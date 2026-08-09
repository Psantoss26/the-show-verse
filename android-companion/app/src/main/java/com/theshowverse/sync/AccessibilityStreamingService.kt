package com.theshowverse.sync

import android.accessibilityservice.AccessibilityService
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import android.view.accessibility.AccessibilityWindowInfo

/**
 * Detecta el título que se muestra en la FICHA de una app de streaming SIN
 * reproducir, leyendo el árbol de accesibilidad de la pantalla. Como MediaSession
 * solo existe al reproducir, esta es la única vía en Android para el caso "navegar
 * por la ficha". Extrae candidatos de título, los resuelve contra TMDb en modo
 * resolveOnly (NO toca historial ni progreso) y muestra la notificación de acceso
 * rápido. Heurístico y best-effort: TMDb filtra los textos que no son títulos.
 */
class AccessibilityStreamingService : AccessibilityService() {

    private var prefs: Prefs? = null
    private val handler = Handler(Looper.getMainLooper())
    private var lastText: String? = null
    private var lastAt = 0L
    private var lastDiagText: String? = null
    private var pendingPkg: String? = null
    private val resolveRunnable = Runnable { processCurrent() }

    override fun onServiceConnected() {
        prefs = Prefs(this)
        prefs?.addLog("Accesibilidad conectada (detección de ficha)")
    }

    override fun onInterrupt() { /* noop */ }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        val p = prefs ?: return
        val e = event ?: return
        val type = e.eventType
        if (type != AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED &&
            type != AccessibilityEvent.TYPE_WINDOW_CONTENT_CHANGED
        ) return
        val pkg = e.packageName?.toString() ?: return
        if (!Platforms.KNOWN.containsKey(pkg)) return
        if (p.paused || !p.indicatorEnabled || !p.a11yEnabled || !p.isPaired()) return
        if (!p.isEnabled(pkg)) return

