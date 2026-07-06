package com.theshowverse.sync

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.media.MediaMetadata
import android.media.session.MediaController
import android.media.session.MediaSessionManager
import android.media.session.PlaybackState
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.service.notification.NotificationListenerService
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat

/**
 * Motor de sincronización: como NotificationListenerService, puede enumerar las
 * MediaSession de OTRAS apps. Sondea las sesiones activas cada 3s y, cuando una
 * app lleva ≥15s reproduciendo (por RELOJ, sin depender de la posición que
 * reporte), construye un PlaybackSignal y lo envía al backend. Registra cada
 * paso en Prefs para poder diagnosticar desde la propia app.
 */
class MediaListenerService : NotificationListenerService() {

    private val component by lazy { ComponentName(this, MediaListenerService::class.java) }
    private val handler = Handler(Looper.getMainLooper())
    private lateinit var prefs: Prefs
    private var msm: MediaSessionManager? = null
    private var polling = false

    private val playingSince = HashMap<String, Long>()
    private val lastKeyByPackage = HashMap<String, String>()
    private val loggedNotes = HashSet<String>() // para no repetir el mismo aviso
    // Progreso: entidad resuelta por paquete (para enviar posición sin re-resolver)
    // y control de cadencia de los pings.
    private val syncedByPackage = HashMap<String, SyncedInfo>()
    private val lastProgressAtByPackage = HashMap<String, Long>()
    // Última posición/duración conocida por paquete (segundos): sirve para volcar
    // el punto EXACTO al salir cuando la sesión ya no puede leerse.
    private val lastPosByPackage = HashMap<String, Pair<Long, Long>>()

    private val sessionsListener =
        MediaSessionManager.OnActiveSessionsChangedListener { list ->
            if ((list?.size ?: 0) > 0) startPolling() else stopPolling()
        }

    private val pollRunnable = object : Runnable {
        override fun run() {
            pollOnce()
            if (polling) handler.postDelayed(this, POLL_MS)
        }
    }

    override fun onListenerConnected() {
        prefs = Prefs(this)
        val manager = getSystemService(Context.MEDIA_SESSION_SERVICE) as MediaSessionManager
        msm = manager
        try {
            manager.addOnActiveSessionsChangedListener(sessionsListener, component)
            Log.i(TAG, "Listener connected")
            prefs.addLog("Servicio conectado (acceso a notificaciones OK)")
            startPolling()
        } catch (e: SecurityException) {
            prefs.addLog("ERROR: sin acceso a notificaciones")
            Log.w(TAG, "Sin acceso a notificaciones: ${e.message}")
        }
    }

    override fun onListenerDisconnected() {
        stopPolling()
        msm?.removeOnActiveSessionsChangedListener(sessionsListener)
    }

    private fun startPolling() {
        if (polling) return
        polling = true
        handler.post(pollRunnable)
    }

    private fun stopPolling() {
        polling = false
        handler.removeCallbacks(pollRunnable)
        // Al dejar de reproducir, retiramos la notificación de acceso rápido.
        cancelQuickAccessNotification()
    }

    private fun noteOnce(key: String, msg: String) {
        if (loggedNotes.add(key)) prefs.addLog(msg)
    }

    /** Extras de la notificación de la app (título/texto/subtexto). Algunas apps
     * (Netflix) NO exponen la serie en la MediaSession pero sí en su notificación. */
    private fun notifExtrasFor(pkg: String): Triple<String?, String?, String?> = try {
        val ex = activeNotifications
            ?.firstOrNull { it.packageName == pkg }
            ?.notification?.extras
        Triple(
            ex?.getCharSequence(Notification.EXTRA_TITLE)?.toString(),
            ex?.getCharSequence(Notification.EXTRA_TEXT)?.toString(),
            ex?.getCharSequence(Notification.EXTRA_SUB_TEXT)?.toString(),
        )
    } catch (e: Exception) {
        Triple(null, null, null)
    }

