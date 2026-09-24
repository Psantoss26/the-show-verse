package com.theshowverse.sync

import android.os.SystemClock

/**
 * Puente entre la detección de FICHA (AccessibilityStreamingService) y la
 * sincronización por MediaSession (MediaListenerService), que viven en servicios
 * distintos del MISMO proceso.
 *
 * Motivación: algunas apps —Netflix sobre todo, y en especial el anime— NO exponen
 * el nombre de la SERIE en la MediaSession: `title` es el episodio y el subtítulo es
 * "T1:E1 - <episodio>". Sin el nombre de la serie, la resolución contra TMDb da un
 * título sin relación. La FICHA que el usuario abrió justo antes de reproducir SÍ
 * resuelve la serie, así que la recordamos aquí y la reutilizamos como nombre de
 * serie durante la reproducción inmediata (misma app, ventana corta).
 *
 * CUÁNDO VALE LA PISTA. Es un dato prestado de otra pantalla, y una pista vieja
 * es peor que ninguna: con la regla anterior (cualquier ficha de los últimos 30
 * minutos) bastaba con abrir la ficha de una serie —o que se detectara un banner
 * de la portada— y reproducir OTRA después para que esta se registrara con el
 * nombre de aquella (Crunchyroll). Ahora ([HintFreshness]):
 *   - una ficha solo vale si se vio poco antes de EMPEZAR esta sesión de
 *     reproducción (una pausa corta, el cargando entre episodios o el salto al
 *     siguiente NO empiezan otra: ver MediaListenerService.sessionStart);
 *   - lo confirmado por la propia reproducción (para encadenar el siguiente
 *     episodio que se reproduce solo) solo vale dentro de la MISMA sesión;
 *   - el MISMO episodio cuya serie ya se confirmó vale al reanudarlo aunque la
 *     pausa haya sido larga: es el mismo contenido, no una pista prestada.
 */
object RecentDetail {

    enum class Source { DETAIL, PLAYBACK }

    @Volatile private var pkg: String? = null
    @Volatile private var synced: SyncedInfo? = null
    @Volatile private var atMs: Long = 0L
    @Volatile private var source: Source = Source.DETAIL

    // Último episodio cuya serie confirmó el servidor (ver confirmEpisode).
    @Volatile private var confirmedPkg: String? = null
    @Volatile private var confirmedEpisode: String? = null
    @Volatile private var confirmedTitle: String? = null
    @Volatile private var confirmedAtMs: Long = 0L

    /** Registra la última ficha resuelta (o la serie confirmada al reproducir). */
    @Synchronized
    fun remember(pkg: String, synced: SyncedInfo, source: Source = Source.DETAIL) {
        this.pkg = pkg
        this.synced = synced
        this.atMs = SystemClock.elapsedRealtime()
        this.source = source
    }

    /**
     * El servidor dio por buena la serie [synced] para el episodio [episodeKey]
     * (ver [HintFreshness.episodeKey]). Si ese mismo episodio se reanuda después
     * de una pausa larga, se vuelve a usar esa serie.
     */
    @Synchronized
    fun confirmEpisode(pkg: String, episodeKey: String?, synced: SyncedInfo) {
        val title = synced.title?.trim()
        if (episodeKey == null || title.isNullOrEmpty() || synced.mediaType != "tv") return
        confirmedPkg = pkg
        confirmedEpisode = episodeKey
        confirmedTitle = title
        confirmedAtMs = SystemClock.elapsedRealtime()
    }

    /**
     * Nombre de la serie para lo que suena en [pkg]: la del mismo episodio ya
     * confirmado ([episodeKey]) o la de la última ficha, si sigue siendo válida
     * para la sesión que empezó en [playbackStartedAt] (elapsedRealtime) y es una
     * SERIE (no película). Null en cualquier otro caso.
     */
    @Synchronized
    fun showNameFor(pkg: String, playbackStartedAt: Long, episodeKey: String? = null): String? {
        val now = SystemClock.elapsedRealtime()
        if (episodeKey != null && pkg == confirmedPkg && episodeKey == confirmedEpisode &&
            HintFreshness.resumeUsable(confirmedAtMs, now)
        ) {
            confirmedTitle?.let { return it }
        }
        if (pkg != this.pkg) return null
        if (!HintFreshness.usable(source, atMs, playbackStartedAt, now)) {
            return null
        }
        val s = synced ?: return null
        // Solo pistas de serie: una ficha de película no debe convertir una
        // reproducción en episodio.
        if (s.mediaType != null && s.mediaType != "tv") return null
        val title = s.title?.trim()
        return if (title.isNullOrEmpty()) null else title
    }
}

/** La regla de validez de la pista, sin Android para poder probarla. */
object HintFreshness {
    /** Una ficha vale si se vio como mucho esto ANTES de empezar a reproducir. */
    const val DETAIL_BEFORE_PLAYBACK_MS = 10 * 60 * 1000L
    /** Y nunca más allá de esto sin renovarse, pase lo que pase. */
    const val MAX_AGE_MS = 30 * 60 * 1000L
    /** El mismo episodio ya confirmado se reconoce al reanudarlo hasta este tiempo. */
    const val RESUME_MAX_MS = 6 * 60 * 60 * 1000L

    // Nombres de episodio que no identifican nada ("Episodio 3", "Capítulo 1"):
    // el mismo nombre y números pueden ser de cualquier serie.
    private val GENERIC_EPISODE = Regex(
        "^(?:episodio|episode|ep|cap[ií]tulo|chapter|folge|parte|part)?\\s*\\.?\\s*\\d*$",
        RegexOption.IGNORE_CASE,
    )

    /**
     * Identidad de un episodio para reconocerlo al reanudarlo: su nombre y sus
     * números. Null si el nombre es genérico o falta (no identificaría nada).
     */
    fun episodeKey(episodeName: String?, season: Int?, episode: Int?): String? {
        val name = TitleMatch.normalize(episodeName)
        if (name.length < 4 || GENERIC_EPISODE.matches(name)) return null
        return "$name|${season ?: ""}|${episode ?: ""}"
    }

    fun resumeUsable(confirmedAtMs: Long, nowMs: Long): Boolean =
        confirmedAtMs > 0L && nowMs - confirmedAtMs <= RESUME_MAX_MS

    fun usable(
        source: RecentDetail.Source,
        atMs: Long,
        playbackStartedAt: Long,
        nowMs: Long,
    ): Boolean {
        if (atMs <= 0L || nowMs - atMs > MAX_AGE_MS) return false
        return when (source) {
            RecentDetail.Source.DETAIL -> atMs >= playbackStartedAt - DETAIL_BEFORE_PLAYBACK_MS
            RecentDetail.Source.PLAYBACK -> atMs >= playbackStartedAt
        }
    }
}
