package com.theshowverse.sync

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors

/**
 * Notificación de acceso rápido a la ficha en The Show Verse. Compartida por el
 * servicio de sesiones multimedia (reproducción → "en progreso"/"historial") y el
 * de accesibilidad (navegar por la ficha). Aparece en PRIMER PLANO (heads-up) con
 * el título y la PORTADA del contenido, e id fijo: el último título reemplaza al
 * anterior y persiste hasta tocarla/descartarla.
 */
object QuickAccessNotifier {
    // v2: canal de importancia ALTA (heads-up). El id cambia porque Android no
    // permite subir la importancia de un canal ya creado.
    const val CHANNEL_ID = "tsv_quick_access_v2"
    private const val OLD_CHANNEL_ID = "tsv_quick_access"
    const val NOTIF_ID = 1001
    private const val POSTER_BASE = "https://image.tmdb.org/t/p/w342"

    private val bg = Executors.newSingleThreadExecutor()

    /**
     * Publica/actualiza la notificación para [synced]. Descarga la portada en
     * segundo plano y la muestra en primer plano. No hace nada si falta origen o
     * título, o si el indicador está desactivado.
     */
    fun show(ctx: Context, prefs: Prefs, synced: SyncedInfo?, contentTitleRes: Int) {
        if (!prefs.indicatorEnabled) return
        val url = DetailsUrl.build(prefs.origin, synced) ?: return
        val title = synced?.title ?: return
        val app = ctx.applicationContext
        val contentTitle = app.getString(contentTitleRes, title)
        val posterUrl = synced.posterPath
            ?.takeIf { it.isNotBlank() }
            ?.let { POSTER_BASE + it }

        // Descarga la portada (si la hay) y luego muestra UNA sola vez con imagen.
        bg.execute {
            val poster = posterUrl?.let { loadBitmap(it) }
            notifyNow(app, contentTitle, url, poster)
        }
    }

    fun cancel(ctx: Context) {
        try {
            NotificationManagerCompat.from(ctx).cancel(NOTIF_ID)
        } catch (e: Exception) {
            /* noop */
        }
    }

    private fun notifyNow(app: Context, contentTitle: String, url: String, poster: Bitmap?) {
        ensureChannel(app)
        val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url)).apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        val pi = PendingIntent.getActivity(
            app,
            0,
            intent,
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        val builder = NotificationCompat.Builder(app, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_tsv)
            .setContentTitle(contentTitle)
            .setContentText(app.getString(R.string.notif_open_details))
            .setContentIntent(pi)
            .setAutoCancel(true)
            .setPriority(NotificationCompat.PRIORITY_HIGH) // heads-up en Android < 8
            .setCategory(NotificationCompat.CATEGORY_RECOMMENDATION)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .addAction(0, app.getString(R.string.notif_open_details), pi)
        if (poster != null) {
            // Portada como icono grande (miniatura) y grande al expandir.
            builder.setLargeIcon(poster)
                .setStyle(
                    NotificationCompat.BigPictureStyle()
                        .bigPicture(poster)
                        .bigLargeIcon(null as Bitmap?),
                )
        }
        try {
            NotificationManagerCompat.from(app).notify(NOTIF_ID, builder.build())
        } catch (e: SecurityException) {
            // Sin permiso POST_NOTIFICATIONS (Android 13+): se ignora.
        }
    }

    private fun loadBitmap(urlStr: String): Bitmap? {
        return try {
            val conn = URL(urlStr).openConnection() as HttpURLConnection
            conn.connectTimeout = 6000
            conn.readTimeout = 6000
            conn.instanceFollowRedirects = true
            conn.setRequestProperty("User-Agent", "Mozilla/5.0 (Android) TSVSync")
            conn.inputStream.use { BitmapFactory.decodeStream(it) }
        } catch (e: Exception) {
            null
        }
    }

    private fun ensureChannel(ctx: Context) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val mgr = ctx.getSystemService(NotificationManager::class.java) ?: return
            // Retira el canal antiguo silencioso (importancia baja).
            try {
                mgr.deleteNotificationChannel(OLD_CHANNEL_ID)
            } catch (e: Exception) {
                /* noop */
            }
            if (mgr.getNotificationChannel(CHANNEL_ID) == null) {
                val ch = NotificationChannel(
                    CHANNEL_ID,
                    ctx.getString(R.string.notif_channel_name),
                    NotificationManager.IMPORTANCE_HIGH, // heads-up (primer plano)
                )
                ch.description = ctx.getString(R.string.notif_channel_desc)
                mgr.createNotificationChannel(ch)
            }
        }
    }
}
