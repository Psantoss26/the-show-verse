// src/lib/details/omdbCache.js

export const OMDB_CACHE_TTL_MS = 24 * 60 * 60 * 1000
// v2: las entradas anteriores podían guardar la nota de IMDb de OMDb (con
// semanas de retraso en estrenos recientes) encima de la del dataset de IMDb.
const cacheKey = (imdbId) => `showverse:omdb:v2:${imdbId}`

const validVotes = (value) => {
    const n = Number(value)
    return Number.isFinite(n) && n > 0 ? n : null
}

/**
 * De dos lecturas de la nota de IMDb ({ imdbRating, imdbVotes }), la MÁS
 * RECIENTE. Los votos de un título solo crecen, así que gana la que tenga más;
 * si solo una trae votos, esa; y si ninguna, la primera. Hay dos fuentes con
 * desfases distintos (el dataset diario de IMDb y OMDb, que en estrenos
 * recientes va semanas por detrás) y ninguna debe pisar a la otra con un dato
 * más viejo.
 */
export const pickFresherImdbScore = (first, second) => {
    const a = first?.imdbRating != null ? first : null
    const b = second?.imdbRating != null ? second : null
    if (!a || !b) return a || b || { imdbRating: null, imdbVotes: null }
    const va = validVotes(a.imdbVotes)
    const vb = validVotes(b.imdbVotes)
    if (va != null && vb != null) return vb > va ? b : a
    if (vb != null && va == null) return b
    return a
}

export const readOmdbCache = (imdbId) => {
    if (!imdbId || typeof window === 'undefined') return null
    try {
        const key = cacheKey(imdbId)
        const raw =
            window.localStorage.getItem(key) ||
            window.sessionStorage.getItem(key)
        if (!raw) return null
        const parsed = JSON.parse(raw)
        const t = Number(parsed?.t || 0)
        const fresh = Number.isFinite(t) && Date.now() - t < OMDB_CACHE_TTL_MS
        return { ...parsed, fresh }
    } catch {
        return null
    }
}

export const writeOmdbCache = (imdbId, patch) => {
    if (!imdbId || typeof window === 'undefined') return
    try {
        const prev = readOmdbCache(imdbId) || {}
        const hasPatchValue = (key) =>
            Object.prototype.hasOwnProperty.call(patch || {}, key)
        // La nota de IMDb no se sobrescribe a ciegas: se conserva la lectura
        // más reciente de las dos (ver pickFresherImdbScore).
        const imdb = pickFresherImdbScore(
            { imdbRating: patch?.imdbRating ?? null, imdbVotes: patch?.imdbVotes ?? null },
            { imdbRating: prev?.imdbRating ?? null, imdbVotes: prev?.imdbVotes ?? null }
        )
        const next = {
            t: Date.now(),
            imdbRating: imdb.imdbRating ?? null,
            imdbVotes: imdb.imdbVotes ?? null,
            awards: hasPatchValue('awards') ? patch.awards : prev?.awards ?? null,
            awardsFetched: patch?.awardsFetched ?? prev?.awardsFetched ?? false,
            rtScore: patch?.rtScore ?? prev?.rtScore ?? null,
            mcScore: patch?.mcScore ?? prev?.mcScore ?? null
        }
        const key = cacheKey(imdbId)
        const value = JSON.stringify(next)
        window.localStorage.setItem(key, value)
        window.sessionStorage.setItem(key, value)
    } catch {
        // ignore
    }
}

export const runIdle = (cb) => {
    if (typeof window === 'undefined') return
    if (typeof window.requestIdleCallback === 'function') {
        return window.requestIdleCallback(() => cb?.(), { timeout: 1200 })
    }
    return window.setTimeout(() => cb?.(), 250)
}

export const omdbGetRatingValue = (omdb, source) => {
    const arr = Array.isArray(omdb?.Ratings) ? omdb.Ratings : []
    const hit = arr.find(
        (r) => String(r?.Source || '').toLowerCase() === String(source || '').toLowerCase()
    )
    return typeof hit?.Value === 'string' ? hit.Value.trim() : null
}

export const parseOmdbScore0to100 = (value) => {
    if (!value || value === 'N/A') return null
    const s = String(value).trim()
    const m = s.match(/(\d+(\.\d+)?)/)
    if (!m) return null
    const n = Number(m[1])
    return Number.isFinite(n) ? n : null
}

export const extractOmdbExtraScores = (omdb) => {
    const rtRaw = omdbGetRatingValue(omdb, 'Rotten Tomatoes')
    const mcRaw = omdbGetRatingValue(omdb, 'Metacritic')
    const metaRaw = typeof omdb?.Metascore === 'string' ? omdb.Metascore : null

    const rtScore = parseOmdbScore0to100(rtRaw)
    const mcScore = parseOmdbScore0to100(mcRaw && mcRaw !== 'N/A' ? mcRaw : metaRaw)

    return { rtScore, mcScore }
}

export const parseOmdbScore0to10 = (value) => {
    if (!value || value === 'N/A') return null
    const s = String(value).trim()
    const m = s.match(/(\d+(\.\d+)?)/)
    if (!m) return null
    const n = Number(m[1])
    return Number.isFinite(n) && n > 0 && n <= 10 ? n : null
}

export const parseOmdbVotes = (value) => {
    if (!value || value === 'N/A') return null
    const digits = String(value).replace(/[^\d]/g, '')
    if (!digits) return null
    const n = Number(digits)
    return Number.isFinite(n) && n > 0 ? n : null
}

export const extractOmdbImdbScore = (omdb) => {
    const rating =
        parseOmdbScore0to10(omdb?.imdbRating) ??
        parseOmdbScore0to10(omdbGetRatingValue(omdb, 'Internet Movie Database'))
    const votes = parseOmdbVotes(omdb?.imdbVotes)

    return { imdbRating: rating, imdbVotes: votes }
}
