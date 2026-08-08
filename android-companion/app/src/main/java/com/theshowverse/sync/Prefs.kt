package com.theshowverse.sync

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/** Almacenamiento cifrado del token/origen de emparejamiento y preferencias. */
class Prefs(context: Context) {

    private val prefs: SharedPreferences

    init {
        val masterKey = MasterKey.Builder(context)
            .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
            .build()
        prefs = EncryptedSharedPreferences.create(
            context,
            "tsv_sync_prefs",
            masterKey,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
        )
    }

    var token: String?
        get() = prefs.getString(KEY_TOKEN, null)
        set(value) = prefs.edit().putString(KEY_TOKEN, value).apply()

    var origin: String?
        get() = prefs.getString(KEY_ORIGIN, null)
        set(value) = prefs.edit().putString(KEY_ORIGIN, value).apply()

    var paused: Boolean
        get() = prefs.getBoolean(KEY_PAUSED, false)
        set(value) = prefs.edit().putBoolean(KEY_PAUSED, value).apply()

    /** Indicador de acceso rápido a la ficha (notificación). Activado por defecto. */
    var indicatorEnabled: Boolean
        get() = prefs.getBoolean(KEY_INDICATOR, true)
        set(value) = prefs.edit().putBoolean(KEY_INDICATOR, value).apply()

    /** Detección por accesibilidad de la ficha en apps de streaming (sin reproducir).
     * Requiere además que el usuario active el servicio en Ajustes de Accesibilidad. */
    var a11yEnabled: Boolean
        get() = prefs.getBoolean(KEY_A11Y, true)
        set(value) = prefs.edit().putBoolean(KEY_A11Y, value).apply()

    /**
     * Origen que carga la app. Vacío = el de fábrica (BuildConfig.DEFAULT_ORIGIN).
     * Es independiente de [origin], que es el servidor con el que se emparejó la
     * sincronización: normalmente coinciden, pero no tienen por qué (se puede
     * estar viendo la web de producción con la sincronización apuntando al NAS).
     */
    var webOrigin: String?
        get() = prefs.getString(KEY_WEB_ORIGIN, null)
        set(value) = prefs.edit().putString(KEY_WEB_ORIGIN, value).apply()

    /** Clave del gate de acceso privado de la web, si el servidor lo tiene puesto. */
    var accessKey: String?
        get() = prefs.getString(KEY_ACCESS_KEY, null)
        set(value) = prefs.edit().putString(KEY_ACCESS_KEY, value).apply()

    /**
     * El login nativo de Google falló por configuración (no por cancelación).
     * Se recuerda para no volver a enseñar un selector de cuentas que acaba en
     * nada: a partir de entonces se va directo al flujo por navegador.
     */
    var nativeGoogleUnavailable: Boolean
        get() = prefs.getBoolean(KEY_NO_NATIVE_GOOGLE, false)
        set(value) = prefs.edit().putBoolean(KEY_NO_NATIVE_GOOGLE, value).apply()

    /**
     * Resultado del último login con Google, en JSON, a la espera de que la web
     * lo recoja. Existe porque el aviso directo al WebView se puede perder: si
     * Android recrea la actividad mientras el selector de cuentas está encima,
     * la página se recarga y con ella desaparece quien esperaba la respuesta.
     * Guardado aquí, la web lo encuentra cuando vuelve a estar viva.
     */
    var pendingGoogleResult: String?
        get() = prefs.getString(KEY_GOOGLE_RESULT, null)
        set(value) = prefs.edit().putString(KEY_GOOGLE_RESULT, value).apply()

    /** Última página vista, para reabrir la app donde se dejó. */
    var lastUrl: String?
        get() = prefs.getString(KEY_LAST_URL, null)
        set(value) = prefs.edit().putString(KEY_LAST_URL, value).apply()

    fun isPaired(): Boolean = !token.isNullOrBlank() && !origin.isNullOrBlank()

    /** Apps activadas para sincronizar. Por defecto, las de streaming conocidas. */
    fun enabledPackages(): Set<String> {
        if (!prefs.contains(KEY_ENABLED)) return Platforms.DEFAULT_ENABLED
        return prefs.getStringSet(KEY_ENABLED, emptySet())?.toSet() ?: emptySet()
    }

    fun isEnabled(pkg: String): Boolean = enabledPackages().contains(pkg)

    fun setEnabled(pkg: String, enabled: Boolean) {
        val next = enabledPackages().toMutableSet()
        if (enabled) next.add(pkg) else next.remove(pkg)
        prefs.edit().putStringSet(KEY_ENABLED, next).apply()
    }

    /** Paquetes que hemos visto emitir sesiones (para listarlos en la UI). */
    fun seenPackages(): Set<String> =
        prefs.getStringSet(KEY_SEEN, emptySet())?.toSet() ?: emptySet()

    fun addSeen(pkg: String) {
        val next = seenPackages().toMutableSet()
        if (next.add(pkg)) prefs.edit().putStringSet(KEY_SEEN, next).apply()
    }

    fun clearPairing() {
        prefs.edit().remove(KEY_TOKEN).remove(KEY_ORIGIN).apply()
    }

    /** Registro de eventos visible en la app (para diagnosticar sin adb). */
    fun addLog(line: String) {
        val ts = SimpleDateFormat("HH:mm:ss", Locale.getDefault()).format(Date())
        val prev = prefs.getString(KEY_LOGS, "") ?: ""
        val lines = ("$ts  $line\n$prev")
            .split("\n")
            .filter { it.isNotBlank() }
            .take(40)
        prefs.edit().putString(KEY_LOGS, lines.joinToString("\n")).apply()
    }

    fun logs(): String = prefs.getString(KEY_LOGS, "") ?: ""

    fun clearLogs() = prefs.edit().remove(KEY_LOGS).apply()

    companion object {
        private const val KEY_TOKEN = "token"
        private const val KEY_ORIGIN = "origin"
        private const val KEY_PAUSED = "paused"
        private const val KEY_INDICATOR = "indicator_enabled"
        private const val KEY_A11Y = "a11y_enabled"
        private const val KEY_ENABLED = "enabled_packages"
        private const val KEY_SEEN = "seen_packages"
        private const val KEY_LOGS = "event_logs"
        private const val KEY_WEB_ORIGIN = "web_origin"
        private const val KEY_ACCESS_KEY = "private_access_key"
        private const val KEY_LAST_URL = "last_url"
        private const val KEY_NO_NATIVE_GOOGLE = "no_native_google"
        private const val KEY_GOOGLE_RESULT = "google_result"
    }
}
