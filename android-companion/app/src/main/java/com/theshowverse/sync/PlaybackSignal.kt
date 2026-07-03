package com.theshowverse.sync

/**
 * Señal de reproducción normalizada — misma forma que la que envía la extensión
 * del navegador, para reutilizar el resolutor del backend sin cambios.
 */
data class PlaybackSignal(
    val host: String,
    val platformId: String,
    val platformName: String,
    val showName: String? = null,
    val episodeName: String? = null,
    val movieTitle: String? = null,
    val season: Int? = null,
    val episode: Int? = null,
    val seasonEpisodeText: String? = null,
    val tabTitle: String? = null,
    val artworkUrl: String? = null,
    val durationSec: Long? = null,
    val positionSec: Long? = null,
) {
    /** Título principal (para retrocompat con el endpoint: mainTitle). */
    val mainTitle: String?
        get() = showName ?: movieTitle ?: tabTitle

    /** Clave de deduplicación local (equivalente al lastKey de la extensión). */
    val dedupKey: String
        get() = "$platformId:${mainTitle ?: ""}|${episodeName ?: ""}|${season ?: ""}|${episode ?: ""}"
}

/**
 * Metadatos crudos extraídos de una MediaSession de otra app (sin dependencias
 * de Android para poder probar SignalBuilder en la JVM).
 */
data class RawMetadata(
    val packageName: String,
    val title: String? = null,
    val artist: String? = null,
    val album: String? = null,
    val displayTitle: String? = null,
    val displaySubtitle: String? = null,
    val artUri: String? = null,
    val durationMs: Long = 0,
    val positionMs: Long = 0,
)
