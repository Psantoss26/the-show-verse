package com.theshowverse.sync

import android.app.Activity
import android.content.ClipData
import android.content.Intent
import android.provider.Settings
import android.util.Base64
import android.webkit.JavascriptInterface
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.FileProvider
import org.json.JSONObject
import java.io.File
import java.io.IOException

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
    private val bloquearRecarga: (Boolean) -> Unit = {},
    private val pedirPermisoPush: () -> Unit = {},
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
        json.put("deviceId", prefs.deviceId)
        json.put("origin", prefs.origin ?: "")
        json.put("notificationAccess", tieneAccesoNotificaciones())
        json.put("accessibilityGranted", accesibilidadConcedida())
        json.put("accessibilityEnabled", prefs.a11yEnabled)
        json.put("paused", prefs.paused)
        json.put("pendingSyncEvents", ProgressOutbox.pendingCount(activity))
        json.put("indicator", prefs.indicatorEnabled)
        json.put("version", appVersion())
        // The Show Verse Sync instalada: ella sincroniza y guarda el registro, y
        // la web solo lo explica (ver Delegacion).
        json.put("delegatedToSyncApp", Delegacion.cedida(activity))
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
    /**
     * La web avisa de que el usuario corrigió una detección (ver
     * src/app/detections/[id]). Se olvida la ficha recordada como pista de serie
     * —pudo ser la equivocada— y se refresca la lista de textos que no son títulos.
     */
    @JavascriptInterface
    fun detectionCorrected(detectionId: String?): Boolean {
        if (!propio()) return false
        RecentDetail.forgetAfterCorrection()
        NotATitleList.refreshIfStale(prefs, force = true)
        prefs.addLog("Detección corregida desde la web${detectionId?.let { " ($it)" } ?: ""}")
        return true
    }

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

    /** Registro de detecciones de este móvil (nativo; la web ya no las enseña). */
    @JavascriptInterface
    fun openDetections() {
        if (!propio()) return
        activity.runOnUiThread { activity.startActivity(DeteccionesActivity.intentFor(activity)) }
    }

    /** Abre The Show Verse Sync, que tiene la sincronización si está instalada. */
    @JavascriptInterface
    fun openSyncApp(): Boolean {
        if (!propio()) return false
        if (!Delegacion.syncInstalada(activity)) return false
        activity.runOnUiThread { Delegacion.abrirSync(activity) }
        return true
    }

    /**
     * Vincula The Show Verse Sync con un token que acaba de generar la web. Con
     * Sync instalada, el emparejamiento es suyo: guardarlo en esta app no
     * serviría de nada porque le ha cedido la sincronización.
     */
    @JavascriptInterface
    fun pairSyncApp(token: String?, origin: String?): Boolean {
        if (!propio()) return false
        val limpio = token?.trim().orEmpty()
        val destino = WebOrigin.normalize(origin) ?: currentOrigin()
        if (limpio.isEmpty() || destino.isBlank()) return false
        if (!Delegacion.syncInstalada(activity)) return false
        activity.runOnUiThread { Delegacion.vincularSync(activity, limpio, destino) }
        return true
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

    /**
     * Compartir una IMAGEN (la de la ficha) con el selector del sistema, con el
     * texto y el enlace como pie. El WebView no implementa `navigator.share` con
     * ficheros, así que la web manda la imagen en base64; aquí se guarda en la
     * caché y se entrega por FileProvider con permiso de lectura temporal.
     *
     * Solo se conserva la última imagen: cada llamada vacía la carpeta antes de
     * escribir, así la caché no crece con cada título compartido.
     */
    @JavascriptInterface
    fun shareImage(
        base64: String?,
        mimeType: String?,
        fileName: String?,
        text: String?,
        url: String?,
    ): Boolean {
        if (!propio()) return false
        val bytes = try {
            Base64.decode(base64.orEmpty(), Base64.DEFAULT)
        } catch (_: IllegalArgumentException) {
            return false
        }
        if (bytes.isEmpty() || bytes.size > MAX_IMAGEN_COMPARTIDA) return false

        val jpeg = mimeType == "image/jpeg"
        val nombre = fileName.orEmpty()
            .substringBeforeLast('.')
            .replace(Regex("[^A-Za-z0-9._-]"), "")
            .take(80)
            .ifBlank { "the-show-verse" }
        val carpeta = File(activity.cacheDir, CARPETA_COMPARTIDAS)
        val archivo = File(carpeta, "$nombre.${if (jpeg) "jpg" else "png"}")
        try {
            carpeta.mkdirs()
            carpeta.listFiles()?.forEach { it.delete() }
            archivo.writeBytes(bytes)
        } catch (_: IOException) {
            return false
        }

        val uri = FileProvider.getUriForFile(activity, "${activity.packageName}.shareimages", archivo)
        val pie = listOfNotNull(text?.takeIf { it.isNotBlank() }, url?.takeIf { it.isNotBlank() })
            .joinToString("\n")
        activity.runOnUiThread {
            val enviar = Intent(Intent.ACTION_SEND).apply {
                type = if (jpeg) "image/jpeg" else "image/png"
                putExtra(Intent.EXTRA_STREAM, uri)
                if (pie.isNotBlank()) putExtra(Intent.EXTRA_TEXT, pie)
                // ClipData: sin él, algunas apps del selector no heredan el
                // permiso de lectura y no ven la imagen (ni la vista previa).
                clipData = ClipData.newRawUri(null, uri)
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            }
            activity.startActivity(Intent.createChooser(enviar, null))
        }
        return true
    }

    /**
     * Bloquea (o libera) "deslizar para recargar" mientras la web tiene abierto
     * un panel con scroll propio (el desplegable de alertas).
     *
     * El nativo solo ve el scroll de la PÁGINA: con ella arriba del todo, un
     * arrastre hacia abajo DENTRO del panel se tomaba como "recargar" y la app
     * recargaba la web en vez de desplazar el panel. Solo la web sabe que hay un
     * panel encima, así que es ella quien lo avisa.
     */
    @JavascriptInterface
    fun setPullToRefreshLocked(locked: Boolean) {
        if (!propio()) return
        activity.runOnUiThread { bloquearRecarga(locked) }
    }

    // ------------------------------------------------------ notificaciones push
    // La web registra el token en el backend (lib/notifications/devicePush.js).

    /** ¿Esta build lleva Firebase configurado? */
    @JavascriptInterface
    fun pushAvailable(): Boolean = propio() && PushNotifications.available(activity)

    /** "granted" | "denied" | "default". */
    @JavascriptInterface
    fun pushPermission(): String = if (propio()) PushNotifications.permission(activity) else "denied"

    @JavascriptInterface
    fun pushToken(): String = if (propio()) prefs.pushToken.orEmpty() else ""

    /**
     * Pide el permiso del sistema. La respuesta llega después, a
     * `window.__tsvPushPermissionResult(estado)`, con el token ya pedido.
     */
    @JavascriptInterface
    fun requestPushPermission(): Boolean {
        if (!propio()) return false
        activity.runOnUiThread { pedirPermisoPush() }
        return true
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

        /** Subcarpeta de la caché servida por el FileProvider (res/xml/share_image_paths.xml). */
        private const val CARPETA_COMPARTIDAS = "shared"

        /** Tope de la imagen a compartir (la de la ficha ronda 0,5 MB en JPEG). */
        private const val MAX_IMAGEN_COMPARTIDA = 15 * 1024 * 1024
    }
}
