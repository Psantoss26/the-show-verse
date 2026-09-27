package com.theshowverse.sync

/**
 * Lo que el REPRODUCTOR de una app de streaming muestra en pantalla: la serie, el
 * episodio con sus números y el tiempo. [atMs] es el elapsedRealtime de la lectura.
 */
data class PlayerReading(
    val seriesTitle: String? = null,
    val episodeName: String? = null,
    val season: Int? = null,
    val episode: Int? = null,
    val positionSec: Long? = null,
    val durationSec: Long? = null,
    val atMs: Long = 0L,
) {
    /** La lectura dice QUÉ se reproduce (no solo por dónde va). */
    val hasIdentity: Boolean
        get() = !seriesTitle.isNullOrBlank() || episode != null
}

/**
 * Lectura de la pantalla del REPRODUCTOR a partir de sus textos de accesibilidad.
 * PURO (sin Android) para poder probarlo en la JVM.
 *
 * POR QUÉ. Prime Video y Crunchyroll, en su app de Android, no publican en la
 * MediaSession de qué serie es el episodio (a veces ni su número), y tampoco
 * siempre la posición: sin serie el servidor no resuelve nada o resuelve un título
 * ajeno, y sin posición solo se puede estimar por reloj, que nunca marca un
 * episodio como visto. Pero su propio reproductor sí lo muestra, cada vez que
 * aparecen los controles: la serie arriba, debajo «T1 E3 · Nombre del episodio» y
 * el tiempo junto a la barra de avance. Aquí se interpreta esa pantalla; el
 * servicio de accesibilidad la lee y MediaListenerService la combina con la sesión.
 */
object PlayerScreen {

    // Tiempo "12:34" o "1:02:03"; con un menos delante es el tiempo RESTANTE.
    private val TIME_TOKEN = Regex("([-−–]\\s*)?(?<![\\d:])(\\d{1,2}):(\\d{2})(?::(\\d{2}))?(?![\\d:])")
    private val REMAINING_WORDS = Regex("\\b(?:quedan?|restan?|restante|remaining|left)\\b", RegexOption.IGNORE_CASE)
    // "Termina a las 22:15", "Ends at 10:15 PM": una HORA del día, no un tiempo del vídeo.
    private val CLOCK_WORDS = Regex("\\b(?:termina|finaliza|acaba|ends?|a las|at|[ap]\\.?\\s?m\\.?)\\b", RegexOption.IGNORE_CASE)

    // Línea de episodio del reproductor: «T1 E3 - Nombre», «T1:E3 Nombre»,
    // «Temporada 1, ep. 3 Nombre», «Season 1 Episode 3: Name», «E12 - Nombre»,
    // «Episodio 3». El nombre del episodio (grupo 3) puede faltar.
    private val EPISODE_LINE = Regex(
        "^\\s*(?:(?:T|S|Temp|Temporada|Season|Saison|Staffel|Stagione)\\s*\\.?\\s*(\\d{1,3})\\s*[,:x·•|\\-–—]?\\s*)?" +
            "(?:E|Ep|Ép|Episodio|Episode|Épisode|Episodi|Cap[ií]tulo|Chapter|Folge)\\s*\\.?\\s*(\\d{1,4})(?!\\d)" +
            "(?:\\s*[-–—·•:.|]\\s*|\\s+|$)(.*)$",
        RegexOption.IGNORE_CASE,
    )
    private val SEASON_ONLY = Regex(
        "^\\s*(?:T|S|Temporada|Season|Saison|Staffel|Stagione)\\s*\\.?\\s*(\\d{1,3})\\s*$",
        RegexOption.IGNORE_CASE,
    )

    // Tarjeta de "siguiente episodio": su línea de episodio NO es lo que suena.
    private val UP_NEXT = setOf(
        "siguiente episodio", "próximo episodio", "proximo episodio", "a continuación",
        "a continuacion", "next episode", "up next", "siguiente", "next", "ver siguiente",
        "reproducir siguiente", "episodio siguiente",
    )

