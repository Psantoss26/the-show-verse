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
        val root = analysisRoot(pkg) ?: return

        val analysis = analyzeScreen(root)
        // Solo actuamos si la pantalla PARECE una ficha (botón de reproducir
        // reconocido O suficientes señales de detalle) y hay algún candidato.
        if (!analysis.looksLikeDetail || analysis.candidates.isEmpty()) {
            // Diagnóstico: si había candidatos pero no se clasificó como ficha, se
            // registra (una vez por texto) para poder afinar la detección por
            // plataforma (p. ej. si Prime/Max no exponen las señales esperadas).
            val top = analysis.candidates.firstOrNull()
            if (top != null && !top.equals(lastDiagText, ignoreCase = true)) {
                lastDiagText = top
                val titles = analysis.candidates.take(3).joinToString(" · ") { "\"$it\"" }
                // Muestra también las etiquetas de UI cortas de la pantalla (botones,
                // estados): así, cuando una ficha da señales=0, el registro revela
                // qué etiquetas usa la plataforma para poder reconocerlas (Prime).
                val labels = if (analysis.uiLabels.isNotEmpty())
                    " · ui=[" + analysis.uiLabels.joinToString(", ") + "]" else ""
                p.addLog(
                    "Ficha no reconocida (${Platforms.nameFor(pkg)}): play=${analysis.sawPlay} " +
                        "señales=${analysis.detailSignals} · $titles$labels",
                )
            }
            return
        }

        val primary = analysis.candidates.first()
        val now = SystemClock.elapsedRealtime()
        if (primary.equals(lastText, ignoreCase = true) && now - lastAt < DEDUP_MS) return
        lastText = primary
        lastAt = now

        // Diagnóstico (solo Prime): revela de qué ventana se leyó (front = ficha en
        // primer plano; active = la que devuelve rootInActiveWindow), cuántas
        // ventanas de aplicación hay y los candidatos con su tipo (H = encabezado,
        // T = texto). Sirve para confirmar el arreglo o afinar si Prime compone la
        // ficha dentro de la MISMA ventana que el inicio.
        if (isPrime(pkg)) {
            val hc = analysis.headingCount.coerceAtMost(analysis.candidates.size)
            val tagged = analysis.candidates.mapIndexed { i, c ->
                (if (i < hc) "H:" else "T:") + "«$c»"
            }.joinToString(" ")
            p.addLog(
                "Prime dbg: root=${if (lastRootFront) "front" else "active"} " +
                    "wins=${appWindowCount()} play=${analysis.sawPlay} " +
                    "señales=${analysis.detailSignals} → $tagged",
            )
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
        SyncClient.send(origin, token, signal, resolveOnly = true) { ok, _, synced ->
            handler.post {
                if (ok && synced != null) {
                    // Recuerda la serie de esta ficha: si el usuario reproduce a
                    // continuación y la app no expone la serie en la MediaSession
                    // (Netflix), MediaListenerService la usará como nombre de serie.
                    RecentDetail.remember(pkg, synced)
                    QuickAccessNotifier.show(this, p, synced, R.string.notif_browsing)
                    p.addLog("Ficha detectada: ${synced.title ?: primary}")
                }
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

    // Origen de la última raíz analizada (para el diagnóstico): true si se leyó la
    // ventana de aplicación en primer plano; false si se cayó a rootInActiveWindow.
    private var lastRootFront = false

    // Raíz a analizar. Para todas las plataformas se mantiene rootInActiveWindow (sin
    // cambios). SOLO en Prime Video se prefiere la ventana de aplicación MÁS AL FRENTE
    // (mayor `layer`): al abrir una ficha, Prime la muestra encima del INICIO —cuyo
    // banner destacado se autorreproduce—, pero rootInActiveWindow devolvía a veces
    // esa pantalla de fondo, así que se detectaba siempre el título del banner y nunca
    // la ficha abierta. Requiere `flagRetrieveInteractiveWindows` en la config.
    private fun analysisRoot(pkg: String): AccessibilityNodeInfo? {
        lastRootFront = false
        val active = rootInActiveWindow
        if (!isPrime(pkg)) return active
        val wins = try { windows } catch (e: Exception) { null }
        if (wins.isNullOrEmpty()) return active
        val frontApp = wins
            .filter { it.type == AccessibilityWindowInfo.TYPE_APPLICATION }
            .maxByOrNull { it.layer }
        val root = try { frontApp?.root } catch (e: Exception) { null }
        return if (root != null) {
            lastRootFront = true
            root
        } else {
            active
        }
    }

    /** Nº de ventanas de aplicación visibles (solo para el diagnóstico de Prime). */
    private fun appWindowCount(): Int = try {
        windows?.count { it.type == AccessibilityWindowInfo.TYPE_APPLICATION } ?: -1
    } catch (e: Exception) {
        -1
    }

    companion object {
        private const val DEBOUNCE_MS = 700L
        private const val DEDUP_MS = 60_000L
        private const val MAX_NODES = 900
        private const val MAX_CANDIDATES = 4
        private const val MAX_LABELS = 8
    }
}
