package com.theshowverse.sync

/**
 * Señal de reproducción normalizada — misma forma que la que envía la extensión
 * del navegador, para reutilizar el resolutor del backend sin cambios.
 */
data class PlaybackSignal(
    val host: String,
    val platformId: String,
    val platformName: String,
    val showName: String? = null,
    val episodeName: String? = null,
    val movieTitle: String? = null,
    val season: Int? = null,
    val episode: Int? = null,
    val seasonEpisodeText: String? = null,
    val tabTitle: String? = null,
    // Fuentes adicionales del nombre de la SERIE (algunas apps ponen ahí la serie
    // cuando `title` es el episodio): título de la cola, "album artist" y los
    // extras de la notificación de la app (Netflix no da la serie en la MediaSession).
    val queueTitle: String? = null,
    val albumArtist: String? = null,
    val notifTitle: String? = null,
    val notifText: String? = null,
    val notifSubText: String? = null,
    val artworkUrl: String? = null,
    val durationSec: Long? = null,
    val positionSec: Long? = null,
    // El nombre de la serie viene de la FICHA que se vio antes (RecentDetail), no
    // de la propia reproducción. El servidor lo usa para bajar la confianza: un
    // dato prestado no puede valer lo mismo que uno que da la MediaSession.
    val seriesFromHint: Boolean = false,
) {
    /** Título principal (para retrocompat con el endpoint: mainTitle). */
    val mainTitle: String?
        get() = showName ?: movieTitle ?: tabTitle

    /**
     * Clave de deduplicación local: identifica QUÉ SE ESTÁ REPRODUCIENDO. Mientras
     * no cambia, la resolución ya hecha sigue valiendo y el progreso se sigue
     * enviando; en cuanto cambia, se vuelca el punto anterior y se resuelve de nuevo.
     *
     * Por eso NO puede depender de campos que van y vienen entre sondeos. El nombre
     * de la serie de un episodio suele venir de una pista externa (la ficha que se
     * abrió antes, ver [RecentDetail]), que caduca y puede faltar en cualquier
     * lectura: con `mainTitle` dentro de la clave, cada parpadeo se tomaba por un
     * cambio de contenido y se tiraba la resolución recién hecha, se olvidaba el
     * punto de reproducción y se reiniciaba la cadencia de envío. Entre parpadeo y
     * parpadeo no daba tiempo a completar una petición, así que el episodio se
     * detectaba bien una y otra vez pero su progreso no llegaba a enviarse NUNCA
     * —mientras que las películas, cuyo título sale siempre de la propia sesión, sí
     * funcionaban—.
     *
     * Un episodio ya queda identificado por su nombre y sus números, así que el de
     * la serie solo entra en la clave cuando lo dice la propia reproducción.
     */
    val dedupKey: String
        get() {
            val serieEstable = if (seriesFromHint) null else showName
            if (episode != null || !episodeName.isNullOrBlank()) {
                return "$platformId:${serieEstable ?: ""}|${episodeName ?: ""}|${season ?: ""}|${episode ?: ""}"
            }
            return "$platformId:${mainTitle ?: ""}"
        }
}

/**
 * Metadatos crudos extraídos de una MediaSession de otra app (sin dependencias
 * de Android para poder probar SignalBuilder en la JVM).
 */
data class RawMetadata(
    val packageName: String,
    val title: String? = null,
    val artist: String? = null,
    val album: String? = null,
    val albumArtist: String? = null,
    val displayTitle: String? = null,
    val displaySubtitle: String? = null,
    val displayDescription: String? = null,
    val queueTitle: String? = null,
    val notifTitle: String? = null,
    val notifText: String? = null,
    val notifSubText: String? = null,
    val artUri: String? = null,
    val durationMs: Long = 0,
    val positionMs: Long = 0,
)
