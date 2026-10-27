package com.theshowverse.sync

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class ScreenPlaybackTest {
    private val prime = "com.amazon.avod.thirdpartyclient"
    private val disney = "com.disney.disneyplus"

    @Test
    fun `el reproductor visto sigue contando aunque se oculten los controles`() {
        val v = ScreenPlayback.decide(prime, seenAt = 0L, paused = false, nowMs = 90 * 60_000L, interactive = true, foregroundPkg = prime)
        assertEquals(ScreenPlayback.Verdict.PLAYING, v)
    }

    @Test
    fun `otra app delante, pausa, pantalla apagada o demasiado tiempo`() {
        assertEquals(ScreenPlayback.Verdict.GONE, ScreenPlayback.decide(prime, 0L, false, 1_000L, true, "com.android.launcher"))
        assertEquals(ScreenPlayback.Verdict.IDLE, ScreenPlayback.decide(prime, 0L, true, 1_000L, true, prime))
        assertEquals(ScreenPlayback.Verdict.IDLE, ScreenPlayback.decide(prime, 0L, false, 1_000L, false, prime))
        assertEquals(ScreenPlayback.Verdict.GONE, ScreenPlayback.decide(prime, 0L, false, ScreenPlayback.MAX_MS + 1, true, null))
        // Sin saber qué ventana está delante, no cambia nada.
        assertEquals(ScreenPlayback.Verdict.PLAYING, ScreenPlayback.decide(prime, 0L, false, 1_000L, true, null))
    }

    @Test
    fun `episodio leido en el reproductor de Prime`() {
        val reading = PlayerReading(seriesTitle = "Suits", episodeName = "Vuelta al trabajo", season = 6, episode = 9)
        val s = ScreenSignal.build(prime, "Prime Video", reading, null)!!
        assertEquals("Suits", s.showName)
        assertEquals(6, s.season)
        assertEquals(9, s.episode)
        assertEquals("tv", s.mediaTypeHint)
        assertFalse(s.seriesFromHint)
    }

    @Test
    fun `numeros sin serie en pantalla toman la serie de la ficha`() {
        val reading = PlayerReading(episode = 9, season = 6)
        val s = ScreenSignal.build(prime, "Prime Video", reading, SyncedInfo(37680, "tv", title = "Suits: la clave del éxito"))!!
        assertEquals("Suits: la clave del éxito", s.showName)
        assertTrue(s.seriesFromHint)
    }

    @Test
    fun `sin nada legible vale la ficha abierta antes, pelicula o serie`() {
        val movie = ScreenSignal.build(disney, "Disney+", null, SyncedInfo(4951, "movie", title = "10 razones para odiarte"))!!
        assertEquals("10 razones para odiarte", movie.movieTitle)
        assertEquals("movie", movie.mediaTypeHint)
        val show = ScreenSignal.build(disney, "Disney+", null, SyncedInfo(1, "tv", title = "Andor"))!!
        assertEquals("Andor", show.showName)
        assertNull(ScreenSignal.build(disney, "Disney+", null, null))
    }

    @Test
    fun `titulo suelto sin ficha va sin tipo`() {
        val s = ScreenSignal.build(prime, "Prime Video", PlayerReading(seriesTitle = "Billy Elliot", positionSec = 60), null)!!
        assertEquals("Billy Elliot", s.mainTitle)
        assertNull(s.showName)
        assertNull(s.movieTitle)
    }

    @Test
    fun `sin nada en el reproductor vale el episodio pulsado en la ficha de la serie`() {
        val suits = SyncedInfo(37680, "tv", title = "Suits: la clave del éxito")
        val s = ScreenSignal.build(prime, "Prime Video", null, suits, EpisodeChoice.Choice(6, 9))!!
        assertEquals("Suits: la clave del éxito", s.showName)
        assertEquals(6, s.season)
        assertEquals(9, s.episode)
        // En una película no se aplica.
        val movie = ScreenSignal.build(prime, "Prime Video", null, SyncedInfo(1, "movie", title = "Dune"), EpisodeChoice.Choice(6, 9))!!
        assertNull(movie.episode)
        // Lo que lee el reproductor gana al episodio pulsado.
        val read = ScreenSignal.build(prime, "Prime Video", PlayerReading(seriesTitle = "Suits", season = 6, episode = 10), suits, EpisodeChoice.Choice(6, 9))!!
        assertEquals(10, read.episode)
    }
}
