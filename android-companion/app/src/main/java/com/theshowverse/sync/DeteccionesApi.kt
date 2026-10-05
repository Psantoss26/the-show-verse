package com.theshowverse.sync

import android.os.Handler
import android.os.Looper
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.net.URLEncoder
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

/**
 * Registro de detecciones del móvil contra el servidor vinculado, con el TOKEN
 * del dispositivo (no hay sesión web: The Show Verse Sync no tiene WebView).
 * Rutas: /api/streaming/device/… (ver backend routes/streamingDetections.js).
 *
 * Cada llamada va en un hilo de fondo y contesta en el principal.
 */
class DeteccionesApi(private val prefs: Prefs) {

    sealed class Resultado<out T> {
        data class Ok<T>(val valor: T) : Resultado<T>()
        data class Error(val mensaje: String, val sinVincular: Boolean = false) : Resultado<Nothing>()
    }

    fun lista(alTerminar: (Resultado<List<Deteccion>>) -> Unit) =
        pedir(alTerminar) { get("/api/streaming/device/detections?days=7") { DeteccionesJson.lista(it) } }

    fun una(id: String, alTerminar: (Resultado<Deteccion>) -> Unit) =
        pedir(alTerminar) {
            get("/api/streaming/device/detections/${codificar(id)}") {
                DeteccionesJson.una(it) ?: throw ErrorDeRegistro("No se encontró la detección")
            }
        }

    fun corregir(id: String, pedida: CorreccionPedida, alTerminar: (Resultado<Deteccion>) -> Unit) =
        pedir(alTerminar) {
            post(
                "/api/streaming/device/detections/${codificar(id)}/correction",
                DeteccionesJson.cuerpoCorreccion(pedida),
            ) { DeteccionesJson.una(it) ?: throw ErrorDeRegistro("Respuesta inesperada del servidor") }
        }

    fun buscarTitulos(texto: String, alTerminar: (Resultado<List<TituloEncontrado>>) -> Unit) =
        pedir(alTerminar) {
            get("/api/streaming/device/titles?q=${codificar(texto)}") { DeteccionesJson.titulos(it) }
        }

    // ------------------------------------------------------------------ privado

    private class ErrorDeRegistro(mensaje: String, val sinVincular: Boolean = false) : Exception(mensaje)

    private fun <T> pedir(alTerminar: (Resultado<T>) -> Unit, trabajo: () -> T) {
        hilo.execute {
            val resultado: Resultado<T> = try {
                Resultado.Ok(trabajo())
            } catch (e: ErrorDeRegistro) {
                Resultado.Error(e.message ?: "Error", e.sinVincular)
            } catch (e: Exception) {
                Resultado.Error("Sin conexión con el servidor")
            }
            principal.post { alTerminar(resultado) }
        }
    }

    private fun <T> get(ruta: String, leer: (String) -> T): T = llamar(peticion(ruta).get().build(), leer)

    private fun <T> post(ruta: String, cuerpo: String, leer: (String) -> T): T =
        llamar(peticion(ruta).post(cuerpo.toRequestBody(JSON)).build(), leer)

    private fun peticion(ruta: String): Request.Builder {
        val token = prefs.token
        val origin = prefs.origin
        if (token.isNullOrBlank() || origin.isNullOrBlank()) {
            throw ErrorDeRegistro("Este dispositivo no está vinculado", sinVincular = true)
        }
        return Request.Builder()
            .url(origin.trimEnd('/') + ruta)
            .header("Authorization", "Bearer $token")
            .header("Accept", "application/json")
    }

    private fun <T> llamar(request: Request, leer: (String) -> T): T =
        cliente.newCall(request).execute().use { res ->
            val cuerpo = res.body?.string().orEmpty()
            when {
                res.code == 401 -> throw ErrorDeRegistro(
                    "La vinculación ya no es válida: vuelve a vincular este dispositivo",
                    sinVincular = true,
                )
                res.code == 404 -> throw ErrorDeRegistro("No se encontró la detección")
                !res.isSuccessful -> throw ErrorDeRegistro(mensajeDeError(cuerpo) ?: "Error del servidor (${res.code})")
                else -> leer(cuerpo)
            }
        }

    private fun mensajeDeError(cuerpo: String): String? = try {
        JSONObject(cuerpo).optString("error").takeIf { it.isNotBlank() }
    } catch (e: Exception) {
        null
    }

    private fun codificar(valor: String) = URLEncoder.encode(valor, "UTF-8")

    private companion object {
        val JSON = "application/json; charset=utf-8".toMediaType()
        val cliente: OkHttpClient = OkHttpClient.Builder()
            .connectTimeout(15, TimeUnit.SECONDS)
            .readTimeout(20, TimeUnit.SECONDS)
            .callTimeout(25, TimeUnit.SECONDS)
            .build()
        val hilo = Executors.newSingleThreadExecutor()
        val principal = Handler(Looper.getMainLooper())
    }
}
