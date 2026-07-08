package com.theshowverse.sync

/**
 * Heurísticas PURAS (sin dependencias de Android) para decidir, a partir de los
 * textos del árbol de accesibilidad, si una pantalla de una app de streaming es una
 * FICHA (detalle de un título) y cuáles son los candidatos a título. Se extrae aquí
 * para poder testearlo con JUnit sin instrumentación.
 *
 * Motivación: antes solo se consideraba "ficha" si aparecía un botón "Reproducir"
 * reconocido; Prime Video y Max no siempre exponen ese botón con un texto que
 * casáramos (o lo exponen como icono), así que su ficha no se detectaba hasta
 * reproducir. Ahora una pantalla también es ficha si muestra VARIAS señales típicas
 * de detalle (añadir a lista, descargar, tráiler, episodios, temporada, duración…),
 * lo que funciona en todas las plataformas.
 */
object ScreenHeuristics {
    private val WHITESPACE = Regex("\\s+")
    private val RUNTIME_RE =
        Regex("\\b\\d{1,2}\\s*h(?:\\s*\\d{1,2}\\s*m(?:in)?)?\\b|\\b\\d{1,3}\\s*min\\b")
    private val RATING_RE =
        Regex("^(?:\\+?\\d{1,2}\\+?|tv-?(?:ma|14|pg|g|y7?)|nr|ur|apta|todos los p[uú]blicos)$")

    /** Normaliza para comparar: minúsculas, sin puntos/puntos suspensivos finales
     *  ("Cargando…" → "cargando") ni espacios de más. */
    private fun norm(text: String): String =
        text.trim().trimEnd('.', '…', '·', ' ').replace(WHITESPACE, " ").lowercase().trim()

    // Cromo de navegación/sistema que el árbol de accesibilidad expone como texto o
    // contentDescription y que NO es un título: botones de barra, estados de carga,
    // el reproductor… Prime Video, sobre todo, los emitía como candidatos ("Back",
    // "Cargando…", "Reproductor de vídeo") y acababan resolviéndose por error.
    private val UI_CHROME = setOf(
        "back", "atrás", "atras", "volver", "cerrar", "close", "cancelar", "cancel",
        "aceptar", "ok", "listo", "done", "buscar", "search", "inicio", "home",
        "menú", "menu", "más opciones", "mas opciones", "opciones", "options",
        "siguiente", "next", "anterior", "previous", "saltar", "skip",
        "saltar intro", "saltar introducción", "skip intro", "saltar créditos",
        "skip credits", "reproducir/pausa", "pausa", "pause", "reproducir siguiente",
        "cargando", "loading", "cargando contenido", "buffering",
        "reproductor de vídeo", "reproductor de video", "video player",
        "reproduciendo vídeo", "reproduciendo video", "reproduciendo",
        "now playing", "en directo", "en vivo", "live", "directo",
        "perfil", "profile", "mi cuenta", "cuenta", "account", "ajustes",
        "settings", "configuración", "configuracion", "descargas", "downloads",
        "novedades", "explorar", "browse", "categorías", "categorias", "canales",
        "guía", "guia", "tienda", "store", "ver todo", "ver todos", "see all",
    )

    // Nombres de plataforma "a secas": nunca son un título de contenido (buscarlos
    // en TMDb devolvería basura tipo "Netflix Tudum"). Mismo criterio que el backend
    // (queryVariants.isBarePlatformName), replicado aquí para descartarlos antes.
    private val PLATFORM_NAMES = setOf(
        "netflix", "prime video", "amazon prime video", "amazon", "max", "hbo max",
        "hbo", "disney+", "disney plus", "disney", "star+", "star plus", "star",
        "paramount+", "paramount plus", "paramount", "apple tv+", "apple tv",
        "movistar+", "movistar plus", "movistar", "filmin", "skyshowtime",
        "pluto tv", "pluto", "rakuten tv", "rakuten", "atresplayer", "rtve",
        "rtve play", "crunchyroll", "plex",
    )

    private val PLAY_EXACT = setOf(
        "reproducir", "play", "ver ahora", "reproducir ahora", "play now",
        "reanudar", "resume", "continuar", "continuar viendo", "continue watching",
        "seguir viendo", "keep watching", "ver de nuevo", "watch now", "mira ahora",
        "empezar", "reproducir desde el principio", "start over", "restart",
        "empezar de nuevo", "reproduzir", "assistir", "assistir agora",
    )
    private val PLAY_PREFIXES = setOf(
        "reproducir", "reanudar", "ver t", "ver s", "ver ep", "ver ahora",
        "play s", "play e", "play t", "watch ", "continuar", "resume ",
        "seguir viendo", "reproduzir",
    )

