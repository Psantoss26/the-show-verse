package com.theshowverse.sync

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Test

/**
 * La clave identifica QUÉ se está reproduciendo. Si cambia, [MediaListenerService]
 * da por hecho que ha empezado otro contenido: vuelca el punto anterior, tira la
 * resolución y reinicia la cadencia de envío. Que sea estable mientras suena lo
 * mismo es, literalmente, la condición para que el progreso llegue a enviarse.
 */
class DedupKeyTest {

    private fun episodio(
        showName: String? = null,
        seriesFromHint: Boolean = false,
        positionSec: Long? = 120,
    ) = PlaybackSignal(
        host = "com.netflix.mediaclient",
        platformId = "com.netflix.mediaclient",
        platformName = "Netflix",
        showName = showName,
        episodeName = "Capítulo cinco: La Nina",
        season = 4,
        episode = 5,
        tabTitle = "Capítulo cinco: La Nina",
        seriesFromHint = seriesFromHint,
        positionSec = positionSec,
    )

    @Test
    fun laPistaQueVaYVieneNoCuentaComoCambioDeContenido() {
        // Mismo episodio sonando; lo único que cambia es que la pista de la ficha
        // (RecentDetail) está disponible o no en esa lectura concreta.
        val conPista = episodio(showName = "Stranger Things", seriesFromHint = true)
        val sinPista = episodio(showName = null)
        assertEquals(sinPista.dedupKey, conPista.dedupKey)
    }

    @Test
    fun laPosicionNoFormaParteDeLaIdentidad() {
        assertEquals(episodio(positionSec = 30).dedupKey, episodio(positionSec = 2400).dedupKey)
    }

    @Test
    fun otroEpisodioSiEsOtroContenido() {
        val quinto = episodio()
        val sexto = PlaybackSignal(
            host = "com.netflix.mediaclient",
            platformId = "com.netflix.mediaclient",
            platformName = "Netflix",
            episodeName = "Capítulo seis: La inmersión",
            season = 4,
            episode = 6,
        )
        assertNotEquals(quinto.dedupKey, sexto.dedupKey)
    }

    @Test
    fun laSerieQueSiDiceLaSesionSigueDistinguiendoContenidos() {
        // Cuando la serie la publica la propia reproducción es un dato estable, así
        // que sí entra en la clave: dos series distintas con episodios del mismo
        // número y nombre no pueden colapsar en la misma entrada.
        val unaSerie = episodio(showName = "Stranger Things", seriesFromHint = false)
        val otraSerie = episodio(showName = "Dark", seriesFromHint = false)
        assertNotEquals(unaSerie.dedupKey, otraSerie.dedupKey)
    }

    @Test
    fun unaPeliculaSeIdentificaPorSuTitulo() {
        val pelicula = PlaybackSignal(
            host = "com.netflix.mediaclient",
            platformId = "com.netflix.mediaclient",
            platformName = "Netflix",
            movieTitle = "El Irlandés",
            tabTitle = "El Irlandés",
        )
        assertEquals("com.netflix.mediaclient:El Irlandés", pelicula.dedupKey)
    }
}
