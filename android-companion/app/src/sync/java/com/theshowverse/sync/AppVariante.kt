package com.theshowverse.sync

import android.content.Context
import android.content.Intent
import android.content.ComponentName
import android.content.pm.PackageManager
import android.net.Uri
import java.net.URI

/**
 * Lo que cambia entre las dos apps en el código compartido. Esta es la de THE
 * SHOW VERSE SYNC: la notificación apunta al componente de la PWA instalada.
 * Un ACTION_VIEW implícito pasa primero por el navegador predeterminado, así que
 * solo se usa cuando la PWA no se puede localizar.
 */
object AppVariante {

    @Suppress("DEPRECATION")
    fun abrirFicha(context: Context, url: String): Intent {
        val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url))
            .addCategory(Intent.CATEGORY_BROWSABLE)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        // MATCH_ALL incluye la PWA aunque el navegador sea el manejador
        // preferido. <queries> ya declara ACTION_VIEW/https en el manifiesto.
        val candidates = context.packageManager.queryIntentActivities(
            intent, PackageManager.MATCH_ALL or PackageManager.GET_META_DATA,
        ).mapNotNull { resolved ->
            val activity = resolved.activityInfo ?: return@mapNotNull null
            if (!activity.exported || !activity.enabled || !activity.applicationInfo.enabled) {
                return@mapNotNull null
            }
            // Metadatos de Chromium WebAPK: no se elige por nombre visible ni
            // se fija el paquete, que cambia en cada instalación de la PWA. Según
            // el dispositivo vienen en la actividad o solo en la aplicación, y la
            // consulta de actividades no siempre rellena los de la aplicación: si
            // faltan, se piden aparte.
            val scope = webApkScope(activity.metaData)
                ?: webApkScope(activity.applicationInfo.metaData)
                ?: webApkScope(appMetaData(context, activity.packageName))
                ?: return@mapNotNull null
            PwaTarget(activity.packageName, activity.name, scope)
        }
        val target = PwaTarget.forUrl(url, candidates)
        if (target != null) {
            return intent.setComponent(ComponentName(target.packageName, target.activityName))
        }
        // Sin WebAPK localizable (PWA instalada como acceso directo: Samsung
        // Internet, Firefox, Chrome sin Google Play, o una dirección vinculada
        // distinta de la de la PWA), el enlace va al navegador: Chrome lo pasa
        // él mismo a la PWA instalada si está en su ámbito, y si no abre la ficha.
        // Antes se mostraba «No se encuentra la app web» aunque estuviera instalada.
        if (intent.resolveActivity(context.packageManager) != null) return intent
        return Intent(context, MainActivity::class.java)
            .setData(Uri.parse(url))
            .putExtra(MainActivity.EXTRA_PWA_UNAVAILABLE, true)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    }

    private fun webApkScope(metadata: android.os.Bundle?): String? {
        if (metadata == null || !metadata.containsKey(WEBAPK_VERSION_KEY)) return null
        return metadata.getString(WEBAPK_SCOPE_KEY)?.takeIf { it.isNotBlank() }
    }

    private fun appMetaData(context: Context, pkg: String): android.os.Bundle? = try {
        context.packageManager.getApplicationInfo(pkg, PackageManager.GET_META_DATA).metaData
    } catch (_: Exception) {
        null
    }

    private const val WEBAPK_VERSION_KEY = "org.chromium.webapk.shell_apk.shellApkVersion"
    private const val WEBAPK_SCOPE_KEY = "org.chromium.webapk.shell_apk.scope"

    fun rendimiento(context: Context): Intent? = null
}

/** Selección pura: solo una PWA cuyo ámbito contenga la ficha completa. */
internal data class PwaTarget(val packageName: String, val activityName: String, val scope: String) {
    companion object {
        fun forUrl(url: String, candidates: List<PwaTarget>): PwaTarget? {
            val target = parse(url) ?: return null
            return candidates.filter { candidate ->
                val scope = parse(candidate.scope) ?: return@filter false
                scope.scheme.equals(target.scheme, ignoreCase = true) &&
                    scope.host.equals(target.host, ignoreCase = true) &&
                    port(scope) == port(target) &&
                    (target.rawPath.ifEmpty { "/" }).startsWith(scope.rawPath.ifEmpty { "/" })
            }.sortedWith(compareByDescending<PwaTarget> { URI(it.scope).rawPath.length }
                .thenBy { it.packageName }.thenBy { it.activityName }).firstOrNull()
        }

        private fun parse(value: String): URI? = try {
            URI(value).takeIf {
                it.scheme.equals("https", ignoreCase = true) &&
                    !it.host.isNullOrBlank() && it.rawUserInfo == null &&
                    it.normalize().rawPath == it.rawPath
            }
        } catch (_: Exception) { null }

        private fun port(uri: URI): Int = if (uri.port == -1) 443 else uri.port
    }
}