        // Debounce: procesa la pantalla ESTABLE tras un breve silencio (evita
        // resolver en cada micro-cambio mientras se compone la ficha).
        pendingPkg = pkg
        handler.removeCallbacks(resolveRunnable)
        handler.postDelayed(resolveRunnable, DEBOUNCE_MS)
    }

    private fun processCurrent() {
        val p = prefs ?: return
        val pkg = pendingPkg ?: return

        // Ventanas candidatas (ver candidateRoots). En Prime pueden ser varias: la
        // ficha, el inicio de fondo, overlays del sistema… Analizamos cada una y nos
        // quedamos con la que MÁS parece una ficha (más señales de detalle). Antes se
        // elegía por capa (layer) y en Prime salían overlays vacíos ("Controlador de
        // ventana") o la pantalla de recientes → 0 señales → no reconocía nada.
        val roots = candidateRoots(pkg)
        if (roots.isEmpty()) return

        var best: ScreenAnalysis? = null
        val scan = if (isPrime(pkg)) StringBuilder() else null
        roots.forEachIndexed { idx, r ->
            val a = analyzeScreen(r)
            scan?.append(
                "[w$idx s=${a.detailSignals}${if (a.sawPlay) "+play" else ""}" +
                    (a.candidates.firstOrNull()?.let { " «$it»" } ?: " —") + "]",
            )
            val prev = best
            if (prev == null ||
                ScreenHeuristics.isBetterDetail(
                    a.looksLikeDetail, a.detailSignals, a.candidates.size,
                    prev.looksLikeDetail, prev.detailSignals, prev.candidates.size,
                )
            ) {
                best = a
            }
        }
        val analysis = best ?: return
        val winScan = scan?.toString().orEmpty()

        // Solo actuamos si la pantalla PARECE una ficha (botón de reproducir
        // reconocido O suficientes señales de detalle) y hay algún candidato.
        if (!analysis.looksLikeDetail || analysis.candidates.isEmpty()) {
            // Diagnóstico (una vez por texto): candidatos, etiquetas de UI y, en Prime,
            // el barrido de ventanas, para afinar si no se reconoce una ficha.
            val top = analysis.candidates.firstOrNull()
            if (top != null && !top.equals(lastDiagText, ignoreCase = true)) {
                lastDiagText = top
                val titles = analysis.candidates.take(3).joinToString(" · ") { "\"$it\"" }
                val labels = if (analysis.uiLabels.isNotEmpty())
                    " · ui=[" + analysis.uiLabels.joinToString(", ") + "]" else ""
                val scanTxt = if (winScan.isNotEmpty()) " · win=$winScan" else ""
                p.addLog(
                    "Ficha no reconocida (${Platforms.nameFor(pkg)}): play=${analysis.sawPlay} " +
                        "señales=${analysis.detailSignals} · $titles$labels$scanTxt",
                )
            }
            return
        }

        val primary = analysis.candidates.first()
        val now = SystemClock.elapsedRealtime()
        if (primary.equals(lastText, ignoreCase = true) && now - lastAt < DEDUP_MS) return
        lastText = primary
        lastAt = now

        // Diagnóstico (solo Prime): barrido de ventanas y candidato elegido.
        if (winScan.isNotEmpty()) {
            p.addLog("Prime dbg: win=$winScan → «$primary»")
        }

        val token = p.token ?: return
        val origin = p.origin ?: return
        // Enviamos varios candidatos: el servidor prueba todas las variantes contra
        // TMDb y descarta lo que no sea un título real.
        val signal = PlaybackSignal(
            host = pkg,
            platformId = Platforms.idFor(pkg),
            platformName = Platforms.nameFor(pkg),
            movieTitle = primary,
            notifTitle = analysis.candidates.getOrNull(1),
            notifText = analysis.candidates.getOrNull(2),
            notifSubText = analysis.candidates.getOrNull(3),
        )
        val textosDePantalla = analysis.candidates
        SyncClient.send(origin, token, signal, resolveOnly = true) { ok, _, synced ->
            handler.post {
                if (!ok || synced == null) return@post

                // CORROBORACIÓN. Resolver contra TMDb es BUSCAR, y una búsqueda casi
                // siempre devuelve algo: el nombre de un carrusel o una etiqueta de la
                // interfaz acababan resolviendo un título real que no estaba en
                // pantalla. Ese título se notificaba (Prime Video) y, peor, se
                // recordaba como "la serie que estoy viendo", con lo que el episodio
                // que se reprodujera después se atribuía a esa serie ajena y entraba
                // en el Historial (Netflix).
                //
                // Solo se acepta si lo que ha devuelto TMDb se PARECE a algo que de
                // verdad se leyó en la pantalla.
                if (!TitleMatch.corroborates(synced.title, textosDePantalla)) {
                    p.addLog(
                        "Ficha descartada (${Platforms.nameFor(pkg)}): TMDb devolvió " +
                            "«${synced.title}» y en pantalla ponía «$primary»",
                    )
                    // Se olvida el texto para poder reintentar cuando la pantalla
                    // cambie: si no, este título quedaría bloqueado DEDUP_MS.
                    lastText = null
                    return@post
                }

                // Recuerda la serie de esta ficha: si el usuario reproduce a
                // continuación y la app no expone la serie en la MediaSession
                // (Netflix), MediaListenerService la usará como nombre de serie.
                RecentDetail.remember(pkg, synced)
                QuickAccessNotifier.show(this, p, synced, R.string.notif_browsing)
                p.addLog("Ficha detectada: ${synced.title ?: primary}")
            }
        }
    }

    private data class ScreenAnalysis(
        val candidates: List<String>,
        val looksLikeDetail: Boolean,
        val sawPlay: Boolean,
        val detailSignals: Int,
        // Nº de candidatos que provienen de encabezados (van primero en `candidates`).
        // Solo para el diagnóstico de Prime (distinguir H de T).
        val headingCount: Int = 0,
        // Etiquetas de UI cortas (no-título) de la pantalla: solo para diagnóstico,
        // para descubrir qué botones/estados expone cada plataforma en su ficha.
        val uiLabels: List<String> = emptyList(),
    )

    // Recorre el árbol (acotado): recoge candidatos de título (encabezados primero,
    // luego textos prominentes), detecta el botón de reproducir y CUENTA señales de
    // ficha (añadir a lista, descargar, tráiler, temporada, duración…). Con eso
    // decide si es una ficha aunque el botón no se reconozca (clave en Prime/Max).
    private fun analyzeScreen(root: AccessibilityNodeInfo): ScreenAnalysis {
        val headings = ArrayList<String>()
        val texts = ArrayList<String>()
        val labels = ArrayList<String>()
        val seen = HashSet<String>()
        val labelSeen = HashSet<String>()
        var sawPlay = false
        var detailSignals = 0
        val detailSeen = HashSet<String>()
        val queue = ArrayDeque<AccessibilityNodeInfo>()
        queue.add(root)
        var visited = 0
        while (queue.isNotEmpty() && visited < MAX_NODES) {
            val node = queue.removeFirst()
            visited++
            // Botón de reproducir por viewId: en Prime/Max el botón puede ser SOLO
            // un icono, sin texto ni contentDescription; su id de recurso
            // ("…:id/play_button") sigue identificándolo. Requiere flagReportViewIds.
            if (!sawPlay && ScreenHeuristics.isPlayViewId(node.viewIdResourceName)) {
                sawPlay = true
            }
            val raw = (node.text ?: node.contentDescription)?.toString()?.trim()
            if (!raw.isNullOrBlank()) {
                if (!sawPlay && ScreenHeuristics.isPlayLabel(raw)) sawPlay = true
                if (ScreenHeuristics.isDetailSignal(raw) && detailSeen.add(raw.lowercase())) {
                    detailSignals++
                }
                if (ScreenHeuristics.isLikelyTitle(raw) && seen.add(raw.lowercase())) {
                    val isHeading =
                        Build.VERSION.SDK_INT >= Build.VERSION_CODES.P && node.isHeading
                    if (isHeading) headings.add(raw) else texts.add(raw)
                } else if (raw.length in 2..28 && raw.split(' ').size <= 4 &&
                    raw.any { it.isLetter() } && labels.size < MAX_LABELS &&
                    labelSeen.add(raw.lowercase())
                ) {
                    // Texto corto que NO es título (botón/estado): candidato a señal
                    // de ficha aún no reconocida. Solo para diagnóstico.
                    labels.add(raw)
                }
            }
            val count = node.childCount
            for (i in 0 until count) {
                node.getChild(i)?.let { queue.add(it) }
            }
        }
        val ordered = (headings + texts).take(MAX_CANDIDATES)
        return ScreenAnalysis(
            candidates = ordered,
            looksLikeDetail = ScreenHeuristics.looksLikeDetail(sawPlay, detailSignals),
            sawPlay = sawPlay,
            detailSignals = detailSignals,
            headingCount = headings.size,
            uiLabels = labels,
        )
    }

    private fun isPrime(pkg: String): Boolean = Platforms.nameFor(pkg) == "Prime Video"

    // Ventanas a analizar. Para el resto de plataformas: solo la ventana activa
    // (rootInActiveWindow), sin cambios. En Prime se consideran TODAS las ventanas de
    // aplicación DE PRIME (filtradas por paquete: excluye recientes, gestor de
    // archivos, overlays del sistema como "Controlador de ventana"…), porque la
    // ventana activa/superior no siempre es la ficha; luego processCurrent elige la
    // que más parece una ficha. Requiere `flagRetrieveInteractiveWindows` en la config.
    private fun candidateRoots(pkg: String): List<AccessibilityNodeInfo> {
        val active = rootInActiveWindow
        if (!isPrime(pkg)) return listOfNotNull(active)
        val wins = try { windows } catch (e: Exception) { null } ?: return listOfNotNull(active)
        val primeRoots = wins.asSequence()
            .filter { it.type == AccessibilityWindowInfo.TYPE_APPLICATION }
            .mapNotNull { try { it.root } catch (e: Exception) { null } }
            .filter { it.packageName?.toString() == pkg }
            .take(MAX_WINDOWS)
            .toList()
        return if (primeRoots.isNotEmpty()) primeRoots else listOfNotNull(active)
    }

    companion object {
        private const val DEBOUNCE_MS = 700L
        private const val DEDUP_MS = 60_000L
        // 1600 (antes 900): las fichas de Prime son árboles muy poblados y las
        // señales de detalle (watchlist, IMDb, calidad…) quedaban fuera de la poda
        // → señales=0 → la ficha no se reconocía y no salía la notificación.
        private const val MAX_NODES = 1600
        private const val MAX_CANDIDATES = 4
        private const val MAX_LABELS = 8
        private const val MAX_WINDOWS = 6
    }
}
