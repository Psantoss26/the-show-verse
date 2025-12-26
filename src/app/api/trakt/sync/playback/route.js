import { NextResponse } from 'next/server'

const TRAKT_API = 'https://api.trakt.tv'

function traktHeaders(accessToken) {
    return {
        'Content-Type': 'application/json',
        'trakt-api-version': '2',
        'trakt-api-key': process.env.TRAKT_CLIENT_ID,
        Authorization: `Bearer ${accessToken}`,
    }
}

export async function GET(req) {
    const auth = req.headers.get('authorization') || ''
    const token = auth.startsWith('Bearer ') ? auth.slice('Bearer '.length) : null
    if (!token) return NextResponse.json({ error: 'Missing Authorization' }, { status: 401 })

    const url = new URL(req.url)
    const type = url.searchParams.get('type') || 'movies'
    const limit = url.searchParams.get('limit') || '10'

    // GET /sync/playback/{type} :contentReference[oaicite:8]{index=8}
    const r = await fetch(`${TRAKT_API}/sync/playback/${encodeURIComponent(type)}?limit=${encodeURIComponent(limit)}`, {
        headers: traktHeaders(token),
        cache: 'no-store',
    })

    const data = await r.json().catch(() => ({}))
    return NextResponse.json(data, { status: r.status })
}
