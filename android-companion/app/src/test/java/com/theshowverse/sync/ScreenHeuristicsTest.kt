package com.theshowverse.sync

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ScreenHeuristicsTest {

    @Test
    fun playLabelMatchesCommonVariantsAndLanguages() {
        assertTrue(ScreenHeuristics.isPlayLabel("Reproducir"))
        assertTrue(ScreenHeuristics.isPlayLabel("PLAY"))
        assertTrue(ScreenHeuristics.isPlayLabel("Ver ahora"))
        assertTrue(ScreenHeuristics.isPlayLabel("Reanudar"))
        assertTrue(ScreenHeuristics.isPlayLabel("Continuar viendo"))
        assertTrue(ScreenHeuristics.isPlayLabel("Reproducir T1:E1"))
        assertTrue(ScreenHeuristics.isPlayLabel("Watch now"))
        assertFalse(ScreenHeuristics.isPlayLabel("Stranger Things"))
        assertFalse(ScreenHeuristics.isPlayLabel(""))
        assertFalse(ScreenHeuristics.isPlayLabel(null))
    }

    @Test
    fun detailSignalsRecognizeTypicalDetailPageElements() {
        assertTrue(ScreenHeuristics.isDetailSignal("Añadir a Mi lista"))
        assertTrue(ScreenHeuristics.isDetailSignal("Descargar"))
        assertTrue(ScreenHeuristics.isDetailSignal("Tráiler"))
        assertTrue(ScreenHeuristics.isDetailSignal("Episodios"))
        assertTrue(ScreenHeuristics.isDetailSignal("Temporada 1"))
        assertTrue(ScreenHeuristics.isDetailSignal("1 h 32 min"))
        assertTrue(ScreenHeuristics.isDetailSignal("45 min"))
        assertTrue(ScreenHeuristics.isDetailSignal("16+"))
        assertTrue(ScreenHeuristics.isDetailSignal("TV-MA"))
        assertFalse(ScreenHeuristics.isDetailSignal("The Boys"))
        assertFalse(ScreenHeuristics.isDetailSignal(""))
    }

    @Test
    fun looksLikeDetailFromPlayButtonOrEnoughSignals() {
        // Netflix: botón de reproducir reconocido → ficha.
        assertTrue(ScreenHeuristics.looksLikeDetail(sawPlay = true, detailSignals = 0))
        // Prime/Max: sin botón reconocido pero con varias señales de detalle → ficha.
        assertTrue(ScreenHeuristics.looksLikeDetail(sawPlay = false, detailSignals = 2))
        assertTrue(ScreenHeuristics.looksLikeDetail(sawPlay = false, detailSignals = 5))
        // Home/grid: ni botón ni señales suficientes → NO ficha.
        assertFalse(ScreenHeuristics.looksLikeDetail(sawPlay = false, detailSignals = 1))
        assertFalse(ScreenHeuristics.looksLikeDetail(sawPlay = false, detailSignals = 0))
    }

    @Test
    fun likelyTitleFiltersUiNoiseButAcceptsRealTitles() {
        assertTrue(ScreenHeuristics.isLikelyTitle("Stranger Things"))
        assertTrue(ScreenHeuristics.isLikelyTitle("The Boys"))
        assertTrue(ScreenHeuristics.isLikelyTitle("La Casa de Papel"))
        // Botones y señales de ficha no son títulos.
        assertFalse(ScreenHeuristics.isLikelyTitle("Reproducir"))
        assertFalse(ScreenHeuristics.isLikelyTitle("Añadir a Mi lista"))
        assertFalse(ScreenHeuristics.isLikelyTitle("Temporada 1"))
        assertFalse(ScreenHeuristics.isLikelyTitle("1 h 32 min"))
        // Ruido de UI / sinopsis.
        assertFalse(ScreenHeuristics.isLikelyTitle("Inicio"))
        assertFalse(
            ScreenHeuristics.isLikelyTitle(
                "Una sinopsis muy larga que claramente no es un título porque tiene demasiadas palabras seguidas",
            ),
        )
        assertFalse(ScreenHeuristics.isLikelyTitle("2024"))
        assertFalse(ScreenHeuristics.isLikelyTitle(""))
    }
}
