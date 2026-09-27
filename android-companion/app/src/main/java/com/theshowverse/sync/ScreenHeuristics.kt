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
    // Señales adicionales típicas de la ficha de Prime Video, que las expone de
    // forma fiable aunque el resto de etiquetas cambien o estén en otro idioma:
    // la nota de IMDb ("IMDb 8,1"), y el AÑO de estreno como texto suelto.
    private val IMDB_RE = Regex("^imdb\\s*\\d", RegexOption.IGNORE_CASE)
    private val YEAR_RE = Regex("^(?:19|20)\\d{2}$")
    // Episodio con su número delante: «T1 E3 - Nombre», «E3 - Nombre», «S1:E3 …».
    // Son las filas de la lista de episodios de la ficha (Crunchyroll, Prime) y NO
    // son el título: antes entraban como candidatos y desplazaban al nombre de la
    // serie fuera de los cuatro que se envían. No cuentan como señal de ficha
    // porque las tarjetas de "Seguir viendo" de la portada los muestran igual.
    private val EPISODE_ROW_RE = Regex(
        "^(?:(?:t|s)\\s*\\d{1,3}\\s*[:·|,-]?\\s*)?e(?:p\\.?)?\\s*\\d{1,4}\\s*[-–—·:.|]|" +
            "^(?:t|s)\\s*\\d{1,3}\\s*[:·|,-]?\\s*e(?:p\\.?)?\\s*\\d{1,4}\\b",
    )

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
        // Botones de icono que Crunchyroll y Prime exponen con descripción.
        "transmitir", "enviar", "enviar a dispositivo", "cast", "chromecast",
        "google cast", "notificaciones", "notifications", "más", "mas", "more",
        "filtrar", "filter", "ordenar", "sort", "mostrar más", "mostrar mas",
        "show more", "leer más", "leer mas", "read more", "ver menos", "show less",
        "premium", "hazte premium", "prueba gratis", "prueba gratuita",
        "free trial", "suscribirse", "subscribe", "mi perfil", "my profile",
    )

    // Géneros y etiquetas de idioma que las fichas pintan como texto suelto o en
    // lista («Acción, Aventura, Fantasía», «Sub | Dob»). Buscarlos en TMDb devuelve
    // un título real sin relación con la ficha. No son señal de ficha: las tarjetas
    // de la portada de Crunchyroll también los llevan.
    private val GENRES = setOf(
        "acción", "accion", "aventura", "animación", "animacion", "anime", "comedia",
        "drama", "fantasía", "fantasia", "ciencia ficción", "ciencia ficcion",
        "romance", "terror", "suspense", "suspenso", "thriller", "misterio",
        "documental", "crimen", "familia", "música", "musica", "musical",
        "deportes", "sobrenatural", "histórico", "historico", "bélico", "belico",
        "western", "infantil", "shonen", "shōnen", "seinen", "shojo", "shōjo",
        "josei", "isekai", "mecha", "slice of life", "recuentos de la vida",
        "action", "adventure", "animation", "comedy", "fantasy", "sci-fi",
        "science fiction", "horror", "mystery", "crime", "family", "music",
        "sports", "supernatural", "historical", "kids", "psicológico", "psicologico",
        "sub", "dob", "dub", "subtitulado", "doblado", "subbed", "dubbed",
    )
    private val LIST_SEPARATORS = Regex("\\s*[,·•|/]\\s*")

    /** ¿Es un género o una lista de géneros/idiomas? («Acción, Aventura», «Sub | Dob»). */
    private fun isGenreList(text: String): Boolean {
        val parts = text.lowercase().split(LIST_SEPARATORS).map { it.trim() }.filter { it.isNotEmpty() }
        return parts.isNotEmpty() && parts.all { it in GENRES }
    }

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
        "comenzar a ver", "empezar a ver", "start watching", "ver desde el principio",
        "watch from the beginning",
    )
    private val PLAY_PREFIXES = setOf(
        "reproducir", "reanudar", "ver t", "ver s", "ver ep", "ver ahora",
        "play s", "play e", "play t", "watch ", "continuar", "resume ",
        "seguir viendo", "reproduzir",
        // Crunchyroll: «Empezar a ver T1 E1», «Comenzar a ver…», «Continue watching S1 E3».
        "empezar a ver", "comenzar a ver", "start watching", "continue watching",
        "keep watching", "ver episodio", "ver película", "ver pelicula",
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
        // Badges de calidad/audio que Prime pinta en la ficha como textos sueltos.
        "uhd", "4k", "4k uhd", "hd", "hdr", "hdr10", "hdr10+", "dolby vision",
        "dolby atmos", "5.1", "subtítulos", "subtitulos", "subtitles", "cc",
        "audio descriptivo", "audio description", "ad",
        // Otros idiomas (FR/DE/IT/PT) para dispositivos no configurados en ES/EN.
        "bande-annonce", "télécharger", "épisodes", "saisons",
        "herunterladen", "episoden", "staffeln",
        "episodi", "stagioni", "guarda il trailer",
        "baixar", "episódios", "temporadas",
        // Señales de la FICHA de Crunchyroll.
        "crunchylista", "crunchylist", "añadir a crunchylista", "agregar a crunchylista",
        "add to crunchylist", "lista de seguimiento", "añadir a la lista de seguimiento",
        "agregar a la lista de seguimiento", "quitar de la lista de seguimiento",
        "más detalles", "mas detalles", "more details",
        "versiones", "versions", "más episodios", "mas episodios",
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
        if (IMDB_RE.containsMatchIn(l)) return true
        if (YEAR_RE.matches(l)) return true
        return false
    }

    private val PLAY_VIEW_ID_HINTS = listOf(
        "play_button", "playbutton", "btn_play", "play_icon", "resume_button",
    )

    /**
     * ¿El viewId del nodo delata un botón de reproducir? Cubre el caso Prime/Max
     * donde el botón es SOLO un icono sin texto ni contentDescription casable: el
     * id de recurso ("…:id/play_button") sigue identificándolo.
     */
    fun isPlayViewId(viewId: String?): Boolean {
        val id = viewId?.substringAfterLast('/')?.lowercase() ?: return false
        if (id.isEmpty()) return false
        return PLAY_VIEW_ID_HINTS.any { id.contains(it) } || id == "play"
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
        if (EPISODE_ROW_RE.containsMatchIn(l)) return false // fila de episodio
        if (isGenreList(t)) return false                     // «Acción, Aventura»
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

    /**
     * Compara dos pantallas (normalmente de VENTANAS distintas) y decide si A es "más
     * ficha" que B, para elegir entre varias ventanas la que de verdad muestra la
     * ficha. Prioridad: (1) la que parece ficha; (2) a igualdad, la que tiene más
     * señales de detalle; (3) a igualdad, la que tiene más candidatos de título.
     *
     * Con esto, overlays/recientes/controladores de ventana (0 señales, 0/1 candidato)
     * NUNCA ganan a la ficha real de Prime, que tiene varias señales de detalle.
     * Puro (sin Android) para poder testearlo.
     */
    fun isBetterDetail(
        aLooksDetail: Boolean,
        aSignals: Int,
        aCandidates: Int,
        bLooksDetail: Boolean,
        bSignals: Int,
        bCandidates: Int,
    ): Boolean {
        if (aLooksDetail != bLooksDetail) return aLooksDetail
        if (aSignals != bSignals) return aSignals > bSignals
        return aCandidates > bCandidates
    }
}
