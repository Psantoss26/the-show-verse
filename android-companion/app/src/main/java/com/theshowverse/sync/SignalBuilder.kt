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

    // El subtítulo de muchas apps no es el nombre de la serie sino los metadatos de
    // la ficha: género y año, duración, o marcas de formato y audio. Tomarlos por el
    // nombre de la serie mandaba a TMDb una consulta como "Ciencia ficción · 2024" y
    // lo que devolviera acababa en el historial, además de convertir una película en
    // serie. Un nombre de serie de verdad no contiene nada de esto.
    private val METADATA_RE = Regex(
        "\\b(?:19|20)\\d{2}\\b" +                                  // un año
            "|\\b\\d+\\s*(?:h|hr|hora|horas|min|mins|minutos)\\b" + // una duración
            "|\\b(?:4k|uhd|hdr|dolby|atmos|vose|subtitulad\\w*|audiodescri\\w*|doblad\\w*)\\b",
        RegexOption.IGNORE_CASE,
    )

    private fun looksLikeMetadata(text: String): Boolean = METADATA_RE.containsMatchIn(text)

    /**
     * Resultado de buscar temporada/episodio en una lista de textos: el par
     * temporada/episodio, el texto del que salió, y cualquier temporada encontrada
     * por separado (puede venir en otro campo distinto del que trae el episodio).
     */
    private data class SeScan(
        val se: Pair<Int?, Int>? = null,
        val seText: String? = null,
        val seasonAny: Int? = null,
    )

    /** Busca en [candidates] sin descartar lo que ya se hubiera encontrado en [prev]. */
    private fun scan(candidates: List<String?>, prev: SeScan): SeScan {
        var se = prev.se
        var seText = prev.seText
        var seasonAny = prev.seasonAny
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
        return SeScan(se, seText, seasonAny)
    }

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

        // Temporada/episodio. Se separan las fuentes en dos grupos porque no valen
        // lo mismo para CLASIFICAR:
        //
        //   - FUERTES (subtítulo, álbum, título de la cola): campos que la app
        //     dedica a describir el episodio. Un número aquí es evidencia de serie.
        //   - DÉBILES (título, displayTitle): el nombre de la obra. Hay películas
        //     que llevan un número de "capítulo" en su propio nombre —"John Wick:
        //     Capítulo 2"— y tomarlo por un episodio convertía la película en la
        //     serie equivocada. De aquí solo se leen números si YA sabemos, por
        //     otra vía, que esto es un episodio.
        //
        // El EPISODIO se toma del primer texto que lo tenga; la TEMPORADA se busca
        // en cualquiera de los textos del mismo grupo y nunca se asume 1.
        val strongCandidates = listOf(subtitle, album, raw.queueTitle.clean())
        val weakCandidates = listOf(title, raw.displayTitle.clean())
        val strongScan = scan(strongCandidates, SeScan())
        val hasEpisodeNumber = strongScan.se != null

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
            !subtitleCore.equals(title, ignoreCase = true) &&
            !looksLikeMetadata(subtitle)

        // ¿Se puede usar la pista de la ficha? Es un dato de FUERA de la sesión —lo
        // que el usuario tenía abierto antes de darle a reproducir—, así que se
        // exige: número de episodio (señal fuerte de que esto es un episodio), que
        // la sesión no traiga ya la serie, y que la pista no sea el propio episodio.
        val hintUsable = hint != null &&
            hasEpisodeNumber &&
            TitleMatch.hintIsUsable(
                hint = hint,
                episodeTitle = title,
                seriesFromSession = if (hasArtistAlbum) (artist ?: album) else null,
            )

        // Nombre de la SERIE, por prioridad:
        //   1) artist/album de la MediaSession (lo más fiable cuando existe),
        //   2) el subtítulo cuando es un nombre de serie válido,
        //   3) la pista de la FICHA de accesibilidad (hint), para cubrir Netflix y
        //      demás apps que no exponen la serie en la MediaSession.
        // La pista va LA ÚLTIMA a propósito: los dos primeros describen lo que se
        // está reproduciendo AHORA, mientras que la pista es un recuerdo de otra
        // pantalla y puede haber quedado desfasada.
        val showTitle: String? = when {
            hasArtistAlbum -> artist ?: album
            subtitleIsSeries -> subtitle
            hintUsable -> hint
            else -> null
        }
        val hasSeries = showTitle != null
        // Ya está claro que es una serie: ahora el propio título puede aportar los
        // números que no traía ningún campo dedicado ("Stranger Things T4:E5").
        val finalScan = if (hasSeries) scan(weakCandidates, strongScan) else strongScan
        val se = finalScan.se
        val seText = finalScan.seText
        val resolvedSeason = se?.first ?: finalScan.seasonAny
        val episodeTitle = if (hasArtistAlbum) (title ?: subtitle) else title
        // Un número de episodio en un campo dedicado basta para saber que esto es un
        // EPISODIO, aunque no se haya podido averiguar de qué serie. En ese caso no
        // se manda `movieTitle`: declararlo película hacía que el servidor buscase
        // el nombre del episodio en el catálogo de cine y guardase la película que
        // más se le pareciera. Sin serie, el servidor lo intentará con el resto de
        // candidatos y, si no lo logra, no guardará nada — que es lo correcto.
        val isEpisode = hasSeries || hasEpisodeNumber
        // ¿La serie sale SOLO de la pista? El servidor lo usa para no dar por bueno
        // con máxima confianza algo que no ha dicho la propia reproducción.
        val seriesFromHint = hasSeries && showTitle === hint

        return PlaybackSignal(
            host = raw.packageName,
            platformId = raw.packageName,
            platformName = platformName,
            showName = if (hasSeries) showTitle else null,
            episodeName = if (isEpisode) episodeTitle else null,
            movieTitle = if (isEpisode) null else title,
            season = if (isEpisode) resolvedSeason else null,
            episode = if (isEpisode) se?.second else null,
            // Solo el texto que REALMENTE contiene el marcador de temporada/episodio.
            // Antes caía al subtítulo cuando no había marcador, y ese subtítulo —el
            // de una película— llegaba al servidor como evidencia de episodio.
            seasonEpisodeText = seText,
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
            seriesFromHint = seriesFromHint,
        )
    }
}
