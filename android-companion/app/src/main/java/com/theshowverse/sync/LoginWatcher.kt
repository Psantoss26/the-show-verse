package com.theshowverse.sync

import android.app.Activity
import android.content.Intent
import android.os.Handler
import android.os.Looper
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONObject
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Vigila el login de Google que está ocurriendo en el navegador y devuelve la
 * app al frente EN CUANTO termina.
 *
 * POR QUÉ EXISTE. Google no admite su formulario dentro de un WebView, así que
 * esa parte tiene que pasar por el navegador. Volver de ahí a la app dependía de
 * cosas que no siempre se cumplen: Chrome bloquea el salto al esquema propio si
 * no lo dispara un gesto (de ahí el botón "Abrir The Show Verse"), y los App
 * Links solo devuelven el control cuando el dominio está verificado.
 *
 * CÓMO LO RESUELVE. La pestaña del navegador se abre DENTRO de la tarea de la
 * app, así que el proceso sigue vivo y con una actividad en la pila de la tarea
 * en primer plano. En esa situación Android sí permite traer la actividad al
 * frente. Aquí se pregunta al servidor cada segundo y medio si la sesión ya está
 * lista —una consulta que NO la consume— y, cuando lo está, se vuelve a la app.
 * Reclamarla sigue siendo cosa del WebView, que es donde deben quedar las
 * cookies: al recuperar el foco, la web lo hace sola.
 */
object LoginWatcher {

    private const val INTERVALO_MS = 1500L
    private const val LIMITE_MS = 3 * 60 * 1000L // un login que tarde más, se abandona

    private val cliente = OkHttpClient.Builder()
        .connectTimeout(10, TimeUnit.SECONDS)
        .readTimeout(10, TimeUnit.SECONDS)
        .build()

    private val principal = Handler(Looper.getMainLooper())
    private val enMarcha = AtomicBoolean(false)

    /** Deja de vigilar (por ejemplo, si el usuario vuelve a la app por su cuenta). */
    fun cancelar() {
        enMarcha.set(false)
    }

    /**
     * Empieza a vigilar la entrega [appId] contra [origen]. Al detectarla lista,
     * trae [activity] al frente, lo que cierra la pestaña del navegador que
     * estaba encima.
     */
    fun vigilar(activity: Activity, origen: String, appId: String) {
        if (appId.isBlank() || origen.isBlank()) return
        // Una sola vigilancia a la vez: si se reintenta el login, la anterior se
        // descarta.
        enMarcha.set(false)
        principal.postDelayed({ arrancar(activity, origen, appId) }, 300)
    }

    private fun arrancar(activity: Activity, origen: String, appId: String) {
        val prefs = Prefs(activity)
        enMarcha.set(true)
        val hasta = System.currentTimeMillis() + LIMITE_MS
        prefs.addLog("Google: esperando a que termine en el navegador…")

        val url = "${origen.trimEnd('/')}/api/auth/google/claim/status?app=" +
            java.net.URLEncoder.encode(appId, "UTF-8")

        fun siguiente() {
            if (!enMarcha.get()) return
            if (System.currentTimeMillis() > hasta) {
                enMarcha.set(false)
                prefs.addLog("Google: se agotó la espera del navegador")
                return
            }

            Thread {
                val estado = try {
                    cliente.newCall(Request.Builder().url(url).get().build()).execute().use { res ->
                        if (!res.isSuccessful) null
                        else JSONObject(res.body?.string().orEmpty()).optString("status")
                    }
                } catch (e: Exception) {
                    null
                }

                if (!enMarcha.get()) return@Thread

                when (estado) {
                    "lista" -> {
                        enMarcha.set(false)
                        prefs.addLog("Google: ✓ sesión lista, volviendo a la app")
                        principal.post { traerAlFrente(activity) }
                    }
                    // "desconocida" = caducada o ya reclamada: no hay nada que esperar.
                    "desconocida" -> {
                        enMarcha.set(false)
                        prefs.addLog("Google: la espera terminó sin sesión")
                    }
                    else -> principal.postDelayed({ siguiente() }, INTERVALO_MS)
                }
            }.start()
        }

        siguiente()
    }

    /**
     * Trae la app al frente. `CLEAR_TOP` cierra lo que hubiera encima dentro de
     * la tarea —la pestaña del navegador— y `SINGLE_TOP` evita recrear la
     * actividad, para no perder el estado del WebView.
     */
    private fun traerAlFrente(activity: Activity) {
        val intent = Intent(activity, WebAppActivity::class.java).apply {
            addFlags(
                Intent.FLAG_ACTIVITY_CLEAR_TOP or
                    Intent.FLAG_ACTIVITY_SINGLE_TOP or
                    Intent.FLAG_ACTIVITY_REORDER_TO_FRONT,
            )
        }
        try {
            activity.startActivity(intent)
        } catch (e: Exception) {
            // Si el sistema no deja traerla (restricciones de arranque en
            // segundo plano), la sesión se recoge igual al volver a mano.
        }
    }
}
