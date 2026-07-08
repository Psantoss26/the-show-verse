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
 */
object RecentDetail {
    // Ventana de validez. Durante la reproducción se refresca en cada ping
    // (MediaListenerService), así que este margen solo cubre el hueco entre que un
    // episodio pasa del 90% y auto-reproduce el siguiente. 30 min va sobrado sin
    // arriesgar aplicar una ficha vieja a algo sin relación.
    private const val TTL_MS = 30 * 60 * 1000L

    @Volatile private var pkg: String? = null
    @Volatile private var synced: SyncedInfo? = null
    @Volatile private var atMs: Long = 0L

    /** Registra la última ficha resuelta para [pkg]. */
    @Synchronized
    fun remember(pkg: String, synced: SyncedInfo) {
        this.pkg = pkg
        this.synced = synced
        this.atMs = SystemClock.elapsedRealtime()
    }

    /**
     * Nombre de la serie de la última ficha detectada para [pkg], si es reciente y
     * es una SERIE (no película). Null en cualquier otro caso.
     */
    @Synchronized
    fun showNameFor(pkg: String): String? {
        if (pkg != this.pkg) return null
        if (SystemClock.elapsedRealtime() - atMs > TTL_MS) return null
        val s = synced ?: return null
        // Solo pistas de serie: una ficha de película no debe convertir una
        // reproducción en episodio.
        if (s.mediaType != null && s.mediaType != "tv") return null
        val title = s.title?.trim()
        return if (title.isNullOrEmpty()) null else title
    }
}
