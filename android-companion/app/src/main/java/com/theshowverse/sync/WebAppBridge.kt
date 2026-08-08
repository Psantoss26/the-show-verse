package com.theshowverse.sync

import android.app.Activity
import android.content.Intent
import android.provider.Settings
import android.webkit.JavascriptInterface
import androidx.core.app.NotificationManagerCompat
import org.json.JSONObject

/**
 * Puente entre la web y el nativo: `window.TSVAndroidBridge` dentro del WebView.
 *
 * Es lo que convierte "una web metida en una app" en UNA SOLA app: desde Ajustes
 * de la web se empareja el dispositivo, se ve si falta algún permiso y se abre el
 * panel de sincronización, sin salir a un deep link ni a otra aplicación.
 *
 * SEGURIDAD. `addJavascriptInterface` expone estos métodos a CUALQUIER página que
 * cargue el WebView, así que cada método sensible pasa por [propio]: solo actúa
 * si la página en curso es del origen configurado. Además la carcasa manda los
 * enlaces externos a una pestaña del navegador, con lo que aquí solo debería
 * llegar la propia web; la comprobación es la red de seguridad por si algún día
 * eso cambia.
 *
 * Los métodos los invoca el WebView en un hilo propio (no el principal): todo lo
 * que toque interfaz o arranque actividades va por `runOnUiThread`.
 */
