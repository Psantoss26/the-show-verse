package com.theshowverse.sync

import com.theshowverse.sync.FotosHistorial.Historial
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class FotosHistorialTest {

    private val base = "https://theshowverse.com"

    /** Simula el WebView: lista de entradas, posición y tope. */
    private class Web(val tope: Int) {
        val urls = mutableListOf<String>()
        var indice = -1
        fun estado() = Historial(urls.toList(), indice)
        fun ir(url: String) {
            while (urls.size > indice + 1) urls.removeAt(urls.size - 1)
            urls.add(url)
            if (urls.size > tope) urls.removeAt(0) else indice++
        }
        fun atras() { indice-- }
        fun reemplazar(url: String) { urls[indice] = url }
    }

    private val web = Web(tope = 50)
    private val fotos = FotosHistorial<String>(maximo = 4)

    /** Toca la página actual (foto = su ruta) y navega a `destino`. */
    private fun tocarEIr(destino: String) {
        val e = web.estado()
        fotos.tocado("foto ${e.urlActual}", e.indice, e.urlActual)
        web.ir("$base$destino")
        fotos.cambio(web.estado())
    }

    private fun empezar(url: String) {
        web.ir("$base$url")
        fotos.cambio(web.estado())
    }

    @Test
    fun alVolverSeVeLaFotoDeLaPaginaAnterior() {
        empezar("/favorites")
        tocarEIr("/watchlist")
        tocarEIr("/history")
        tocarEIr("/details/tv/1")
        assertEquals("foto $base/history", fotos.anterior(web.estado()))
    }

    @Test
    fun conElHistorialLlenoLasFotosBajanConSusEntradas() {
        empezar("/0")
        repeat(60) { tocarEIr("/p$it") }
        assertEquals(49, web.indice)
        tocarEIr("/favorites")
        tocarEIr("/watchlist")
        tocarEIr("/history")
        tocarEIr("/details/tv/1")
        assertEquals(49, web.indice)
        assertEquals("foto $base/history", fotos.anterior(web.estado()))
        web.atras(); fotos.cambio(web.estado())
        assertEquals("foto $base/watchlist", fotos.anterior(web.estado()))
        web.atras(); fotos.cambio(web.estado())
        assertEquals("foto $base/favorites", fotos.anterior(web.estado()))
    }

    @Test
    fun nuncaSeEnsenaLaFotoDeOtraPagina() {
        empezar("/favorites")
        tocarEIr("/watchlist")
        tocarEIr("/details/tv/1")
        // La entrada anterior cambia de página sin que se sepa (p. ej. una
        // navegación con `replace` mientras se estaba en ella).
        web.urls[1] = "$base/history"
        assertNull(fotos.anterior(web.estado()))
    }

    @Test
    fun unToqueViejoDeOtraPaginaNoSeGuarda() {
        empezar("/favorites")
        val e = web.estado()
        fotos.tocado("foto favoritos", e.indice, e.urlActual)
        // `replace` a otra página: el toque ya no la representa.
        web.reemplazar("$base/watchlist"); fotos.cambio(web.estado())
        web.ir("$base/details/tv/1"); fotos.cambio(web.estado())
        assertNull(fotos.anterior(web.estado()))
    }

    @Test
    fun cambiarSoloLaConsultaMantieneLaFotoDelToque() {
        empezar("/favorites")
        val e = web.estado()
        fotos.tocado("foto favoritos", e.indice, e.urlActual)
        web.reemplazar("$base/favorites?orden=imdb"); fotos.cambio(web.estado())
        web.ir("$base/details/tv/1"); fotos.cambio(web.estado())
        assertEquals("foto favoritos", fotos.anterior(web.estado()))
    }

    @Test
    fun unToqueEnOtraPosicionNoSeAsocia() {
        empezar("/favorites")
        tocarEIr("/watchlist")
        // Toque en /watchlist que no navega; luego atrás y otra página.
        val e = web.estado()
        fotos.tocado("foto watchlist", e.indice, e.urlActual)
        web.atras(); fotos.cambio(web.estado())
        web.ir("$base/history"); fotos.cambio(web.estado())
        assertNull(fotos.anterior(web.estado()))
    }

    @Test
    fun soloGuardaLasUltimasPaginas() {
        empezar("/a")
        listOf("/b", "/c", "/d", "/e", "/f", "/g").forEach(::tocarEIr)
        assertEquals("foto $base/f", fotos.anterior(web.estado()))
        repeat(4) { web.atras(); fotos.cambio(web.estado()) }
        assertNull(fotos.anterior(web.estado())) // la de /b se descartó
    }
}
