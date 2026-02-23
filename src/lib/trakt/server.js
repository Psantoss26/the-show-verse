import crypto from 'crypto'

const TRAKT_API = 'https://api.trakt.tv'
const TRAKT_AUTHORIZE = 'https://trakt.tv/oauth/authorize'
const TRAKT_TOKEN = 'https://api.trakt.tv/oauth/token'

function traktUserAgent() {
    return process.env.TRAKT_USER_AGENT || 'TheShowVerse/1.0 (Next.js; Trakt OAuth)'
}

function requireEnv() {
    const clientId = process.env.TRAKT_CLIENT_ID
    const clientSecret = process.env.TRAKT_CLIENT_SECRET

    if (!clientId) throw new Error('Missing env TRAKT_CLIENT_ID')
    if (!clientSecret) throw new Error('Missing env TRAKT_CLIENT_SECRET')

    return { clientId, clientSecret }
}

export function buildRedirectUri(origin) {
    return `${origin}/api/trakt/auth/callback`
}

export function buildAuthorizeUrl({ origin, state }) {
    const { clientId } = requireEnv()
    const redirectUri = buildRedirectUri(origin)

    const u = new URL(TRAKT_AUTHORIZE)
    u.searchParams.set('response_type', 'code')
    u.searchParams.set('client_id', clientId)
    u.searchParams.set('redirect_uri', redirectUri)
    if (state) u.searchParams.set('state', state)
    return u.toString()
}

export function newOAuthState() {
    return crypto.randomBytes(16).toString('hex')
}

export function tokenIsExpired(expiresAtMs) {
    const t = Number(expiresAtMs || 0)
    if (!Number.isFinite(t) || t <= 0) return true
    // margen 30s
    return Date.now() >= t - 30_000
}

export function readTraktCookies(cookieStore) {
    const accessToken = cookieStore.get('trakt_access_token')?.value || null
    const refreshToken = cookieStore.get('trakt_refresh_token')?.value || null
    const expiresAtMs = cookieStore.get('trakt_expires_at')?.value || null
    return { accessToken, refreshToken, expiresAtMs: expiresAtMs ? Number(expiresAtMs) : null }
}

export function setTraktCookies(res, tokens) {
    const secure = process.env.NODE_ENV === 'production'

    res.cookies.set('trakt_access_token', tokens.access_token, {
        httpOnly: true,
        secure,
        sameSite: 'lax',
        path: '/',
    })

    res.cookies.set('trakt_refresh_token', tokens.refresh_token, {
        httpOnly: true,
        secure,
        sameSite: 'lax',
        path: '/',
    })

    res.cookies.set('trakt_expires_at', String(tokens.expires_at_ms), {
        httpOnly: true,
        secure,
        sameSite: 'lax',
        path: '/',
    })
}

export function clearTraktCookies(res) {
    const secure = process.env.NODE_ENV === 'production'
    const opts = { httpOnly: true, secure, sameSite: 'lax', path: '/', maxAge: 0 }
    res.cookies.set('trakt_access_token', '', opts)
    res.cookies.set('trakt_refresh_token', '', opts)
    res.cookies.set('trakt_expires_at', '', opts)
    res.cookies.set('trakt_oauth_state', '', opts)
}

export function setOAuthStateCookie(res, state) {
    const secure = process.env.NODE_ENV === 'production'
    res.cookies.set('trakt_oauth_state', state, {
        httpOnly: true,
        secure,
        sameSite: 'lax',
        path: '/',
        maxAge: 10 * 60, // 10 min
    })
}

export function readOAuthStateCookie(cookieStore) {
    return cookieStore.get('trakt_oauth_state')?.value || null
}

async function safeJson(res) {
    try {
        return await res.json()
    } catch {
        return null
    }
}

function traktHeaders({ token } = {}) {
    const { clientId } = requireEnv()
    const h = {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'trakt-api-version': '2',
        'trakt-api-key': clientId,
        'User-Agent': traktUserAgent(),
    }
    if (token) h.Authorization = `Bearer ${token}`
    return h
}

function traktOAuthHeaders() {
    const { clientId } = requireEnv()
    return {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'trakt-api-version': '2',
        'trakt-api-key': clientId,
        'User-Agent': traktUserAgent(),
    }
}

