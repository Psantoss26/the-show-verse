package com.theshowverse.sync

import com.theshowverse.sync.FrecuenciaPantalla.Modo
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/**
 * La app pide la frecuencia alta de la pantalla, hasta 120 Hz: en una de 120
 * va a 120, en una de 90 a 90, y en las de 144/165 se queda en 120.
 */
class FrecuenciaPantallaTest {

    private val fhd60 = Modo(1, 1080, 2400, 60f)
    private val fhd90 = Modo(2, 1080, 2400, 90f)
    private val fhd120 = Modo(3, 1080, 2400, 120.00001f)
    private val qhd120 = Modo(4, 1440, 3200, 120f)
    private val fhd144 = Modo(5, 1080, 2400, 144f)
    private val fhd165 = Modo(6, 1080, 2400, 165f)

    @Test
    fun `con 120 Hz disponibles pide 120`() {
        assertEquals(fhd120, FrecuenciaPantalla.mejorModo(fhd60, listOf(fhd60, fhd90, fhd120)))
    }

    @Test
    fun `en pantallas de mas de 120 Hz se queda en 120`() {
        assertEquals(fhd120, FrecuenciaPantalla.mejorModo(fhd90, listOf(fhd60, fhd90, fhd120, fhd144, fhd165)))
    }

    @Test
    fun `en una pantalla de 90 Hz pide 90`() {
        assertEquals(fhd90, FrecuenciaPantalla.mejorModo(fhd60, listOf(fhd60, fhd90)))
    }

    @Test
    fun `si todos pasan del tope pide el mas alto`() {
        assertEquals(fhd165, FrecuenciaPantalla.mejorModo(fhd144, listOf(fhd144, fhd165)))
    }

    @Test
    fun `no cambia de resolucion para ganar frecuencia`() {
        // A 1080p con 60 y 90 Hz disponibles, el de 120 Hz solo existe a otra
        // resolución: se queda en 90 Hz a 1080p.
        assertEquals(fhd90, FrecuenciaPantalla.mejorModo(fhd60, listOf(fhd60, fhd90, qhd120)))
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
