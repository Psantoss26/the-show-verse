package com.theshowverse.sync

import android.os.SystemClock

/**
 * Puente entre la detección de FICHA (AccessibilityStreamingService) y la
 * sincronización por MediaSession (MediaListenerService), que viven en servicios
 * distintos del MISMO proceso.
 *
 * Motivación: algunas apps —Netflix sobre todo, y en especial el anime— NO exponen
 * el nombre de la SERIE en la MediaSession: `title` es el episodio y el subtítulo es
 * "T1:E1 - <episodio>". Sin el nombre de la serie, la resolución contra TMDb da un
 * título sin relación. La FICHA que el usuario abrió justo antes de reproducir SÍ
 * resuelve la serie, así que la recordamos aquí y la reutilizamos como nombre de
 * serie durante la reproducción inmediata (misma app, ventana corta).
 *
 * CUÁNDO VALE LA PISTA. Es un dato prestado de otra pantalla, y una pista vieja
 * es peor que ninguna: con la regla anterior (cualquier ficha de los últimos 30
 * minutos) bastaba con abrir la ficha de una serie —o que se detectara un banner
 * de la portada— y reproducir OTRA después para que esta se registrara con el
 * nombre de aquella (Crunchyroll). Ahora ([HintFreshness]):
 *   - una ficha solo vale si se vio poco antes de EMPEZAR esta reproducción;
 *   - lo confirmado por la propia reproducción (para encadenar el siguiente
 *     episodio que se reproduce solo) solo vale dentro de la MISMA sesión.
 */
object RecentDetail {

    enum class Source { DETAIL, PLAYBACK }

    @Volatile private var pkg: String? = null
    @Volatile private var synced: SyncedInfo? = null
    @Volatile private var atMs: Long = 0L
    @Volatile private var source: Source = Source.DETAIL

    /** Registra la última ficha resuelta (o la serie confirmada al reproducir). */
    @Synchronized
    fun remember(pkg: String, synced: SyncedInfo, source: Source = Source.DETAIL) {
        this.pkg = pkg
        this.synced = synced
        this.atMs = SystemClock.elapsedRealtime()
        this.source = source
    }

    /**
     * Nombre de la serie de la última ficha para [pkg], si sigue siendo válida
     * para la reproducción que empezó en [playbackStartedAt] (elapsedRealtime) y
     * es una SERIE (no película). Null en cualquier otro caso.
     */
    @Synchronized
    fun showNameFor(pkg: String, playbackStartedAt: Long): String? {
        if (pkg != this.pkg) return null
        if (!HintFreshness.usable(source, atMs, playbackStartedAt, SystemClock.elapsedRealtime())) {
            return null
        }
        val s = synced ?: return null
        // Solo pistas de serie: una ficha de película no debe convertir una
        // reproducción en episodio.
        if (s.mediaType != null && s.mediaType != "tv") return null
        val title = s.title?.trim()
        return if (title.isNullOrEmpty()) null else title
    }
}

/** La regla de validez de la pista, sin Android para poder probarla. */
object HintFreshness {
    /** Una ficha vale si se vio como mucho esto ANTES de empezar a reproducir. */
    const val DETAIL_BEFORE_PLAYBACK_MS = 5 * 60 * 1000L
    /** Y nunca más allá de esto, pase lo que pase. */
    const val MAX_AGE_MS = 30 * 60 * 1000L

    fun usable(
        source: RecentDetail.Source,
        atMs: Long,
        playbackStartedAt: Long,
        nowMs: Long,
    ): Boolean {
        if (atMs <= 0L || nowMs - atMs > MAX_AGE_MS) return false
        return when (source) {
            RecentDetail.Source.DETAIL -> atMs >= playbackStartedAt - DETAIL_BEFORE_PLAYBACK_MS
            RecentDetail.Source.PLAYBACK -> atMs >= playbackStartedAt
        }
    }
}
