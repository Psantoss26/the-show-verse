import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { backendFetchJson, mediaTypeToBackend, setBackendAuthCookies } from '@/lib/backend/server'

const TRAKT_BASE = 'https://api.trakt.tv'
const TRAKT_CLIENT_ID = process.env.TRAKT_CLIENT_ID

async function getTraktAccessTokenOrNull() {
    const store = await cookies()
    return store.get('trakt_access_token')?.value || null
}

function traktHeaders(token) {
    return {
        'Content-Type': 'application/json',
        'trakt-api-version': '2',
        'trakt-api-key': TRAKT_CLIENT_ID,
        Authorization: `Bearer ${token}`,
    }
}

export async function POST(req) {
    try {
        const { type, tmdbId, watchlist } = await req.json()
        if (!['movie', 'show'].includes(type)) return NextResponse.json({ error: 'Bad type' }, { status: 400 })

        const id = Number(tmdbId)
        if (!Number.isFinite(id)) return NextResponse.json({ error: 'Bad tmdbId' }, { status: 400 })

        try {
            const mediaType = mediaTypeToBackend(type)
            const backend = watchlist
                ? await backendFetchJson(req, '/v1/watchlist', {
                    method: 'POST',
                    body: JSON.stringify({
                        tmdbId: id,
                        mediaType,
                    }),
                })
                : await backendFetchJson(req, `/v1/watchlist/${encodeURIComponent(id)}/${mediaType}`, {
                    method: 'DELETE',
                })

            if (backend.ok) {
                const response = NextResponse.json({ ok: true, inWatchlist: !!watchlist, source: 'backend' })
                setBackendAuthCookies(response, backend, { secure: req.nextUrl?.protocol === 'https:' })
                return response
            }
            if (!backend.skipped && backend.status !== 401) {
                console.warn('Backend watchlist failed; falling back to Trakt', backend.error)
            }
        } catch (e) {
            console.warn('Backend watchlist failed; falling back to Trakt', e)
        }

        const token = await getTraktAccessTokenOrNull()
        if (!token) return NextResponse.json({ error: 'Not connected' }, { status: 401 })

        const payloadKey = type === 'movie' ? 'movies' : 'shows'
        const payload = { [payloadKey]: [{ ids: { tmdb: id } }] }

        const url = watchlist ? `${TRAKT_BASE}/sync/watchlist` : `${TRAKT_BASE}/sync/watchlist/remove`

        const res = await fetch(url, {
            method: 'POST',
            headers: traktHeaders(token),
            body: JSON.stringify(payload),
        })

        const json = await res.json().catch(() => ({}))
        if (!res.ok) return NextResponse.json({ error: json?.error || 'Trakt watchlist error', raw: json }, { status: res.status })
        return NextResponse.json({ ok: true, inWatchlist: !!watchlist })
    } catch (e) {
        return NextResponse.json({ error: e?.message || 'Trakt watchlist error' }, { status: 500 })
    }
}
