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
    }

    private fun noteOnce(key: String, msg: String) {
        if (loggedNotes.add(key)) prefs.addLog(msg)
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
            playingSince.remove(pkg)
            loggedNotes.removeAll { it.endsWith(":$pkg") }
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
            artUri = md.getString(MediaMetadata.METADATA_KEY_ART_URI)
                ?: md.getString(MediaMetadata.METADATA_KEY_ALBUM_ART_URI),
            durationMs = md.getLong(MediaMetadata.METADATA_KEY_DURATION),
            positionMs = if (posMs > 0) posMs else 0,
        )

        // Diagnóstico: vuelca (una vez por título) los metadatos crudos NO vacíos,
        // para saber en qué campo esconde cada app el nombre de la serie cuando el
        // episodio no resuelve. Visible en la pantalla "Registro" de la app.
        noteOnce(
            "meta:$pkg:${raw.title}",
            buildString {
                append("Metadatos ${Platforms.nameFor(pkg)} →")
                fun f(k: String, v: String?) {
                    if (!v.isNullOrBlank()) append(" $k=«$v»")
                }
                f("title", raw.title)
                f("artist", raw.artist)
                f("album", raw.album)
                f("albumArtist", raw.albumArtist)
                f("dTitle", raw.displayTitle)
                f("dSub", raw.displaySubtitle)
                f("dDesc", raw.displayDescription)
                f("queue", raw.queueTitle)
            },
        )

        val signal = SignalBuilder.build(raw, Platforms.nameFor(pkg))
        if (signal.mainTitle.isNullOrBlank()) {
            noteOnce("notitle:$pkg", "Reproduciendo en ${Platforms.nameFor(pkg)} pero sin título legible")
            return
        }

        val key = signal.dedupKey
        if (lastKeyByPackage[pkg] == key) return
        lastKeyByPackage[pkg] = key

        val token = prefs.token ?: return
        val origin = prefs.origin ?: return
        prefs.addLog("Enviando: ${signal.mainTitle}${signal.episodeName?.let { " — $it" } ?: ""}")
        SyncClient.send(origin, token, signal) { ok, err ->
            handler.post {
                if (ok) {
                    prefs.addLog("✓ Sincronizado: ${signal.mainTitle}")
                } else {
                    // NO reintentamos el mismo título: reenviar cada 3s satura el
                    // endpoint y agrava el 429. Se enviará el próximo título nuevo.
                    prefs.addLog("✗ Fallo: $err")
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
