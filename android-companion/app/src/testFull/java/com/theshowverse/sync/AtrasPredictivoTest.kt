package com.theshowverse.sync

import com.theshowverse.sync.AtrasPredictivo.Salida
import com.theshowverse.sync.AtrasPredictivo.LadoGesto
import com.theshowverse.sync.AtrasPredictivo.Transformacion
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class AtrasPredictivoTest {

    private fun t(p: Float, izquierda: Boolean = true, deltaY: Float = 0f) =
        Transformacion.para(p, izquierda, anchoPx = 1080f, densidad = 3f, deltaYPx = deltaY, altoPx = 2400f)

    private fun f(p: Float, inicio: Transformacion = Transformacion.REPOSO, izquierda: Boolean = true) =
        Salida.para(p, inicio, izquierda, anchoPx = 1080f, densidad = 3f)

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

    // ---------------------------------------------------------- salida

    @Test
    fun laSalidaEmpiezaDondeSeSoltoElGesto() {
        val inicio = t(0.6f, deltaY = 200f)
        assertEquals(inicio, f(0f, inicio))
    }

    @Test
    fun laPaginaQueSeVaSaleDelTodoPorElLadoContrarioAlBorde() {
        assertEquals(1080f, f(1f, izquierda = true).desplazamientoX, 0.0001f)
        assertEquals(-1080f, f(1f, izquierda = false).desplazamientoX, 0.0001f)
    }

    @Test
    fun sinGestoSaleDesdeTamanoCompletoYRedondeaLasEsquinas() {
        assertEquals(Transformacion.REPOSO, f(0f))
        assertEquals(84f, f(0.25f).radio, 0.0001f)
        assertEquals(0.9f, f(1f).escala, 0.0001f)
    }

    @Test
    fun avanzaSinSaltosHaciaFuera() {
        val pasos = (0..10).map { f(it / 10f).desplazamientoX }
        assertTrue(pasos.zipWithNext().all { (a, b) -> b >= a })
    }

    // ---------------------------------------------------------- lado sin avance

    @Test
    fun unToqueRobadoEnLaMitadDerechaEsGestoDesdeLaDerecha() {
        assertFalse(LadoGesto.desdeIzquierda(xInicio = 1070f, anchoPx = 1080f, edadMs = 400L))
    }

    @Test
    fun unToqueRobadoEnLaMitadIzquierdaEsGestoDesdeLaIzquierda() {
        assertTrue(LadoGesto.desdeIzquierda(xInicio = 10f, anchoPx = 1080f, edadMs = 400L))
    }

    @Test
    fun sinToqueRobadoOConUnoViejoSeQuedaLaIzquierda() {
        assertTrue(LadoGesto.desdeIzquierda(xInicio = null, anchoPx = 1080f, edadMs = 0L))
        assertTrue(LadoGesto.desdeIzquierda(xInicio = 1070f, anchoPx = 1080f, edadMs = LadoGesto.VIGENCIA_MS + 1))
        assertTrue(LadoGesto.desdeIzquierda(xInicio = 1070f, anchoPx = 0f, edadMs = 400L))
    }

    @Test
    fun laSalidaDesdeLaDerechaVaHaciaLaIzquierda() {
        assertEquals(-1080f, f(1f, izquierda = false).desplazamientoX, 0.0001f)
    }
}
