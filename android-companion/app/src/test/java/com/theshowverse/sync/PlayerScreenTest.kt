package com.theshowverse.sync

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertSame
import org.junit.Assert.assertTrue
import org.junit.Test

class PlayerScreenTest {

    @Test
    fun readsCrunchyrollPlayerOverlay() {
        // Barra superior del reproductor de Crunchyroll: serie y, debajo, el episodio.
        val r = PlayerScreen.parse(
            listOf("Atrás", "Frieren", "T1 E12 - La promesa", "Transmitir", "Pausa", "12:34", "23:40"),
            seekFraction = 0.53,
            atMs = 1_000L,
        )!!
        assertEquals("Frieren", r.seriesTitle)
        assertEquals("La promesa", r.episodeName)
        assertEquals(1, r.season)
        assertEquals(12, r.episode)
        assertEquals(754L, r.positionSec)
        assertEquals(1420L, r.durationSec)
        assertEquals(1_000L, r.atMs)
    }

    @Test
    fun readsPrimeVideoPlayerWithRemainingTime() {
        // Prime Video: «Temporada 1, ep. 3 Nombre» y el tiempo RESTANTE con signo.
        val r = PlayerScreen.parse(
            listOf("The Boys", "Temporada 4, ep. 3 Nombre en clave", "20:00", "-40:00", "X-Ray"),
            seekFraction = null,
            atMs = 0L,
        )!!
        assertEquals("The Boys", r.seriesTitle)
        assertEquals("Nombre en clave", r.episodeName)
        assertEquals(4, r.season)
        assertEquals(3, r.episode)
        assertEquals(1200L, r.positionSec)
        assertEquals(3600L, r.durationSec)
    }

    @Test
    fun episodeNameCanComeInTheNextText() {
        val r = PlayerScreen.parse(
            listOf("Frieren", "T1 E12", "La promesa", "1:02:03 / 1:30:00"),
            seekFraction = null,
            atMs = 0L,
        )!!
        assertEquals("Frieren", r.seriesTitle)
        assertEquals("La promesa", r.episodeName)
        assertEquals(12, r.episode)
        assertEquals(3723L, r.positionSec)
        assertEquals(5400L, r.durationSec)
    }

    @Test
    fun movieHasNoIdentityButKeepsTheTime() {
        val r = PlayerScreen.parse(listOf("Dune", "45:00", "-1:50:00"), null, 0L)!!
        assertNull(r.seriesTitle)
        assertNull(r.episode)
        assertFalse(r.hasIdentity)
        assertEquals(2700L, r.positionSec)
        assertEquals(9300L, r.durationSec)
    }

    @Test
    fun ignoresTheUpNextCard() {
        // La tarjeta de "Siguiente episodio" no es lo que suena.
        val r = PlayerScreen.parse(
            listOf("Frieren", "Siguiente episodio", "T1 E13 - Otro", "23:10", "23:40"),
            null,
            0L,
        )!!
        assertNull(r.episode)
    }

    @Test
    fun notAPlayerWithoutSeekBarOrTimes() {
        assertNull(PlayerScreen.parse(listOf("Frieren", "T1 E12 - La promesa", "Episodios"), null, 0L))
        // Una hora del día ("Termina a las 22:15") no es un tiempo del vídeo.
        assertNull(PlayerScreen.parse(listOf("Dune", "Termina a las 22:15", "21:30"), null, 0L))
    }

    @Test
    fun remainingTimeWithSeekBarGivesPositionAndDuration() {
        val r = PlayerScreen.parse(listOf("Dune", "-30:00"), seekFraction = 0.5, atMs = 0L)!!
        assertEquals(1800L, r.positionSec)
        assertEquals(3600L, r.durationSec)
    }

    private fun sessionSignal(raw: RawMetadata, hint: String? = null) =
        SignalBuilder.build(raw, "Crunchyroll", hint)

    @Test
    fun mergeGivesTheSeriesToAnEpisodeWithoutIt() {
        // La sesión solo trae el nombre del episodio: sin la lectura se tomaba por
        // una película con ese nombre.
        val session = sessionSignal(RawMetadata(packageName = "com.crunchyroll.crunchyroid", title = "La promesa"))
        assertEquals("La promesa", session.movieTitle)
        val reading = PlayerReading(seriesTitle = "Frieren", episodeName = "La promesa", season = 1, episode = 12)
        val merged = PlayerScreen.merge(session, reading)
        assertEquals("Frieren", merged.showName)
        assertEquals("La promesa", merged.episodeName)
        assertNull(merged.movieTitle)
        assertEquals(1, merged.season)
        assertEquals(12, merged.episode)
        assertTrue(merged.seriesFromHint)
        assertEquals("Frieren", merged.mainTitle)
    }

    @Test
    fun mergeWhenSessionTitleIsTheSeries() {
        // Prime Video: la sesión da el nombre de la SERIE como título.
        val session = SignalBuilder.build(
            RawMetadata(packageName = "com.amazon.avod.thirdpartyclient", title = "The Boys"),
            "Prime Video",
        )
        val merged = PlayerScreen.merge(
            session,
            PlayerReading(seriesTitle = "The Boys", episodeName = "Nombre en clave", season = 4, episode = 3),
        )
        assertEquals("The Boys", merged.showName)
        assertEquals("Nombre en clave", merged.episodeName)
        assertEquals(4, merged.season)
        assertEquals(3, merged.episode)
    }

