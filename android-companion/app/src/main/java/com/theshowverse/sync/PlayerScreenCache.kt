package com.theshowverse.sync

/**
 * Última lectura del reproductor en pantalla ([PlayerScreen]) de cada app, para
 * pasarla de AccessibilityStreamingService a MediaListenerService (mismo proceso).
 *
 * La identidad (serie/episodio) y el tiempo se guardan POR SEPARADO: los controles
 * no siempre muestran las dos cosas a la vez (el tiempo cambia cada segundo; el
 * título puede tardar en pintarse), y una lectura que solo trae el tiempo no debe
 * borrar la serie ya leída del mismo episodio.
 */
object PlayerScreenCache {
    private const val RETENTION_MS = 3 * 60 * 60 * 1000L

    private val identity = HashMap<String, PlayerReading>()
    private val timing = HashMap<String, PlayerReading>()

    @Synchronized
    fun record(pkg: String, reading: PlayerReading) {
        if (reading.hasIdentity) {
            val prev = identity[pkg]
            // Misma serie y episodio: se conserva lo que ya se sabía y esta lectura
            // no trae (el nombre del episodio no siempre se lee), para que la
            // identidad no parpadee entre lecturas del mismo contenido.
            val same = prev != null && prev.episode == reading.episode &&
                (prev.seriesTitle == null || reading.seriesTitle == null ||
                    TitleMatch.similar(prev.seriesTitle, reading.seriesTitle))
            identity[pkg] = if (same && prev != null) {
                reading.copy(
                    seriesTitle = reading.seriesTitle ?: prev.seriesTitle,
                    episodeName = reading.episodeName ?: prev.episodeName,
                    season = reading.season ?: prev.season,
                )
            } else {
                reading
            }
        }
        if (reading.positionSec != null) timing[pkg] = reading
    }

    /**
     * Lectura de [pkg] tomada desde [sinceMs] (elapsedRealtime): la identidad más
     * reciente con el tiempo más reciente. Null si no hay nada válido.
     */
    @Synchronized
    fun latest(pkg: String, sinceMs: Long, nowMs: Long): PlayerReading? {
        val id = identity[pkg]?.takeIf { it.atMs >= sinceMs && nowMs - it.atMs <= RETENTION_MS }
        val t = timing[pkg]?.takeIf { it.atMs >= sinceMs && nowMs - it.atMs <= RETENTION_MS }
        if (id == null && t == null) return null
        val base = id ?: PlayerReading(atMs = t!!.atMs)
        return if (t == null) {
            base.copy(positionSec = null, durationSec = null)
        } else {
            base.copy(
                positionSec = t.positionSec,
                durationSec = t.durationSec ?: id?.durationSec,
                atMs = t.atMs,
            )
        }
    }

    @Synchronized
    fun forget(pkg: String) {
        identity.remove(pkg)
        timing.remove(pkg)
    }
}
