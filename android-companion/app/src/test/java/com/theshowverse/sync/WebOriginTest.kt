package com.theshowverse.sync

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * De estas reglas depende qué se abre DENTRO de la app y, sobre todo, a quién se
 * le deja usar el puente JS. Por eso son puras y están cubiertas.
 */
class WebOriginTest {

    @Test
    fun `normaliza lo que teclea el usuario`() {
        assertEquals("https://theshowverse.com", WebOrigin.normalize("theshowverse.com"))
        assertEquals("https://theshowverse.com", WebOrigin.normalize("  theshowverse.com/  "))
        assertEquals("https://theshowverse.com", WebOrigin.normalize("HTTPS://TheShowVerse.com/perfil"))
        assertEquals("http://192.168.1.50:3000", WebOrigin.normalize("http://192.168.1.50:3000"))
        // El puerto por defecto no forma parte del origen normalizado.
        assertEquals("https://theshowverse.com", WebOrigin.normalize("https://theshowverse.com:443"))
    }

    @Test
    fun `rechaza lo que no sirve como origen`() {
        assertNull(WebOrigin.normalize(null))
        assertNull(WebOrigin.normalize("   "))
        assertNull(WebOrigin.normalize("javascript:alert(1)"))
        assertNull(WebOrigin.normalize("file:///sdcard/x.html"))
        assertNull(WebOrigin.normalize("ftp://theshowverse.com"))
    }

    @Test
    fun `lo del propio sitio se queda dentro`() {
        val origen = "https://theshowverse.com"
        assertTrue(WebOrigin.isInternal("https://theshowverse.com/", origen))
        assertTrue(WebOrigin.isInternal("https://theshowverse.com/details/movie/27205", origen))
        // www es el mismo sitio: un enlace compartido no debe salir al navegador.
        assertTrue(WebOrigin.isInternal("https://www.theshowverse.com/social", origen))
    }

    @Test
    fun `lo de fuera no se queda dentro`() {
        val origen = "https://theshowverse.com"
        assertFalse(WebOrigin.isInternal("https://www.themoviedb.org/movie/27205", origen))
        assertFalse(WebOrigin.isInternal("https://youtube.com/watch?v=1", origen))
        // Mismo host pero otro esquema o puerto: NO es el mismo origen.
        assertFalse(WebOrigin.isInternal("http://theshowverse.com/", origen))
        assertFalse(WebOrigin.isInternal("https://theshowverse.com:8443/", origen))
        // Un dominio que solo TERMINA igual no cuela.
        assertFalse(WebOrigin.isInternal("https://malotheshowverse.com/", origen))
        assertFalse(WebOrigin.isInternal("https://theshowverse.com.evil.net/", origen))
        assertFalse(WebOrigin.isInternal(null, origen))
        assertFalse(WebOrigin.isInternal("no es una url", origen))
    }

    @Test
    fun `servidor propio en la LAN funciona igual`() {
        val origen = "http://192.168.1.50:3000"
        assertTrue(WebOrigin.isInternal("http://192.168.1.50:3000/watchlist", origen))
        assertFalse(WebOrigin.isInternal("http://192.168.1.51:3000/watchlist", origen))
        assertFalse(WebOrigin.isInternal("https://theshowverse.com/", origen))
    }

    @Test
    fun `los esquemas ajenos los resuelve el sistema`() {
        assertTrue(WebOrigin.isExternalScheme("mailto:hola@theshowverse.com"))
        assertTrue(WebOrigin.isExternalScheme("market://details?id=com.netflix.mediaclient"))
        assertTrue(WebOrigin.isExternalScheme("intent://x#Intent;scheme=http;end"))
        assertFalse(WebOrigin.isExternalScheme("https://theshowverse.com"))
        assertFalse(WebOrigin.isExternalScheme("http://192.168.1.50:3000"))
    }

    @Test
    fun `url de acceso privado`() {
        assertEquals(
            "https://theshowverse.com/api/private-access?key=cla+ve%2F1",
            WebOrigin.privateAccessUrl("theshowverse.com", "cla ve/1"),
        )
        assertNull(WebOrigin.privateAccessUrl("theshowverse.com", "  "))
        assertNull(WebOrigin.privateAccessUrl(null, "x"))
    }
}
