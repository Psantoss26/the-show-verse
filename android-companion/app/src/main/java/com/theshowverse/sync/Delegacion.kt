package com.theshowverse.sync

import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.SystemClock

/**
 * Reparto de la sincronización entre las dos apps.
 *
 * The Show Verse Sync existe para quien usa la PWA y no quiere la app completa.
 * Si alguien tiene las dos, solo debe detectar UNA: dos servicios leyendo las
 * mismas sesiones enviarían cada visionado dos veces y lanzarían dos avisos. La
 * regla es simple: con Sync instalada, la completa le cede la sincronización y
 * el registro de detecciones, y se limita a ser la web.
 *
 * Lo comprueban los servicios en cada vuelta (MediaListenerService,
 * AccessibilityStreamingService, QuickAccessNotifier), así que instalar o quitar
 * Sync surte efecto solo, sin reiniciar nada. En Sync `cedida` es siempre false.
 */
object Delegacion {

    const val SYNC_PACKAGE = "com.theshowverse.sync"

    /** Cada cuánto se vuelve a preguntar al sistema (los servicios llaman a menudo). */
    private const val VIGENCIA_MS = 10_000L

    @Volatile
    private var comprobadaEn = -1L

    @Volatile
    private var syncPresente = false

    /** ¿Esta app debe dejar la sincronización a The Show Verse Sync? */
    fun cedida(context: Context): Boolean {
        if (!BuildConfig.CEDE_A_SYNC) return false
        val ahora = SystemClock.elapsedRealtime()
        if (comprobadaEn < 0 || ahora - comprobadaEn > VIGENCIA_MS) {
            syncPresente = syncInstalada(context)
            comprobadaEn = ahora
        }
        return syncPresente
    }

    fun syncInstalada(context: Context): Boolean = try {
        context.packageManager.getPackageInfo(SYNC_PACKAGE, 0)
        true
    } catch (e: PackageManager.NameNotFoundException) {
        false
    }

    /** Abre The Show Verse Sync. false si no está instalada. */
    fun abrirSync(context: Context): Boolean {
        val intent = context.packageManager.getLaunchIntentForPackage(SYNC_PACKAGE) ?: return false
        return lanzar(context, intent)
    }

    /**
     * Vincula Sync con un token generado por la web: abre SU pantalla de
     * emparejamiento con el mismo enlace que usaría el navegador, pero dirigido a
     * su paquete para que no conteste esta app.
     */
    fun vincularSync(context: Context, token: String, origin: String): Boolean {
        val enlace = Uri.Builder()
            .scheme("theshowverse")
            .authority("pair")
            .appendQueryParameter("token", token)
            .appendQueryParameter("origin", origin)
            .build()
        return lanzar(context, Intent(Intent.ACTION_VIEW, enlace).setPackage(SYNC_PACKAGE))
    }

    private fun lanzar(context: Context, intent: Intent): Boolean = try {
        context.startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        true
    } catch (e: Exception) {
        false
    }
}
