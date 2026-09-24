package com.theshowverse.sync

/**
 * Mapa de paquetes de apps de streaming conocidas → nombre legible. Las claves
 * forman la lista de apps activadas por defecto (equivalente a la lista curada
 * de dominios de la extensión). Cualquier otra app que emita una MediaSession
 * aparece en la pantalla principal para activarla manualmente (así evitamos, por
 * defecto, registrar apps de música como Spotify).
 */
object Platforms {
    val KNOWN: Map<String, String> = linkedMapOf(
        "com.netflix.mediaclient" to "Netflix",
        "com.amazon.avod.thirdpartyclient" to "Prime Video",
        // Tablets Fire (Fire OS): Prime Video viene de serie con otro paquete. Sin
        // él, en esas tablets no se detectaba ni la ficha ni la reproducción.
        "com.amazon.avod" to "Prime Video",
        "com.amazon.amazonvideo.livingroom" to "Prime Video",
        "com.wbd.stream" to "Max",
        "com.hbo.hbonow" to "Max",
        "com.disney.disneyplus" to "Disney+",
        "com.crunchyroll.crunchyroid" to "Crunchyroll",
        "com.telefonica.gvp" to "Movistar+",
        "es.plus.yomvi" to "Movistar+",
        "com.apple.atve.androidtv.appletv" to "Apple TV+",
        "com.filmin" to "Filmin",
        "com.skyshowtime.skyshowtime" to "SkyShowtime",
        "tv.pluto.android" to "Pluto TV",
        "com.rakuten.tv" to "Rakuten TV",
        "com.atresmedia.atresplayer" to "Atresplayer",
        "es.rtve.rtvePlay" to "RTVE",
        "app.plex.android" to "Plex",
        "com.plexapp.android" to "Plex",
    )

    /** Paquetes activados por defecto (todas las apps de streaming conocidas). */
    val DEFAULT_ENABLED: Set<String> = KNOWN.keys.toSet()

    /**
     * Apps conocidas ANTES de que se guardara qué apps conocía la lista al tocar
     * un interruptor (ver Prefs.enabledPackages). Las que se añadan después de esta
     * lista entran activadas aunque el usuario ya hubiera personalizado la suya.
     * No se toca: es una foto del pasado.
     */
    val LEGACY_KNOWN: Set<String> = setOf(
        "com.netflix.mediaclient", "com.amazon.avod.thirdpartyclient",
        "com.amazon.amazonvideo.livingroom", "com.wbd.stream", "com.hbo.hbonow",
        "com.disney.disneyplus", "com.crunchyroll.crunchyroid", "com.telefonica.gvp",
        "es.plus.yomvi", "com.apple.atve.androidtv.appletv", "com.filmin",
        "com.skyshowtime.skyshowtime", "tv.pluto.android", "com.rakuten.tv",
        "com.atresmedia.atresplayer", "es.rtve.rtvePlay", "app.plex.android",
        "com.plexapp.android",
    )

    /** Nombre legible: el conocido, o el propio paquete si es una app añadida. */
    fun nameFor(pkg: String): String = KNOWN[pkg] ?: pkg

    /** Id de plataforma corto para logs/UI. */
    fun idFor(pkg: String): String {
        KNOWN[pkg]?.let { return it.lowercase().replace(Regex("[^a-z0-9]+"), "") }
        return pkg
    }

    /** Color de marca por plataforma (para el indicador de la lista de apps). */
    private val COLORS: Map<String, Long> = mapOf(
        "Netflix" to 0xFFE50914,
        "Prime Video" to 0xFF00A8E1,
        "Max" to 0xFF3B36E0,
        "Disney+" to 0xFF1F80E0,
        "Crunchyroll" to 0xFFF47521,
        "Movistar+" to 0xFF0BA5EC,
        "Apple TV+" to 0xFFB0B0B8,
        "Filmin" to 0xFFE4322B,
        "SkyShowtime" to 0xFF6E4AFF,
        "Pluto TV" to 0xFFFFE000,
        "Rakuten TV" to 0xFFE60012,
        "Atresplayer" to 0xFFFF6A00,
        "RTVE" to 0xFF00A0DF,
        "Plex" to 0xFFE5A00D,
    )

    /** Color de marca (ARGB) o ámbar por defecto para apps añadidas por el usuario. */
    fun colorFor(pkg: String): Int = (COLORS[nameFor(pkg)] ?: 0xFFEAB308).toInt()
}
