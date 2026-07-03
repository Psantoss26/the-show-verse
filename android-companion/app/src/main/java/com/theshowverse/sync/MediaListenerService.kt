package com.theshowverse.sync

import android.content.ComponentName
import android.content.Context
import android.media.MediaMetadata
import android.media.session.MediaController
import android.media.session.MediaSessionManager
import android.media.session.PlaybackState
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.service.notification.NotificationListenerService
import android.util.Log

/**
 * Motor de sincronización: como NotificationListenerService, puede enumerar las
 * MediaSession de OTRAS apps. Sondea las sesiones activas cada pocos segundos
 * (como la extensión) y, cuando una app lleva ≥15s reproduciendo (por RELOJ, sin
 * depender de la posición que reporte), construye un PlaybackSignal y lo envía al
 * backend. Es la única forma de detección automática en Android.
 */
class MediaListenerService : NotificationListenerService() {

    private val component by lazy { ComponentName(this, MediaListenerService::class.java) }
    private val handler = Handler(Looper.getMainLooper())
    private lateinit var prefs: Prefs
    private var msm: MediaSessionManager? = null
    private var polling = false

    // Cuándo (reloj monotónico) vimos por primera vez cada app reproduciendo.
    private val playingSince = HashMap<String, Long>()
    private val lastKeyByPackage = HashMap<String, String>()

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
            Log.i(TAG, "Listener connected; media sessions observed.")
            startPolling() // sondeamos ya por si hay algo reproduciéndose
        } catch (e: SecurityException) {
            Log.w(TAG, "Sin acceso a notificaciones todavía: ${e.message}")
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
    }

    private fun pollOnce() {
        val manager = msm ?: return
        val sessions = try {
            manager.getActiveSessions(component)
        } catch (e: SecurityException) {
            return
        }

        val playingNow = HashSet<String>()
        for (controller in sessions) {
            val pkg = controller.packageName
            prefs.addSeen(pkg)
            val playing = controller.playbackState?.state == PlaybackState.STATE_PLAYING
            if (!playing) continue
            playingNow.add(pkg)
            evaluate(controller, pkg)
        }

        // Apps que ya no reproducen: reiniciamos su contador (al volver, cuentan de 0).
        val stopped = playingSince.keys - playingNow
        for (pkg in stopped) playingSince.remove(pkg)

        // Sin nada reproduciéndose podemos dejar de sondear (el listener nos
        // reactivará cuando aparezca una sesión).
        if (sessions.isEmpty()) stopPolling()
    }

    private fun evaluate(controller: MediaController, pkg: String) {
        if (!prefs.isPaired() || prefs.paused) return
        if (!prefs.isEnabled(pkg)) return

        val now = SystemClock.elapsedRealtime()
        val since = playingSince.getOrPut(pkg) { now }
        if (now - since < MIN_WATCH_MS) return // aún no lleva 15s reproduciendo

        val md = controller.metadata ?: return
        val posMs = controller.playbackState?.position ?: 0
        val raw = RawMetadata(
            packageName = pkg,
            title = md.getString(MediaMetadata.METADATA_KEY_TITLE),
            artist = md.getString(MediaMetadata.METADATA_KEY_ARTIST),
            album = md.getString(MediaMetadata.METADATA_KEY_ALBUM),
            displayTitle = md.getString(MediaMetadata.METADATA_KEY_DISPLAY_TITLE),
            displaySubtitle = md.getString(MediaMetadata.METADATA_KEY_DISPLAY_SUBTITLE),
            artUri = md.getString(MediaMetadata.METADATA_KEY_ART_URI)
                ?: md.getString(MediaMetadata.METADATA_KEY_ALBUM_ART_URI),
            durationMs = md.getLong(MediaMetadata.METADATA_KEY_DURATION),
            positionMs = if (posMs > 0) posMs else 0,
        )

        val signal = SignalBuilder.build(raw, Platforms.nameFor(pkg))
        if (signal.mainTitle.isNullOrBlank()) {
            Log.i(TAG, "Reproduciendo en $pkg pero sin título legible aún.")
            return
        }

        val key = signal.dedupKey
        if (lastKeyByPackage[pkg] == key) return
        lastKeyByPackage[pkg] = key // optimista: evita reenvíos en bucle

        val token = prefs.token ?: return
        val origin = prefs.origin ?: return
        Log.i(TAG, "Enviando (${signal.platformName}): ${signal.mainTitle}")
        SyncClient.send(origin, token, signal) { ok, err ->
            handler.post {
                if (ok) {
                    Log.i(TAG, "Sincronizado (${signal.platformName}): ${signal.mainTitle}")
                } else {
                    Log.w(TAG, "Fallo al sincronizar: $err")
                    lastKeyByPackage.remove(pkg) // permite reintento
                }
            }
        }
    }

    companion object {
        private const val TAG = "TSVSync"
        private const val POLL_MS = 3_000L
        private const val MIN_WATCH_MS = 15_000L
    }
}
