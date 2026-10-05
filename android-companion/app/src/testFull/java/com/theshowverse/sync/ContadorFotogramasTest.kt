package com.theshowverse.sync

import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * El medidor de diagnóstico compara la fluidez de la ficha con cada ajuste de
 * rendimiento: si cuenta mal los fotogramas perdidos, la comparación no vale.
 */
class ContadorFotogramasTest {

    private val periodo = 8_333_333L // 120 Hz
    private val ms = 1_000_000L

    @Test
    fun `fotogramas seguidos no pierden nada`() {
        val c = ContadorFotogramas(periodo)
        repeat(10) { c.registrar(it * periodo, 4 * ms) }
        assertEquals(10, c.entregados)
        assertEquals(0, c.perdidos)
        assertEquals(100, c.fluidez())
    }

    @Test
    fun `un hueco de tres periodos son dos fotogramas perdidos`() {
        val c = ContadorFotogramas(periodo)
        c.registrar(0, 4 * ms)
        c.registrar(3 * periodo, 20 * ms)
        assertEquals(2, c.perdidos)
        assertEquals(20 * ms, c.peorNs)
        // 2 entregados de 4 esperados.
        assertEquals(50, c.fluidez())
    }

    @Test
    fun `una pausa larga es reposo, no fotogramas perdidos`() {
        val c = ContadorFotogramas(periodo)
        c.registrar(0, 4 * ms)
        c.registrar(ContadorFotogramas.PAUSA_NS + periodo, 4 * ms)
        assertEquals(0, c.perdidos)
    }

    @Test
    fun `reiniciar empieza de cero sin heredar el ultimo vsync`() {
        val c = ContadorFotogramas(periodo)
        c.registrar(0, 30 * ms)
        c.reiniciar()
        c.registrar(5 * periodo, 4 * ms)
        assertEquals(1, c.entregados)
        assertEquals(0, c.perdidos)
        assertEquals(4 * ms, c.peorNs)
    }

    @Test
    fun `cambiar el periodo recalcula los huecos con la frecuencia nueva`() {
        val c = ContadorFotogramas(periodo)
        c.periodoNs = 16_666_667L // la pantalla bajó a 60 Hz
        c.registrar(0, 4 * ms)
        c.registrar(16_666_667L, 4 * ms)
        assertEquals(0, c.perdidos)
    }
}