    private const val MAX_TEXT = 140
    private const val MAX_DURATION_SEC = 6 * 60 * 60L

    private fun norm(t: String) = t.trim().trimEnd('.', '…', ':').lowercase()

    private data class Times(val elapsed: List<Long>, val remaining: List<Long>)

    /** Segundos de cada token de tiempo de [text], si es una etiqueta de tiempo. */
    private fun readTimes(text: String): Times? {
        if (text.length > 40 || CLOCK_WORDS.containsMatchIn(text)) return null
        val matches = TIME_TOKEN.findAll(text).toList()
        if (matches.isEmpty()) return null
        // Lo que queda sin los tiempos tiene que ser poco ("/", "de", "Restante"…):
        // si no, es una frase que casualmente lleva una hora dentro.
        val rest = TIME_TOKEN.replace(text, "").filter { it.isLetter() }
        if (rest.length > 16) return null
        val remainingWord = REMAINING_WORDS.containsMatchIn(text)
        val elapsed = ArrayList<Long>()
        val remaining = ArrayList<Long>()
        for (m in matches) {
            val a = m.groupValues[2].toLong()
            val b = m.groupValues[3].toLong()
            val c = m.groupValues[4].toLongOrNull()
            if (b >= 60 || (c != null && c >= 60)) return null
            val secs = if (c != null) a * 3600 + b * 60 + c else a * 60 + b
            if (m.groupValues[1].isNotEmpty() || remainingWord) remaining.add(secs) else elapsed.add(secs)
        }
        return Times(elapsed, remaining)
    }

    private data class EpisodeLine(val season: Int?, val episode: Int, val name: String?)

    private fun episodeLine(text: String): EpisodeLine? {
        if (text.length > MAX_TEXT) return null
        val m = EPISODE_LINE.find(text) ?: return null
        val episode = m.groupValues[2].toIntOrNull() ?: return null
        if (episode <= 0) return null
        val name = m.groupValues[3].trim().trimStart('-', '–', '—', '·', '•', ':', '|').trim()
        return EpisodeLine(
            season = m.groupValues[1].toIntOrNull(),
            episode = episode,
            name = name.takeIf { it.any(Char::isLetter) && readTimes(it) == null },
        )
    }

    private fun isTitleText(text: String): Boolean =
        ScreenHeuristics.isLikelyTitle(text) &&
            readTimes(text) == null &&
            episodeLine(text) == null &&
            norm(text) !in UP_NEXT

