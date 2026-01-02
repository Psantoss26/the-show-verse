// /src/app/api/trakt/list-items/route.js
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'

const TRAKT_API = 'https://api.trakt.tv'
const CLIENT_ID = process.env.TRAKT_CLIENT_ID
const CLIENT_SECRET = process.env.TRAKT_CLIENT_SECRET

const TMDB_KEY = process.env.NEXT_PUBLIC_TMDB_API_KEY
const TMDB_API = 'https://api.themoviedb.org/3'

function traktHeaders(accessToken) {
    const h = {
        'Content-Type': 'application/json',
        'trakt-api-version': '2',
        'trakt-api-key': CLIENT_ID || '',
    }
    if (accessToken) h.Authorization = `Bearer ${accessToken}`
    return h
}

async function getTokens() {
    const store = await cookies()
    const accessToken = store.get('trakt_access_token')?.value || null
    const refreshToken = store.get('trakt_refresh_token')?.value || null
    const expiresAtMs = Number(store.get('trakt_expires_at')?.value || 0) || 0
    return { accessToken, refreshToken, expiresAtMs }
}

async function refreshAccessToken(refreshToken) {
    const res = await fetch(`${TRAKT_API}/oauth/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            refresh_token: refreshToken,
            client_id: CLIENT_ID,
            client_secret: CLIENT_SECRET,
            grant_type: 'refresh_token',
        }),
    })
    const j = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(j?.error_description || 'Trakt refresh failed')
    return j
}

async function getValidAccessToken() {
    const { accessToken, refreshToken, expiresAtMs } = await getTokens()
    const now = Date.now()
    if (!accessToken) return { accessToken: null, patch: null }
    if (expiresAtMs && expiresAtMs > now + 30_000) return { accessToken, patch: null }
    if (!refreshToken) return { accessToken: null, patch: null }

    const fresh = await refreshAccessToken(refreshToken)
    const nextAccess = fresh.access_token || null
    const nextRefresh = fresh.refresh_token || refreshToken
    const nextExpiresAtMs = now + Number(fresh.expires_in || 0) * 1000
    return { accessToken: nextAccess, patch: { nextAccess, nextRefresh, nextExpiresAtMs } }
}

function buildTmdbUrl(path, params = {}) {
    const url = new URL(`${TMDB_API}${path}`)
    url.searchParams.set('api_key', TMDB_KEY || '')
    url.searchParams.set('language', 'es-ES')
    Object.entries(params).forEach(([k, v]) => v != null && url.searchParams.set(k, String(v)))
    return url.toString()
}

async function fetchJson(url, init) {
    const res = await fetch(url, init)
    const j = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(j?.status_message || 'Request failed')
    return j
}

// Concurrency limitada
async function mapLimit(arr, limit, mapper) {
    const ret = []
    let i = 0
    const workers = Array.from({ length: limit }, async () => {
        while (i < arr.length) {
            const idx = i++
            ret[idx] = await mapper(arr[idx], idx)
        }
    })
    await Promise.all(workers)
    return ret
}

export async function GET(req) {
    try {
        if (!CLIENT_ID) return NextResponse.json({ error: 'Missing TRAKT_CLIENT_ID' }, { status: 500 })
        if (!TMDB_KEY) return NextResponse.json({ error: 'Missing TMDB key' }, { status: 500 })

        const { searchParams } = new URL(req.url)
        const user = searchParams.get('user') || 'trakt' // slug del usuario dueño de la lista (en oficiales, suele venir como "trakt")
        const listId = searchParams.get('listId')
        const limit = Math.min(60, Math.max(1, Number(searchParams.get('limit') || 24) || 24))

        if (!listId) return NextResponse.json({ error: 'Missing listId' }, { status: 400 })

        const { accessToken, patch } = await getValidAccessToken()

        // items: extended=full para ids
        const itemsRes = await fetch(
            `${TRAKT_API}/users/${encodeURIComponent(user)}/lists/${encodeURIComponent(listId)}/items?extended=full`,
            { headers: traktHeaders(accessToken), cache: 'no-store' }
        )

        const items = await itemsRes.json().catch(() => null)
        if (!itemsRes.ok) {
            return NextResponse.json({ error: items?.error || 'Trakt list items failed' }, { status: itemsRes.status })
        }

        const sliced = Array.isArray(items) ? items.slice(0, limit) : []

        // Normalizamos a { media_type, tmdbId }
        const ids = sliced
            .map((it) => {
                const type = it?.type // 'movie' | 'show'
                const obj = type === 'movie' ? it?.movie : it?.show
                const tmdbId = obj?.ids?.tmdb
                if (!tmdbId) return null
                return { media_type: type === 'show' ? 'tv' : 'movie', tmdbId }
            })
            .filter(Boolean)

        // Enriquecemos via TMDb para que tu ListItemCard funcione con poster/title/release_date/vote_average
        const enriched = await mapLimit(ids, 8, async ({ media_type, tmdbId }) => {
            const path = media_type === 'tv' ? `/tv/${tmdbId}` : `/movie/${tmdbId}`
            const j = await fetchJson(buildTmdbUrl(path), { cache: 'no-store' })
            return {
                ...j,
                id: j?.id,
                media_type,
                // para tu card:
                title: media_type === 'movie' ? j?.title : undefined,
                name: media_type === 'tv' ? j?.name : undefined,
            }
        })

        const out = NextResponse.json({ ok: true, items: enriched.filter(Boolean) })

        if (patch?.nextAccess) {
            out.cookies.set('trakt_access_token', patch.nextAccess, { path: '/' })
            out.cookies.set('trakt_refresh_token', patch.nextRefresh, { path: '/' })
            out.cookies.set('trakt_expires_at', String(patch.nextExpiresAtMs), { path: '/' })
        }

        return out
    } catch (e) {
        return NextResponse.json({ error: e?.message || 'Server error' }, { status: 500 })
    }
}
