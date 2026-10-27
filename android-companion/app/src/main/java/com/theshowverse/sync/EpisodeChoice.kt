package com.theshowverse.sync

/**
 * El episodio que el usuario eligió en la FICHA al darle a reproducir. PURO.
 *
 * POR QUÉ. Prime Video no publica MediaSession y su reproductor casi nunca deja
 * leer la línea «T6 E9 …» (los controles se ocultan enseguida): sin más, lo único
 * que se sabía de lo que sonaba era la serie de la ficha, y a Continuar viendo
 * llegaba la serie entera en vez del episodio. Pero el botón o la fila que se
 * pulsa en la ficha sí lo dice: «Reanudar episodio 9», «Volver a ver episodio 9»,
 * «T6 E9», o la fila «9. Vuelta al trabajo» de la lista de episodios, con la
 * temporada que muestra el selector de la ficha («Temporada 6»).
 */
object EpisodeChoice {

    data class Choice(val season: Int?, val episode: Int, val name: String? = null)

    // «T6 E9», «S6:E9», «Temporada 6, episodio 9», «Temp. 6 ep. 9».
    private val SEASON_EPISODE = Regex(
        "(?:^|[^\\p{L}])(?:t|s|temp\\.?|temporada|season)\\s*(\\d{1,3})\\s*[,:·.]?\\s*" +
            "(?:e|ep\\.?|episodio|episode|cap[ií]tulo)\\s*(\\d{1,4})(?!\\d)",
        RegexOption.IGNORE_CASE,
    )
    // «Reanudar episodio 9», «Volver a ver episodio 9», «Ver capítulo 3».
    private val EPISODE_ONLY = Regex(
        "(?:^|[^\\p{L}])(?:episodio|episode|cap[ií]tulo|chapter|ep\\.)\\s*(\\d{1,4})(?!\\d)",
        RegexOption.IGNORE_CASE,
    )
    // Fila de la lista de episodios: «9. Vuelta al trabajo».
    private val NUMBERED_ROW = Regex("^\\s*(\\d{1,3})\\.\\s+(\\S.*)$")

    // Temporada que muestra la ficha: el selector («Temporada 6») o el botón de
    // descargarla entera («Descargar T6»).
    private val SEASON_LABEL = Regex(
        "^(?:temporada|season|staffel|saison|stagione)\\s*(\\d{1,3})$" +
            "|^(?:descargar|download)\\s+(?:t|s|temporada|season)\\s*(\\d{1,3})$",
        RegexOption.IGNORE_CASE,
    )

    // Lo que se pulsa para DESCARGAR un episodio no lo reproduce.
    private val DOWNLOAD = Regex("^\\s*(?:descargar|download|eliminar descarga|cancelar descarga)\\b", RegexOption.IGNORE_CASE)

    /** Temporada que delata un texto de la ficha, o null. */
    fun seasonFrom(text: String?): Int? {
        val m = text?.trim()?.let { SEASON_LABEL.find(it) } ?: return null
        return (m.groupValues[1].ifEmpty { m.groupValues[2] }).toIntOrNull()?.takeIf { it > 0 }
    }

    /**
     * El episodio de lo que se ha pulsado ([texts]: primero su texto o su
     * descripción, luego los de sus hijos), con [fichaSeason] cuando el propio
     * texto no trae temporada. Null si no es un episodio o si es una descarga.
     */
    fun parse(texts: List<String>, fichaSeason: Int?): Choice? {
        val all = texts.map { it.replace(Regex("\\s+"), " ").trim() }.filter { it.isNotEmpty() && it.length <= 160 }
        // El primero es lo pulsado: si es una descarga, no se reproduce nada. Los
        // botones de descarga DENTRO de una fila de episodio se ignoran.
        if (all.isEmpty() || DOWNLOAD.containsMatchIn(all.first())) return null
        val clean = all.filterNot { DOWNLOAD.containsMatchIn(it) }
        for (t in clean) {
            val m = SEASON_EPISODE.find(t) ?: continue
            val episode = m.groupValues[2].toIntOrNull()?.takeIf { it > 0 } ?: continue
            return Choice(m.groupValues[1].toIntOrNull()?.takeIf { it > 0 } ?: fichaSeason, episode)
        }
        for (t in clean) {
            val m = EPISODE_ONLY.find(t) ?: continue
            val episode = m.groupValues[1].toIntOrNull()?.takeIf { it > 0 } ?: continue
            return Choice(fichaSeason, episode)
        }
        for (t in clean) {
            val m = NUMBERED_ROW.find(t) ?: continue
            val episode = m.groupValues[1].toIntOrNull()?.takeIf { it > 0 } ?: continue
            return Choice(fichaSeason, episode, m.groupValues[2].trim().takeIf { it.any(Char::isLetter) })
        }
        return null
    }
}
