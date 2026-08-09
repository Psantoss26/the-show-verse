package com.theshowverse.sync

import java.text.Normalizer

/**
 * Comparación de títulos. PURO (sin Android) para poder probarlo en la JVM.
 *
 * POR QUÉ EXISTE. La resolución contra TMDb es una BÚSQUEDA: casi cualquier texto
 * devuelve *algo*. Si le mandamos el nombre de un carrusel ("Éxitos de taquilla")
 * o un texto de la notificación, TMDb responde con un título real que no tiene
 * NADA que ver con lo que hay en pantalla, y a partir de ahí:
 *   - se notifica ese título como si fuera la ficha abierta (Prime Video), y
 *   - se recuerda como "la serie que estoy viendo", con lo que el episodio que se
 *     reproduzca después se atribuye a esa serie ajena y acaba en el Historial
 *     (Netflix).
 *
 * La regla que arregla las dos cosas es la misma: **una resolución solo vale si
 * lo que ha devuelto TMDb se parece a lo que se leyó en la pantalla**. Si no se
 * parece, la búsqueda ha inventado y hay que descartarla.
 */
object TitleMatch {

    /** Palabras vacías que no aportan a la comparación (artículos y conectores). */
    private val STOP = setOf(
        "el", "la", "los", "las", "un", "una", "unos", "unas", "de", "del", "y",
        "the", "a", "an", "of", "and",
    )

    /**
     * Normaliza para comparar: sin acentos, en minúsculas y sin signos. Mantiene
     * el criterio del backend (`normalizeText` de src/lib/netflix/resolve.js) para
     * que cliente y servidor no discrepen sobre qué es "el mismo título".
     */
    fun normalize(value: String?): String {
        if (value.isNullOrBlank()) return ""
        val sinAcentos = Normalizer.normalize(value, Normalizer.Form.NFD)
            .replace(Regex("\\p{Mn}+"), "")
        return sinAcentos
            .lowercase()
            .replace(Regex("[×✕⨯╳]"), "x")
            .replace(Regex("[^\\p{L}\\p{N}]+"), " ")
            .trim()
    }

    private fun tokens(value: String?): Set<String> =
        normalize(value)
            .split(' ')
            .filter { it.isNotBlank() && it !in STOP }
            .toSet()

    /**
     * ¿[a] y [b] son plausiblemente el mismo título?
     *
     * Se acepta si son iguales normalizados, si uno contiene al otro con
     * suficiente cuerpo (evita que "el" case con "el padrino"), o si comparten la
     * mayoría de sus palabras significativas —que es lo que pasa entre el título
     * de TMDb y el que pinta la plataforma ("La casa del dragón" vs "La Casa del
     * Dragón: Temporada 2")—.
     */
    fun similar(a: String?, b: String?): Boolean {
        val na = normalize(a)
        val nb = normalize(b)
        if (na.isEmpty() || nb.isEmpty()) return false
        if (na == nb) return true

        // Contención CON CUERPO: además de estar contenido, el trozo tiene que ser
        // una parte sustancial del otro título. Sin la proporción, "Bola" casaba
        // con "Bola de Dragón" y cualquier palabra suelta de la pantalla habría
        // dado por bueno un título ajeno.
        val corto = if (na.length <= nb.length) na else nb
        val largo = if (na.length <= nb.length) nb else na
        if (corto.length >= MIN_CONTAINED &&
            largo.contains(corto) &&
            corto.length >= largo.length * MIN_CONTAINED_RATIO
        ) {
            return true
        }

        val ta = tokens(a)
        val tb = tokens(b)
        if (ta.isEmpty() || tb.isEmpty()) return false
        val comunes = ta.count { it in tb }
        val menor = minOf(ta.size, tb.size)
        // Con una sola palabra significativa exigimos coincidencia total: "Bola"
        // no puede pasar por "Bola de Dragón".
        if (menor == 1) return comunes == 1 && ta.size == tb.size
        return comunes.toDouble() / menor >= MIN_TOKEN_RATIO
    }

    /**
     * ¿El título [resolved] devuelto por TMDb está RESPALDADO por alguno de los
     * textos [screenTexts] que se leyeron en la pantalla?
     *
     * Es la puerta que evita notificar (y recordar) títulos inventados: si TMDb
     * resolvió algo que no aparece por ninguna parte en la pantalla, la búsqueda
     * se ha ido por su cuenta y la resolución se descarta.
     */
    fun corroborates(resolved: String?, screenTexts: List<String?>): Boolean {
        if (normalize(resolved).isEmpty()) return false
        return screenTexts.any { similar(resolved, it) }
    }

    /**
     * ¿La pista de serie [hint] es coherente con lo que está sonando?
     *
     * La pista viene de la ficha que el usuario abrió antes de darle a reproducir,
     * y sirve para las apps que no exponen la serie en la MediaSession (Netflix).
     * Se RECHAZA cuando:
     *   - la propia reproducción ya trae un nombre de serie (no hace falta pista), o
     *   - la pista coincide con el nombre del episodio (sería redundante y suele
     *     indicar que la ficha era del episodio, no de la serie).
     * En el resto de casos se acepta: por definición la pista aporta un dato que la
     * MediaSession no tiene, así que no se le puede exigir que case con ella.
     */
    fun hintIsUsable(hint: String?, episodeTitle: String?, seriesFromSession: String?): Boolean {
        if (normalize(hint).isEmpty()) return false
        if (!normalize(seriesFromSession).isEmpty()) return false
        if (similar(hint, episodeTitle)) return false
        return true
    }

    private const val MIN_CONTAINED = 4
    private const val MIN_CONTAINED_RATIO = 0.6
    private const val MIN_TOKEN_RATIO = 0.6
}
