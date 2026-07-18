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
        // Etiquetas propias de la ficha de Prime Video.
        assertTrue(ScreenHeuristics.isDetailSignal("Watchlist"))
        assertTrue(ScreenHeuristics.isDetailSignal("Incluido con Prime"))
        assertTrue(ScreenHeuristics.isDetailSignal("Comprar"))
        assertTrue(ScreenHeuristics.isDetailSignal("Alquilar"))
        assertTrue(ScreenHeuristics.isDetailSignal("X-Ray"))
        assertFalse(ScreenHeuristics.isDetailSignal("The Boys"))
        assertFalse(ScreenHeuristics.isDetailSignal(""))
    }

    @Test
    fun rejectsNavigationAndPlatformChromeAsTitles() {
        // Cromo de navegación/sistema que Prime Video emitía como candidatos.
        assertFalse(ScreenHeuristics.isLikelyTitle("Back"))
        assertFalse(ScreenHeuristics.isLikelyTitle("Atrás"))
        assertFalse(ScreenHeuristics.isLikelyTitle("Cargando…"))
        assertFalse(ScreenHeuristics.isLikelyTitle("Reproductor de vídeo"))
        assertFalse(ScreenHeuristics.isLikelyTitle("Reproduciendo vídeo"))
        // Nombres de plataforma a secas.
        assertFalse(ScreenHeuristics.isLikelyTitle("Amazon Prime Video"))
        assertFalse(ScreenHeuristics.isLikelyTitle("Max"))
        assertFalse(ScreenHeuristics.isLikelyTitle("Netflix"))
        // Títulos reales que se parecen pero SÍ deben pasar.
        assertTrue(ScreenHeuristics.isLikelyTitle("Off Campus"))
        assertTrue(ScreenHeuristics.isLikelyTitle("Secretos compartidos"))
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

    @Test
    fun betterDetailPrefersTheRealFichaOverEmptyOverlays() {
        // Caso del bug real de Prime: la ficha (muchas señales) DEBE ganar al overlay
        // "Prime Video Controlador de ventana" y a la pantalla de recientes (0 señales).
        // ficha: looksDetail=true, signals=5, cands=3   ·   overlay: false, 0, 1
        assertTrue(
            ScreenHeuristics.isBetterDetail(true, 5, 3, false, 0, 1),
        )
        assertFalse(
            ScreenHeuristics.isBetterDetail(false, 0, 1, true, 5, 3),
        )
        // Recientes (0 señales, 3 candidatos "Cerrar todo/YouTube/Mis archivos") no gana
        // a la ficha.
        assertFalse(
            ScreenHeuristics.isBetterDetail(false, 0, 3, true, 4, 2),
        )
    }

    @Test
    fun betterDetailBreaksTiesBySignalsThenCandidates() {
        // A igualdad de "parece ficha", gana la de más señales de detalle.
        assertTrue(ScreenHeuristics.isBetterDetail(true, 4, 1, true, 2, 3))
        assertFalse(ScreenHeuristics.isBetterDetail(true, 2, 3, true, 4, 1))
        // A igualdad de señales, gana la de más candidatos de título.
        assertTrue(ScreenHeuristics.isBetterDetail(true, 3, 4, true, 3, 2))
        // Empate total: no es estrictamente mejor.
        assertFalse(ScreenHeuristics.isBetterDetail(true, 3, 2, true, 3, 2))
    }
}
