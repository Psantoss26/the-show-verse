// /src/app/api/trakt/ratings/route.js
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const TRAKT_API = 'https://api.trakt.tv'
const TRAKT_CLIENT_ID = process.env.TRAKT_CLIENT_ID
const TRAKT_CLIENT_SECRET = process.env.TRAKT_CLIENT_SECRET
const TRAKT_REDIRECT_URI =
    process.env.TRAKT_REDIRECT_URI ||
    (process.env.TRAKT_APP_ORIGIN ? `${String(process.env.TRAKT_APP_ORIGIN).replace(/\/+$/, '')}/api/trakt/auth/callback` : null)

function jsonWithCookies(payload, status = 200, cookiesToSet = []) {
    const res = NextResponse.json(payload, { status })
    for (const c of cookiesToSet) {
        res.cookies.set(c.name, c.value, c.options)
    }
    return res
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

function normalizeRating(val) {
    if (val === null || val === undefined) return null
    const n = Number(val)
    if (!Number.isFinite(n)) return null
    const int = Math.round(n)
    if (int < 1 || int > 10) throw new Error('Rating must be 1..10 or null')
    return int
}

function cookieOpts() {
    // En Vercel es https => secure true OK.
    // En local (http) conviene no romper: secure solo en prod.
    return {
        path: '/',
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
    }
}

async function readTraktAuthCookies() {
    const store = await cookies()
    const accessToken = store.get('trakt_access_token')?.value || null
    const refreshToken = store.get('trakt_refresh_token')?.value || null
    const expiresAtMs = store.get('trakt_expires_at')?.value ? Number(store.get('trakt_expires_at').value) : null
    return { accessToken, refreshToken, expiresAtMs }
}

// Devuelve { accessToken, refreshToken, expiresAtMs, cookiesToSet: [] }
async function refreshIfNeeded(auth) {
    mustEnv()
    const { accessToken, refreshToken, expiresAtMs } = auth

    if (!accessToken) return { ...auth, accessToken: null, cookiesToSet: [] }
    if (!refreshToken || !expiresAtMs) return { ...auth, cookiesToSet: [] }

    // margen de 60s
    const now = Date.now()
    if (now < expiresAtMs - 60_000) return { ...auth, cookiesToSet: [] }

    // sin redirect_uri no refrescamos (mantienes funcionalidad previa: simplemente no auto-refresh)
    if (!TRAKT_REDIRECT_URI) return { ...auth, cookiesToSet: [] }

    const res = await fetch(`${TRAKT_API}/oauth/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            grant_type: 'refresh_token',
            refresh_token: refreshToken,
            client_id: TRAKT_CLIENT_ID,
            client_secret: TRAKT_CLIENT_SECRET,
            redirect_uri: TRAKT_REDIRECT_URI,
        }),
        cache: 'no-store',
    })

    if (!res.ok) return { ...auth, cookiesToSet: [] }

    const data = await res.json().catch(() => ({}))
    const newAccess = data?.access_token || null
    const newRefresh = data?.refresh_token || refreshToken
    const newExpiresIn = Number(data?.expires_in || 0)
    const newExpiresAtMs = newExpiresIn ? Date.now() + newExpiresIn * 1000 : expiresAtMs

    const cookiesToSet = []
    if (newAccess) {
        const opts = cookieOpts()
        cookiesToSet.push({ name: 'trakt_access_token', value: newAccess, options: opts })
        cookiesToSet.push({ name: 'trakt_refresh_token', value: newRefresh, options: opts })
        cookiesToSet.push({ name: 'trakt_expires_at', value: String(newExpiresAtMs), options: opts })
    }

    return {
        ...auth,
        accessToken: newAccess,
        refreshToken: newRefresh,
        expiresAtMs: newExpiresAtMs,
        cookiesToSet,
    }
}

async function traktFetch(path, { accessToken }, { method = 'GET', body } = {}) {
    mustEnv()
    return fetch(`${TRAKT_API}${path}`, {
        method,
        headers: {
            'Content-Type': 'application/json',
            'trakt-api-version': '2',
            'trakt-api-key': TRAKT_CLIENT_ID,
            ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
        cache: 'no-store',
    })
}

// ======================
// GET: leer rating user
// - /api/trakt/ratings?type=season&tmdbId=XXXX&season=Y
// - /api/trakt/ratings?type=movie&tmdbId=XXXX
// - /api/trakt/ratings?type=show&tmdbId=XXXX
// - /api/trakt/ratings?type=episode&tmdbId=SHOW_TMDB&season=Y&episode=Z
// ======================
export async function GET(req) {
    try {
        const url = new URL(req.url)
        const type = normalizeType(url.searchParams.get('type'))

        const auth0 = await readTraktAuthCookies()
        const auth = await refreshIfNeeded(auth0)
        const respond = (payload, status = 200) => jsonWithCookies(payload, status, auth.cookiesToSet)

        if (!auth.accessToken) return respond({ error: 'Unauthorized' }, 401)

        // ---- MOVIE / SHOW ----
        if (type === 'movie' || type === 'show') {
            const tmdbId = Number(url.searchParams.get('tmdbId'))
            if (!Number.isFinite(tmdbId)) return respond({ error: 'Missing tmdbId' }, 400)

            const pathType = type === 'movie' ? 'movies' : 'shows'
            let page = 1
            const limit = 100

            while (page <= 20) {
                const res = await traktFetch(`/sync/ratings/${pathType}?extended=full&page=${page}&limit=${limit}`, auth)
                if (res.status === 401) return respond({ error: 'Unauthorized' }, 401)
                if (!res.ok) {
                    const err = await res.json().catch(() => ({}))
                    return respond({ error: err?.error || 'Trakt GET ratings failed' }, res.status)
                }

                const items = await res.json()
                if (!Array.isArray(items) || items.length === 0) break

                const found = items.find((it) => {
                    const ids = type === 'movie' ? it?.movie?.ids : it?.show?.ids
                    return Number(ids?.tmdb) === tmdbId
                })

                if (found) {
                    return respond({
                        found: true,
                        rating: typeof found?.rating === 'number' ? found.rating : null,
                        rated_at: found?.rated_at || null,
                    })
                }

                page++
            }

            return respond({ found: false, rating: null })
        }

        // ---- SEASON ----
        if (type === 'season') {
            const tmdbId = Number(url.searchParams.get('tmdbId'))
            const seasonNumber = Number(url.searchParams.get('season'))
            if (!Number.isFinite(tmdbId) || !Number.isFinite(seasonNumber)) {
                return respond({ error: 'Missing tmdbId/season' }, 400)
            }

            let page = 1
            const limit = 100

            while (page <= 20) {
                const res = await traktFetch(`/sync/ratings/seasons?extended=full&page=${page}&limit=${limit}`, auth)
                if (res.status === 401) return respond({ error: 'Unauthorized' }, 401)
                if (!res.ok) {
                    const err = await res.json().catch(() => ({}))
                    return respond({ error: err?.error || 'Trakt GET ratings failed' }, res.status)
                }

                const items = await res.json()
                if (!Array.isArray(items) || items.length === 0) break

                const found = items.find((it) => {
                    const showTmdb = Number(it?.show?.ids?.tmdb)
                    const sn = Number(it?.season?.number)
                    return showTmdb === tmdbId && sn === seasonNumber
                })

                if (found) {
                    return respond({
                        found: true,
                        rating: typeof found?.rating === 'number' ? found.rating : null,
                        rated_at: found?.rated_at || null,
                    })
                }

                page++
            }

            return respond({ found: false, rating: null })
        }

        // ---- EPISODE ----
        if (type === 'episode') {
            const showTmdbId = Number(url.searchParams.get('tmdbId'))
            const seasonNumber = Number(url.searchParams.get('season'))
            const episodeNumber = Number(url.searchParams.get('episode'))
            if (!Number.isFinite(showTmdbId) || !Number.isFinite(seasonNumber) || !Number.isFinite(episodeNumber)) {
                return respond({ error: 'Missing tmdbId/season/episode' }, 400)
            }

            let page = 1
            const limit = 100

            while (page <= 20) {
                const res = await traktFetch(`/sync/ratings/episodes?extended=full&page=${page}&limit=${limit}`, auth)
                if (res.status === 401) return respond({ error: 'Unauthorized' }, 401)
                if (!res.ok) {
                    const err = await res.json().catch(() => ({}))
                    return respond({ error: err?.error || 'Trakt GET ratings failed' }, res.status)
                }

                const items = await res.json()
                if (!Array.isArray(items) || items.length === 0) break

                const found = items.find((it) => {
                    const showTmdb = Number(it?.show?.ids?.tmdb)
                    const sn = Number(it?.episode?.season)
                    const en = Number(it?.episode?.number)
                    return showTmdb === showTmdbId && sn === seasonNumber && en === episodeNumber
                })

                if (found) {
                    return respond({
                        found: true,
                        rating: typeof found?.rating === 'number' ? found.rating : null,
                        rated_at: found?.rated_at || null,
                    })
                }

                page++
            }

            return respond({ found: false, rating: null })
        }

        return respond({ error: 'Unsupported type' }, 400)
    } catch (e) {
        console.error(e)
        return NextResponse.json({ error: e?.message || 'Server error' }, { status: 500 })
    }
}

// ======================
// POST: crear/eliminar rating
// - movie/show: body { type:'movie'|'show'|'tv', tmdbId OR ids:{tmdb}, rating }
// - season:     body { type:'season', tmdbId, season, rating }
// - episode:    body { type:'episode', tmdbId(SHOW), season, episode, rating }
// rating=null => remove
// ======================
export async function POST(req) {
    try {
        const body = await req.json().catch(() => ({}))
        const type = normalizeType(body?.type)

        const auth0 = await readTraktAuthCookies()
        const auth = await refreshIfNeeded(auth0)
        const respond = (payload, status = 200) => jsonWithCookies(payload, status, auth.cookiesToSet)

        if (!auth.accessToken) return respond({ error: 'Unauthorized' }, 401)

        // ---- MOVIE / SHOW ----
        if (type === 'movie' || type === 'show') {
            const tmdbId = Number(body?.tmdbId ?? body?.ids?.tmdb)
            if (!Number.isFinite(tmdbId)) return respond({ error: 'Missing tmdbId' }, 400)

            const rating = normalizeRating(body?.rating)
            const isRemove = rating === null

            const endpoint = isRemove ? '/sync/ratings/remove' : '/sync/ratings'
            const key = type === 'movie' ? 'movies' : 'shows'

            const payload = {
                [key]: [
                    isRemove
                        ? { ids: { tmdb: tmdbId } }
                        : { ids: { tmdb: tmdbId }, rating, rated_at: new Date().toISOString() },
                ],
            }

            const res = await traktFetch(endpoint, auth, { method: 'POST', body: payload })
            if (res.status === 401) return respond({ error: 'Unauthorized' }, 401)

            const out = await res.json().catch(() => ({}))
            if (!res.ok) return respond({ error: out?.error || 'Trakt rating failed', details: out }, res.status)

            return respond({ ok: true, type, removed: isRemove, rating: isRemove ? null : rating, summary: out })
        }

        // ---- SEASON ----
        if (type === 'season') {
            const tmdbId = Number(body?.tmdbId ?? body?.ids?.tmdb)
            const seasonNumber = Number(body?.season ?? body?.seasonNumber)
            if (!Number.isFinite(tmdbId) || !Number.isFinite(seasonNumber)) {
                return respond({ error: 'Missing tmdbId (show) or season number' }, 400)
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
                                : { number: seasonNumber, rating, rated_at: new Date().toISOString() },
                        ],
                    },
                ],
            }

            const res = await traktFetch(endpoint, auth, { method: 'POST', body: payload })
            if (res.status === 401) return respond({ error: 'Unauthorized' }, 401)

            const out = await res.json().catch(() => ({}))
            if (!res.ok) return respond({ error: out?.error || 'Trakt rating failed', details: out }, res.status)

            return respond({ ok: true, removed: isRemove, rating: isRemove ? null : rating, summary: out })
        }

        // ---- EPISODE ----
        if (type === 'episode') {
            const showTmdbId = Number(body?.tmdbId ?? body?.showId ?? body?.tvId ?? body?.showTmdbId ?? body?.ids?.tmdb)
            const seasonNumber = Number(body?.season ?? body?.seasonNumber)
            const episodeNumber = Number(body?.episode ?? body?.episodeNumber)

            if (!Number.isFinite(showTmdbId) || !Number.isFinite(seasonNumber) || !Number.isFinite(episodeNumber)) {
                return respond({ error: 'Missing tmdbId (show) / season / episode' }, 400)
            }

            const rating = normalizeRating(body?.rating)
            const isRemove = rating === null

            const endpoint = isRemove ? '/sync/ratings/remove' : '/sync/ratings'
            const payload = {
                shows: [
                    {
                        ids: { tmdb: showTmdbId },
                        seasons: [
                            {
                                number: seasonNumber,
                                episodes: [
                                    isRemove
                                        ? { number: episodeNumber }
                                        : { number: episodeNumber, rating, rated_at: new Date().toISOString() },
                                ],
                            },
                        ],
                    },
                ],
            }

            const res = await traktFetch(endpoint, auth, { method: 'POST', body: payload })
            if (res.status === 401) return respond({ error: 'Unauthorized' }, 401)

            const out = await res.json().catch(() => ({}))
            if (!res.ok) return respond({ error: out?.error || 'Trakt rating failed', details: out }, res.status)

            return respond({ ok: true, type, removed: isRemove, rating: isRemove ? null : rating, summary: out })
        }

        return respond({ error: 'Unsupported type' }, 400)
    } catch (e) {
        console.error(e)
        return NextResponse.json({ error: e?.message || 'Server error' }, { status: 500 })
    }
}
