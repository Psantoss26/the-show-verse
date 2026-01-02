// /src/app/api/trakt/ratings/route.js
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'

const TRAKT_API = 'https://api.trakt.tv'
const TRAKT_CLIENT_ID = process.env.TRAKT_CLIENT_ID
const TRAKT_CLIENT_SECRET = process.env.TRAKT_CLIENT_SECRET
const TRAKT_REDIRECT_URI = process.env.TRAKT_REDIRECT_URI // ponlo en tu .env si quieres refresh automático

function json(res, status = 200) {
    return NextResponse.json(res, { status })
}

function mustEnv() {
    if (!TRAKT_CLIENT_ID) throw new Error('Missing TRAKT_CLIENT_ID')
    if (!TRAKT_CLIENT_SECRET) throw new Error('Missing TRAKT_CLIENT_SECRET')
}

function normalizeType(t) {
    const x = String(t || '').toLowerCase().trim()
    if (x === 'tv' || x === 'shows' || x === 'series') return 'show'
    if (x === 'movies') return 'movie'
    if (x === 'seasons') return 'season'
    if (x === 'episodes') return 'episode'
    return x
}

async function readTraktAuthCookies() {
    // Next 15+: cookies() puede ser async en algunos entornos
    const store = await cookies()
    const accessToken = store.get('trakt_access_token')?.value || null
    const refreshToken = store.get('trakt_refresh_token')?.value || null
    const expiresAtMs = store.get('trakt_expires_at')?.value ? Number(store.get('trakt_expires_at').value) : null
    return { accessToken, refreshToken, expiresAtMs, store }
}

