package com.theshowverse.sync

import android.accessibilityservice.AccessibilityService
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo

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
        val root = rootInActiveWindow ?: return

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
            uiLabels = labels,
        )
    }

    companion object {
        private const val DEBOUNCE_MS = 700L
        private const val DEDUP_MS = 60_000L
        private const val MAX_NODES = 900
        private const val MAX_CANDIDATES = 4
        private const val MAX_LABELS = 8
    }
}
