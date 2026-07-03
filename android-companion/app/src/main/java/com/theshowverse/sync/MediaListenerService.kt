package com.theshowverse.sync

import android.content.ComponentName
import android.content.Context
import android.media.MediaMetadata
import android.media.session.MediaController
import android.media.session.MediaSession
import android.media.session.MediaSessionManager
import android.media.session.PlaybackState
import android.os.Handler
import android.os.Looper
import android.service.notification.NotificationListenerService
import android.util.Log

/**
 * Motor de sincronización: como NotificationListenerService, tiene permiso para
 * enumerar las MediaSession de OTRAS apps. Escucha cambios de sesión y de estado
 * de reproducción, construye un PlaybackSignal y lo envía al backend. Es la única
 * forma de detección automática en Android (una PWA no puede leer otras apps).
 */
class MediaListenerService : NotificationListenerService() {

    private val component by lazy { ComponentName(this, MediaListenerService::class.java) }
    private val handler = Handler(Looper.getMainLooper())
    private lateinit var prefs: Prefs
    private var msm: MediaSessionManager? = null

    private val controllers = HashMap<MediaSession.Token, MediaController>()
    private val callbacks = HashMap<MediaSession.Token, MediaController.Callback>()
    private val lastKeyByPackage = HashMap<String, String>()

    private val sessionsListener =
        MediaSessionManager.OnActiveSessionsChangedListener { list ->
            handleSessions(list ?: emptyList())
        }

    override fun onListenerConnected() {
        prefs = Prefs(this)
        val manager = getSystemService(Context.MEDIA_SESSION_SERVICE) as MediaSessionManager
        msm = manager
        try {
            manager.addOnActiveSessionsChangedListener(sessionsListener, component)
            handleSessions(manager.getActiveSessions(component))
            Log.i(TAG, "Listener connected; media sessions observed.")
        } catch (e: SecurityException) {
            Log.w(TAG, "Sin acceso a notificaciones todavía: ${e.message}")
        }
    }

    override fun onListenerDisconnected() {
        msm?.removeOnActiveSessionsChangedListener(sessionsListener)
        for ((token, controller) in controllers) {
            callbacks[token]?.let { controller.unregisterCallback(it) }
        }
        controllers.clear()
        callbacks.clear()
    }

    private fun handleSessions(list: List<MediaController>) {
        val active = list.map { it.sessionToken }.toSet()

        // Quitar sesiones que ya no están.
        val gone = controllers.keys - active
        for (token in gone) {
            controllers.remove(token)?.let { controller ->
                callbacks.remove(token)?.let { controller.unregisterCallback(it) }
            }
        }

        // Registrar callbacks en las nuevas.
        for (controller in list) {
            prefs.addSeen(controller.packageName)
            val token = controller.sessionToken
            if (controllers.containsKey(token)) continue

            val cb = object : MediaController.Callback() {
                override fun onMetadataChanged(metadata: MediaMetadata?) = evaluate(controller)
                override fun onPlaybackStateChanged(state: PlaybackState?) = evaluate(controller)
                override fun onSessionDestroyed() {
                    controllers.remove(token)
                    callbacks.remove(token)
                }
            }
            controller.registerCallback(cb, handler)
            controllers[token] = controller
            callbacks[token] = cb
            evaluate(controller)
        }
    }

    private fun evaluate(controller: MediaController) {
        if (!prefs.isPaired() || prefs.paused) return
        val pkg = controller.packageName
        if (!prefs.isEnabled(pkg)) return

        val state = controller.playbackState ?: return
        if (state.state != PlaybackState.STATE_PLAYING) return
        val positionMs = state.position
        if (positionMs < MIN_WATCH_MS) return // requiere posición conocida ≥ 15s

        val md = controller.metadata ?: return
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
            positionMs = positionMs,
        )

        val signal = SignalBuilder.build(raw, Platforms.nameFor(pkg))
        if (signal.mainTitle.isNullOrBlank()) return

        val key = signal.dedupKey
        if (lastKeyByPackage[pkg] == key) return
        lastKeyByPackage[pkg] = key // optimista: evita reenvíos en bucle

        val token = prefs.token ?: return
        val origin = prefs.origin ?: return
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
        private const val MIN_WATCH_MS = 15_000L
    }
}
