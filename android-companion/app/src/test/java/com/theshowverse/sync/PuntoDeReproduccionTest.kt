package com.theshowverse.sync

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class PuntoDeReproduccionTest {

    @Test
    fun `guarda posicion, duracion y marca de estimacion juntas`() {
        val puntos = PuntoDeReproduccion()
        puntos.registrar("com.netflix.mediaclient", posSec = 2500, durSec = 2820, estimado = false)

        val punto = puntos.de("com.netflix.mediaclient")!!
        assertEquals(2500L, punto.posSec)
        assertEquals(2820L, punto.durSec)
        assertTrue(!punto.estimado)
    }

    @Test
    fun `encadenar episodios no contamina el punto del anterior`() {
        // Reproduce el fallo real: un episodio que SÍ publica posición termina cerca
        // del final y, acto seguido, arranca otro que NO la publica. Lo que se
        // vuelque del primero tiene que seguir siendo suyo: su posición y su marca.
        val puntos = PuntoDeReproduccion()
        val pkg = "com.netflix.mediaclient"

        puntos.registrar(pkg, posSec = 2700, durSec = 2820, estimado = false)
        val alTerminar = puntos.de(pkg)!!

        // El servicio vuelca ANTES de apuntar nada del episodio siguiente.
        assertEquals(2700L, alTerminar.posSec)
        assertTrue(
            "el episodio terminado no puede volcarse como estimado: el servidor " +
                "no marca como visto una posición estimada",
            !alTerminar.estimado,
        )

        // Y solo entonces entra el nuevo.
        puntos.olvidar(pkg)
        puntos.registrar(pkg, posSec = 12, durSec = 0, estimado = true)

        val nuevo = puntos.de(pkg)!!
        assertEquals(12L, nuevo.posSec)
        assertTrue(nuevo.estimado)
    }

    @Test
    fun `una posicion negativa no pisa el ultimo punto bueno`() {
        val puntos = PuntoDeReproduccion()
        puntos.registrar("plex", posSec = 900, durSec = 1800, estimado = false)
        puntos.registrar("plex", posSec = -1, durSec = 1800, estimado = false)

        assertEquals(900L, puntos.de("plex")!!.posSec)
    }

    @Test
    fun `olvidar deja el paquete sin punto`() {
        val puntos = PuntoDeReproduccion()
        puntos.registrar("disney", posSec = 10, durSec = 100, estimado = true)
        puntos.olvidar("disney")

        assertNull(puntos.de("disney"))
    }
}
