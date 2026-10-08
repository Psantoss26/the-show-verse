// /src/app/api/tmdb/collection/route.js
import { NextResponse } from 'next/server'
import { buildCollectionCast, sumCollectionRevenue } from '@/lib/lists/collectionStats'

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

// `/collection/{id}` no trae recaudación ni créditos de sus películas. Se piden
// en paralelo (una petición por película, con los créditos anexados) y se
// cachean un día: la taquilla y el reparto de una saga apenas cambian. Si
// alguna falla, la colección se sirve igual sin sus datos.
const PART_DETAILS_REVALIDATE_SECONDS = 60 * 60 * 24

async function fetchPartDetails(partId) {
    try {
        return await fetchJson(
            buildTmdbUrl(`/movie/${partId}`, { append_to_response: 'credits' }),
            { next: { revalidate: PART_DETAILS_REVALIDATE_SECONDS } },
        )
    } catch {
        return null
    }
}

export async function GET(req) {
    try {
        if (!TMDB_KEY) return NextResponse.json({ error: 'Missing TMDb key' }, { status: 500 })

        const { searchParams } = new URL(req.url)
        const id = searchParams.get('id')
        if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

        const tmdbUrl = buildTmdbUrl(`/collection/${id}`)
        // Una hora en la caché del servidor: una colección casi nunca cambia y
        // así abrirla (o precargarla desde /lists) no espera a TMDb.
        const c = await fetchJson(tmdbUrl, { next: { revalidate: 3600 } })
        const parts = Array.isArray(c?.parts) ? c.parts : []

        // orden natural por fecha si existe
        parts.sort((a, b) => {
            const da = a?.release_date || '9999-99-99'
            const db = b?.release_date || '9999-99-99'
            return da.localeCompare(db)
        })

        // `lite=1` (vistas previas del índice de /lists): sin los detalles de
        // cada película (taquilla y créditos), que solo usa la ficha.
        const lite = searchParams.get('lite') === '1'
        const details = lite ? [] : await Promise.all(parts.map((p) => (p?.id != null ? fetchPartDetails(p.id) : null)))
        const enrichedParts = parts.map((p, index) => ({
            ...p,
            revenue: Number(details[index]?.revenue) || 0,
        }))
        const cast = buildCollectionCast(
            parts.map((p, index) => ({
                id: p?.id,
                title: p?.title,
                release_date: p?.release_date,
                cast: details[index]?.credits?.cast || [],
            })),
        )

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
                revenue: sumCollectionRevenue(enrichedParts),
                cast,
                tmdbUrl: c?.id ? `https://www.themoviedb.org/collection/${c.id}` : null,
            },
            items: enrichedParts.map((p) => ({
                ...p,
                media_type: 'movie',
                title: p?.title,
            })),
        })
    } catch (e) {
        return NextResponse.json({ error: e?.message || 'Server error' }, { status: 500 })
    }
}
