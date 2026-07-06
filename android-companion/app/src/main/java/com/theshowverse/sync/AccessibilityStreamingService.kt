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
        // Solo actuamos si la pantalla PARECE una ficha (hay botón de reproducir):
        // así evitamos disparar en la home/búsqueda/rejilla de títulos.
        if (!analysis.looksLikeDetail || analysis.candidates.isEmpty()) return

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

    private data class ScreenAnalysis(val candidates: List<String>, val looksLikeDetail: Boolean)

    // Recorre el árbol (acotado): recoge candidatos de título (encabezados primero,
    // luego textos prominentes, filtrando ruido de UI) y detecta si hay un botón de
    // reproducir, señal fiable de que estamos en una ficha.
    private fun analyzeScreen(root: AccessibilityNodeInfo): ScreenAnalysis {
        val headings = ArrayList<String>()
        val texts = ArrayList<String>()
        val seen = HashSet<String>()
        var sawPlay = false
        val queue = ArrayDeque<AccessibilityNodeInfo>()
        queue.add(root)
        var visited = 0
        while (queue.isNotEmpty() && visited < MAX_NODES) {
            val node = queue.removeFirst()
            visited++
            val raw = (node.text ?: node.contentDescription)?.toString()?.trim()
            if (!raw.isNullOrBlank()) {
                if (!sawPlay && isPlayLabel(raw)) sawPlay = true
                if (isLikelyTitle(raw) && seen.add(raw.lowercase())) {
                    val isHeading =
                        Build.VERSION.SDK_INT >= Build.VERSION_CODES.P && node.isHeading
                    if (isHeading) headings.add(raw) else texts.add(raw)
                }
            }
            val count = node.childCount
            for (i in 0 until count) {
                node.getChild(i)?.let { queue.add(it) }
            }
        }
        val ordered = (headings + texts).take(MAX_CANDIDATES)
        return ScreenAnalysis(ordered, sawPlay)
    }

    private fun isPlayLabel(t: String): Boolean {
        val l = t.lowercase()
        return l == "reproducir" || l == "play" || l == "ver ahora" ||
            l.startsWith("reproducir") || l.startsWith("ver t") // "Ver T1:E1"
    }

    private fun isLikelyTitle(t: String): Boolean {
        if (t.length < 2 || t.length > 80) return false
        val l = t.lowercase()
        if (STOP_WORDS.contains(l)) return false
        if (STOP_PREFIXES.any { l.startsWith(it) }) return false
        if (t.split(WHITESPACE).size > 10) return false // parece sinopsis
        if (!t.any { it.isLetter() }) return false
        return true
    }

    companion object {
        private const val DEBOUNCE_MS = 700L
        private const val DEDUP_MS = 60_000L
        private const val MAX_NODES = 500
        private const val MAX_CANDIDATES = 4
        private val WHITESPACE = Regex("\\s+")
        private val STOP_WORDS = setOf(
            "reproducir", "play", "descargar", "download", "mi lista", "buscar",
            "inicio", "novedades", "series", "películas", "peliculas", "más",
            "mas", "episodios", "episodes", "reparto", "tráiler", "trailer",
            "detalles", "resumen", "similares", "similar", "compartir",
            "continuar viendo", "añadir a mi lista", "quitar de mi lista",
            "ver más", "ver mas", "valorar", "me gusta", "no me gusta", "atrás",
        )
        private val STOP_PREFIXES = setOf(
            "temporada", "season", "episodio", "episode", "capítulo", "capitulo",
            "año ", "duración", "duracion", "clasificación",
        )
    }
}