class WebAppBridge(
    private val activity: Activity,
    private val prefs: Prefs,
    private val currentOrigin: () -> String,
    private val currentUrl: () -> String,
    private val evaluarJs: (String) -> Unit,
    private val abrirEnNavegador: (String) -> Unit,
) {

    /**
     * ¿La página que llama es la nuestra? Se compara la URL cargada en ese
     * momento —que la carcasa mantiene al día en el hilo principal— con el
     * origen configurado. Una página ajena que llegara a este WebView no podría
     * emparejar el dispositivo ni abrir pantallas del sistema.
     */
    private fun propio(): Boolean = WebOrigin.isInternal(currentUrl(), currentOrigin())

    // ------------------------------------------------------------- información

    /** Marca de que la web se está ejecutando dentro de la app oficial. */
    @JavascriptInterface
    fun isApp(): Boolean = true

    @JavascriptInterface
    fun appVersion(): String = BuildConfig.UA_SUFFIX.substringAfter('/')

    /**
     * Estado completo de la sincronización, en JSON, para que Ajustes lo pinte
     * sin adivinar: emparejamiento, permisos concedidos y preferencias.
     */
    @JavascriptInterface
    fun syncStatus(): String {
        val json = JSONObject()
        json.put("paired", prefs.isPaired())
        json.put("origin", prefs.origin ?: "")
        json.put("notificationAccess", tieneAccesoNotificaciones())
        json.put("accessibilityGranted", accesibilidadConcedida())
        json.put("accessibilityEnabled", prefs.a11yEnabled)
        json.put("paused", prefs.paused)
        json.put("indicator", prefs.indicatorEnabled)
        json.put("version", appVersion())
        return json.toString()
    }

    // ------------------------------------------------------ sesión con Google

    /**
     * ¿Puede la app ofrecer el login nativo? La web lo consulta para decidir si
     * enseña su botón normal (que acaba en el navegador) o el nativo.
     */
    @JavascriptInterface
    fun canSignInWithGoogle(): Boolean =
        propio() && GoogleSignIn.configurado() && !prefs.nativeGoogleUnavailable

    /**
     * Abre el selector de cuentas de Android. Es ASÍNCRONO: devuelve enseguida y
     * el resultado llega por `window.__tsvGoogleSignInResult(peticion, json)`,
     * porque un método del puente no puede bloquear esperando a una pantalla del
     * sistema (colgaría el hilo del WebView).
     */
    @JavascriptInterface
    fun signInWithGoogle(peticion: String?): Boolean {
        if (!propio()) return false
        val id = peticion?.takeIf { it.isNotBlank() } ?: return false
        activity.runOnUiThread {
            GoogleSignIn.solicitar(activity) { resultado ->
                val json = JSONObject()
                    .put("ok", resultado.ok)
                    .put("cancelled", resultado.cancelled)
                    .put("idToken", resultado.idToken ?: JSONObject.NULL)
                    .put("error", resultado.error ?: JSONObject.NULL)
                evaluarJs(
                    "window.__tsvGoogleSignInResult && " +
                        "window.__tsvGoogleSignInResult(${cadenaJs(id)}, ${cadenaJs(json.toString())})",
                )
            }
        }
        return true
    }

    /**
     * Abre el login de Google en el navegador Y SE QUEDA VIGILANDO: cuando el
     * servidor dice que la sesión está lista, la app vuelve al frente sola.
     *
     * Es lo que evita tener que pulsar "Abrir The Show Verse": ni el esquema
     * propio (Chrome lo bloquea sin gesto) ni los App Links (hay que verificar el
     * dominio) garantizan la vuelta, pero la pestaña se abre dentro de la tarea
     * de la app, y desde ahí sí se puede volver.
     */
    @JavascriptInterface
    fun openLoginInBrowser(url: String?, appId: String?): Boolean {
        if (!propio()) return false
        val destino = url?.takeIf { it.isNotBlank() } ?: return false
        // Solo URLs del propio origen: esto abre un navegador, no vale para
        // mandar al usuario a cualquier sitio.
        if (!WebOrigin.isInternal(destino, currentOrigin())) return false

        activity.runOnUiThread {
            abrirEnNavegador(destino)
            appId?.takeIf { it.isNotBlank() }?.let {
                LoginWatcher.vigilar(activity, currentOrigin(), it)
            }
        }
        return true
    }

    /** Deja de vigilar (el usuario volvió por su cuenta o canceló). */
    @JavascriptInterface
    fun stopLoginWatch() {
        LoginWatcher.cancelar()
    }

    /**
     * Recoge el resultado del login nativo que quedó en el buzón, y lo borra.
     *
     * Es la red que hace que el login no se pueda quedar a medias: si el aviso
     * directo al WebView se pierde —o Android recrea la actividad mientras el
     * selector de cuentas está encima, recargando la página—, la web pregunta
     * por aquí y lo encuentra igual.
     */
    @JavascriptInterface
    fun takeGoogleSignInResult(): String {
        if (!propio()) return ""
        val pendiente = prefs.pendingGoogleResult ?: return ""
        prefs.pendingGoogleResult = null
        return pendiente
    }

    /** Literal JS seguro: el token y los mensajes van dentro de una cadena. */
    private fun cadenaJs(valor: String): String = JSONObject.quote(valor)

    /** Deja una línea en el registro de la app desde la web. */
    @JavascriptInterface
    fun log(mensaje: String?) {
        if (!propio()) return
        mensaje?.takeIf { it.isNotBlank() }?.let { prefs.addLog(it.take(200)) }
    }

    // ---------------------------------------------------------- emparejamiento

    /**
     * Empareja este dispositivo. Sustituye al deep link `theshowverse://pair`:
     * dentro de la app no hace falta salir y volver, la web pasa el token
     * directamente.
     */
    @JavascriptInterface
    fun pair(token: String?, origin: String?): Boolean {
        if (!propio()) return false
        val limpio = token?.trim().orEmpty()
        val destino = WebOrigin.normalize(origin) ?: currentOrigin()
        if (limpio.isEmpty() || destino.isBlank()) return false
        prefs.token = limpio
        prefs.origin = destino
        prefs.addLog("Emparejado desde la app con $destino")
        return true
    }

    @JavascriptInterface
    fun unpair(): Boolean {
        if (!propio()) return false
        prefs.clearPairing()
        return true
    }

    // ------------------------------------------------------------ preferencias

    @JavascriptInterface
    fun setPaused(paused: Boolean): Boolean {
        if (!propio()) return false
        prefs.paused = paused
        return true
    }

    @JavascriptInterface
    fun setIndicator(enabled: Boolean): Boolean {
        if (!propio()) return false
        prefs.indicatorEnabled = enabled
        return true
    }

    @JavascriptInterface
    fun setAccessibility(enabled: Boolean): Boolean {
        if (!propio()) return false
        prefs.a11yEnabled = enabled
        return true
    }

    // -------------------------------------------------------------- pantallas

    /** Panel nativo de sincronización (permisos, apps, registro). */
    @JavascriptInterface
    fun openSyncPanel() {
        if (!propio()) return
        activity.runOnUiThread {
            activity.startActivity(Intent(activity, MainActivity::class.java))
        }
    }

    /** Ajustes del sistema donde se concede el acceso a notificaciones. */
    @JavascriptInterface
    fun openNotificationAccessSettings() {
        if (!propio()) return
        abrirAjustes(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS)
    }

    /** Ajustes del sistema de accesibilidad (detección de fichas). */
    @JavascriptInterface
    fun openAccessibilitySettings() {
        if (!propio()) return
        abrirAjustes(Settings.ACTION_ACCESSIBILITY_SETTINGS)
    }

    /** Ajustes de servidor propio y clave de acceso privado. */
    @JavascriptInterface
    fun openServerSettings() {
        if (!propio()) return
        activity.runOnUiThread {
            activity.startActivity(Intent(activity, ServerActivity::class.java))
        }
    }

    /** Compartir un título con el selector del sistema. */
    @JavascriptInterface
    fun share(text: String?, url: String?) {
        if (!propio()) return
        val cuerpo = listOfNotNull(text?.takeIf { it.isNotBlank() }, url?.takeIf { it.isNotBlank() })
            .joinToString("\n")
        if (cuerpo.isBlank()) return
        activity.runOnUiThread {
            val enviar = Intent(Intent.ACTION_SEND).apply {
                type = "text/plain"
                putExtra(Intent.EXTRA_TEXT, cuerpo)
            }
            activity.startActivity(Intent.createChooser(enviar, null))
        }
    }

    // ---------------------------------------------------------------- privados

    private fun abrirAjustes(accion: String) {
        activity.runOnUiThread {
            try {
                activity.startActivity(Intent(accion))
            } catch (e: Exception) {
                /* Fabricante sin esa pantalla: no se puede hacer más. */
            }
        }
    }

    private fun tieneAccesoNotificaciones(): Boolean =
        NotificationManagerCompat.getEnabledListenerPackages(activity)
            .contains(activity.packageName)

    private fun accesibilidadConcedida(): Boolean {
        val esperado = "${activity.packageName}/${AccessibilityStreamingService::class.java.name}"
        val activos = Settings.Secure.getString(
            activity.contentResolver,
            Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES,
        ) ?: return false
        return activos.split(':').any { it.equals(esperado, ignoreCase = true) }
    }

    companion object {
        /** Nombre del objeto en `window`. */
        const val NAME = "TSVAndroidBridge"
    }
}
