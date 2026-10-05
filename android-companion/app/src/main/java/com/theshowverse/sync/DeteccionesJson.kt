package com.theshowverse.sync

import org.json.JSONObject

/** Una detección del registro del móvil (ver toDetectionResult en el backend). */
data class Deteccion(
    val id: String,
    val platform: String,
    /** "detail" (ficha abierta) | "playback" (reproducción). */
    val kind: String,
    val triggerText: String,
    val tmdbId: Int,
    val mediaType: String,
    val season: Int?,
    val episode: Int?,
    val title: String?,
    val posterPath: String?,
    val status: String,
    /** Temporada/episodio que leyó el reproductor: prerrellenan la corrección. */
    val detectedSeason: Int?,
    val detectedEpisode: Int?,
    val createdAt: String,
    val correccion: CorreccionHecha?,
)

data class CorreccionHecha(
    /** "not_a_title" | "wrong_title". */
    val verdict: String,
    val tmdbId: Int?,
    val mediaType: String?,
    val season: Int?,
    val episode: Int?,
    val title: String?,
)

/** Resultado del buscador de la corrección (backend lib/titleSearch.js). */
data class TituloEncontrado(
    val tmdbId: Int,
    val mediaType: String,
    val title: String,
    val year: Int?,
    val posterPath: String?,
)

/** Lo que el usuario dice de una detección. */
sealed class CorreccionPedida {
    /** No había ninguna ficha: el texto no era un título. */
    object NoEraTitulo : CorreccionPedida()

    /**
     * Era otro título. [titulo] null = «no es este, pero no sé cuál era».
     * Temporada y episodio solo cuentan en series y si van los dos.
     */
    data class OtroTitulo(val titulo: TituloEncontrado?, val season: Int?, val episode: Int?) :
        CorreccionPedida()
}

/**
 * Traducción entre el JSON del servidor y el registro nativo. PURA (solo
 * org.json) para poder probarla sin Android: lo que se manda tiene que pasar
 * la validación del backend tal cual.
 */
object DeteccionesJson {

    fun lista(json: String): List<Deteccion> {
        val results = objeto(json)?.optJSONArray("results") ?: return emptyList()
        return (0 until results.length()).mapNotNull { i -> results.optJSONObject(i)?.let(::deteccion) }
    }

    fun una(json: String): Deteccion? = objeto(json)?.optJSONObject("detection")?.let(::deteccion)

    fun titulos(json: String): List<TituloEncontrado> {
        val results = objeto(json)?.optJSONArray("results") ?: return emptyList()
        return (0 until results.length()).mapNotNull { i ->
            val o = results.optJSONObject(i) ?: return@mapNotNull null
            val id = o.optInt("tmdbId", 0)
            val tipo = o.optString("mediaType")
            val titulo = texto(o, "title")
            if (id <= 0 || (tipo != "movie" && tipo != "tv") || titulo == null) return@mapNotNull null
            TituloEncontrado(id, tipo, titulo, entero(o, "year"), texto(o, "posterPath"))
        }
    }

    /** Cuerpo de POST …/correction. */
    fun cuerpoCorreccion(pedida: CorreccionPedida): String {
        val body = JSONObject()
        when (pedida) {
            CorreccionPedida.NoEraTitulo -> body.put("verdict", "not_a_title")
            is CorreccionPedida.OtroTitulo -> {
                body.put("verdict", "wrong_title")
                val t = pedida.titulo
                if (t != null) {
                    body.put("tmdbId", t.tmdbId)
                    body.put("mediaType", t.mediaType)
                    body.put("title", t.title)
                    t.posterPath?.let { body.put("posterPath", it) }
                    val s = pedida.season?.takeIf { it > 0 }
                    val e = pedida.episode?.takeIf { it > 0 }
                    if (t.mediaType == "tv" && s != null && e != null) {
                        body.put("season", s)
                        body.put("episode", e)
                    }
                }
            }
        }
        return body.toString()
    }

    private val PLATAFORMAS = mapOf(
        "netflix" to "Netflix",
        "primevideo" to "Prime Video",
        "prime" to "Prime Video",
        "max" to "Max",
        "hbomax" to "Max",
        "disney" to "Disney+",
        "disneyplus" to "Disney+",
        "appletv" to "Apple TV+",
        "movistar" to "Movistar Plus+",
        "crunchyroll" to "Crunchyroll",
        "plex" to "Plex",
        "filmin" to "Filmin",
        "skyshowtime" to "SkyShowtime",
        "plutotv" to "Pluto TV",
        "rakuten" to "Rakuten TV",
        "atresplayer" to "Atresplayer",
        "rtve" to "RTVE Play",
    )

    /** Nombre legible de la plataforma (el mismo que pinta la web). */
    fun plataforma(id: String): String {
        val clave = id.lowercase()
        PLATAFORMAS[clave]?.let { return it }
        if (clave.isBlank()) return "Streaming"
        return clave.replaceFirstChar { it.uppercase() }
    }

    /** Etiqueta de una detección ya corregida, o null si sigue como se detectó. */
    fun estado(d: Deteccion): String? {
        if (d.status != "corrected") return null
        val c = d.correccion
        return when {
            c?.verdict == "not_a_title" -> "Descartada"
            c?.tmdbId != null -> "Corregida: ${c.title ?: "otro título"}"
            else -> "Título descartado"
        }
    }

    // ------------------------------------------------------------------ ayudas

    private fun deteccion(o: JSONObject): Deteccion? {
        val id = texto(o, "id") ?: return null
        return Deteccion(
            id = id,
            platform = o.optString("platform"),
            kind = o.optString("kind"),
            triggerText = o.optString("triggerText"),
            tmdbId = o.optInt("tmdbId", 0),
            mediaType = o.optString("mediaType"),
            season = entero(o, "season"),
            episode = entero(o, "episode"),
            title = texto(o, "title"),
            posterPath = texto(o, "posterPath"),
            status = o.optString("status"),
            detectedSeason = entero(o, "detectedSeason"),
            detectedEpisode = entero(o, "detectedEpisode"),
            createdAt = o.optString("createdAt"),
            correccion = o.optJSONObject("correction")?.let {
                CorreccionHecha(
                    verdict = it.optString("verdict"),
                    tmdbId = entero(it, "tmdbId"),
                    mediaType = texto(it, "mediaType"),
                    season = entero(it, "season"),
                    episode = entero(it, "episode"),
                    title = texto(it, "title"),
                )
            },
        )
    }

    private fun objeto(json: String): JSONObject? = try {
        JSONObject(json)
    } catch (e: Exception) {
        null
    }

    /** Texto no vacío, o null (incluido el `null` de JSON, que optString daría como "null"). */
    private fun texto(o: JSONObject, clave: String): String? =
        if (o.isNull(clave)) null else o.optString(clave).trim().takeIf { it.isNotEmpty() }

    private fun entero(o: JSONObject, clave: String): Int? =
        if (o.isNull(clave)) null else o.optInt(clave, 0).takeIf { it > 0 }
}