    /**
     * Interpreta los textos del reproductor, en ORDEN DE LECTURA (recorrido en
     * profundidad del árbol: la serie va justo antes que su línea de episodio).
     * [seekFraction] es el avance de la barra (0..1) si la pantalla la expone.
     * Devuelve null si la pantalla no es un reproductor.
     */
    fun parse(texts: List<String>, seekFraction: Double?, atMs: Long): PlayerReading? {
        val clean = texts.map { it.trim() }.filter { it.isNotEmpty() }

        val elapsed = ArrayList<Long>()
        val remaining = ArrayList<Long>()
        for (t in clean) {
            val times = readTimes(t) ?: continue
            elapsed.addAll(times.elapsed)
            remaining.addAll(times.remaining)
        }
        val fraction = seekFraction?.takeIf { it in 0.0..1.0 }
        // Un reproductor tiene barra de avance, o al menos dos tiempos (transcurrido
        // y total/restante). Un único "12:34" suelto no basta: puede ser cualquier cosa.
        val isPlayer = fraction != null || elapsed.size + remaining.size >= 2 || remaining.isNotEmpty()
        if (!isPlayer) return null

        var pos: Long? = null
        var dur: Long? = null
        when {
            elapsed.size >= 2 -> {
                pos = elapsed.first()
                dur = elapsed.drop(1).maxOrNull()
                if (dur != null && pos >= dur) {
                    // El orden no era transcurrido → total: el menor es la posición.
                    val lo = elapsed.minOrNull()
                    val hi = elapsed.maxOrNull()
                    pos = lo
                    dur = if (hi != null && lo != null && hi > lo) hi else null
                }
            }
            elapsed.size == 1 && remaining.isNotEmpty() -> {
                pos = elapsed.first()
                dur = elapsed.first() + remaining.first()
            }
            elapsed.size == 1 -> {
                pos = elapsed.first()
                if (fraction != null && fraction in 0.02..0.995) dur = (pos / fraction).toLong()
            }
            remaining.isNotEmpty() && fraction != null && fraction < 0.98 -> {
                dur = (remaining.first() / (1.0 - fraction)).toLong()
                pos = dur - remaining.first()
            }
        }
        if (dur != null && (dur <= 0 || dur > MAX_DURATION_SEC)) dur = null
        if (pos != null && (pos < 0 || (dur != null && pos > dur))) pos = null

        // Línea de episodio: la PRIMERA que no sea la tarjeta de "siguiente".
        var lineIdx = -1
        var line: EpisodeLine? = null
        for ((i, t) in clean.withIndex()) {
            val l = episodeLine(t) ?: continue
            val upNext = (maxOf(0, i - 2) until i).any { norm(clean[it]) in UP_NEXT }
            if (upNext) continue
            lineIdx = i
            line = l
            break
        }

        var series: String? = null
        var episodeName = line?.name
        var season = line?.season
        if (line != null) {
            // La serie va justo ANTES de su línea de episodio.
            for (j in (lineIdx - 1) downTo maxOf(0, lineIdx - 3)) {
                val t = clean[j]
                if (season == null) SEASON_ONLY.find(t)?.let { season = it.groupValues[1].toIntOrNull() }
                if (norm(t) in UP_NEXT) break
                if (isTitleText(t)) {
                    series = t
                    break
                }
            }
            // Sin nombre en la propia línea, el episodio suele ir en el texto siguiente.
            if (episodeName == null) {
                clean.getOrNull(lineIdx + 1)?.takeIf { isTitleText(it) && it != series }?.let { episodeName = it }
            }
        }
        if (series != null && episodeName != null && TitleMatch.similar(series, episodeName)) {
            // Un único título repetido: es la serie, no sabemos el episodio.
            episodeName = null
        }

        return PlayerReading(
            seriesTitle = series,
            episodeName = episodeName,
            season = season,
            episode = line?.episode,
            positionSec = pos,
            durationSec = dur,
            atMs = atMs,
        )
    }

    /** Nombre del episodio sin su marcador delante («E12 - La promesa» → «La promesa»). */
    private fun episodeCore(name: String?): String? {
        if (name.isNullOrBlank()) return null
        return episodeLine(name)?.name ?: name.trim()
    }

