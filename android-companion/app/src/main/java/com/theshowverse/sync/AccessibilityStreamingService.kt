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
    // Desde cuándo hay un procesado pendiente (ver MAX_WAIT_MS).
    private var pendingSince = 0L
    private var lastPlayerLog: String? = null
    private val resolveRunnable = Runnable {
        pendingSince = 0L
        processCurrent()
    }

    override fun onServiceConnected() {
        prefs = Prefs(this)
        prefs?.addLog("Accesibilidad conectada (detección de ficha)")
        prefs?.let { NotATitleList.refreshIfStale(it) }
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
        if (p.paused || !p.a11yEnabled || !p.isPaired()) return
        // En Prime Video y Crunchyroll la lectura de la pantalla también alimenta la
        // sincronización (serie, episodio y tiempo del reproductor), no solo el
        // acceso rápido: no depende del indicador, que QuickAccessNotifier ya
        // comprueba antes de notificar nada.
        if (!p.indicatorEnabled && !Platforms.readsPlayerScreen(pkg)) return
        if (!p.isEnabled(pkg)) return

        // Debounce: procesa la pantalla ESTABLE tras un breve silencio (evita
        // resolver en cada micro-cambio mientras se compone la ficha). Con tope: el
        // reproductor cambia sin parar (el tiempo, la barra de avance) y, sin él, el
        // silencio no llegaba nunca y su pantalla no se leía.
        val now = SystemClock.elapsedRealtime()
        if (pendingPkg != pkg) pendingSince = 0L
        pendingPkg = pkg
        if (pendingSince == 0L) pendingSince = now
        handler.removeCallbacks(resolveRunnable)
        if (now - pendingSince >= MAX_WAIT_MS) {
            handler.post(resolveRunnable)
        } else {
            handler.postDelayed(resolveRunnable, DEBOUNCE_MS)
        }
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

        // Prime Video y Crunchyroll: si la pantalla es su REPRODUCTOR, se lee (serie,
        // episodio, tiempo) para la sincronización y no se trata como una ficha: el
        // botón de reproducir de los controles en pausa la hacía pasar por una.
        if (Platforms.readsPlayerScreen(pkg) && readPlayerScreen(p, pkg, roots)) return

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

        // Textos de ESTA pantalla, sea o no una ficha: durante la reproducción es
        // la barra del reproductor, que suele nombrar la serie. Ver ScreenTexts.
        ScreenTexts.record(pkg, analysis.candidates)

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

        // Textos que el usuario corrigió como «no había ninguna ficha»: fuera, para
        // que el siguiente candidato (el título de verdad, si lo hay) sea el
        // principal. La lista se refresca sola cuando caduca.
        NotATitleList.refreshIfStale(p)
        val candidates = NotATitleList.filter(p, Platforms.idFor(pkg), analysis.candidates)
        if (candidates.isEmpty()) {
            val top = analysis.candidates.first()
            if (!top.equals(lastDiagText, ignoreCase = true)) {
                lastDiagText = top
                p.addLog("Ficha ignorada (${Platforms.nameFor(pkg)}): «$top» no es un título (corregido)")
            }
            return
        }

        val primary = candidates.first()
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
            notifTitle = candidates.getOrNull(1),
            notifText = candidates.getOrNull(2),
            notifSubText = candidates.getOrNull(3),
        )
        val textosDePantalla = candidates
        SyncClient.send(origin, token, signal, resolveOnly = true, detectionKind = "detail") { ok, _, synced, _ ->
            handler.post {
                if (p.paused || p.token != token || p.origin != origin || pendingPkg != pkg || lastText != primary) return@post
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

    /**
     * Busca el reproductor en [roots] y, si está, guarda su lectura para
     * MediaListenerService. Devuelve true si la pantalla ERA un reproductor.
     */
    private fun readPlayerScreen(p: Prefs, pkg: String, roots: List<AccessibilityNodeInfo>): Boolean {
        val now = SystemClock.elapsedRealtime()
        for (root in roots) {
            val (texts, seek) = playerTexts(root)
            val reading = PlayerScreen.parse(texts, seek, now) ?: continue
            PlayerScreenCache.record(pkg, reading)
            // Los títulos del reproductor siguen sirviendo de último recurso (ScreenTexts).
            ScreenTexts.record(pkg, texts.filter { ScreenHeuristics.isLikelyTitle(it) }.take(MAX_CANDIDATES))
            if (reading.hasIdentity) {
                val desc = "«${reading.seriesTitle ?: "?"}» T${reading.season ?: "?"}:E${reading.episode ?: "?"}" +
                    (reading.episodeName?.let { " «$it»" } ?: "")
                if (desc != lastPlayerLog) {
                    lastPlayerLog = desc
                    p.addLog("Reproductor ${Platforms.nameFor(pkg)} en pantalla: $desc")
                }
            }
            return true
        }
        return false
    }

    /**
     * Textos del árbol en ORDEN DE LECTURA (en profundidad: el título del
     * reproductor va justo antes que su línea de episodio, cosa que el recorrido
     * en anchura de analyzeScreen no respeta) y el avance de la barra (0..1).
     */
    private fun playerTexts(root: AccessibilityNodeInfo): Pair<List<String>, Double?> {
        val texts = ArrayList<String>()
        var seek: Double? = null
        val stack = ArrayDeque<AccessibilityNodeInfo>()
        stack.addLast(root)
        var visited = 0
        while (stack.isNotEmpty() && visited < MAX_NODES) {
            val node = stack.removeLast()
            visited++
            val isSeekBar = node.className?.toString()?.endsWith("SeekBar") == true
            if (isSeekBar && seek == null) {
                node.rangeInfo?.let { r ->
                    val span = r.max - r.min
                    if (span > 0f) seek = ((r.current - r.min) / span).toDouble().coerceIn(0.0, 1.0)
                }
            }
            val raw = (node.text ?: node.contentDescription)?.toString()?.trim()
            if (!raw.isNullOrBlank() && raw != texts.lastOrNull()) texts.add(raw)
            if (isSeekBar && Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                node.stateDescription?.toString()?.trim()?.takeIf { it.isNotEmpty() }?.let { texts.add(it) }
            }
            for (i in node.childCount - 1 downTo 0) {
                node.getChild(i)?.let { stack.addLast(it) }
            }
        }
        return texts to seek
    }

    // Ventanas a analizar. Para el resto de plataformas: solo la ventana activa
    // (rootInActiveWindow), sin cambios. En Prime (y Crunchyroll, cuyo reproductor y
    // controles de Cast también abren ventanas propias) se consideran TODAS las
    // ventanas de aplicación DE ESA APP (filtradas por paquete: excluye recientes, gestor de
    // archivos, overlays del sistema como "Controlador de ventana"…), porque la
    // ventana activa/superior no siempre es la ficha; luego processCurrent elige la
    // que más parece una ficha. Requiere `flagRetrieveInteractiveWindows` en la config.
    private fun candidateRoots(pkg: String): List<AccessibilityNodeInfo> {
        val active = rootInActiveWindow
        if (!Platforms.readsPlayerScreen(pkg)) return listOfNotNull(active)
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
        private const val MAX_WAIT_MS = 2_500L
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
