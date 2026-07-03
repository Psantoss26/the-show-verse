package com.theshowverse.sync

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey

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

    companion object {
        private const val KEY_TOKEN = "token"
        private const val KEY_ORIGIN = "origin"
        private const val KEY_PAUSED = "paused"
        private const val KEY_ENABLED = "enabled_packages"
        private const val KEY_SEEN = "seen_packages"
    }
}
