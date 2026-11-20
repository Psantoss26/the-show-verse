package com.theshowverse.sync

import com.theshowverse.sync.AtrasPredictivo.Fotograma
import com.theshowverse.sync.AtrasPredictivo.Transformacion
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class AtrasPredictivoTest {

    private fun t(p: Float, izquierda: Boolean = true, deltaY: Float = 0f) =
        Transformacion.para(p, izquierda, anchoPx = 1080f, densidad = 3f, deltaYPx = deltaY, altoPx = 2400f)

    private fun f(p: Float, inicio: Transformacion = Transformacion.REPOSO, izquierda: Boolean = true) =
        Fotograma.para(p, inicio, izquierda, anchoPx = 1080f, densidad = 3f)

    // ---------------------------------------------------------- gesto

    @Test
    fun enReposoLaWebNoCambia() {
        assertEquals(Transformacion.REPOSO, t(0f))
    }

    @Test
    fun alFinalSeEncogeAlNoventaPorCiento() {
        assertEquals(0.9f, t(1f).escala, 0.0001f)
    }

    @Test
    fun seApartaDelBordePorElQueEntraElDedo() {
        assertTrue(t(1f, izquierda = true).desplazamientoX > 0f)
        assertTrue(t(1f, izquierda = false).desplazamientoX < 0f)
        assertEquals(72f, t(1f).desplazamientoX, 0.0001f) // 24 dp × 3
    }

    @Test
    fun lasEsquinasSeRedondeanAlEmpezarYNoPasanDelMaximo() {
        assertEquals(84f, t(0.25f).radio, 0.0001f) // 28 dp × 3, ya al 25 %
        assertEquals(84f, t(1f).radio, 0.0001f)
        assertTrue(t(0.1f).radio in 0.1f..84f)
    }

    @Test
    fun sigueAlDedoEnVerticalConTope() {
        assertEquals(10f, t(0.5f, deltaY = 100f).desplazamientoY, 0.0001f)
        assertEquals(-10f, t(0.5f, deltaY = -100f).desplazamientoY, 0.0001f)
        // Tope: 2400 / 20 − 8 dp × 3 = 96 px.
        assertEquals(96f, t(0.5f, deltaY = 5000f).desplazamientoY, 0.0001f)
    }

    @Test
    fun elProgresoFueraDeRangoSeRecorta() {
        assertEquals(t(1f), t(1.5f))
        assertEquals(t(0f), t(-0.2f))
    }

    // ---------------------------------------------------------- transición

    @Test
    fun laTransicionEmpiezaDondeSeSoltoElGesto() {
        val inicio = t(0.6f)
        val r = f(0f, inicio)
        assertEquals(inicio.escala, r.saliente.escala, 0.0001f)
        assertEquals(inicio.desplazamientoX, r.saliente.desplazamientoX, 0.0001f)
        assertEquals(inicio.radio, r.saliente.radio, 0.0001f)
    }

    @Test
    fun laPaginaQueSeVaSaleDelTodoPorElLadoContrarioAlBorde() {
        assertEquals(1080f, f(1f, izquierda = true).saliente.desplazamientoX, 0.0001f)
        assertEquals(-1080f, f(1f, izquierda = false).saliente.desplazamientoX, 0.0001f)
    }

    @Test
    fun laPaginaAnteriorEntraDesdeElLadoDelGestoYAcabaEnSuSitio() {
        assertTrue(f(0f, izquierda = true).entrante.desplazamientoX < 0f)
        assertTrue(f(0f, izquierda = false).entrante.desplazamientoX > 0f)
        assertEquals(Transformacion.REPOSO, f(1f).entrante)
    }

    @Test
    fun elVeloSeDesvaneceHastaCero() {
        assertEquals(Fotograma.VELO_MAXIMO, f(0f).velo, 0.0001f)
        assertEquals(0f, f(1f).velo, 0.0001f)
        assertTrue(f(0.5f).velo in 0f..Fotograma.VELO_MAXIMO)
    }

    @Test
    fun sinGestoLaCapturaEmpiezaATamanoCompleto() {
        val r = f(0f)
        assertEquals(1f, r.saliente.escala, 0.0001f)
        assertEquals(0f, r.saliente.desplazamientoX, 0.0001f)
    }
}
