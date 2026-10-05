package com.theshowverse.sync

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.os.Handler
import android.os.Looper
import android.util.LruCache
import android.widget.ImageView
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors

/**
 * Portadas de TMDb para el aviso de acceso rápido y el registro de detecciones.
 * Caché en memoria pequeña: el registro son unas decenas de miniaturas.
 */
object Portadas {

    const val PEQUENA = "https://image.tmdb.org/t/p/w154"
    const val MEDIANA = "https://image.tmdb.org/t/p/w342"

    private val cache = object : LruCache<String, Bitmap>(8 * 1024 * 1024) {
        override fun sizeOf(key: String, value: Bitmap) = value.byteCount
    }
    private val hilos = Executors.newFixedThreadPool(3)
    private val principal = Handler(Looper.getMainLooper())

    /** Descarga BLOQUEANTE (hilo de fondo). Null si no se pudo. */
    fun cargar(url: String): Bitmap? {
        cache.get(url)?.let { return it }
        return try {
            val conn = URL(url).openConnection() as HttpURLConnection
            conn.connectTimeout = 6000
            conn.readTimeout = 6000
            conn.instanceFollowRedirects = true
            conn.setRequestProperty("User-Agent", "Mozilla/5.0 (Android) TSVSync")
            conn.inputStream.use { BitmapFactory.decodeStream(it) }?.also { cache.put(url, it) }
        } catch (e: Exception) {
            null
        }
    }

    /**
     * Pinta la portada en [vista] cuando llegue. La etiqueta evita que una vista
     * reutilizada reciba la imagen de otra fila.
     */
    fun en(vista: ImageView, posterPath: String?, base: String = PEQUENA) {
        val url = posterPath?.takeIf { it.isNotBlank() }?.let { base + it }
        vista.tag = url
        vista.setImageDrawable(null)
        if (url == null) return
        cache.get(url)?.let {
            vista.setImageBitmap(it)
            return
        }
        hilos.execute {
            val bitmap = cargar(url) ?: return@execute
            principal.post { if (vista.tag == url) vista.setImageBitmap(bitmap) }
        }
    }
}
