package com.theshowverse.sync

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import com.google.firebase.FirebaseApp
import com.google.firebase.messaging.FirebaseMessaging
import java.net.HttpURLConnection
import java.net.URL

/**
 * Notificaciones push de The Show Verse (Firebase Cloud Messaging).
 *
 * La app es un WebView y el WebView no recibe Web Push, así que aquí el nativo
 * hace de "service worker": guarda el token de FCM (la web lo lee por el puente
 * y lo registra en el backend) y, cuando llega un aviso, o se lo pasa a la web
 * si está a la vista —que lo enseña como ventana emergente— o pinta la
 * notificación del sistema.
 *
 * Todo depende de que la build lleve app/google-services.json. Sin él
 * [available] es false y la web no ofrece la opción.
 */
object PushNotifications {
    private const val CHANNEL_ID = "tsv_alerts"

    fun available(ctx: Context): Boolean =
        BuildConfig.PUSH_CONFIGURED &&
            runCatching { FirebaseApp.getApps(ctx).isNotEmpty() }.getOrDefault(false)

    /** Estado del permiso con la misma forma que `Notification.permission` en la web. */
    fun permission(ctx: Context): String {
        val enabled = NotificationManagerCompat.from(ctx).areNotificationsEnabled()
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
            return if (enabled) "granted" else "denied"
        }
        val granted = ContextCompat.checkSelfPermission(ctx, Manifest.permission.POST_NOTIFICATIONS) ==
            PackageManager.PERMISSION_GRANTED
        return when {
            granted && enabled -> "granted"
            granted -> "denied" // concedido pero apagado en los ajustes del sistema
            else -> "default" // se puede pedir; si ya no deja, el diálogo devuelve denegado
        }
    }

    /**
     * Pide el token a FCM y lo guarda. [done] se llama siempre (con o sin
     * token), para que quien espera no se quede colgado.
     */
    fun refreshToken(ctx: Context, prefs: Prefs, done: (String?) -> Unit = {}) {
        if (!available(ctx)) {
            done(null)
            return
        }
        try {
            FirebaseMessaging.getInstance().token.addOnCompleteListener { task ->
                val token = if (task.isSuccessful) task.result?.takeIf { it.isNotBlank() } else null
                if (token != null) prefs.pushToken = token
                done(token ?: prefs.pushToken)
            }
        } catch (e: Exception) {
            done(prefs.pushToken)
        }
    }

    /**
     * Notificación del sistema para un aviso (app cerrada o en segundo plano).
     * Se llama desde el hilo del servicio de FCM, así que puede descargar la
     * portada en línea.
     */
    fun show(ctx: Context, data: Map<String, String>) {
        val title = data["title"]?.takeIf { it.isNotBlank() } ?: return
        val body = data["body"].orEmpty()
        val tag = data["tag"] ?: title
        val prefs = Prefs(ctx)
        val origin = WebOrigin.normalize(prefs.webOrigin) ?: BuildConfig.DEFAULT_ORIGIN
        // Solo rutas de la propia web: el aviso nunca abre nada ajeno.
        val path = data["url"]?.takeIf { it.startsWith("/") && !it.startsWith("//") } ?: "/"
        val url = origin.trimEnd('/') + path

        ensureChannel(ctx)
        val intent = WebAppActivity.intentFor(ctx, url)
        val pi = PendingIntent.getActivity(
            ctx,
            tag.hashCode(),
            intent,
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        val builder = NotificationCompat.Builder(ctx, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_tsv)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .setContentIntent(pi)
            .setAutoCancel(true)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_RECOMMENDATION)
        data["image"]?.let { loadBitmap(it) }?.let { builder.setLargeIcon(it) }

        try {
            // Mismo título, misma notificación: la nueva sustituye a la anterior.
            NotificationManagerCompat.from(ctx).notify(tag, 0, builder.build())
        } catch (e: SecurityException) {
            // Sin permiso POST_NOTIFICATIONS (Android 13+): no se puede avisar.
        }
    }

    private fun loadBitmap(urlStr: String): Bitmap? {
        if (!urlStr.startsWith("https://image.tmdb.org/")) return null
        return try {
            val conn = URL(urlStr).openConnection() as HttpURLConnection
            conn.connectTimeout = 5000
            conn.readTimeout = 5000
            conn.inputStream.use { BitmapFactory.decodeStream(it) }
        } catch (e: Exception) {
            null
        }
    }

    private fun ensureChannel(ctx: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val mgr = ctx.getSystemService(NotificationManager::class.java) ?: return
        if (mgr.getNotificationChannel(CHANNEL_ID) != null) return
        val channel = NotificationChannel(
            CHANNEL_ID,
            ctx.getString(R.string.push_channel_name),
            NotificationManager.IMPORTANCE_HIGH,
        )
        channel.description = ctx.getString(R.string.push_channel_desc)
        mgr.createNotificationChannel(channel)
    }
}
