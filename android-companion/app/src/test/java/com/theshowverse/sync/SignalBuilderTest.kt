package com.theshowverse.sync

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Assert.assertNull
import org.junit.Test

class SignalBuilderTest {

    @Test
    fun parsesSeasonEpisodeMultiLanguage() {
        assertEquals(4 to 1, SignalBuilder.parseSeasonEpisode("Temporada 4: Episodio 1"))
        assertEquals(2 to 10, SignalBuilder.parseSeasonEpisode("S2 E10"))
        assertEquals(1 to 2, SignalBuilder.parseSeasonEpisode("T1:E2"))
        // Episodio sin temporada: NO se asume 1 (queda null; el servidor decide).
        assertEquals(null to 5, SignalBuilder.parseSeasonEpisode("Capítulo 5"))
        assertNull(SignalBuilder.parseSeasonEpisode("sin numeros"))
        assertNull(SignalBuilder.parseSeasonEpisode(""))
    }

    @Test
    fun episodeRegexDoesNotMatchInsideWords() {
        // "PARTE3"/"SUITE3" contienen "E3" pero NO son un episodio (guarda izquierda).
        assertNull(SignalBuilder.parseSeasonEpisode("PARTE3"))
        assertNull(SignalBuilder.parseSeasonEpisode("Suite3"))
        // Los formatos legítimos con no-letra delante siguen casando.
        assertEquals(2 to 10, SignalBuilder.parseSeasonEpisode("S2E10"))
        assertEquals(1 to 1, SignalBuilder.parseSeasonEpisode("T1:E1 - Piloto"))
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
    fun treatsSubtitleAsSeriesWhenNoArtistOrAlbum() {
        // HBO Max: sin artist/album; el EPISODIO va en title y la SERIE en el
        // subtítulo. Antes se enviaba el episodio como película → 404 en TMDb.
        val raw = RawMetadata(
            packageName = "com.wbd.stream",
            title = "Los herederos del Dragón",
            displayTitle = "Los herederos del Dragón",
            displaySubtitle = "La Casa del Dragón",
            durationMs = 3_600_000,
            positionMs = 60_000,
        )
        val sig = SignalBuilder.build(raw, "Max")
        assertEquals("La Casa del Dragón", sig.showName)
        assertEquals("Los herederos del Dragón", sig.episodeName)
        assertNull(sig.movieTitle)
        // mainTitle es la SERIE (lo que TMDb sí resuelve).
        assertEquals("La Casa del Dragón", sig.mainTitle)
    }

    @Test
    fun usesAccessibilityHintAsSeriesWhenMediaSessionLacksIt() {
        // Netflix (Ataque a los Titanes): la MediaSession no expone la serie; title
        // es el episodio y el subtítulo es "T1:E1 - <episodio>". La ficha abierta
        // antes dio la serie ("Ataque a los Titanes") → se usa como nombre de serie.
        val raw = RawMetadata(
            packageName = "com.netflix.mediaclient",
            title = "A ti, dentro de 2000 años - La caída de Shiganshina, parte 1",
            displayTitle = "A ti, dentro de 2000 años - La caída de Shiganshina, parte 1",
            displaySubtitle = "T1:E1 - A ti, dentro de 2000 años - La caída de Shiganshina, parte 1",
        )
        val sig = SignalBuilder.build(raw, "Netflix", hintShowName = "Ataque a los Titanes")
        assertEquals("Ataque a los Titanes", sig.showName)
        assertEquals(
            "A ti, dentro de 2000 años - La caída de Shiganshina, parte 1",
            sig.episodeName,
        )
        assertNull(sig.movieTitle)
        assertEquals(1, sig.season)
        assertEquals(1, sig.episode)
        assertEquals("Ataque a los Titanes", sig.mainTitle)
    }

    @Test
    fun doesNotUseEpisodeMarkerSubtitleAsSeries() {
        // Sin pista de accesibilidad, un subtítulo "T1:E1 - <mismo episodio>" NO debe
        // enviarse como nombre de serie (antes producía una notificación sin relación).
        val raw = RawMetadata(
            packageName = "com.netflix.mediaclient",
            title = "A ti, dentro de 2000 años - La caída de Shiganshina, parte 1",
            displaySubtitle = "T1:E1 - A ti, dentro de 2000 años - La caída de Shiganshina, parte 1",
        )
        val sig = SignalBuilder.build(raw, "Netflix")
        assertNull(sig.showName)
        assertEquals(
            "A ti, dentro de 2000 años - La caída de Shiganshina, parte 1",
            sig.movieTitle,
        )
        assertEquals(1, sig.season)
        assertEquals(1, sig.episode)
    }

    @Test
    fun ignoresHintForMovieWithoutEpisodeNumber() {
        // Una pista de serie no debe convertir una película (sin nº de episodio) en
        // episodio.
        val raw = RawMetadata(packageName = "com.netflix.mediaclient", title = "Alguna Película")
        val sig = SignalBuilder.build(raw, "Netflix", hintShowName = "Ataque a los Titanes")
        assertEquals("Alguna Película", sig.movieTitle)
        assertNull(sig.showName)
        assertNull(sig.episode)
    }

    @Test
    fun keepsMovieWhenSubtitleEqualsTitleOrAbsent() {
        // Película con subtítulo idéntico al título (o inexistente) → sigue siendo
        // película, NO se inventa una serie.
        val same = SignalBuilder.build(
            RawMetadata(
                packageName = "com.wbd.stream",
                title = "Dune",
                displaySubtitle = "Dune",
            ),
            "Max",
        )
        assertEquals("Dune", same.movieTitle)
        assertNull(same.showName)
        assertNull(same.episodeName)
        assertEquals("Dune", same.mainTitle)
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

    @Test
    fun marksWhenTheSeriesNameCameOnlyFromTheHint() {
        // La serie sale de la ficha vista antes, no de la sesión: se marca para que
        // el servidor no le dé la misma confianza que a un dato de la reproducción.
        val raw = RawMetadata(
            packageName = "com.netflix.mediaclient",
            title = "A ti, dentro de 2000 años",
            displaySubtitle = "T1:E1 - A ti, dentro de 2000 años",
        )
        val sig = SignalBuilder.build(raw, "Netflix", hintShowName = "Ataque a los Titanes")
        assertEquals("Ataque a los Titanes", sig.showName)
        assertTrue(sig.seriesFromHint)

        // Con la serie en la propia sesión, la pista ni se toca.
        val conArtista = SignalBuilder.build(
            raw.copy(artist = "Peaky Blinders"),
            "Netflix",
            hintShowName = "Ataque a los Titanes",
        )
        assertEquals("Peaky Blinders", conArtista.showName)
        assertFalse(conArtista.seriesFromHint)
    }

    @Test
    fun sessionSubtitleBeatsTheRememberedHint() {
        // El subtítulo describe lo que suena AHORA; la pista es un recuerdo de otra
        // pantalla. Si los dos aportan serie, manda la sesión.
        val raw = RawMetadata(
            packageName = "com.netflix.mediaclient",
            title = "El trato",
            displaySubtitle = "La casa del dragón",
            album = null,
        )
        val sig = SignalBuilder.build(
            raw.copy(displaySubtitle = "La casa del dragón · E3"),
            "Netflix",
            hintShowName = "Ataque a los Titanes",
        )
        assertEquals("La casa del dragón · E3", sig.showName)
        assertFalse(sig.seriesFromHint)
    }

    @Test
    fun ignoresHintWhenItIsTheEpisodeItself() {
        // Ficha del EPISODIO (no de la serie): usarla como nombre de serie manda a
        // TMDb el episodio y devuelve un título sin relación.
        val raw = RawMetadata(
            packageName = "com.netflix.mediaclient",
            title = "A ti, dentro de 2000 años",
            displaySubtitle = "T1:E1 - A ti, dentro de 2000 años",
        )
        val sig = SignalBuilder.build(raw, "Netflix", hintShowName = "A ti, dentro de 2000 años")
        assertNull(sig.showName)
        assertFalse(sig.seriesFromHint)
    }
}
