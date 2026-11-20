package com.theshowverse.sync

import com.theshowverse.sync.FrecuenciaPantalla.Modo
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/**
 * De esta elección depende que la app vaya a la misma frecuencia que la PWA
 * dentro de Chrome: 90 Hz donde los hay (a 120 el WebView no llega con el
 * desenfoque del cristal), y si no, la más alta.
 */
class FrecuenciaPantallaTest {

    private val fhd60 = Modo(1, 1080, 2400, 60f)
    private val fhd90 = Modo(2, 1080, 2400, 90f)
    private val fhd120 = Modo(3, 1080, 2400, 120f)
    private val qhd120 = Modo(4, 1440, 3200, 120f)
    private val fhd144 = Modo(5, 1080, 2400, 144f)
    private val fhd165 = Modo(6, 1080, 2400, 165f)

    @Test
    fun `con 90 Hz disponibles pide 90 aunque haya mas`() {
        assertEquals(fhd90, FrecuenciaPantalla.mejorModo(fhd60, listOf(fhd60, fhd90, fhd120)))
        assertEquals(fhd90, FrecuenciaPantalla.mejorModo(fhd120, listOf(fhd60, fhd90, fhd120, fhd144, fhd165)))
    }

    @Test
    fun `sin modos entre 60 y 90 pide el mas alto`() {
        assertEquals(fhd120, FrecuenciaPantalla.mejorModo(fhd60, listOf(fhd60, fhd120)))
    }

    @Test
    fun `no cambia de resolucion para ganar frecuencia`() {
        // A 1080p con 60 y 90 Hz disponibles, el de 120 Hz solo existe a otra
        // resolución: se queda en 90 Hz a 1080p.
        assertEquals(fhd90, FrecuenciaPantalla.mejorModo(fhd60, listOf(fhd60, fhd90, qhd120)))
    }

    @Test
    fun `si ya esta en 90 lo mantiene`() {
        assertEquals(fhd90, FrecuenciaPantalla.mejorModo(fhd90, listOf(fhd60, fhd90, fhd120)))
    }

    @Test
    fun `una pantalla de un solo modo no cambia nada`() {
        assertEquals(fhd60, FrecuenciaPantalla.mejorModo(fhd60, listOf(fhd60)))
    }

    @Test
    fun `sin modos con la resolucion actual no pide ninguno`() {
        assertNull(FrecuenciaPantalla.mejorModo(fhd60, listOf(qhd120)))
    }
}
