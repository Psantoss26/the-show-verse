// /src/app/api/tmdb/collections/featured/route.js
import { NextResponse } from 'next/server'

const TMDB_KEY = process.env.NEXT_PUBLIC_TMDB_API_KEY
const TMDB_API = 'https://api.themoviedb.org/3'

const FEATURED_COLLECTION_IDS = [
    119,  // The Lord of the Rings Collection
    121,  // The Hobbit Collection
    1241, // Harry Potter Collection
    10,   // Star Wars Collection (si en tu TMDb coincide; si no, quítala)
]

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
    if (!res.ok) throw new Error(j?.status_message || 'TMDb request failed')
    return j
}

export async function GET() {
    try {
        if (!TMDB_KEY) return NextResponse.json({ error: 'Missing TMDb key' }, { status: 500 })

        const collections = await Promise.all(
            FEATURED_COLLECTION_IDS.map(async (id) => {
                try {
                    const c = await fetchJson(buildTmdbUrl(`/collection/${id}`), { cache: 'no-store' })
                    const parts = Array.isArray(c?.parts) ? c.parts : []
                    return {
                        source: 'collection',
                        id: String(c?.id),
                        name: c?.name || 'Colección',
                        description: c?.overview || '',
                        item_count: parts.length,
                        poster_path: c?.poster_path || null,
                        backdrop_path: c?.backdrop_path || null,
                        tmdbUrl: c?.id ? `https://www.themoviedb.org/collection/${c.id}` : null,
                        // preview: te vale para tu collage
                        previewItems: parts.slice(0, 12).map((p) => ({
                            id: p?.id,
                            media_type: 'movie',
                            title: p?.title,
                            poster_path: p?.poster_path,
                            backdrop_path: p?.backdrop_path,
                            release_date: p?.release_date,
                            vote_average: p?.vote_average,
                        })),
                    }
                } catch {
                    return null
                }
            })
        )

        return NextResponse.json({ ok: true, collections: collections.filter(Boolean) })
    } catch (e) {
        return NextResponse.json({ error: e?.message || 'Server error' }, { status: 500 })
    }
}
