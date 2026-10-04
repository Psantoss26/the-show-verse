package com.theshowverse.sync

import com.theshowverse.sync.FrecuenciaPantalla.Modo
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/**
 * De esta elección depende que las animaciones de la app vayan a la misma
 * frecuencia que en la PWA (Chrome pide siempre el modo más alto).
 */
class FrecuenciaPantallaTest {

    private val fhd60 = Modo(1, 1080, 2400, 60f)
    private val fhd90 = Modo(2, 1080, 2400, 90f)
    private val fhd120 = Modo(3, 1080, 2400, 120f)
    private val qhd120 = Modo(4, 1440, 3200, 120f)

    @Test
    fun `elige la frecuencia mas alta con la resolucion actual`() {
        assertEquals(fhd120, FrecuenciaPantalla.mejorModo(fhd60, listOf(fhd60, fhd90, fhd120)))
    }

    @Test
    fun `no cambia de resolucion para ganar frecuencia`() {
        // A 1080p con 60 y 90 Hz disponibles, el de 120 Hz solo existe a otra
        // resolución: se queda en 90 Hz a 1080p.
        assertEquals(fhd90, FrecuenciaPantalla.mejorModo(fhd60, listOf(fhd60, fhd90, qhd120)))
    }

    @Test
    fun `si ya esta en el maximo lo mantiene`() {
        assertEquals(fhd120, FrecuenciaPantalla.mejorModo(fhd120, listOf(fhd60, fhd120)))
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
