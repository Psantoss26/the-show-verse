package com.theshowverse.sync

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat

/**
 * Notificación de acceso rápido a la ficha en The Show Verse. Compartida por el
 * servicio de sesiones multimedia (reproducción → "en progreso"/"historial") y
 * el de accesibilidad (navegar por la ficha sin reproducir). Id fijo: el último
 * título reemplaza al anterior y la notificación PERSISTE hasta que se toca (abre
 * la ficha) o se descarta.
 */
object QuickAccessNotifier {
    const val CHANNEL_ID = "tsv_quick_access"
    const val NOTIF_ID = 1001

    /**
     * Publica/actualiza la notificación para [synced]. [contentTitleRes] elige el
     * texto según el estado (viendo / historial / ficha). No hace nada si falta el
     * origen, el título o si el indicador está desactivado.
     */
    fun show(ctx: Context, prefs: Prefs, synced: SyncedInfo?, contentTitleRes: Int) {
        if (!prefs.indicatorEnabled) return
        val url = DetailsUrl.build(prefs.origin, synced) ?: return
        val title = synced?.title ?: return
        ensureChannel(ctx)
        val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url)).apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        val pi = PendingIntent.getActivity(
            ctx,
            0,
            intent,
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        val notif = NotificationCompat.Builder(ctx, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_tsv)
            .setContentTitle(ctx.getString(contentTitleRes, title))
            .setContentText(ctx.getString(R.string.notif_open_details))
            .setContentIntent(pi)
            .setAutoCancel(true)
            .addAction(0, ctx.getString(R.string.notif_open_details), pi)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build()
        try {
            NotificationManagerCompat.from(ctx).notify(NOTIF_ID, notif)
        } catch (e: SecurityException) {
            // Sin permiso POST_NOTIFICATIONS (Android 13+): se ignora.
        }
    }

    fun cancel(ctx: Context) {
        try {
            NotificationManagerCompat.from(ctx).cancel(NOTIF_ID)
        } catch (e: Exception) {
            /* noop */
        }
    }

    private fun ensureChannel(ctx: Context) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val mgr = ctx.getSystemService(NotificationManager::class.java)
            if (mgr != null && mgr.getNotificationChannel(CHANNEL_ID) == null) {
                val ch = NotificationChannel(
                    CHANNEL_ID,
                    ctx.getString(R.string.notif_channel_name),
                    NotificationManager.IMPORTANCE_LOW,
                )
                ch.description = ctx.getString(R.string.notif_channel_desc)
                mgr.createNotificationChannel(ch)
            }
        }
    }
}
