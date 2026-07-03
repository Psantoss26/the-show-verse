package com.theshowverse.sync

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class SignalBuilderTest {

    @Test
    fun parsesSeasonEpisodeMultiLanguage() {
        assertEquals(4 to 1, SignalBuilder.parseSeasonEpisode("Temporada 4: Episodio 1"))
        assertEquals(2 to 10, SignalBuilder.parseSeasonEpisode("S2 E10"))
        assertEquals(1 to 2, SignalBuilder.parseSeasonEpisode("T1:E2"))
        assertEquals(1 to 5, SignalBuilder.parseSeasonEpisode("Capítulo 5"))
        assertNull(SignalBuilder.parseSeasonEpisode("sin numeros"))
        assertNull(SignalBuilder.parseSeasonEpisode(""))
    }

    @Test
    fun buildsSeriesSignalFromMediaSession() {
        val raw = RawMetadata(
            packageName = "com.netflix.mediaclient",
            title = "El Regreso",
            artist = "Peaky Blinders",
            displaySubtitle = "T2 E3",
            artUri = "http://art/big.jpg",
            durationMs = 3_000_000,
            positionMs = 120_000,
        )
        val sig = SignalBuilder.build(raw, "Netflix")
        assertEquals("Peaky Blinders", sig.showName)
        assertEquals("El Regreso", sig.episodeName)
        assertNull(sig.movieTitle)
        assertEquals(2, sig.season)
        assertEquals(3, sig.episode)
        assertEquals("Peaky Blinders", sig.mainTitle)
        assertEquals(120L, sig.positionSec)
    }

    @Test
    fun buildsMovieSignalWhenNoArtist() {
        val raw = RawMetadata(
            packageName = "com.disney.disneyplus",
            title = "Napoleón",
        )
        val sig = SignalBuilder.build(raw, "Disney+")
        assertEquals("Napoleón", sig.movieTitle)
        assertNull(sig.showName)
        assertNull(sig.episode)
        assertEquals("Napoleón", sig.mainTitle)
    }

    @Test
    fun parsesEpisodeFromAlbumWhenSubtitleMissing() {
        val raw = RawMetadata(
            packageName = "com.crunchyroll.crunchyroid",
            title = "El trato",
            artist = "Arcane",
            album = "Temporada 1 Episodio 4",
        )
        val sig = SignalBuilder.build(raw, "Crunchyroll")
        assertEquals(1, sig.season)
        assertEquals(4, sig.episode)
    }
}
