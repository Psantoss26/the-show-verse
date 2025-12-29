import { NextResponse } from 'next/server'

const TRAKT_API = 'https://api.trakt.tv'

function traktHeaders() {
    const key = process.env.TRAKT_CLIENT_ID
    if (!key) throw new Error('Missing TRAKT_CLIENT_ID env var')

    return {
        'Content-Type': 'application/json',
        'trakt-api-version': '2',
        'trakt-api-key': key,
    }
}

export async function GET(req) {
    try {
        const { searchParams } = new URL(req.url)
        const type = searchParams.get('type') // 'movie' | 'show'
        const tmdbId = searchParams.get('tmdbId')

        if (!tmdbId || (type !== 'movie' && type !== 'show')) {
            return NextResponse.json(
                { error: 'Missing/invalid type or tmdbId' },
                { status: 400 }
            )
        }

        // 1) Mapear TMDb -> Trakt
        const mapUrl = `${TRAKT_API}/search/tmdb/${encodeURIComponent(tmdbId)}?type=${encodeURIComponent(type)}`
        const mapRes = await fetch(mapUrl, {
            headers: traktHeaders(),
            next: { revalidate: 86400 },
        })

        const mapJson = await mapRes.json()
        const item = mapJson?.[0]?.[type]
        const traktId = item?.ids?.trakt

        if (!mapRes.ok || !traktId) {
            return NextResponse.json({ error: 'Trakt item not found' }, { status: 404 })
        }

        // 2) Stats
        const path = type === 'movie' ? 'movies' : 'shows'
        const statsUrl = `${TRAKT_API}/${path}/${traktId}/stats`
        const statsRes = await fetch(statsUrl, {
            headers: traktHeaders(),
            next: { revalidate: 3600 },
        })

        const stats = await statsRes.json()
        if (!statsRes.ok) {
            return NextResponse.json({ error: 'Error fetching stats from Trakt' }, { status: 502 })
        }

        return NextResponse.json({ traktId, stats })
    } catch (e) {
        return NextResponse.json(
            { error: e?.message || 'Unexpected error' },
            { status: 500 }
        )
    }
}
