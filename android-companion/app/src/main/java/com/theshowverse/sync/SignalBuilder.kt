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
    // Con guarda izquierda (^ o no-letra), como SEASON_RE: sin ella, "PARTE3" o
    // "SUITE3" casaban su "E3" interior como episodio 3 (falso positivo).
    private val EPISODE_RE = Regex(
        "(?:^|[^a-zA-Z])(?:E|Ep|Episodio|Episode|Cap[ií]tulo|Chapter|Folge)\\s*\\.?\\s*(\\d{1,3})",
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

    // Marcador de temporada/episodio AL PRINCIPIO ("T1:E1 - ", "S1 E1 ·",
    // "Temporada 1 Episodio 1:", "Episodio 5 -"). Sirve para decidir si un subtítulo
    // es realmente el nombre de la SERIE o solo el episodio con su marcador delante.
    private val LEADING_SE_MARKER = Regex(
        "^\\s*(?:T|S|Temporada|Season|Saison|Staffel)\\s*\\.?\\s*\\d{1,3}" +
            "(?:\\s*[:x]?\\s*(?:E|Ep|Episodio|Episode|Cap[ií]tulo|Chapter|Folge)?\\s*\\.?\\s*\\d{1,3})?" +
            "\\s*[-–—·:.]*\\s*",
        RegexOption.IGNORE_CASE,
    )

    /** Quita un marcador "T1:E1 -"/"Episodio 1:" del principio; null si queda vacío. */
    private fun withoutEpisodeMarker(s: String?): String? =
        s?.let { LEADING_SE_MARKER.replace(it, "").trim().ifEmpty { null } }

    fun build(
        raw: RawMetadata,
        platformName: String,
        hintShowName: String? = null,
    ): PlaybackSignal {
        val title = raw.title.clean() ?: raw.displayTitle.clean()
        val artist = raw.artist.clean()
        val album = raw.album.clean()
        val subtitle = raw.displaySubtitle.clean()
        val hint = hintShowName.clean()
        val hasArtistAlbum = artist != null || album != null

        // Temporada/episodio: probamos subtítulo, álbum, título, displayTitle. El
        // EPISODIO se toma del primer texto que lo tenga; la TEMPORADA se busca en
        // CUALQUIERA de los textos (puede venir en otro campo) y nunca se asume 1.
        // Se calcula ANTES de decidir la serie: saber si hay nº de episodio decide
        // si aplicar la pista de la ficha (hint).
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
        val hasEpisodeNumber = se != null

        // ¿El subtítulo aporta el nombre de la SERIE? Solo si, tras quitarle un
        // posible marcador ("T1:E1 -", "Episodio 1:"), lo que queda es DISTINTO del
        // título (el episodio). Así:
        //   - HBO Max: dSub = "La Casa del Dragón" (serie) ≠ título → sí es serie.
        //   - Netflix: dSub = "T1:E1 - <mismo episodio>" → al quitar "T1:E1 -" queda
        //     el propio episodio → NO es serie (antes se mandaba esa basura como
        //     nombre de serie y TMDb resolvía un título sin relación).
        val subtitleCore = withoutEpisodeMarker(subtitle)
        val subtitleIsSeries = !hasArtistAlbum &&
            !subtitle.isNullOrBlank() &&
            !title.isNullOrBlank() &&
            !subtitle.equals(title, ignoreCase = true) &&
            subtitleCore != null &&
            !subtitleCore.equals(title, ignoreCase = true)

        // Nombre de la SERIE, por prioridad:
        //   1) artist/album de la MediaSession (lo más fiable cuando existe),
        //   2) la pista de la FICHA de accesibilidad (hint) —solo si hay nº de
        //      episodio, señal fuerte de que es un episodio—, para cubrir Netflix y
        //      demás apps que no exponen la serie en la MediaSession,
        //   3) el subtítulo cuando es un nombre de serie válido.
        val showTitle: String? = when {
            hasArtistAlbum -> artist ?: album
            hint != null && hasEpisodeNumber -> hint
            subtitleIsSeries -> subtitle
            else -> null
        }
        val hasSeries = showTitle != null
        val episodeTitle = if (hasArtistAlbum) (title ?: subtitle) else title

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
