import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const TRAKT_CLIENT_ID = process.env.TRAKT_CLIENT_ID

function normalizeUrl(u) {
    if (!u) return null
    const s = String(u).trim()
    if (!s) return null
    return s.startsWith('http://') || s.startsWith('https://') ? s : `https://${s}`
}

async function traktFetch(url, { signal } = {}) {
    if (!TRAKT_CLIENT_ID) throw new Error('Missing TRAKT_CLIENT_ID')
    const res = await fetch(url, {
        signal,
        headers: {
            'Content-Type': 'application/json',
            'trakt-api-version': '2',
            'trakt-api-key': TRAKT_CLIENT_ID
        },
        cache: 'no-store'
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) {
        const msg = json?.error || json?.message || `Trakt request failed: ${res.status}`
        throw new Error(msg)
    }
    return json
}

export async function GET(req) {
    const { searchParams } = new URL(req.url)
    const tmdbId = searchParams.get('tmdbId')
    const type = searchParams.get('type') // 'movie' | 'tv'

    if (!tmdbId) {
        return NextResponse.json({ error: 'Missing tmdbId' }, { status: 400 })
    }

    const traktType = type === 'tv' ? 'show' : 'movie'
    const plural = traktType === 'show' ? 'shows' : 'movies'

    try {
        // 1) localizar el item en Trakt por TMDb id
        const searchUrl = `https://api.trakt.tv/search/tmdb/${encodeURIComponent(tmdbId)}?type=${traktType}`
        const search = await traktFetch(searchUrl)

        const first = Array.isArray(search) ? search[0] : null
        const item = first?.[traktType]
        const traktId = item?.ids?.trakt

        if (!traktId) {
            return NextResponse.json({ url: null }, { status: 200 })
        }

        // 2) pedir extended=full para sacar homepage
        const detailsUrl = `https://api.trakt.tv/${plural}/${encodeURIComponent(String(traktId))}?extended=full`
        const details = await traktFetch(detailsUrl)

        const homepage = normalizeUrl(details?.homepage || null)

        const res = NextResponse.json({ url: homepage || null }, { status: 200 })
        // cache CDN suave (opcional)
        res.headers.set('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=604800')
        return res
    } catch (e) {
        return NextResponse.json({ error: e?.message || 'Error' }, { status: 500 })
    }
}
