package com.theshowverse.sync

import org.json.JSONObject
import java.util.concurrent.Executors

/**
 * Textos que el usuario marcó como «no había ninguna ficha» al corregir una
 * detección (y los que marcaron suficientes usuarios a la vez). Antes de tratar
 * una pantalla como ficha, AccessibilityStreamingService descarta los candidatos
 * que estén aquí: así el siguiente candidato —el título de verdad— pasa a ser el
 * principal, en vez de volver a notificar el banner o el carrusel corregido.
 *
 * El servidor rechaza esos textos de todas formas; esta lista solo evita la
 * consulta y deja paso al siguiente candidato. Se guarda en [Prefs] y se refresca
 * cada pocas horas, y al momento tras una corrección.
 */
object NotATitleList {

    private const val TTL_MS = 6 * 60 * 60 * 1000L

    private val bg = Executors.newSingleThreadExecutor()

    @Volatile private var cachedJson: String? = null
    @Volatile private var cached: Map<String, Set<String>> = emptyMap()
    @Volatile private var refreshing = false

    /** Id canónico de plataforma (el mismo que usa el servidor en la huella). */
    fun canonicalPlatform(platformId: String): String {
        val id = platformId.lowercase().replace(Regex("[^a-z0-9]+"), "")
        return ALIASES[id] ?: id
    }

    private val ALIASES = mapOf(
        "prime" to "primevideo",
        "amazon" to "primevideo",
        "amazonprimevideo" to "primevideo",
        "hbomax" to "max",
        "hbo" to "max",
        "disneyplus" to "disney",
        "movistarplus" to "movistar",
        "appletvplus" to "appletv",
    )

    /** Interpreta la respuesta del servidor. PURA (para probarla en la JVM). */
    fun parse(json: String?): Map<String, Set<String>> {
        if (json.isNullOrBlank()) return emptyMap()
        return try {
            val platforms = JSONObject(json).optJSONObject("platforms") ?: return emptyMap()
            buildMap {
                for (key in platforms.keys()) {
                    val arr = platforms.optJSONArray(key) ?: continue
                    val texts = (0 until arr.length())
                        .mapNotNull { arr.optString(it).takeIf { t -> t.isNotBlank() } }
                        .toSet()
                    if (texts.isNotEmpty()) put(canonicalPlatform(key), texts)
                }
            }
        } catch (e: Exception) {
            emptyMap()
        }
    }

    /** ¿[text] no es un título en [platformId]? PURA salvo por la lista dada. */
    fun matches(rules: Map<String, Set<String>>, platformId: String, text: String?): Boolean {
        val list = rules[canonicalPlatform(platformId)] ?: return false
        val key = TitleMatch.normalize(text)
        return key.isNotEmpty() && key in list
    }

    /** Candidatos sin los textos marcados como «no es un título» en esta plataforma. */
    fun filter(prefs: Prefs, platformId: String, candidates: List<String>): List<String> {
        val rules = rules(prefs)
        if (rules.isEmpty()) return candidates
        return candidates.filterNot { matches(rules, platformId, it) }
    }

    private fun rules(prefs: Prefs): Map<String, Set<String>> {
        val json = prefs.notATitleJson
        if (json != cachedJson) {
            cached = parse(json)
            cachedJson = json
        }
        return cached
    }

    /** Pide la lista al servidor en segundo plano si ha caducado (o si [force]). */
    fun refreshIfStale(prefs: Prefs, force: Boolean = false) {
        val origin = prefs.origin ?: return
        val token = prefs.token ?: return
        if (refreshing) return
        if (!force && System.currentTimeMillis() - prefs.notATitleFetchedAt < TTL_MS) return
        refreshing = true
        bg.execute {
            try {
                val body = SyncClient.fetchNotATitle(origin, token)
                // Solo si la vinculación sigue siendo la misma que la pidió.
                if (body != null && prefs.token == token) prefs.notATitleJson = body
            } finally {
                refreshing = false
            }
        }
    }
}
