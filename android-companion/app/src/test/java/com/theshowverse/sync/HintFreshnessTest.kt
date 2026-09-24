package com.theshowverse.sync

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class HintFreshnessTest {
    private val min = 60_000L
    private val start = 100 * min // la reproducción empezó aquí

    @Test
    fun fichaVistaJustoAntesDeReproducirVale() {
        assertTrue(HintFreshness.usable(RecentDetail.Source.DETAIL, start - 2 * min, start, start + min))
    }

    @Test
    fun fichaAntiguaNoValeParaOtraReproduccion() {
        // Se abrió la ficha de A hace 20 min y ahora suena otra cosa: nada de pista.
        assertFalse(HintFreshness.usable(RecentDetail.Source.DETAIL, start - 20 * min, start, start + min))
    }

    @Test
    fun loConfirmadoAlReproducirSoloValeEnLaMismaSesion() {
        // Siguiente episodio encadenado: misma sesión, la pista sigue.
        assertTrue(HintFreshness.usable(RecentDetail.Source.PLAYBACK, start + 25 * min, start, start + 26 * min))
        // Sesión nueva tras parar: lo de la anterior ya no vale.
        assertFalse(HintFreshness.usable(RecentDetail.Source.PLAYBACK, start - min, start, start + min))
    }

    @Test
    fun nadaVaMasAllaDeMediaHora() {
        assertFalse(HintFreshness.usable(RecentDetail.Source.PLAYBACK, start + min, start, start + 40 * min))
        assertFalse(HintFreshness.usable(RecentDetail.Source.DETAIL, 0L, start, start + min))
    }

    @Test
    fun elMismoEpisodioSeReconoceTrasUnaPausaLarga() {
        assertTrue(HintFreshness.resumeUsable(start, start + 2 * 60 * min))
        assertFalse(HintFreshness.resumeUsable(start, start + 7 * 60 * min))
        assertFalse(HintFreshness.resumeUsable(0L, start))
    }

    @Test
    fun laIdentidadDelEpisodioIgnoraNombresGenericos() {
        assertEquals(
            HintFreshness.episodeKey("Capítulo uno: La desaparición", 1, 1),
            HintFreshness.episodeKey("capitulo uno  la desaparicion", 1, 1),
        )
        assertNull(HintFreshness.episodeKey("Episodio 3", 1, 3))
        assertNull(HintFreshness.episodeKey("Capítulo 1", 1, 1))
        assertNull(HintFreshness.episodeKey(null, 1, 1))
    }
}