    @Test
    fun mergeBeatsTheDetailHintButNotTheSessionSeries() {
        val raw = RawMetadata(packageName = "com.crunchyroll.crunchyroid", title = "E12 - La promesa")
        val conPista = sessionSignal(raw, hint = "Dandadan")
        assertTrue(conPista.seriesFromHint)
        val reading = PlayerReading(seriesTitle = "Frieren", episode = 12)
        assertEquals("Frieren", PlayerScreen.merge(conPista, reading).showName)

        // La sesión SÍ da la serie: manda la sesión.
        val conSerie = sessionSignal(raw.copy(title = "La promesa", artist = "Frieren", album = "T1 E12"))
        val merged = PlayerScreen.merge(conSerie, PlayerReading(seriesTitle = "Otra serie", episode = 12))
        assertSame(conSerie, merged)
    }

    @Test
    fun mergeIgnoresAReadingOfAnotherEpisode() {
        // La lectura es del episodio anterior (autoplay): números distintos.
        val session = sessionSignal(RawMetadata(packageName = "com.crunchyroll.crunchyroid", title = "E13 - Otro"))
        val merged = PlayerScreen.merge(session, PlayerReading(seriesTitle = "Frieren", episode = 12))
        assertSame(session, merged)

        // O el nombre del episodio no casa.
        val porNombre = sessionSignal(RawMetadata(packageName = "com.crunchyroll.crunchyroid", title = "Otro episodio"))
        assertSame(
            porNombre,
            PlayerScreen.merge(porNombre, PlayerReading(seriesTitle = "Frieren", episodeName = "La promesa", episode = 12)),
        )
    }

    @Test
    fun mergeLeavesMoviesAlone() {
        val session = SignalBuilder.build(
            RawMetadata(packageName = "com.amazon.avod.thirdpartyclient", title = "Dune"),
            "Prime Video",
        )
        assertSame(session, PlayerScreen.merge(session, PlayerReading(positionSec = 10)))
        assertSame(session, PlayerScreen.merge(session, null))
    }

    @Test
    fun dedupKeyIsStableWhileTheSameReadingApplies() {
        val session = sessionSignal(RawMetadata(packageName = "com.crunchyroll.crunchyroid", title = "La promesa"))
        val reading = PlayerReading(seriesTitle = "Frieren", episodeName = "La promesa", season = 1, episode = 12)
        val a = PlayerScreen.merge(session, reading)
        val b = PlayerScreen.merge(session, reading.copy(seriesTitle = "Frieren: Más allá del final del viaje"))
        assertEquals(a.dedupKey, b.dedupKey)
    }

    @Test
    fun clockAdvancesOnlyWhilePlaying() {
        val clock = PlayerClock()
        val reading = PlayerReading(positionSec = 100, atMs = 10_000L)
        // Leído a los 10 s; suena desde los 5 s → a los 20 s va por 110 s.
        assertEquals(110_000L, clock.positionMs("p", reading, nowMs = 20_000L, playingSinceMs = 5_000L))
        // Sigue sonando: +3 s.
        assertEquals(113_000L, clock.positionMs("p", reading, nowMs = 23_000L, playingSinceMs = 5_000L))
        // Pausa de 60 s y se reanuda a los 83 s: la pausa no cuenta.
        clock.pause("p")
        assertEquals(116_000L, clock.positionMs("p", reading, nowMs = 86_000L, playingSinceMs = 83_000L))
        // Nueva lectura (se ha adelantado): manda la lectura.
        val nueva = PlayerReading(positionSec = 500, atMs = 90_000L)
        assertEquals(502_000L, clock.positionMs("p", nueva, nowMs = 92_000L, playingSinceMs = 83_000L))
    }

    @Test
    fun clockReadingTakenWhilePausedStartsAtResume() {
        val clock = PlayerClock()
        // Leído en pausa a los 10 s; se reanuda a los 50 s; a los 60 s → +10 s.
        val reading = PlayerReading(positionSec = 100, atMs = 10_000L)
        assertEquals(110_000L, clock.positionMs("p", reading, nowMs = 60_000L, playingSinceMs = 50_000L))
        assertNull(PlayerClock().positionMs("p", null, 1L, 0L))
    }

    @Test
    fun cacheKeepsIdentityWhenOnlyTheTimeChanges() {
        val pkg = "test.cache"
        PlayerScreenCache.forget(pkg)
        PlayerScreenCache.record(pkg, PlayerReading(seriesTitle = "Frieren", episode = 12, episodeName = "La promesa", positionSec = 10, atMs = 1_000L))
        PlayerScreenCache.record(pkg, PlayerReading(positionSec = 40, durationSec = 1420, atMs = 5_000L))
        val r = PlayerScreenCache.latest(pkg, sinceMs = 0L, nowMs = 6_000L)!!
        assertEquals("Frieren", r.seriesTitle)
        assertEquals(40L, r.positionSec)
        assertEquals(1420L, r.durationSec)
        assertEquals(5_000L, r.atMs)
        // Lecturas anteriores al contenido en curso no valen.
        assertNull(PlayerScreenCache.latest(pkg, sinceMs = 5_001L, nowMs = 6_000L))
        PlayerScreenCache.forget(pkg)
    }
}
