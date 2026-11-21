package com.theshowverse.sync

/**
 * Las FOTOS de las páginas que se dejan, para la transición de atrás
 * ([AtrasPredictivo]). Puro (sin vistas ni bitmaps concretos), con pruebas.
 *
 * Cada foto se guarda con la posición en el historial de la entrada que se deja
 * Y con su URL. La foto solo se enseña si la entrada a la que se vuelve sigue
 * teniendo esa URL: una foto de otra página no se ve nunca, pase lo que pase
 * con el historial (sin foto, la transición usa un velo liso).
 *
 * EL TOPE DE 50. El WebView guarda como mucho 50 entradas. Lleno, cada página
 * nueva borra la más antigua y la posición actual no cambia (49): todas las
 * entradas bajan un puesto. Antes las fotos seguían en su posición y, al volver,
 * salía un instante la foto de otra página (la que estaba ahí antes) hasta que
 * la web pintaba la buena. Ahora ese desplazamiento se detecta comparando las
 * URL y las fotos bajan con sus entradas.
 */
class FotosHistorial<T>(private val maximo: Int) {

    /** El historial del WebView: URL de cada entrada y posición actual. */
    data class Historial(val urls: List<String>, val indice: Int) {
        val urlActual: String? get() = urls.getOrNull(indice)
    }

    private class Foto<T>(val imagen: T, val url: String)

    private val paginas = HashMap<Int, Foto<T>>()
    private var visto: Historial? = null

    /** La del último toque: la página tal como se veía, su posición y su URL. */
    private var toque: Foto<T>? = null
    private var indiceToque = -1

    /** Quita la foto del último toque (para reutilizar su memoria) y la devuelve. */
    fun soltarToque(): T? = toque?.imagen.also { toque = null }

    /** Un dedo tocó la página `url`, en la posición `indice`: esta es su foto. */
    fun tocado(imagen: T, indice: Int, url: String?) {
        toque = url?.let { Foto(imagen, sinFragmento(it)) }
        indiceToque = indice
    }

    /** El historial ha cambiado (navegación, `pushState`, `replaceState`, atrás). */
    fun cambio(nuevo: Historial) {
        val antes = visto
        visto = nuevo
        if (antes == null || antes.indice < 0) return
        val a = antes.indice
        val n = nuevo.indice
        when {
            // Se avanza: la página que se deja es la de `a`, y lo que hubiera
            // desde ahí ya no vale (el historial hacia delante se ha cortado).
            n > a -> {
                paginas.keys.removeAll { it >= a }
                guardarToque(desde = a, en = a, nuevo)
            }
            // Historial lleno: misma posición, pero todo ha bajado un puesto.
            n == a && desplazadoUno(antes, nuevo) -> {
                val bajadas = paginas.filterKeys { it in 1 until a }.mapKeys { it.key - 1 }
                paginas.clear()
                paginas.putAll(bajadas)
                guardarToque(desde = a, en = a - 1, nuevo)
            }
            // Misma entrada con otra URL (`replaceState`). Si es la misma ruta
            // (cambia la consulta), la foto del toque sigue valiendo; si es
            // otra página, ya no.
            n == a -> {
                val t = toque
                val url = nuevo.urlActual
                if (t != null && indiceToque == a) {
                    toque = if (url != null && ruta(url) == ruta(t.url)) Foto(t.imagen, sinFragmento(url)) else null
                }
            }
            // Atrás: no se guarda nada; las fotos de las posiciones de delante
            // se quedan por si se vuelve a avanzar (se validan por URL al usarlas).
            else -> Unit
        }
        while (paginas.size > maximo) paginas.remove(paginas.keys.min())
    }

    /** La foto de la página a la que se vuelve, solo si es de esa página. */
    fun anterior(historial: Historial): T? {
        val i = historial.indice - 1
        val url = historial.urls.getOrNull(i) ?: return null
        val foto = paginas[i] ?: return null
        return foto.imagen.takeIf { foto.url == sinFragmento(url) }
    }

    private fun guardarToque(desde: Int, en: Int, nuevo: Historial) {
        val t = toque ?: return
        if (indiceToque != desde) return
        toque = null
        // La foto se tomó en la página que ahora está en `en`.
        if (nuevo.urls.getOrNull(en)?.let(::sinFragmento) == t.url) paginas[en] = t
    }

    /**
     * El historial lleno ha avanzado: sin la entrada más antigua, cada URL ha
     * bajado un puesto y la que era la actual queda justo antes.
     */
    private fun desplazadoUno(antes: Historial, nuevo: Historial): Boolean {
        val a = antes.indice
        if (a < 1 || antes.urls.size != nuevo.urls.size || a >= antes.urls.size) return false
        if (nuevo.urls[a - 1] != antes.urls[a]) return false
        return (0 until a - 1).all { nuevo.urls[it] == antes.urls[it + 1] }
    }

    companion object {
        fun sinFragmento(url: String) = url.substringBefore('#')
        fun ruta(url: String) = sinFragmento(url).substringBefore('?')
    }
}
