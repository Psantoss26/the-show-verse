package com.theshowverse.sync

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class TitleMatchTest {

    @Test
    fun similarIgnoresAccentsCaseAndPunctuation() {
        assertTrue(TitleMatch.similar("La Casa del Dragón", "la casa del dragon"))
        assertTrue(TitleMatch.similar("¿Quién es Erin Carter?", "Quien es Erin Carter"))
        assertTrue(TitleMatch.similar("Hunter × Hunter", "Hunter x Hunter"))
    }

    @Test
    fun similarAcceptsTheDecorationsThePlatformsAdd() {
        // Lo que pinta la app suele traer coletillas; sigue siendo el mismo título.
        assertTrue(TitleMatch.similar("La casa del dragón", "La Casa del Dragón: Temporada 2"))
        assertTrue(TitleMatch.similar("Stranger Things", "Stranger Things 4"))
    }

    @Test
    fun similarRejectsUnrelatedTitles() {
        assertFalse(TitleMatch.similar("El padrino", "Los Soprano"))
        assertFalse(TitleMatch.similar("Breaking Bad", "Better Call Saul"))
        // Una palabra suelta NO puede pasar por un título que la contenga.
        assertFalse(TitleMatch.similar("Bola", "Bola de Dragón"))
        assertFalse(TitleMatch.similar("El", "El padrino"))
    }

    @Test
    fun corroboratesRequiresTheTitleToAppearOnScreen() {
        val pantalla = listOf("La casa del dragón", "Añadir a mi lista", "2022")
        assertTrue(TitleMatch.corroborates("La Casa del Dragón", pantalla))
        // Esto es lo que evita el fallo: TMDb devolvió algo que no está en pantalla.
        assertFalse(TitleMatch.corroborates("Los Soprano", pantalla))
        assertFalse(TitleMatch.corroborates("", pantalla))
        assertFalse(TitleMatch.corroborates("La casa del dragón", emptyList()))
    }

    @Test
    fun corroboratesToleratesNullsInTheScreenTexts() {
        assertTrue(TitleMatch.corroborates("Dune", listOf(null, "Dune", null)))
        assertFalse(TitleMatch.corroborates("Dune", listOf(null, null)))
    }

    @Test
    fun hintIsUsableOnlyWhenTheSessionLacksTheSeries() {
        // Caso Netflix: la sesión da el episodio, la ficha aportó la serie.
        assertTrue(TitleMatch.hintIsUsable("Los Simpson", "Bart el temerario", null))
        // La sesión YA trae la serie: la pista sobra y no debe pisarla.
        assertFalse(TitleMatch.hintIsUsable("Los Simpson", "Bart el temerario", "Padre de familia"))
        // La pista es el propio episodio: la ficha era del episodio, no de la serie.
        assertFalse(TitleMatch.hintIsUsable("Bart el temerario", "Bart el temerario", null))
        assertFalse(TitleMatch.hintIsUsable(null, "Bart el temerario", null))
    }
}
