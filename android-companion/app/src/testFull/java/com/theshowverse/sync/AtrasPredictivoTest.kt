package com.theshowverse.sync

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class AtrasPredictivoTest {

    private fun t(p: Float, izquierda: Boolean = true) =
        AtrasPredictivo.Transformacion.para(p, izquierda, anchoPx = 1080f, densidad = 3f)

    @Test
    fun enReposoLaWebNoCambia() {
        val r = t(0f)
        assertEquals(1f, r.escala, 0.0001f)
        assertEquals(0f, r.desplazamientoX, 0.0001f)
        assertEquals(0f, r.radio, 0.0001f)
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
    fun elProgresoFueraDeRangoSeRecorta() {
        assertEquals(t(1f), t(1.5f))
        assertEquals(t(0f), t(-0.2f))
    }
}
