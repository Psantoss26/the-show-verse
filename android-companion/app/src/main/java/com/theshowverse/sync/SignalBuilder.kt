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
    fun parseSeasonEpisode(text: String?): Pair<Int?, Int>? {
        if (text.isNullOrBlank()) return null
        val e = EPISODE_RE.find(text) ?: return null
        val episode = e.groupValues[1].toIntOrNull() ?: return null
        // La temporada NO se asume 1: si no aparece queda null (el servidor decide;
        // antes se registraba T1 al ver, p. ej., la T4).
        val season = SEASON_RE.find(text)?.groupValues?.get(1)?.toIntOrNull()
        return season to episode
    }

    private fun String?.clean(): String? = this?.replace(Regex("\\s+"), " ")?.trim()?.ifEmpty { null }

    fun build(raw: RawMetadata, platformName: String): PlaybackSignal {
        val title = raw.title.clean() ?: raw.displayTitle.clean()
        val artist = raw.artist.clean()
        val album = raw.album.clean()
        val subtitle = raw.displaySubtitle.clean()
        val hasArtistAlbum = artist != null || album != null

        // Algunas apps (HBO Max) NO exponen artist/album en la MediaSession: ponen
        // el nombre del EPISODIO en `title` y el de la SERIE en `displaySubtitle`.
        // Sin tratar este caso, el episodio se enviaba como película y TMDb no lo
        // resolvía → 404 ("Could not resolve TMDb entity for: <episodio>"). Si hay
        // un subtítulo distinto del título, lo tratamos como serie:
        // serie = subtítulo, episodio = título.
        val seriesFromSubtitle = !hasArtistAlbum &&
            !subtitle.isNullOrBlank() &&
            !title.isNullOrBlank() &&
            !subtitle.equals(title, ignoreCase = true)
        val hasSeries = hasArtistAlbum || seriesFromSubtitle

        // Nombre de la serie y del episodio según de dónde salga la señal de serie.
        val showTitle = if (hasArtistAlbum) (artist ?: album) else subtitle
        val episodeTitle = if (hasArtistAlbum) (title ?: subtitle) else title

        // Temporada/episodio: probamos subtítulo, álbum, título, displayTitle. El
        // EPISODIO se toma del primer texto que lo tenga; la TEMPORADA se busca en
        // CUALQUIERA de los textos (puede venir en otro campo) y nunca se asume 1.
        val candidates = listOf(subtitle, album, title, raw.displayTitle.clean())
        var se: Pair<Int?, Int>? = null
        var seText: String? = null
        var seasonAny: Int? = null
        for (candidate in candidates) {
            if (candidate.isNullOrBlank()) continue
            if (se == null) {
                val parsed = parseSeasonEpisode(candidate)
                if (parsed != null) {
                    se = parsed
                    seText = candidate
                }
            }
            if (seasonAny == null) {
                seasonAny = SEASON_RE.find(candidate)?.groupValues?.get(1)?.toIntOrNull()
            }
        }
        val resolvedSeason = se?.first ?: seasonAny

        return PlaybackSignal(
            host = raw.packageName,
            platformId = raw.packageName,
            platformName = platformName,
            showName = if (hasSeries) showTitle else null,
            episodeName = if (hasSeries) episodeTitle else null,
            movieTitle = if (hasSeries) null else title,
            season = resolvedSeason,
            episode = se?.second,
            seasonEpisodeText = seText ?: subtitle,
            tabTitle = raw.displayTitle.clean() ?: title,
            // Fuentes extra del nombre de la SERIE cuando no hay artist/album y el
            // `title` es el episodio (el servidor las prueba como candidatas).
            queueTitle = raw.queueTitle.clean(),
            albumArtist = raw.albumArtist.clean(),
            notifTitle = raw.notifTitle.clean(),
            notifText = raw.notifText.clean(),
            notifSubText = raw.notifSubText.clean(),
            artworkUrl = raw.artUri.clean(),
            durationSec = if (raw.durationMs > 0) raw.durationMs / 1000 else null,
            positionSec = if (raw.positionMs > 0) raw.positionMs / 1000 else null,
        )
    }
}
