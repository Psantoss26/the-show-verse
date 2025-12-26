import crypto from 'crypto'

export const TRAKT_API_BASE = 'https://api.trakt.tv'
export const TRAKT_OAUTH_TOKEN_URL = `${TRAKT_API_BASE}/oauth/token`

export function assertTraktEnv() {
    if (!process.env.TRAKT_CLIENT_ID) throw new Error('Missing TRAKT_CLIENT_ID')
    if (!process.env.TRAKT_CLIENT_SECRET) throw new Error('Missing TRAKT_CLIENT_SECRET')
    if (!process.env.TRAKT_REDIRECT_URI) throw new Error('Missing TRAKT_REDIRECT_URI')
}

export function traktHeaders({ accessToken } = {}) {
    assertTraktEnv()
    const h = {
        'Content-Type': 'application/json',
        'trakt-api-version': '2',
        'trakt-api-key': process.env.TRAKT_CLIENT_ID
    }
    if (accessToken) h.Authorization = `Bearer ${accessToken}`
    return h
}

export function getCookie(req, name) {
    return req.cookies.get(name)?.value || null
}

export function setTraktCookies(res, tokenPayload) {
    const access = tokenPayload?.access_token
    const refresh = tokenPayload?.refresh_token
    const expiresIn = Number(tokenPayload?.expires_in || 0)
    const createdAt = Number(tokenPayload?.created_at || 0) // epoch seconds

    const expiresAt = createdAt && expiresIn ? createdAt + expiresIn : 0

    const common = {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        path: '/'
    }

    if (access) {
        res.cookies.set('trakt_access_token', access, {
            ...common,
            maxAge: Math.max(60, expiresIn || 3600)
        })
    }
    if (refresh) {
        // Trakt refresh token suele durar mucho; guardamos 1 año
        res.cookies.set('trakt_refresh_token', refresh, {
            ...common,
            maxAge: 60 * 60 * 24 * 365
        })
    }
    if (expiresAt) {
        res.cookies.set('trakt_expires_at', String(expiresAt), {
            ...common,
            maxAge: 60 * 60 * 24 * 365
        })
    }
}

export function clearTraktCookies(res) {
    const common = {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        path: '/'
    }
    res.cookies.set('trakt_access_token', '', { ...common, maxAge: 0 })
    res.cookies.set('trakt_refresh_token', '', { ...common, maxAge: 0 })
    res.cookies.set('trakt_expires_at', '', { ...common, maxAge: 0 })
    res.cookies.set('trakt_oauth_state', '', { ...common, maxAge: 0 })
    res.cookies.set('trakt_oauth_next', '', { ...common, maxAge: 0 })
}

export async function exchangeCodeForTokens(code) {
    assertTraktEnv()
    const r = await fetch(TRAKT_OAUTH_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            code,
            client_id: process.env.TRAKT_CLIENT_ID,
            client_secret: process.env.TRAKT_CLIENT_SECRET,
            redirect_uri: process.env.TRAKT_REDIRECT_URI,
            grant_type: 'authorization_code'
        })
    })

    const json = await r.json().catch(() => ({}))
    if (!r.ok) {
        throw new Error(`Trakt token exchange failed (${r.status})`)
    }
    return json
}

export async function refreshAccessToken(refreshToken) {
    assertTraktEnv()
    const r = await fetch(TRAKT_OAUTH_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            refresh_token: refreshToken,
            client_id: process.env.TRAKT_CLIENT_ID,
            client_secret: process.env.TRAKT_CLIENT_SECRET,
            redirect_uri: process.env.TRAKT_REDIRECT_URI,
            grant_type: 'refresh_token'
        })
    })

    const json = await r.json().catch(() => ({}))
    if (!r.ok) {
        throw new Error(`Trakt refresh failed (${r.status})`)
    }
    return json
}

export function makeState() {
    // crypto.randomUUID() está bien, pero en algunos entornos no; esto es 100% seguro
    return crypto.randomBytes(16).toString('hex')
}

export async function traktSearchByTmdb({ accessToken, type, tmdbId }) {
    // type: 'movie' | 'show'
    const url = `${TRAKT_API_BASE}/search/tmdb/${encodeURIComponent(
        String(tmdbId)
    )}?type=${encodeURIComponent(type)}`
    const r = await fetch(url, { headers: traktHeaders({ accessToken }) })
    const json = await r.json().catch(() => [])
    if (!r.ok) {
        throw new Error(`Trakt search failed (${r.status})`)
    }
    const first = Array.isArray(json) && json.length ? json[0] : null
    const item = first?.[type] || null
    return item
}

export function normalizeWatchedAtDateOnly(dateStr) {
    // dateStr: 'YYYY-MM-DD'
    // Para evitar “saltos de día” por timezone, ponemos mediodía local.
    if (!dateStr || typeof dateStr !== 'string') return null
    const m = dateStr.match(/^\d{4}-\d{2}-\d{2}$/)
    if (!m) return null
    const d = new Date(`${dateStr}T12:00:00`)
    return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

export async function traktGetHistoryForItem({ accessToken, type, traktId, limit = 50 }) {
    const bucket = type === 'movie' ? 'movies' : 'shows'
    const url = `${TRAKT_API_BASE}/sync/history/${bucket}/${encodeURIComponent(
        String(traktId)
    )}?page=1&limit=${encodeURIComponent(String(limit))}`

    const r = await fetch(url, { headers: traktHeaders({ accessToken }) })
    const json = await r.json().catch(() => [])
    return { r, json }
}

export function computeHistorySummary(historyArray) {
    const list = Array.isArray(historyArray) ? historyArray : []
    const plays = list.length
    let last = null
    for (const it of list) {
        const w = it?.watched_at
        if (!w) continue
        if (!last || new Date(w).getTime() > new Date(last).getTime()) last = w
    }
    return { plays, lastWatchedAt: last, watched: plays > 0 }
}
