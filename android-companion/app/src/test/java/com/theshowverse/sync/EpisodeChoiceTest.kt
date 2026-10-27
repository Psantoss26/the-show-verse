package com.theshowverse.sync

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class EpisodeChoiceTest {

    @Test
    fun `boton de la ficha con el episodio y la temporada del selector`() {
        assertEquals(EpisodeChoice.Choice(6, 9), EpisodeChoice.parse(listOf("Reanudar episodio 9"), fichaSeason = 6))
        assertEquals(EpisodeChoice.Choice(6, 9), EpisodeChoice.parse(listOf("Volver a ver episodio 9"), fichaSeason = 6))
        assertEquals(EpisodeChoice.Choice(2, 3), EpisodeChoice.parse(listOf("Reproducir T2 E3"), fichaSeason = 6))
        assertEquals(EpisodeChoice.Choice(null, 9), EpisodeChoice.parse(listOf("Ver episodio 9"), fichaSeason = null))
    }

    @Test
    fun `fila de la lista de episodios con su boton de descarga dentro`() {
        val row = listOf("", "2. Cuentas a Pagar", "Descargar 2. Cuentas a Pagar a tu dispositivo", "45 min")
        assertEquals(EpisodeChoice.Choice(6, 2, "Cuentas a Pagar"), EpisodeChoice.parse(row, fichaSeason = 6))
    }

    @Test
    fun `descargar o un boton cualquiera no eligen episodio`() {
        assertNull(EpisodeChoice.parse(listOf("Descargar 2. Cuentas a Pagar a tu dispositivo"), 6))
        assertNull(EpisodeChoice.parse(listOf("Descargar episodio 9"), 6))
        assertNull(EpisodeChoice.parse(listOf("Añadir a la watchlist"), 6))
        assertNull(EpisodeChoice.parse(listOf("Siguiente episodio"), 6))
        assertNull(EpisodeChoice.parse(emptyList(), 6))
    }

    @Test
    fun `temporada del selector de la ficha`() {
        assertEquals(6, EpisodeChoice.seasonFrom("Temporada 6"))
        assertEquals(6, EpisodeChoice.seasonFrom("Descargar T6"))
        assertEquals(1, EpisodeChoice.seasonFrom("Season 1"))
        assertNull(EpisodeChoice.seasonFrom("Fringe (Al límite), Season 1. Prime Video"))
        assertNull(EpisodeChoice.seasonFrom("Suits"))
    }
}
