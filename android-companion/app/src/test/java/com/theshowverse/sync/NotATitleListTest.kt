package com.theshowverse.sync

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class NotATitleListTest {

    private val rules = NotATitleList.parse(
        """{"platforms":{"netflix":["top 10 en espana"],"primevideo":["destacados"]}}""",
    )

    @Test
    fun comparaConLaNormalizacionDelServidor() {
        assertTrue(NotATitleList.matches(rules, "netflix", "TOP 10 en España"))
        assertFalse(NotATitleList.matches(rules, "netflix", "Dark"))
    }

    @Test
    fun soloEnLaPlataformaDondeSeAprendio() {
        assertFalse(NotATitleList.matches(rules, "max", "Top 10 en España"))
    }

    @Test
    fun usaElIdCanonicoDeLaPlataforma() {
        assertEquals("primevideo", NotATitleList.canonicalPlatform("Prime"))
        assertTrue(NotATitleList.matches(rules, "prime", "Destacados"))
    }

    @Test
    fun unaRespuestaInvalidaNoBloqueaNada() {
        assertTrue(NotATitleList.parse("no es json").isEmpty())
        assertTrue(NotATitleList.parse(null).isEmpty())
    }
}