    /** ¿El texto es la etiqueta de un botón de reproducir? (multi-idioma/plataforma). */
    fun isPlayLabel(text: String?): Boolean {
        val l = text?.trim()?.lowercase() ?: return false
        if (l.isEmpty()) return false
        if (PLAY_EXACT.contains(l)) return true
        return PLAY_PREFIXES.any { l.startsWith(it) }
    }

    private val DETAIL_EXACT = setOf(
        "añadir a mi lista", "agregar a mi lista", "add to watchlist", "add to my list",
        "mi lista", "my list", "descargar", "download", "tráiler", "trailer",
        "ver tráiler", "watch trailer", "episodios", "episodes", "temporadas",
        "seasons", "más información", "mas informacion", "more info", "detalles",
        "details", "sinopsis", "synopsis", "reparto", "reparto y equipo", "cast",
        "títulos similares", "titulos similares", "more like this", "también te puede gustar",
        "compartir", "share", "valorar", "rate", "me gusta", "no me gusta",
        "quitar de mi lista", "remove from my list", "extras", "ver tráileres",
        "audio y subtítulos", "audio and subtitles", "próximos episodios",
        // Señales típicas de la FICHA de Prime Video (usa etiquetas propias que no
        // casaban con las de Netflix/Max, por eso su ficha daba señales=0).
        "watchlist", "añadir a la watchlist", "agregar a la watchlist",
        "quitar de la watchlist", "incluido con prime", "incluido en prime",
        "ver con prime", "incluido", "comprar", "alquilar", "comprar o alquilar",
        "buy", "rent", "rent or buy", "x-ray", "rayos x", "descripción",
        "descripcion", "description", "idiomas", "audio e idiomas",
        "más como esto", "mas como esto", "más títulos como este",
    )
    private val DETAIL_PREFIXES = setOf(
        "temporada", "season", "episodio", "episode", "capítulo", "capitulo",
        "año ", "duración", "duracion", "género", "genero", "clasificación",
    )

    /** ¿El texto es una señal típica de una pantalla de FICHA (no home/grid)? */
    fun isDetailSignal(text: String?): Boolean {
        val l = text?.trim()?.lowercase() ?: return false
        if (l.isEmpty()) return false
        if (DETAIL_EXACT.contains(l)) return true
        if (DETAIL_PREFIXES.any { l.startsWith(it) }) return true
        if (RUNTIME_RE.containsMatchIn(l)) return true
        if (RATING_RE.matches(l)) return true
        return false
    }

    private val STOP_WORDS = setOf(
        "reproducir", "play", "descargar", "download", "mi lista", "buscar",
        "inicio", "novedades", "series", "películas", "peliculas", "más",
        "mas", "episodios", "episodes", "reparto", "tráiler", "trailer",
        "detalles", "resumen", "similares", "similar", "compartir",
        "continuar viendo", "añadir a mi lista", "quitar de mi lista",
        "ver más", "ver mas", "valorar", "me gusta", "no me gusta", "atrás",
        "reanudar", "resume", "seguir viendo", "temporadas", "seasons",
    )
    private val STOP_PREFIXES = setOf(
        "temporada", "season", "episodio", "episode", "capítulo", "capitulo",
        "año ", "duración", "duracion", "clasificación",
    )

    /** ¿El texto PARECE un título (no ruido de UI, ni botón, ni señal de ficha)? */
    fun isLikelyTitle(text: String?): Boolean {
        val t = text?.trim() ?: return false
        if (t.length < 2 || t.length > 80) return false
        val l = t.lowercase()
        val n = norm(t)
        if (STOP_WORDS.contains(l)) return false
        if (UI_CHROME.contains(n)) return false        // "Back", "Cargando…", "Reproductor de vídeo"
        if (PLATFORM_NAMES.contains(n)) return false   // "Amazon Prime Video", "Max"…
        if (STOP_PREFIXES.any { l.startsWith(it) }) return false
        if (t.split(WHITESPACE).size > 10) return false // parece sinopsis
        if (!t.any { it.isLetter() }) return false
        if (isPlayLabel(t) || isDetailSignal(t)) return false
        return true
    }

    /** Nº mínimo de señales de ficha para considerar una pantalla como detalle
     *  cuando NO se reconoce el botón de reproducir. */
    const val MIN_DETAIL_SIGNALS = 2

    /**
     * Decide si la pantalla es una ficha: hay botón de reproducir reconocido, o
     * suficientes señales de detalle (cubre Prime/Max cuando el botón no casa).
     */
    fun looksLikeDetail(sawPlay: Boolean, detailSignals: Int): Boolean {
        return sawPlay || detailSignals >= MIN_DETAIL_SIGNALS
    }
}
