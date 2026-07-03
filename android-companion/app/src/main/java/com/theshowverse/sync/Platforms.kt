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

    /** Nombre legible: el conocido, o el propio paquete si es una app añadida. */
    fun nameFor(pkg: String): String = KNOWN[pkg] ?: pkg

    /** Id de plataforma corto para logs/UI. */
    fun idFor(pkg: String): String {
        KNOWN[pkg]?.let { return it.lowercase().replace(Regex("[^a-z0-9]+"), "") }
        return pkg
    }
}