    /**
     * Completa [signal] (lo que dice la MediaSession, con o sin pista de ficha) con
     * lo que muestra el reproductor ([reading]).
     *
     * El reproductor describe lo que suena AHORA, así que su serie gana a la pista
     * de una ficha vista antes, pero nunca a la serie que da la propia sesión. Si la
     * lectura CONTRADICE a la sesión (otro número de episodio, otro nombre), es de
     * otro contenido —el anterior, o la tarjeta de "siguiente"— y se ignora.
     *
     * La serie que sale de aquí va marcada como `seriesFromHint`: no la ha dicho la
     * reproducción, así que el servidor comprueba que el episodio es de esa serie y
     * no le da confianza máxima, y no entra en la clave de deduplicación.
     */
    fun merge(signal: PlaybackSignal, reading: PlayerReading?): PlaybackSignal {
        if (reading == null || !reading.hasIdentity) return signal

        if (signal.episode != null && reading.episode != null && signal.episode != reading.episode) return signal
        if (signal.season != null && reading.season != null && signal.season != reading.season) return signal
        // Sin números en la sesión, se compara su título (del episodio, o el único
        // que traiga) con lo leído: tiene que ser el episodio o la serie de la
        // lectura. Si no es ninguno de los dos, la lectura es de otra cosa.
        val sessionTitleCore = episodeCore(signal.episodeName ?: signal.movieTitle)
        if (signal.episode == null && sessionTitleCore != null && reading.episodeName != null &&
            !TitleMatch.similar(sessionTitleCore, reading.episodeName) &&
            (reading.seriesTitle == null || !TitleMatch.similar(sessionTitleCore, reading.seriesTitle))
        ) return signal

        val sessionKnowsSeries = signal.showName != null && !signal.seriesFromHint
        val series = reading.seriesTitle
        if (sessionKnowsSeries) {
            // Solo se completan los números que falten, y solo si es la misma serie.
            if (series != null && !TitleMatch.similar(series, signal.showName)) return signal
            return signal.copy(
                season = signal.season ?: reading.season,
                episode = signal.episode ?: reading.episode,
                episodeName = signal.episodeName ?: reading.episodeName,
            )
        }

        val sessionTitle = signal.movieTitle ?: signal.episodeName
        val isEpisode = reading.episode != null || signal.episode != null || signal.episodeName != null
        if (series == null) {
            // Sin serie: solo números, y solo si la sesión ya sabe que es un episodio
            // (con la serie de la pista de la ficha, p. ej.).
            if (signal.showName == null || reading.episode == null) return signal
            return signal.copy(
                season = signal.season ?: reading.season,
                episode = signal.episode ?: reading.episode,
                episodeName = signal.episodeName ?: reading.episodeName,
            )
        }
        // La sesión solo trae un título y el reproductor no dice nada de episodios:
        // es una película (o la sesión ya lo tiene todo). No se toca.
        if (!isEpisode) return signal

        val episodeName = signal.episodeName
            ?: reading.episodeName
            ?: sessionTitle?.takeIf { !TitleMatch.similar(it, series) }
        val season = signal.season ?: reading.season
        val episode = signal.episode ?: reading.episode
        return signal.copy(
            showName = series,
            episodeName = episodeName,
            movieTitle = null,
            season = season,
            episode = episode,
            seasonEpisodeText = signal.seasonEpisodeText
                ?: episode?.let { e -> (season?.let { "T$it " } ?: "") + "E$e" },
            seriesFromHint = true,
            // Ya no hacen falta: la serie está identificada.
            screenTitles = emptyList(),
        )
    }
}

/**
 * Posición del reproductor según la pantalla, para las apps que no la publican en
 * la MediaSession. La lectura solo existe mientras se ven los controles; entre
 * lectura y lectura se avanza con el tiempo que la sesión pasa REPRODUCIENDO (no
 * durante las pausas). Sin Android: el tiempo entra como parámetro.
 */
class PlayerClock {

    private class State(var posMs: Long, var tickMs: Long?, val readingAt: Long)

    private val byPkg = HashMap<String, State>()

    /**
     * Posición (ms) de [pkg] ahora. Se llama solo MIENTRAS SUENA; [playingSinceMs]
     * es cuándo empezó el tramo de reproducción en curso. Null si no hay lectura.
     */
    fun positionMs(pkg: String, reading: PlayerReading?, nowMs: Long, playingSinceMs: Long): Long? {
        val st = byPkg[pkg]
        val readPos = reading?.positionSec
        if (reading != null && readPos != null && (st == null || reading.atMs > st.readingAt)) {
            // Una lectura tomada en pausa (antes de reanudar) no avanza hasta la reanudación.
            val base = maxOf(reading.atMs, playingSinceMs)
            val pos = readPos * 1000 + (nowMs - base).coerceAtLeast(0L)
            byPkg[pkg] = State(pos, nowMs, reading.atMs)
            return pos
        }
        st ?: return null
        st.posMs += (nowMs - (st.tickMs ?: playingSinceMs)).coerceAtLeast(0L)
        st.tickMs = nowMs
        return st.posMs
    }

    /** La reproducción se ha parado: el reloj deja de avanzar hasta que se reanude. */
    fun pause(pkg: String) {
        byPkg[pkg]?.tickMs = null
    }

    fun forget(pkg: String) {
        byPkg.remove(pkg)
    }
}
