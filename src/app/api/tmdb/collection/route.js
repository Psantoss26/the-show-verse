// /src/app/api/tmdb/collection/route.js
import { NextResponse } from 'next/server'

const TMDB_KEY = process.env.NEXT_PUBLIC_TMDB_API_KEY
const TMDB_API = 'https://api.themoviedb.org/3'

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

export async function GET(req) {
    try {
        if (!TMDB_KEY) return NextResponse.json({ error: 'Missing TMDb key' }, { status: 500 })

        const { searchParams } = new URL(req.url)
        const id = searchParams.get('id')
        if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

        const c = await fetchJson(buildTmdbUrl(`/collection/${id}`), { cache: 'no-store' })
        const parts = Array.isArray(c?.parts) ? c.parts : []

        // orden natural por fecha si existe
        parts.sort((a, b) => {
            const da = a?.release_date || '9999-99-99'
            const db = b?.release_date || '9999-99-99'
            return da.localeCompare(db)
        })

        return NextResponse.json({
            ok: true,
            collection: {
                source: 'collection',
                id: String(c?.id),
                name: c?.name || 'Colección',
                description: c?.overview || '',
                item_count: parts.length,
                poster_path: c?.poster_path || null,
                backdrop_path: c?.backdrop_path || null,
                tmdbUrl: c?.id ? `https://www.themoviedb.org/collection/${c.id}` : null,
            },
            items: parts.map((p) => ({
                ...p,
                media_type: 'movie',
                title: p?.title,
            })),
        })
    } catch (e) {
        return NextResponse.json({ error: e?.message || 'Server error' }, { status: 500 })
    }
}
