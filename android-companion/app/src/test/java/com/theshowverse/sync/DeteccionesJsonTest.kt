package com.theshowverse.sync

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * El registro nativo de detecciones lee lo que devuelve
 * /api/streaming/device/… y manda la corrección con la forma que valida el
 * backend (correctionSchema en routes/streamingDetections.js).
 */
class DeteccionesJsonTest {

    private val id = "9b1f4b0e-9d1f-4a2b-8a1a-2f3c4d5e6f99"

    private val lista = """
        {"results":[
          {"id":"$id","platform":"netflix","kind":"playback","triggerText":"Dark",
           "tmdbId":70523,"mediaType":"tv","season":1,"episode":2,"title":"Dark",
           "posterPath":"/dark.jpg","status":"active","detectedSeason":1,"detectedEpisode":2,
           "correction":null,"createdAt":"2026-10-05T10:00:00.000Z"},
          {"id":"x","platform":"disney","kind":"detail","triggerText":"Top 10",
           "tmdbId":1,"mediaType":"movie","season":null,"episode":null,"title":null,
           "posterPath":null,"status":"corrected","detectedSeason":null,"detectedEpisode":null,
           "correction":{"verdict":"not_a_title"},"createdAt":"2026-10-04T10:00:00.000Z"}
        ]}
    """.trimIndent()

    @Test
    fun `lee la lista con sus campos opcionales`() {
        val ds = DeteccionesJson.lista(lista)
        assertEquals(2, ds.size)
        val dark = ds[0]
        assertEquals(id, dark.id)
        assertEquals("tv", dark.mediaType)
        assertEquals(2, dark.episode)
        assertNull(dark.correccion)
        val top = ds[1]
        assertNull(top.title)
        assertNull(top.season)
        assertEquals("not_a_title", top.correccion?.verdict)
    }

    @Test
    fun `una respuesta rota es una lista vacia, no un fallo`() {
        assertTrue(DeteccionesJson.lista("{}").isEmpty())
        assertTrue(DeteccionesJson.lista("no es json").isEmpty())
    }

    @Test
    fun `lee los titulos del buscador`() {
        val t = DeteccionesJson.titulos(
            """{"results":[{"tmdbId":1,"mediaType":"movie","title":"Dune","year":2021,"posterPath":null}]}""",
        )
        assertEquals(listOf(TituloEncontrado(1, "movie", "Dune", 2021, null)), t)
    }

    @Test
    fun `no era un titulo no lleva titulo`() {
        val body = JSONObject(DeteccionesJson.cuerpoCorreccion(CorreccionPedida.NoEraTitulo))
        assertEquals("not_a_title", body.getString("verdict"))
        assertFalse(body.has("tmdbId"))
    }

    @Test
    fun `otro titulo desconocido va sin tmdbId`() {
        val body = JSONObject(DeteccionesJson.cuerpoCorreccion(CorreccionPedida.OtroTitulo(null, null, null)))
        assertEquals("wrong_title", body.getString("verdict"))
        assertFalse(body.has("tmdbId"))
    }

    @Test
    fun `serie con episodio lleva temporada y episodio`() {
        val dark = TituloEncontrado(70523, "tv", "Dark", 2017, "/d.jpg")
        val body = JSONObject(DeteccionesJson.cuerpoCorreccion(CorreccionPedida.OtroTitulo(dark, 1, 2)))
        assertEquals(70523, body.getInt("tmdbId"))
        assertEquals("tv", body.getString("mediaType"))
        assertEquals(1, body.getInt("season"))
        assertEquals(2, body.getInt("episode"))
        assertEquals("Dark", body.getString("title"))
        assertEquals("/d.jpg", body.getString("posterPath"))
    }

    @Test
    fun `una pelicula nunca lleva temporada aunque se la pasen`() {
        val dune = TituloEncontrado(1, "movie", "Dune", 2021, null)
        val body = JSONObject(DeteccionesJson.cuerpoCorreccion(CorreccionPedida.OtroTitulo(dune, 1, 2)))
        assertFalse(body.has("season"))
        assertFalse(body.has("episode"))
        assertFalse(body.has("posterPath"))
    }

    @Test
    fun `temporada sin episodio se queda a nivel de serie`() {
        val dark = TituloEncontrado(70523, "tv", "Dark", 2017, null)
        val body = JSONObject(DeteccionesJson.cuerpoCorreccion(CorreccionPedida.OtroTitulo(dark, 1, null)))
        assertFalse(body.has("season"))
        assertFalse(body.has("episode"))
    }

    @Test
    fun `etiquetas de plataforma y de estado`() {
        assertEquals("Netflix", DeteccionesJson.plataforma("netflix"))
        assertEquals("Prime Video", DeteccionesJson.plataforma("primevideo"))
        assertEquals("Nueva", DeteccionesJson.plataforma("nueva"))
        assertEquals("Streaming", DeteccionesJson.plataforma(""))

        val ds = DeteccionesJson.lista(lista)
        assertNull(DeteccionesJson.estado(ds[0]))
        assertEquals("Descartada", DeteccionesJson.estado(ds[1]))
    }
}
