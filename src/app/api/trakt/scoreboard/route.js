import { NextResponse } from 'next/server'

const TRAKT_BASE = 'https://api.trakt.tv'

function traktHeaders() {
    const key = process.env.TRAKT_CLIENT_ID
    if (!key) throw new Error('Missing TRAKT_CLIENT_ID')
    return {
        'Content-Type': 'application/json',
        'trakt-api-version': '2',
        'trakt-api-key': key
    }
}

async function fetchTrakt(path) {
    const res = await fetch(`${TRAKT_BASE}${path}`, { headers: traktHeaders() })
    const json = await res.json().catch(() => null)
    if (!res.ok) {
        const msg = json?.error || json?.message || 'Trakt error'
        throw new Error(msg)
    }
    return json
}

export async function GET(req) {
    try {
        const { searchParams } = new URL(req.url)
        const type = searchParams.get('type') // 'movie' | 'show'
        const tmdbId = searchParams.get('tmdbId')

        if (!type || !tmdbId) {
            return NextResponse.json({ error: 'Missing type/tmdbId' }, { status: 400 })
        }

        const safeType = type === 'show' ? 'show' : 'movie'
        const plural = safeType === 'show' ? 'shows' : 'movies'

        // 1) resolve trakt id via tmdb
        const search = await fetchTrakt(`/search/tmdb/${tmdbId}?type=${safeType}`)
        const hit = Array.isArray(search) ? search[0] : null
        const item = hit?.[safeType]
        const ids = item?.ids

        if (!ids?.trakt) {
            return NextResponse.json({ found: false })
        }

        const traktId = ids.trakt

        // 2) summary (rating/votes) + stats
        const [summary, stats] = await Promise.all([
            fetchTrakt(`/${plural}/${traktId}?extended=full`),
            fetchTrakt(`/${plural}/${traktId}/stats`)
        ])

        return NextResponse.json({
            found: true,
            ids,
            community: {
                rating: typeof summary?.rating === 'number' ? summary.rating : null,
                votes: typeof summary?.votes === 'number' ? summary.votes : null
            },
            stats: {
                watchers: typeof stats?.watchers === 'number' ? stats.watchers : null,
                plays: typeof stats?.plays === 'number' ? stats.plays : null,
                collectors: typeof stats?.collectors === 'number' ? stats.collectors : null,
                comments: typeof stats?.comments === 'number' ? stats.comments : null,
                lists: typeof stats?.lists === 'number' ? stats.lists : null,
                favorited: typeof stats?.favorited === 'number' ? stats.favorited : null
            },

            // 🔌 preparados para cuando tú los consigas por backend:
            external: {
                rtAudience: null,
                justwatchRank: null,
                justwatchDelta: null,
                justwatchCountry: 'ES'
            }
        })
    } catch (e) {
        return NextResponse.json({ error: e?.message || 'Error' }, { status: 500 })
    }
}