async function refreshIfNeeded(auth) {
    mustEnv()
    const { accessToken, refreshToken, expiresAtMs, store } = auth
    if (!accessToken) return { ...auth, accessToken: null }
    if (!refreshToken || !expiresAtMs) return auth

    // margen de 60s
    const now = Date.now()
    if (now < expiresAtMs - 60_000) return auth
    if (!TRAKT_REDIRECT_URI) return auth

    const res = await fetch(`${TRAKT_API}/oauth/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            grant_type: 'refresh_token',
            refresh_token: refreshToken,
            client_id: TRAKT_CLIENT_ID,
            client_secret: TRAKT_CLIENT_SECRET,
            redirect_uri: TRAKT_REDIRECT_URI
        })
    })

    if (!res.ok) return auth
    const data = await res.json()

    const newAccess = data?.access_token || null
    const newRefresh = data?.refresh_token || refreshToken
    const newExpiresIn = Number(data?.expires_in || 0)
    const newExpiresAtMs = newExpiresIn ? Date.now() + newExpiresIn * 1000 : expiresAtMs

    if (newAccess) {
        store.set('trakt_access_token', newAccess, { path: '/', httpOnly: true, sameSite: 'lax', secure: true })
        store.set('trakt_refresh_token', newRefresh, { path: '/', httpOnly: true, sameSite: 'lax', secure: true })
        store.set('trakt_expires_at', String(newExpiresAtMs), { path: '/', httpOnly: true, sameSite: 'lax', secure: true })
    }

    return { ...auth, accessToken: newAccess, refreshToken: newRefresh, expiresAtMs: newExpiresAtMs }
}

async function traktFetch(path, { accessToken }, { method = 'GET', body } = {}) {
    mustEnv()
    const res = await fetch(`${TRAKT_API}${path}`, {
        method,
        headers: {
            'Content-Type': 'application/json',
            'trakt-api-version': '2',
            'trakt-api-key': TRAKT_CLIENT_ID,
            ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {})
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
        cache: 'no-store'
    })
    return res
}

function normalizeRating(val) {
    if (val === null || val === undefined) return null
    const n = Number(val)
    if (!Number.isFinite(n)) return null
    const int = Math.round(n)
    if (int < 1 || int > 10) throw new Error('Rating must be 1..10 or null')
    return int
}

// ======================
// GET: leer rating user
// - /api/trakt/ratings?type=season&tmdbId=XXXX&season=Y
// - /api/trakt/ratings?type=movie&tmdbId=XXXX
// - /api/trakt/ratings?type=show&tmdbId=XXXX  (o type=tv)
// ======================
export async function GET(req) {
    try {
        const url = new URL(req.url)
        const type = normalizeType(url.searchParams.get('type'))

        const auth0 = await readTraktAuthCookies()
        const auth = await refreshIfNeeded(auth0)
        if (!auth.accessToken) return json({ error: 'Unauthorized' }, 401)

        // ---- MOVIE / SHOW ----
        if (type === 'movie' || type === 'show') {
            const tmdbId = Number(url.searchParams.get('tmdbId'))
            if (!Number.isFinite(tmdbId)) return json({ error: 'Missing tmdbId' }, 400)

            const pathType = type === 'movie' ? 'movies' : 'shows'
            let page = 1
            const limit = 100

            while (page <= 20) {
                const res = await traktFetch(`/sync/ratings/${pathType}?extended=full&page=${page}&limit=${limit}`, auth)
                if (res.status === 401) return json({ error: 'Unauthorized' }, 401)
                if (!res.ok) {
                    const err = await res.json().catch(() => ({}))
                    return json({ error: err?.error || 'Trakt GET ratings failed' }, res.status)
                }

                const items = await res.json()
                if (!Array.isArray(items) || items.length === 0) break

                const found = items.find((it) => {
                    const ids = type === 'movie' ? it?.movie?.ids : it?.show?.ids
                    return Number(ids?.tmdb) === tmdbId
                })

                if (found) {
                    return json({
                        found: true,
                        rating: typeof found?.rating === 'number' ? found.rating : null,
                        rated_at: found?.rated_at || null
                    })
                }

                page++
            }

            return json({ found: false, rating: null })
        }

        // ---- SEASON (lo que ya tenías) ----
        if (type === 'season') {
            const tmdbId = Number(url.searchParams.get('tmdbId'))
            const seasonNumber = Number(url.searchParams.get('season'))
            if (!Number.isFinite(tmdbId) || !Number.isFinite(seasonNumber)) {
                return json({ error: 'Missing tmdbId/season' }, 400)
            }

            let page = 1
            const limit = 100

            while (page <= 20) {
                const res = await traktFetch(`/sync/ratings/seasons?extended=full&page=${page}&limit=${limit}`, auth)
                if (res.status === 401) return json({ error: 'Unauthorized' }, 401)
                if (!res.ok) {
                    const err = await res.json().catch(() => ({}))
                    return json({ error: err?.error || 'Trakt GET ratings failed' }, res.status)
                }

                const items = await res.json()
                if (!Array.isArray(items) || items.length === 0) break

                const found = items.find((it) => {
                    const showTmdb = Number(it?.show?.ids?.tmdb)
                    const sn = Number(it?.season?.number)
                    return showTmdb === tmdbId && sn === seasonNumber
                })

                if (found) {
                    return json({
                        found: true,
                        rating: typeof found?.rating === 'number' ? found.rating : null,
                        rated_at: found?.rated_at || null
                    })
                }

                page++
            }

            return json({ found: false, rating: null })
        }

        return json({ error: 'Unsupported type' }, 400)
    } catch (e) {
        console.error(e)
        return json({ error: e?.message || 'Server error' }, 500)
    }
}

// ======================
// POST: crear/eliminar rating
// - movie/show: body { type:'movie'|'show'|'tv', tmdbId OR ids:{tmdb}, rating }
// - season:     body { type:'season', tmdbId, season, rating }
// rating=null => remove
// ======================
export async function POST(req) {
    try {
        const body = await req.json().catch(() => ({}))
        const type = normalizeType(body?.type)

        const auth0 = await readTraktAuthCookies()
        const auth = await refreshIfNeeded(auth0)
        if (!auth.accessToken) return json({ error: 'Unauthorized' }, 401)

        // ---- MOVIE / SHOW ----
        if (type === 'movie' || type === 'show') {
            const tmdbId = Number(body?.tmdbId ?? body?.ids?.tmdb)
            if (!Number.isFinite(tmdbId)) return json({ error: 'Missing tmdbId' }, 400)

            const rating = normalizeRating(body?.rating)
            const isRemove = rating === null

            const endpoint = isRemove ? '/sync/ratings/remove' : '/sync/ratings'
            const key = type === 'movie' ? 'movies' : 'shows'

            const payload = {
                [key]: [
                    isRemove
                        ? { ids: { tmdb: tmdbId } }
                        : { ids: { tmdb: tmdbId }, rating, rated_at: new Date().toISOString() }
                ]
            }

            const res = await traktFetch(endpoint, auth, { method: 'POST', body: payload })
            if (res.status === 401) return json({ error: 'Unauthorized' }, 401)

            const out = await res.json().catch(() => ({}))
            if (!res.ok) return json({ error: out?.error || 'Trakt rating failed', details: out }, res.status)

            return json({ ok: true, type, removed: isRemove, rating: isRemove ? null : rating, summary: out })
        }

        // ---- SEASON (lo que ya tenías) ----
        if (type === 'season') {
            const tmdbId = Number(body?.tmdbId ?? body?.ids?.tmdb)
            const seasonNumber = Number(body?.season ?? body?.seasonNumber)
            if (!Number.isFinite(tmdbId) || !Number.isFinite(seasonNumber)) {
                return json({ error: 'Missing tmdbId (show) or season number' }, 400)
            }

            const rating = normalizeRating(body?.rating)
            const isRemove = rating === null

            const endpoint = isRemove ? '/sync/ratings/remove' : '/sync/ratings'
            const payload = {
                shows: [
                    {
                        ids: { tmdb: tmdbId },
                        seasons: [
                            isRemove
                                ? { number: seasonNumber }
                                : { number: seasonNumber, rating, rated_at: new Date().toISOString() }
                        ]
                    }
                ]
            }

            const res = await traktFetch(endpoint, auth, { method: 'POST', body: payload })
            if (res.status === 401) return json({ error: 'Unauthorized' }, 401)

            const out = await res.json().catch(() => ({}))
            if (!res.ok) return json({ error: out?.error || 'Trakt rating failed', details: out }, res.status)

            return json({ ok: true, removed: isRemove, rating: isRemove ? null : rating, summary: out })
        }

        return json({ error: 'Unsupported type' }, 400)
    } catch (e) {
        console.error(e)
        return json({ error: e?.message || 'Server error' }, 500)
    }
}
