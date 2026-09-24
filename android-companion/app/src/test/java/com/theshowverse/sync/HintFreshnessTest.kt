package com.theshowverse.sync

import org.junit.Assert.assertFalse
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
}