    /** Publica/actualiza la notificación de acceso rápido a la ficha en The Show
     * Verse (id fijo: se reemplaza por título y se retira al parar la reproducción). */
    private fun showQuickAccessNotification(synced: SyncedInfo?) {
        if (!prefs.indicatorEnabled) return
        val url = DetailsUrl.build(prefs.origin, synced) ?: return
        val title = synced?.title ?: return
        ensureQuickAccessChannel()
        val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url)).apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        val pi = PendingIntent.getActivity(
            this,
            0,
            intent,
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        val notif = NotificationCompat.Builder(this, QUICK_CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_tsv)
            .setContentTitle(getString(R.string.notif_watching, title))
            .setContentText(getString(R.string.notif_open_details))
            .setContentIntent(pi)
            .setAutoCancel(true)
            .addAction(0, getString(R.string.notif_open_details), pi)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build()
        try {
            NotificationManagerCompat.from(this).notify(QUICK_NOTIF_ID, notif)
        } catch (e: SecurityException) {
            // Sin permiso POST_NOTIFICATIONS (Android 13+): se ignora.
        }
    }

    private fun cancelQuickAccessNotification() {
        try {
            NotificationManagerCompat.from(this).cancel(QUICK_NOTIF_ID)
        } catch (e: Exception) {
            /* noop */
        }
    }

    private fun ensureQuickAccessChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val mgr = getSystemService(NotificationManager::class.java)
            if (mgr != null && mgr.getNotificationChannel(QUICK_CHANNEL_ID) == null) {
                val ch = NotificationChannel(
                    QUICK_CHANNEL_ID,
                    getString(R.string.notif_channel_name),
                    NotificationManager.IMPORTANCE_LOW,
                )
                ch.description = getString(R.string.notif_channel_desc)
                mgr.createNotificationChannel(ch)
            }
        }
    }

    private fun pollOnce() {
        val manager = msm ?: return
        val sessions = try {
            manager.getActiveSessions(component)
        } catch (e: SecurityException) {
            prefs.addLog("ERROR: getActiveSessions sin permiso")
            return
        }

        val playingNow = HashSet<String>()
        for (controller in sessions) {
            val pkg = controller.packageName
            prefs.addSeen(pkg)
            val playing = controller.playbackState?.state == PlaybackState.STATE_PLAYING
            if (!playing) continue
            playingNow.add(pkg)
            noteOnce("detected:$pkg", "Detectado reproduciendo: ${Platforms.nameFor(pkg)}")
            evaluate(controller, pkg)
        }

        val stopped = playingSince.keys - playingNow
        for (pkg in stopped) {
            // Volcado del punto EXACTO al salir (pausa/stop) ANTES de olvidar la
            // resolución: usa la posición viva de la sesión (si sigue, pausada) o
            // la última conocida.
            flushProgressOnStop(pkg, sessions)
            playingSince.remove(pkg)
            loggedNotes.removeAll { it.endsWith(":$pkg") }
            // Al parar, olvidamos la resolución y la clave: si se reanuda el mismo
            // título, se vuelve a resolver y a retomar el seguimiento de progreso.
            syncedByPackage.remove(pkg)
            lastProgressAtByPackage.remove(pkg)
            lastPosByPackage.remove(pkg)
            lastKeyByPackage.remove(pkg)
        }

        if (sessions.isEmpty()) stopPolling()
    }

    private fun evaluate(controller: MediaController, pkg: String) {
        if (!prefs.isPaired()) {
            noteOnce("unpaired:$pkg", "No vinculado: abre la web y pulsa Vincular app Android")
            return
        }
        if (prefs.paused) return
        if (!prefs.isEnabled(pkg)) {
            noteOnce("disabled:$pkg", "Ignorada (app desactivada): ${Platforms.nameFor(pkg)}")
            return
        }

        val now = SystemClock.elapsedRealtime()
        val since = playingSince.getOrPut(pkg) { now }
        if (now - since < MIN_WATCH_MS) return // aún no lleva 15s reproduciendo

        val md = controller.metadata
        if (md == null) {
            noteOnce("nometa:$pkg", "Reproduciendo en ${Platforms.nameFor(pkg)} pero sin metadatos")
            return
        }
        val posMs = controller.playbackState?.position ?: 0
        val notif = notifExtrasFor(pkg)
        val raw = RawMetadata(
            packageName = pkg,
            title = md.getString(MediaMetadata.METADATA_KEY_TITLE),
            artist = md.getString(MediaMetadata.METADATA_KEY_ARTIST),
            album = md.getString(MediaMetadata.METADATA_KEY_ALBUM),
            albumArtist = md.getString(MediaMetadata.METADATA_KEY_ALBUM_ARTIST),
            displayTitle = md.getString(MediaMetadata.METADATA_KEY_DISPLAY_TITLE),
            displaySubtitle = md.getString(MediaMetadata.METADATA_KEY_DISPLAY_SUBTITLE),
            displayDescription = md.getString(MediaMetadata.METADATA_KEY_DISPLAY_DESCRIPTION),
            queueTitle = controller.queueTitle?.toString(),
            notifTitle = notif.first,
            notifText = notif.second,
            notifSubText = notif.third,
            artUri = md.getString(MediaMetadata.METADATA_KEY_ART_URI)
                ?: md.getString(MediaMetadata.METADATA_KEY_ALBUM_ART_URI),
            durationMs = md.getLong(MediaMetadata.METADATA_KEY_DURATION),
            positionMs = if (posMs > 0) posMs else 0,
        )

        // Diagnóstico: vuelca (una vez por título) los metadatos crudos NO vacíos,
        // para saber en qué campo esconde cada app el nombre de la serie cuando el
        // episodio no resuelve. Visible en la pantalla "Registro" de la app.
        val metaDump = listOf(
            "title" to raw.title,
            "artist" to raw.artist,
            "album" to raw.album,
            "albumArtist" to raw.albumArtist,
            "dTitle" to raw.displayTitle,
            "dSub" to raw.displaySubtitle,
            "dDesc" to raw.displayDescription,
            "queue" to raw.queueTitle,
            "nTitle" to raw.notifTitle,
            "nText" to raw.notifText,
            "nSub" to raw.notifSubText,
        ).filter { !it.second.isNullOrBlank() }
            .joinToString(" ") { "${it.first}=«${it.second}»" }
        noteOnce("meta:$pkg:${raw.title}", "Metadatos ${Platforms.nameFor(pkg)} → $metaDump")

        val signal = SignalBuilder.build(raw, Platforms.nameFor(pkg))
        if (signal.mainTitle.isNullOrBlank()) {
            noteOnce("notitle:$pkg", "Reproduciendo en ${Platforms.nameFor(pkg)} pero sin título legible")
            return
        }

        // Cachea la última posición/duración conocida (para el volcado al salir).
        val dSec = signal.durationSec
        val pSec = signal.positionSec
        if (dSec != null && dSec > 0 && pSec != null && pSec >= 0) {
            lastPosByPackage[pkg] = pSec to dSec
        }

        // Progreso: si ya resolvimos este contenido, enviamos posición/duración
        // (Continuar viendo + visto al 90%). Va ANTES del corte por dedup para que
        // siga latiendo mientras se reproduce el mismo título.
        maybeSendProgress(pkg, signal)

        val key = signal.dedupKey
        if (lastKeyByPackage[pkg] == key) return
        lastKeyByPackage[pkg] = key
        // Contenido nuevo: reiniciamos el estado de progreso de este paquete.
        syncedByPackage.remove(pkg)
        lastProgressAtByPackage.remove(pkg)

        val token = prefs.token ?: return
        val origin = prefs.origin ?: return
        prefs.addLog("Enviando: ${signal.mainTitle}${signal.episodeName?.let { " — $it" } ?: ""}")
        // resolveOnly: solo RESOLVEMOS el título (para "Continuar viendo" y el
        // indicador). El "visto" ya no se marca al detectar, sino al 90% vía pings.
        SyncClient.send(origin, token, signal, resolveOnly = true) { ok, err, synced ->
            handler.post {
                if (ok) {
                    prefs.addLog("✓ Detectado: ${signal.mainTitle}")
                    // Acceso rápido: notificación con enlace a la ficha en The Show Verse.
                    showQuickAccessNotification(synced)
                    if (synced != null) {
                        syncedByPackage[pkg] = synced
                        lastProgressAtByPackage.remove(pkg) // fuerza un ping inmediato
                        maybeSendProgress(pkg, signal)
                    }
                } else {
                    // NO reintentamos el mismo título: reenviar cada 3s satura el
                    // endpoint y agrava el 429. Se enviará el próximo título nuevo.
                    prefs.addLog("✗ Fallo: $err")
                }
            }
        }
    }

    // Envía el progreso del contenido ya resuelto, como mucho una vez cada
    // PROGRESS_PING_MS. Si el servidor responde completed=true (≥90%), deja de
    // sondear ese paquete (ya está marcado como visto).
    private fun maybeSendProgress(pkg: String, signal: PlaybackSignal) {
        val synced = syncedByPackage[pkg] ?: return
        val durationSec = signal.durationSec ?: return
        val positionSec = signal.positionSec ?: return
        if (durationSec <= 0 || positionSec < 0) return
        val now = SystemClock.elapsedRealtime()
        val last = lastProgressAtByPackage[pkg] ?: 0L
        if (now - last < PROGRESS_PING_MS) return
        lastProgressAtByPackage[pkg] = now

        val token = prefs.token ?: return
        val origin = prefs.origin ?: return
        SyncClient.sendProgress(
            origin, token, synced, positionSec, durationSec, Platforms.idFor(pkg),
        ) { ok, completed ->
            handler.post {
                if (ok && completed) {
                    prefs.addLog("✓ Visto al completar: ${synced.title ?: "#${synced.tmdbId}"}")
                    syncedByPackage.remove(pkg)
                }
            }
        }
    }

    // Volcado inmediato al SALIR (pausa/stop): guarda el punto exacto usando la
    // posición viva de la sesión (si sigue activa aunque pausada) o la última
    // conocida. Ignora la cadencia de PROGRESS_PING_MS.
    private fun flushProgressOnStop(pkg: String, sessions: List<MediaController>) {
        val synced = syncedByPackage[pkg] ?: return
        val controller = sessions.firstOrNull { it.packageName == pkg }
        val md = controller?.metadata
        val liveDur = md?.getLong(MediaMetadata.METADATA_KEY_DURATION)
            ?.let { if (it > 0) it / 1000 else null }
        val livePos = controller?.playbackState?.position
            ?.let { if (it > 0) it / 1000 else null }
        val cached = lastPosByPackage[pkg]
        val pos = livePos ?: cached?.first ?: return
        val dur = liveDur ?: cached?.second ?: return
        if (dur <= 0 || pos < 0) return
        val token = prefs.token ?: return
        val origin = prefs.origin ?: return
        SyncClient.sendProgress(origin, token, synced, pos, dur, Platforms.idFor(pkg)) { ok, completed ->
            handler.post {
                if (ok && completed) {
                    prefs.addLog("✓ Visto al completar: ${synced.title ?: "#${synced.tmdbId}"}")
                }
            }
        }
    }

    companion object {
        private const val TAG = "TSVSync"
        private const val POLL_MS = 3_000L
        private const val MIN_WATCH_MS = 15_000L
        private const val PROGRESS_PING_MS = 30_000L
        private const val QUICK_CHANNEL_ID = "tsv_quick_access"
        private const val QUICK_NOTIF_ID = 1001
    }
}