export async function exchangeCodeForTokens({ code, redirectUri }) {
    const { clientId, clientSecret } = requireEnv()

    const res = await fetch(TRAKT_TOKEN, {
        method: 'POST',
        headers: traktOAuthHeaders(),
        cache: 'no-store',
        body: JSON.stringify({
            code,
            client_id: clientId,
            client_secret: clientSecret,
            redirect_uri: redirectUri,
            grant_type: 'authorization_code',
        }),
    })

    const json = await safeJson(res)
    if (!res.ok) {
        throw new Error(json?.error_description || json?.error || 'Trakt token exchange failed')
    }

    const createdAtSec = Number(json.created_at || 0)
    const expiresInSec = Number(json.expires_in || 0)
    const expiresAtMs = (createdAtSec + expiresInSec) * 1000

    return {
        access_token: json.access_token,
        refresh_token: json.refresh_token,
        expires_at_ms: expiresAtMs,
    }
}

export async function refreshAccessToken(refreshToken) {
    const { clientId, clientSecret } = requireEnv()

    const res = await fetch(TRAKT_TOKEN, {
        method: 'POST',
        headers: traktOAuthHeaders(),
        cache: 'no-store',
        body: JSON.stringify({
            refresh_token: refreshToken,
            client_id: clientId,
            client_secret: clientSecret,
            grant_type: 'refresh_token',
        }),
    })

    const json = await safeJson(res)
    if (!res.ok) {
        throw new Error(json?.error_description || json?.error || 'Trakt refresh failed')
    }

    const createdAtSec = Number(json.created_at || 0)
    const expiresInSec = Number(json.expires_in || 0)
    const expiresAtMs = (createdAtSec + expiresInSec) * 1000

    return {
        access_token: json.access_token,
        refresh_token: json.refresh_token,
        expires_at_ms: expiresAtMs,
    }
}

export async function traktFetch(path, { token, method = 'GET', body } = {}) {
    const url = `${TRAKT_API}${path}`
    const res = await fetch(url, {
        method,
        headers: traktHeaders({ token }),
        cache: 'no-store',
        body: body ? JSON.stringify(body) : undefined,
    })
    const json = await safeJson(res)
    return { ok: res.ok, status: res.status, json }
}

// ✅ Alias para compatibilidad con rutas antiguas (history/add|remove|update)
export const traktApi = traktFetch

export async function traktGetUserSettings(token) {
    const r = await traktFetch('/users/settings', { token })
    if (!r.ok) throw new Error('Trakt auth check failed')
    return r.json
}

export async function traktSearchByTmdb(token, { type, tmdbId }) {
    // type: 'movie' | 'show'
    const r = await traktFetch(
        `/search/tmdb/${encodeURIComponent(tmdbId)}?type=${encodeURIComponent(type)}`,
        { token }
    )
    if (!r.ok) throw new Error('Trakt search failed')
    const arr = Array.isArray(r.json) ? r.json : []
    return arr[0] || null
}

function sortHistoryDesc(history = []) {
    const arr = Array.isArray(history) ? history : []
    return [...arr].sort((a, b) => {
        const ta = new Date(a?.watched_at || 0).getTime()
        const tb = new Date(b?.watched_at || 0).getTime()
        return (Number.isFinite(tb) ? tb : 0) - (Number.isFinite(ta) ? ta : 0)
    })
}

export async function traktGetHistoryForItem(token, { type, traktId, limit = 10 }) {
    // endpoint usa plural: movies / shows
    const plural = type === 'movie' ? 'movies' : 'shows'
    const r = await traktFetch(
        `/sync/history/${plural}/${encodeURIComponent(traktId)}?limit=${limit}`,
        { token }
    )
    if (!r.ok) throw new Error('Trakt history failed')
    const arr = Array.isArray(r.json) ? r.json : []
    return sortHistoryDesc(arr)
}

export function computeHistorySummary({ searchHit, history, type }) {
    if (!searchHit) {
        return {
            found: false,
            traktUrl: null,
            watched: false,
            plays: 0,
            lastWatchedAt: null,
        }
    }

    const obj = type === 'movie' ? searchHit.movie : searchHit.show
    const slug = obj?.ids?.slug || null

    const traktUrl = slug
        ? `https://trakt.tv/${type === 'movie' ? 'movies' : 'shows'}/${slug}`
        : null

    const h = sortHistoryDesc(history || [])
    const plays = Array.isArray(h) ? h.length : 0
    const watched = plays > 0
    const lastWatchedAt = watched ? (h[0]?.watched_at || null) : null

    return { found: true, traktUrl, watched, plays, lastWatchedAt }
}

