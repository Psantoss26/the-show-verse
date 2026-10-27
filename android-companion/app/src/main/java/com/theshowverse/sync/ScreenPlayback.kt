package com.theshowverse.sync

/**
 * Reproducción vista en PANTALLA, para las apps que no publican MediaSession.
 *
 * POR QUÉ. MediaListenerService solo ve lo que una app publica como sesión
 * multimedia. Netflix lo hace siempre; Prime Video y Disney+, en la mayoría de
 * tablets y móviles, no (solo al enviar a otro dispositivo o en imagen en imagen):
 * sin sesión no había ni un «Detectado reproduciendo», y nada llegaba al servidor.
 * Pero el servicio de accesibilidad sí ve su reproductor (PlayerScreen), y eso
 * basta para saber que se está viendo algo de esa app.
 *
 * Regla: una app «reproduce en pantalla» desde que se ve su reproductor hasta que
 * se ve otra pantalla suya (una ficha), otra app pasa a primer plano, se ve en
 * pausa o pasan [MAX_MS] sin volver a verlo. Con la pantalla apagada no cuenta.
 * Los controles del reproductor se ocultan a los pocos segundos y ya no se vuelven
 * a ver: por eso no se exige verlos de nuevo para seguir reproduciendo.
 */
object ScreenPlayback {
    /** Sin volver a ver el reproductor, deja de contar tras esto (una película larga). */
    const val MAX_MS = 4 * 60 * 60 * 1000L

    enum class Verdict { PLAYING, IDLE, GONE }

    private data class State(val seenAt: Long, val paused: Boolean)

    private val states = HashMap<String, State>()

    // La ventana en primer plano se pregunta a la app que la muestra; con el vídeo
    // arrancando, cuantas menos preguntas mejor: se reutiliza unos segundos.
    private const val FOREGROUND_TTL_MS = 10_000L
    private var foregroundCache: String? = null
    private var foregroundAt = 0L

    /** Paquete de la ventana en primer plano (lo da el servicio de accesibilidad). */
    @Volatile var foreground: (() -> String?)? = null

    /** Aviso a MediaListenerService para que empiece a sondear (ver playerSeen). */
    @Volatile var onPlayerSeen: (() -> Unit)? = null

    /** Se ve el reproductor de [pkg] ([paused] si muestra el botón de reproducir). */
    fun playerSeen(pkg: String, nowMs: Long, paused: Boolean) {
        val wasPlaying = synchronized(this) {
            val prev = states[pkg]
            states[pkg] = State(nowMs, paused)
            prev != null && !prev.paused
        }
        if (!paused && !wasPlaying) onPlayerSeen?.invoke()
    }

    /** Se ve otra pantalla de [pkg] (una ficha): ya no está en el reproductor. */
    @Synchronized
    fun playerLeft(pkg: String) {
        states.remove(pkg)
    }

    /** Apps que están reproduciendo en pantalla ahora mismo. */
    @Synchronized
    fun playing(nowMs: Long, interactive: Boolean): Set<String> {
        if (states.isEmpty()) return emptySet()
        if (foregroundAt == 0L || nowMs - foregroundAt >= FOREGROUND_TTL_MS) {
            foregroundCache = try { foreground?.invoke() } catch (e: Exception) { null }
            foregroundAt = nowMs
        }
        val fg = foregroundCache
        val out = HashSet<String>()
        val it = states.entries.iterator()
        while (it.hasNext()) {
            val (pkg, s) = it.next()
            when (decide(pkg, s.seenAt, s.paused, nowMs, interactive, fg)) {
                Verdict.GONE -> it.remove()
                Verdict.PLAYING -> out.add(pkg)
                Verdict.IDLE -> Unit
            }
        }
        return out
    }

    @Synchronized
    fun isEmpty(): Boolean = states.isEmpty()

    /**
     * La regla, sin estado para poder probarla. [foregroundPkg] null = no se sabe
     * (la ventana activa no siempre se puede leer): no cambia nada.
     */
    fun decide(
        pkg: String,
        seenAt: Long,
        paused: Boolean,
        nowMs: Long,
        interactive: Boolean,
        foregroundPkg: String?,
    ): Verdict = when {
        nowMs - seenAt > MAX_MS -> Verdict.GONE
        foregroundPkg != null && foregroundPkg != pkg -> Verdict.GONE
        !interactive || paused -> Verdict.IDLE
        else -> Verdict.PLAYING
    }
}

/**
 * Señal de reproducción SIN MediaSession: lo leído en el reproductor y, si no
 * basta, la ficha abierta justo antes ([RecentDetail]). PURO.
 */
object ScreenSignal {
    fun build(
        pkg: String,
        platformName: String,
        reading: PlayerReading?,
        recent: SyncedInfo?,
    ): PlaybackSignal? {
        val base = PlaybackSignal(host = pkg, platformId = pkg, platformName = platformName)
        val recentTitle = recent?.title?.trim()?.ifEmpty { null }
        val recentIsTv = recent?.mediaType == "tv"
        val series = reading?.seriesTitle?.trim()?.ifEmpty { null }

        // Episodio: números o nombre leídos en el reproductor. La serie, la del
        // reproductor o, si no la pinta, la de la ficha (si era una serie).
        if (reading != null && (reading.episode != null || (series != null && reading.episodeName != null))) {
            val show = series ?: recentTitle?.takeIf { recentIsTv }
            return base.copy(
                showName = show,
                episodeName = reading.episodeName,
                season = reading.season,
                episode = reading.episode,
                seriesFromHint = series == null && show != null,
                mediaTypeHint = "tv",
            )
        }
        // Solo un título: la ficha dice si es serie o película cuando es la misma.
        if (series != null) {
            val sameAsRecent = recentTitle != null && TitleMatch.similar(series, recentTitle)
            return when {
                sameAsRecent && recentIsTv -> base.copy(showName = series, mediaTypeHint = "tv")
                sameAsRecent && recent?.mediaType == "movie" -> base.copy(movieTitle = series, mediaTypeHint = "movie")
                else -> base.copy(tabTitle = series)
            }
        }
        // Nada legible en el reproductor (Disney+): la ficha abierta antes de darle
        // a reproducir.
        if (recentTitle == null) return null
        return if (recentIsTv) {
            base.copy(showName = recentTitle, mediaTypeHint = "tv")
        } else {
            base.copy(movieTitle = recentTitle, mediaTypeHint = recent?.mediaType?.takeIf { it == "movie" })
        }
    }
}
