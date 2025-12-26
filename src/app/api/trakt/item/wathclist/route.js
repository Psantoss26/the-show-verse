import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'

const TRAKT_BASE = 'https://api.trakt.tv'
const TRAKT_CLIENT_ID = process.env.TRAKT_CLIENT_ID

function getTraktAccessTokenOrNull() {
    return cookies().get('trakt_access_token')?.value || null
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
        const token = getTraktAccessTokenOrNull()
        if (!token) return NextResponse.json({ error: 'Not connected' }, { status: 401 })

        const { type, tmdbId, watchlist } = await req.json()
        if (!['movie', 'show'].includes(type)) return NextResponse.json({ error: 'Bad type' }, { status: 400 })

        const id = Number(tmdbId)
        if (!Number.isFinite(id)) return NextResponse.json({ error: 'Bad tmdbId' }, { status: 400 })

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
