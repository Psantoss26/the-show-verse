// src/lib/details/omdbCache.js

export const OMDB_CACHE_TTL_MS = 24 * 60 * 60 * 1000
const cacheKey = (imdbId) => `showverse:omdb:${imdbId}`

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
        const next = {
            t: Date.now(),
            imdbRating: patch?.imdbRating ?? prev?.imdbRating ?? null,
            imdbVotes: patch?.imdbVotes ?? prev?.imdbVotes ?? null,
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
