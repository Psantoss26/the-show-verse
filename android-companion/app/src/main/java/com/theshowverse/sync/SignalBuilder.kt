package com.theshowverse.sync

/**
 * Construye un [PlaybackSignal] a partir de [RawMetadata]. PURO (sin Android):
 * Media-Session-first — si hay artista/álbum lo tratamos como serie (show =
 * artista/álbum, episodio = título); si no, es película (título). La temporada/
 * episodio se extraen de los textos disponibles en varios idiomas.
 */
object SignalBuilder {

    private val SEASON_RE = Regex(
        "(?:^|[^a-zA-Z])(?:T|S|Temporada|Season|Saison|Staffel)\\s*\\.?\\s*(\\d{1,3})",
        RegexOption.IGNORE_CASE,
    )
    private val EPISODE_RE = Regex(
        "(?:E|Ep|Episodio|Episode|Cap[ií]tulo|Chapter|Folge)\\s*\\.?\\s*(\\d{1,3})",
        RegexOption.IGNORE_CASE,
    )

    /** Devuelve (season, episode) o null si no hay episodio identificable. */
    fun parseSeasonEpisode(text: String?): Pair<Int, Int>? {
        if (text.isNullOrBlank()) return null
        val e = EPISODE_RE.find(text) ?: return null
        val episode = e.groupValues[1].toIntOrNull() ?: return null
        val season = SEASON_RE.find(text)?.groupValues?.get(1)?.toIntOrNull() ?: 1
        return season to episode
    }

    private fun String?.clean(): String? = this?.replace(Regex("\\s+"), " ")?.trim()?.ifEmpty { null }

    fun build(raw: RawMetadata, platformName: String): PlaybackSignal {
        val title = raw.title.clean() ?: raw.displayTitle.clean()
        val artist = raw.artist.clean()
        val album = raw.album.clean()
        val subtitle = raw.displaySubtitle.clean()
        val hasSeries = artist != null || album != null

        // Temporada/episodio: probamos subtítulo, álbum, título, displayTitle.
        var se: Pair<Int, Int>? = null
        var seText: String? = null
        for (candidate in listOf(subtitle, album, title, raw.displayTitle.clean())) {
            val parsed = parseSeasonEpisode(candidate)
            if (parsed != null) {
                se = parsed
                seText = candidate
                break
            }
        }

        return PlaybackSignal(
            host = raw.packageName,
            platformId = raw.packageName,
            platformName = platformName,
            showName = if (hasSeries) (artist ?: album) else null,
            episodeName = if (hasSeries) (title ?: subtitle) else null,
            movieTitle = if (hasSeries) null else title,
            season = se?.first,
            episode = se?.second,
            seasonEpisodeText = seText ?: subtitle,
            tabTitle = raw.displayTitle.clean() ?: title,
            // Fuentes extra del nombre de la SERIE cuando no hay artist/album y el
            // `title` es el episodio (el servidor las prueba como candidatas).
            queueTitle = raw.queueTitle.clean(),
            albumArtist = raw.albumArtist.clean(),
            artworkUrl = raw.artUri.clean(),
            durationSec = if (raw.durationMs > 0) raw.durationMs / 1000 else null,
            positionSec = if (raw.positionMs > 0) raw.positionMs / 1000 else null,
        )
    }
}
