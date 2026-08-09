package com.theshowverse.sync

import android.app.Notification
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
    // Progreso: entidad resuelta por paquete (para enviar posición sin re-resolver)
    // y control de cadencia de los pings.
    private val syncedByPackage = HashMap<String, SyncedInfo>()
    private val lastProgressAtByPackage = HashMap<String, Long>()
    // Última posición/duración conocida por paquete (segundos): sirve para volcar
    // el punto EXACTO al salir cuando la sesión ya no puede leerse.
    private val lastPosByPackage = HashMap<String, Pair<Long, Long>>()
    // ¿La posición de este paquete es estimada (la app no la publica)? El servidor
    // la acepta para "Continuar viendo" pero nunca da nada por visto con ella.
    private val estimatedByPackage = HashMap<String, Boolean>()

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
        // La notificación de acceso rápido PERSISTE al parar (hasta tocarla o
        // descartarla), para poder abrir la ficha después de terminar.
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
            estimatedByPackage.remove(pkg)
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
        // Posición REAL o, si la app no la publica, ESTIMADA por reloj desde que
        // empezamos a mirar. La estimación sirve para que el título aparezca en
        // "Continuar viendo", pero se marca como tal: no vale para dar nada por
        // visto ni para pisar una posición mejor (ver `estimatedPosition`).
        val realPosMs = livePositionMs(controller)
        val posMs = realPosMs ?: (now - since).coerceAtLeast(0L)
        val posicionEstimada = realPosMs == null
        if (posicionEstimada) {
            noteOnce(
                "nopos:$pkg",
                "${Platforms.nameFor(pkg)} no publica la posición: se estima para " +
                    "Continuar viendo, pero no se marcará como visto",
            )
        }
        estimatedByPackage[pkg] = posicionEstimada
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
            positionMs = posMs,
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

        // Diagnóstico de reproducción: posición/duración/estado. Sirve para saber por
        // qué un título no entra en "Continuar viendo" (p. ej. la app no da duración).
        noteOnce(
            "play:$pkg:${raw.title}",
            "Reproducción ${Platforms.nameFor(pkg)}: pos=${raw.positionMs / 1000}s " +
                "dur=${raw.durationMs / 1000}s estado=${controller.playbackState?.state}",
        )

        // Pista de la serie desde la última ficha abierta (misma app, reciente):
        // cubre apps que no exponen la serie en la MediaSession (Netflix), donde
        // `title` es solo el episodio.
        val hintShowName = RecentDetail.showNameFor(pkg)
        val signal = SignalBuilder.build(raw, Platforms.nameFor(pkg), hintShowName)
        if (signal.mainTitle.isNullOrBlank()) {
            noteOnce("notitle:$pkg", "Reproduciendo en ${Platforms.nameFor(pkg)} pero sin título legible")
            return
        }

        // Cachea la última posición/duración conocida (para el volcado al salir). La
        // duración puede ser 0 (desconocida): el backend la completa desde TMDb.
        val dSec = signal.durationSec
        val pSec = signal.positionSec
        if (pSec != null && pSec >= 0) {
            lastPosByPackage[pkg] = pSec to (dSec ?: 0L)
        }

        // Progreso: si ya resolvimos este contenido, enviamos posición/duración
        // (Continuar viendo + visto al 90%). Va ANTES del corte por dedup para que
        // siga latiendo mientras se reproduce el mismo título.
        maybeSendProgress(pkg, signal)

        val key = signal.dedupKey
        if (lastKeyByPackage[pkg] == key) return

        // CAMBIO DE CONTENIDO (el típico "siguiente episodio" que arranca solo).
        // Antes se olvidaba el anterior sin más, así que su último punto conocido
        // era el del ping de hacía hasta 30 s y se quedaba ahí para siempre en
        // "Continuar viendo": nunca llegaba al 90% ni salía de la lista. Se vuelca
        // ANTES de cambiar de título.
        if (lastKeyByPackage[pkg] != null) {
            volcarProgreso(pkg, controller)
        }

        lastKeyByPackage[pkg] = key
        // Contenido nuevo: reiniciamos el estado de progreso de este paquete.
        syncedByPackage.remove(pkg)
        lastProgressAtByPackage.remove(pkg)
        lastPosByPackage.remove(pkg)

        val token = prefs.token ?: return
        val origin = prefs.origin ?: return
        prefs.addLog("Enviando: ${signal.mainTitle}${signal.episodeName?.let { " — $it" } ?: ""}")
        // resolveOnly: solo RESOLVEMOS el título (para "Continuar viendo" y el
        // indicador). El "visto" ya no se marca al detectar, sino al 90% vía pings.
        SyncClient.send(origin, token, signal, resolveOnly = true) { ok, err, synced ->
            handler.post {
                if (ok) {
                    prefs.addLog("✓ Detectado: ${signal.mainTitle}")
                    // Acceso rápido: notificación "en progreso" con enlace a la ficha.
                    QuickAccessNotifier.show(this, prefs, synced, R.string.notif_watching)
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

    // Posición VIVA de la reproducción, o null si la app NO la publica.
    //
    // `PlaybackState.position` es una foto tomada en `lastPositionUpdateTime`, así
    // que suele estar estancada: hay que extrapolar con el tiempo transcurrido ×
    // velocidad.
    //
    // Y si la app no publica posición, se devuelve NULL. Antes se estimaba con el
    // reloj de pared desde que empezamos a mirar, y eso no es una posición: al
    // retomar un episodio por el minuto 40 se enviaba "15 s" y "Continuar viendo"
    // lo mandaba al principio; y como el porcentaje se calcula contra la duración
    // de TMDb, un rato largo de reproducción cruzaba el 90% y marcaba como visto
    // algo que no se había terminado. Mejor no enviar progreso que enviarlo mal.
    private fun livePositionMs(controller: MediaController): Long? {
        val ps = controller.playbackState ?: return null
        val base = ps.position
        val updated = ps.lastPositionUpdateTime
        if (ps.state == PlaybackState.STATE_PLAYING && updated > 0 && base >= 0) {
            val speed = if (ps.playbackSpeed > 0f) ps.playbackSpeed else 1f
            val live = base + ((SystemClock.elapsedRealtime() - updated) * speed).toLong()
            if (live > 0) return live
        }
        return if (base > 0) base else null
    }

    // Envía el progreso del contenido ya resuelto, como mucho una vez cada
    // PROGRESS_PING_MS. Si el servidor responde completed=true (≥90%), deja de
    // sondear ese paquete (ya está marcado como visto).
    private fun maybeSendProgress(pkg: String, signal: PlaybackSignal) {
        val synced = syncedByPackage[pkg] ?: return
        // Mantiene viva la pista de la serie durante la reproducción (y la actualiza
        // a lo realmente resuelto): así el episodio que auto-reproduce a continuación
        // sigue resolviéndose con la serie correcta aunque la MediaSession no la dé.
        //
        // PERO no si la serie salió de la propia pista: reescribirla con lo que ella
        // misma produjo la volvía indefinida —una ficha mal resuelta se
        // realimentaba y se aplicaba a todo lo que se reprodujera después, que es
        // como acababan series ajenas en el Historial—. Una pista solo se renueva
        // con datos que vengan de fuera de ella.
        if (!signal.seriesFromHint) {
            RecentDetail.remember(pkg, synced)
        }
        // Solo se exige POSICIÓN (casi siempre disponible ya, viva o estimada). La
        // DURACIÓN es opcional: si la app no la da, se envía 0 y el backend la
        // rellena desde TMDb. Así el título entra en "Continuar viendo" aunque la
        // MediaSession no reporte duración (Plex, algunos episodios de Netflix).
        val positionSec = signal.positionSec ?: return
        if (positionSec < 0) return
        val durationSec = signal.durationSec ?: 0L
        val now = SystemClock.elapsedRealtime()
        val last = lastProgressAtByPackage[pkg] ?: 0L
        if (now - last < PROGRESS_PING_MS) return
        lastProgressAtByPackage[pkg] = now

        val token = prefs.token ?: return
        val origin = prefs.origin ?: return
        SyncClient.sendProgress(
            origin, token, synced, positionSec, durationSec, Platforms.idFor(pkg),
            estimated = estimatedByPackage[pkg] == true,
        ) { ok, completed ->
            handler.post {
                when {
                    ok && completed -> {
                        prefs.addLog("✓ Visto al completar: ${synced.title ?: "#${synced.tmdbId}"}")
                        // Notificación de "añadido al historial".
                        QuickAccessNotifier.show(this, prefs, synced, R.string.notif_watched)
                        syncedByPackage.remove(pkg)
                    }
                    ok -> noteOnce(
                        "cw:$pkg:${synced.tmdbId}:${synced.season}:${synced.episode}",
                        "✓ En Continuar viendo: ${synced.title ?: "#${synced.tmdbId}"}",
                    )
                    else -> noteOnce(
                        "cwfail:$pkg:${synced.tmdbId}",
                        "✗ Progreso no sincronizado (${Platforms.nameFor(pkg)})",
                    )
                }
            }
        }
    }

    // Volcado inmediato al SALIR (pausa/stop). Ignora la cadencia de
    // PROGRESS_PING_MS: es la última oportunidad de guardar el punto exacto.
    private fun flushProgressOnStop(pkg: String, sessions: List<MediaController>) {
        volcarProgreso(pkg, sessions.firstOrNull { it.packageName == pkg })
    }

    /**
     * Guarda el punto de reproducción de [pkg] AHORA, sin esperar al siguiente
     * ping. Se usa al parar y al cambiar de contenido.
     *
     * La posición sale de la misma extrapolación que durante la reproducción. Antes
     * se leía `playbackState.position` en crudo, que es una foto vieja —a menudo 0—
     * y podía sobrescribir hacia ATRÁS un progreso bueno: se veía media película y
     * al salir "Continuar viendo" la mandaba al principio. Por eso, además, nunca se
     * envía una posición MENOR que la última conocida de este mismo contenido.
     */
    private fun volcarProgreso(pkg: String, controller: MediaController?) {
        val synced = syncedByPackage[pkg] ?: return
        val cached = lastPosByPackage[pkg]
        val liveSec = controller?.let { livePositionMs(it) }?.let { it / 1000 }
        val dur = controller?.metadata?.getLong(MediaMetadata.METADATA_KEY_DURATION)
            ?.let { if (it > 0) it / 1000 else null }
            ?: cached?.second
            ?: 0L

        // El mayor entre lo que dice la sesión y lo último que vimos: una foto
        // obsoleta no puede hacer retroceder el progreso.
        val pos = maxOf(liveSec ?: 0L, cached?.first ?: 0L)
        if (pos <= 0L) return

        val token = prefs.token ?: return
        val origin = prefs.origin ?: return
        SyncClient.sendProgress(
            origin, token, synced, pos, dur, Platforms.idFor(pkg),
            estimated = estimatedByPackage[pkg] == true,
        ) { ok, completed ->
            handler.post {
                if (ok && completed) {
                    prefs.addLog("✓ Visto al completar: ${synced.title ?: "#${synced.tmdbId}"}")
                    QuickAccessNotifier.show(this, prefs, synced, R.string.notif_watched)
                }
            }
        }
    }

    companion object {
        private const val TAG = "TSVSync"
        private const val POLL_MS = 3_000L
        private const val MIN_WATCH_MS = 15_000L
        private const val PROGRESS_PING_MS = 30_000L
    }
}
