package com.theshowverse.sync

import android.util.Log
import okhttp3.Call
import okhttp3.Callback
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import org.json.JSONObject
import java.io.IOException
import java.util.concurrent.TimeUnit

/**
 * Envía un [PlaybackSignal] al backend existente
 * (POST {origin}/api/netflix/extension-sync) con el token de sincronización.
 * Reutiliza el mismo endpoint/resolutor que la extensión del navegador.
 */
object SyncClient {

    private const val TAG = "TSVSync"
    private val JSON = "application/json; charset=utf-8".toMediaType()

    private val client = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(20, TimeUnit.SECONDS)
        .build()

    fun send(
        origin: String,
        token: String,
        signal: PlaybackSignal,
        resolveOnly: Boolean = false,
        onResult: (Boolean, String?, SyncedInfo?) -> Unit,
    ) {
        val json = JSONObject().apply {
            put("platform", signal.platformId)
            put("platformName", signal.platformName)
            put("mainTitle", signal.mainTitle ?: return@apply)
            put("subTitle", signal.episodeName ?: "")
            putOpt("showName", signal.showName)
            putOpt("episodeName", signal.episodeName)
            putOpt("movieTitle", signal.movieTitle)
            signal.season?.let { put("season", it) }
            signal.episode?.let { put("episode", it) }
            putOpt("seasonEpisodeText", signal.seasonEpisodeText)
            putOpt("tabTitle", signal.tabTitle)
            putOpt("queueTitle", signal.queueTitle)
            putOpt("albumArtist", signal.albumArtist)
            putOpt("notifTitle", signal.notifTitle)
            putOpt("notifText", signal.notifText)
            putOpt("notifSubText", signal.notifSubText)
            putOpt("artworkUrl", signal.artworkUrl)
            signal.durationSec?.let { put("durationSec", it) }
            signal.positionSec?.let { put("positionSec", it) }
            // El nombre de la serie sale de una ficha vista antes, no de lo que
            // suena: el servidor rebaja la confianza en consecuencia.
            if (signal.seriesFromHint) put("seriesFromHint", true)
            if (resolveOnly) put("resolveOnly", true)
        }

        val url = origin.trimEnd('/') + "/api/netflix/extension-sync"
        val request = Request.Builder()
            .url(url)
            .addHeader("Authorization", "Bearer $token")
            // UA de navegador: algunos firewalls/anti-bot rechazan el UA de OkHttp.
            .addHeader(
                "User-Agent",
                "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
            )
            .addHeader("Accept", "application/json")
            .post(json.toString().toRequestBody(JSON))
            .build()

        client.newCall(request).enqueue(object : Callback {
            override fun onFailure(call: Call, e: IOException) {
                Log.w(TAG, "Sync failed: ${e.message}")
                onResult(false, e.message, null)
            }

            override fun onResponse(call: Call, response: Response) {
                response.use {
                    val body = try {
                        it.body?.string()
                    } catch (e: Exception) {
                        null
                    }
                    if (it.isSuccessful) {
                        onResult(true, null, parseSynced(body))
                    } else {
                        val snippet = body?.take(200)
                        onResult(
                            false,
                            "HTTP ${it.code}" + if (snippet.isNullOrBlank()) "" else ": $snippet",
                            null,
                        )
                    }
                }
            }
        })
    }

    /**
     * Envía el progreso de reproducción (posición/duración) del contenido ya
     * resuelto a POST {origin}/api/netflix/extension-progress. El servidor hace
     * upsert de "Continuar viendo" y, al 90%, lo marca como visto (completed=true).
     */
    fun sendProgress(
        origin: String,
        token: String,
        synced: SyncedInfo,
        positionSeconds: Long,
        runtimeSeconds: Long,
        platform: String?,
        estimated: Boolean = false,
        onResult: (Boolean, Boolean) -> Unit,
    ) {
        val json = JSONObject().apply {
            put("tmdbId", synced.tmdbId)
            put("mediaType", synced.mediaType ?: "movie")
            synced.season?.let { put("season", it) }
            synced.episode?.let { put("episode", it) }
            put("positionSeconds", positionSeconds)
            put("runtimeSeconds", runtimeSeconds)
            putOpt("platform", platform)
            putOpt("title", synced.title)
            putOpt("posterPath", synced.posterPath)
            putOpt("confidence", synced.confidence)
            // Posición deducida por reloj (la app no la publica): el servidor la
            // usa solo para Continuar viendo, nunca para marcar como visto.
            if (estimated) put("estimated", true)
        }

        val url = origin.trimEnd('/') + "/api/netflix/extension-progress"
        val request = Request.Builder()
            .url(url)
            .addHeader("Authorization", "Bearer $token")
            .addHeader(
                "User-Agent",
                "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
            )
            .addHeader("Accept", "application/json")
            .post(json.toString().toRequestBody(JSON))
            .build()

        client.newCall(request).enqueue(object : Callback {
            override fun onFailure(call: Call, e: IOException) {
                Log.w(TAG, "Progress failed: ${e.message}")
                onResult(false, false)
            }

            override fun onResponse(call: Call, response: Response) {
                response.use {
                    val body = try {
                        it.body?.string()
                    } catch (e: Exception) {
                        null
                    }
                    if (it.isSuccessful) {
                        val completed = try {
                            JSONObject(body ?: "{}").optBoolean("completed", false)
                        } catch (e: Exception) {
                            false
                        }
                        onResult(true, completed)
                    } else {
                        onResult(false, false)
                    }
                }
            }
        })
    }

    /** Extrae el objeto `synced` de la respuesta del endpoint (o null). */
    private fun parseSynced(body: String?): SyncedInfo? {
        if (body.isNullOrBlank()) return null
        return try {
            val synced = JSONObject(body).optJSONObject("synced") ?: return null
            val id = synced.optInt("tmdbId", 0)
            if (id <= 0) return null
            SyncedInfo(
                tmdbId = id,
                mediaType = synced.optString("mediaType").ifBlank { null },
                season = if (synced.has("season") && !synced.isNull("season")) synced.optInt("season") else null,
                episode = if (synced.has("episode") && !synced.isNull("episode")) synced.optInt("episode") else null,
                title = synced.optString("title").ifBlank { null },
                posterPath = synced.optString("posterPath").ifBlank { null },
                confidence = synced.optString("confidence").ifBlank { null },
            )
        } catch (e: Exception) {
            null
        }
    }
}