/* ===========================
   ✅ FECHAS: arregla el bug
   - Acepta "YYYY-MM-DD"
   - Acepta "DD/MM/YYYY" o "DD-MM-YYYY"
   - Acepta ISO válido
   - Devuelve ISO al mediodía UTC para preservar el día
   =========================== */

function pad2(n) {
    const x = Number(n)
    if (!Number.isFinite(x)) return null
    return String(Math.trunc(x)).padStart(2, '0')
}

function ymdToIsoAtNoonUtc(ymd) {
    // ymd: YYYY-MM-DD
    if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null
    const iso = `${ymd}T12:00:00.000Z`
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return null
    return d.toISOString()
}

function parseDmyToYmd(s) {
    // "26/12/2025" o "26-12-2025"
    const m = String(s).trim().match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/)
    if (!m) return null
    const dd = pad2(m[1])
    const mm = pad2(m[2])
    const yyyy = m[3]
    if (!dd || !mm) return null
    const ymd = `${yyyy}-${mm}-${dd}`
    return /^\d{4}-\d{2}-\d{2}$/.test(ymd) ? ymd : null
}

export function normalizeWatchedAt(input) {
    // null/undefined -> ahora
    if (input == null) return new Date().toISOString()

    const s = String(input).trim()
    if (!s) return new Date().toISOString()

    // ✅ date-only "YYYY-MM-DD"
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
        return ymdToIsoAtNoonUtc(s) || new Date().toISOString()
    }

    // ✅ ES "DD/MM/YYYY" o "DD-MM-YYYY"
    const ymd = parseDmyToYmd(s)
    if (ymd) {
        return ymdToIsoAtNoonUtc(ymd) || new Date().toISOString()
    }

    // ✅ ISO o cualquier cosa parseable
    const d = new Date(s)
    if (!Number.isNaN(d.getTime())) return d.toISOString()

    // fallback: ahora (mejor que romper rutas)
    return new Date().toISOString()
}

export async function traktAddToHistory(token, { type, tmdbId, watchedAtIso }) {
    const body =
        type === 'movie'
            ? { movies: [{ ids: { tmdb: Number(tmdbId) }, watched_at: watchedAtIso }] }
            : { shows: [{ ids: { tmdb: Number(tmdbId) }, watched_at: watchedAtIso }] }

    const r = await traktFetch('/sync/history', { token, method: 'POST', body })
    if (!r.ok) throw new Error(`Trakt add history failed (${r.status})`)
    return r.json
}

export async function traktRemoveFromHistory(token, { type, tmdbId }) {
    const body =
        type === 'movie'
            ? { movies: [{ ids: { tmdb: Number(tmdbId) } }] }
            : { shows: [{ ids: { tmdb: Number(tmdbId) } }] }

    const r = await traktFetch('/sync/history/remove', { token, method: 'POST', body })
    if (!r.ok) throw new Error(`Trakt remove history failed (${r.status})`)
    return r.json
}

// ✅ borrar por IDs de historial (para "remove" o "update")
export async function traktRemoveHistoryEntries(token, { ids = [] }) {
    const safeIds = (ids || []).map((x) => Number(x)).filter((n) => Number.isFinite(n) && n > 0)
    if (!safeIds.length) return { deleted: 0 }

    const r = await traktFetch('/sync/history/remove', {
        token,
        method: 'POST',
        body: { ids: safeIds }
    })
    if (!r.ok) throw new Error(`Trakt remove history ids failed (${r.status})`)
    return r.json
}

export function mapHistoryEntries(history = []) {
    // ✅ UI: solo id + watched_at, ordenado desc
    // ✅ Añadimos watchedAt como alias por compatibilidad con UI
    return sortHistoryDesc(history || [])
        .map((h) => {
            const id = h?.id ?? null
            const watched_at = h?.watched_at ?? null
            if (!id || !watched_at) return null
            return {
                id,
                watched_at,
                watchedAt: watched_at
            }
        })
        .filter(Boolean)
}

