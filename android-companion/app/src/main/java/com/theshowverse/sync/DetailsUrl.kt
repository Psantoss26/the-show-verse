package com.theshowverse.sync

/** Datos que devuelve el endpoint de sync tras resolver el título contra TMDb. */
data class SyncedInfo(
    val tmdbId: Int,
    val mediaType: String?,
    val season: Int? = null,
    val episode: Int? = null,
    val title: String? = null,
    val posterPath: String? = null,
)

/**
 * Construye la URL de la página de detalles de The Show Verse. Serie con episodio
 * → página del episodio; serie sin episodio → página de la serie; película → su
 * página. Devuelve null si no hay id resuelto. PURA y testeable.
 */
object DetailsUrl {
    fun build(origin: String?, s: SyncedInfo?): String? {
        if (origin.isNullOrBlank() || s == null || s.tmdbId <= 0) return null
        val base = origin.trimEnd('/')
        val type = if (s.mediaType == "tv") "tv" else "movie"
        return if (type == "tv" && s.season != null && s.episode != null) {
            "$base/details/tv/${s.tmdbId}/season/${s.season}/episode/${s.episode}"
        } else {
            "$base/details/$type/${s.tmdbId}"
        }
    }
}
