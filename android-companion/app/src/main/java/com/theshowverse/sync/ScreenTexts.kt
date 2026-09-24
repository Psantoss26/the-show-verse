package com.theshowverse.sync

import android.os.SystemClock

/**
 * Textos con pinta de título que la accesibilidad ha leído en la pantalla de
 * cada app de streaming en los últimos minutos, SEA O NO una ficha.
 *
 * Para qué: hay apps que no dicen en su MediaSession de qué serie es el episodio
 * (Netflix, Prime Video, Crunchyroll…) y la pista de la ficha no siempre existe
 * —en la tablet, por ejemplo, la ficha puede no reconocerse—. Pero el propio
 * reproductor suele mostrar el nombre de la serie en su barra superior. Esos
 * textos viajan al servidor como candidatos de último recurso, y allí solo se
 * aceptan con doble prueba (coincidencia exacta en TMDb y que el episodio que
 * suena exista en esa serie). Aquí no se decide nada: solo se recuerdan.
 *
 * Mismo proceso que AccessibilityStreamingService y MediaListenerService.
 */
object ScreenTexts {
    private const val RETENTION_MS = 5 * 60 * 1000L
    private const val MAX_PER_PACKAGE = 24

    private data class Entry(val text: String, val atMs: Long)

    private val byPackage = HashMap<String, ArrayDeque<Entry>>()

    @Synchronized
    fun record(pkg: String, texts: List<String>) {
        if (texts.isEmpty()) return
        val now = SystemClock.elapsedRealtime()
        val list = byPackage.getOrPut(pkg) { ArrayDeque() }
        for (text in texts) {
            val clean = text.trim()
            if (clean.isEmpty()) continue
            list.removeAll { it.text.equals(clean, ignoreCase = true) }
            list.addLast(Entry(clean, now))
        }
        while (list.size > MAX_PER_PACKAGE) list.removeFirst()
        list.removeAll { now - it.atMs > RETENTION_MS }
    }

    /** Textos de [pkg] vistos desde [sinceMs] (elapsedRealtime), más recientes primero. */
    @Synchronized
    fun recent(pkg: String, sinceMs: Long, limit: Int = 8): List<String> {
        val list = byPackage[pkg] ?: return emptyList()
        return list.filter { it.atMs >= sinceMs }
            .sortedByDescending { it.atMs }
            .map { it.text }
            .take(limit)
    }
}