export async function getValidTraktToken(cookieStore) {
    const { accessToken, refreshToken, expiresAtMs } = readTraktCookies(cookieStore)

    // no hay nada
    if (!accessToken && !refreshToken) {
        return { token: null, refreshedTokens: null, shouldClear: false }
    }

    // access válido
    if (accessToken && !tokenIsExpired(expiresAtMs)) {
        return { token: accessToken, refreshedTokens: null, shouldClear: false }
    }

    // expirado y no hay refresh => limpiar
    if (!refreshToken) {
        return { token: null, refreshedTokens: null, shouldClear: true }
    }

    // refresh
    const refreshedTokens = await refreshAccessToken(refreshToken)
    return { token: refreshedTokens.access_token, refreshedTokens, shouldClear: false }
}

// ✅ Watched progress por show (episodios vistos)
export async function traktGetWatchedForShow(token, { traktId }) {
    const r = await traktFetch(`/sync/watched/shows/${encodeURIComponent(traktId)}`, { token })
    if (!r.ok) throw new Error(`Trakt watched show failed (${r.status})`)
    return r.json
}

// ✅ Mapea -> { [seasonNumber]: [episodeNumber, ...] }
export function mapWatchedEpisodesBySeason(watchedPayload) {
    const obj = Array.isArray(watchedPayload) ? watchedPayload[0] : watchedPayload
    const seasons = Array.isArray(obj?.seasons) ? obj.seasons : []

    const out = {}
    for (const s of seasons) {
        const sn = Number(s?.number)
        if (!Number.isFinite(sn)) continue
        const eps = Array.isArray(s?.episodes) ? s.episodes : []
        out[sn] = eps
            .map((e) => Number(e?.number))
            .filter((n) => Number.isFinite(n) && n > 0)
    }
    return out
}

// ✅ Toggle episodio: add play
export async function traktAddEpisodeToHistory(token, { showTmdbId, season, episode, watchedAtIso }) {
    const body = {
        shows: [
            {
                ids: { tmdb: Number(showTmdbId) },
                seasons: [
                    {
                        number: Number(season),
                        episodes: [{ number: Number(episode), watched_at: watchedAtIso }]
                    }
                ]
            }
        ]
    }

    const r = await traktFetch('/sync/history', { token, method: 'POST', body })
    if (!r.ok) throw new Error(`Trakt add episode history failed (${r.status})`)
    return r.json
}

// ✅ Toggle episodio: remove plays (borra el episodio del historial)
export async function traktRemoveEpisodeFromHistory(token, { showTmdbId, season, episode }) {
    const body = {
        shows: [
            {
                ids: { tmdb: Number(showTmdbId) },
                seasons: [
                    {
                        number: Number(season),
                        episodes: [{ number: Number(episode) }]
                    }
                ]
            }
        ]
    }

    const r = await traktFetch('/sync/history/remove', { token, method: 'POST', body })
    if (!r.ok) throw new Error(`Trakt remove episode history failed (${r.status})`)
    return r.json
}

// ✅ progress/watched por show (mejor que sync/watched para pintar UI)
export async function traktGetProgressWatchedForShow(token, { traktId }) {
    // specials=false y count_specials=false para ignorar especiales
    const r = await traktFetch(
        `/shows/${encodeURIComponent(traktId)}/progress/watched?hidden=false&specials=false&count_specials=false`,
        { token }
    )
    if (!r.ok) throw new Error(`Trakt show progress watched failed (${r.status})`)
    return r.json
}

// ✅ Mapea progress -> { [seasonNumber>=1]: [episodeNumber...] }
export function mapProgressWatchedBySeason(progressPayload) {
    const seasons = Array.isArray(progressPayload?.seasons) ? progressPayload.seasons : []
    const out = {}

    for (const s of seasons) {
        const sn = Number(s?.number)
        if (!Number.isFinite(sn) || sn < 1) continue // 🚫 quita especiales y basura

        const eps = Array.isArray(s?.episodes) ? s.episodes : []
        out[sn] = eps
            .filter((e) => e?.completed === true)
            .map((e) => Number(e?.number))
            .filter((n) => Number.isFinite(n) && n > 0)
    }

    return out
}
