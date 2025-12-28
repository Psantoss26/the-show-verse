import { NextResponse } from 'next/server'
import { resolveTraktIdFromTmdb, traktHeaders, readPaginationHeaders } from '../_utils'

export const dynamic = 'force-dynamic'

async function mapLimit(arr, limit, fn) {
    const out = new Array(arr.length)
    let i = 0
    const workers = new Array(Math.min(limit, arr.length)).fill(0).map(async () => {
        while (true) {
            const idx = i++
            if (idx >= arr.length) break
            out[idx] = await fn(arr[idx], idx)
        }
    })
    await Promise.all(workers)
    return out
}

function tmdbAuthHeaders() {
    const bearer =
        process.env.TMDB_BEARER_TOKEN ||
        process.env.TMDB_TOKEN ||
        process.env.NEXT_PUBLIC_TMDB_BEARER_TOKEN

    return bearer ? { Authorization: `Bearer ${bearer}` } : {}
}

function tmdbApiKey() {
    return (
        process.env.TMDB_API_KEY ||
        process.env.NEXT_PUBLIC_TMDB_API_KEY ||
        process.env.TMDB_KEY
    )
}

async function fetchTmdbPosterUrl(kind, tmdbId) {
    try {
        if (!tmdbId) return null
        const apiKey = tmdbApiKey()
        const headers = { 'Content-Type': 'application/json', ...tmdbAuthHeaders() }

        const base = kind === 'movie' ? 'movie' : 'tv'
        const url = apiKey
            ? `https://api.themoviedb.org/3/${base}/${tmdbId}?api_key=${encodeURIComponent(apiKey)}&language=es-ES`
            : `https://api.themoviedb.org/3/${base}/${tmdbId}?language=es-ES`

        const res = await fetch(url, { headers, cache: 'no-store' })
        if (!res.ok) return null

        const data = await res.json().catch(() => null)
        const path = data?.poster_path || data?.backdrop_path
        if (!path) return null

        return `https://image.tmdb.org/t/p/w342${path}`
    } catch {
        return null
    }
}

export async function GET(req) {
    try {
        const { searchParams } = new URL(req.url)
        const type = (searchParams.get('type') || '').toLowerCase()
        const tmdbId = searchParams.get('tmdbId')
        const tab = (searchParams.get('tab') || 'popular').toLowerCase()
        const page = searchParams.get('page') || '1'
        const limit = searchParams.get('limit') || '10'

        if (!tmdbId) return NextResponse.json({ error: 'Falta tmdbId' }, { status: 400 })
        if (type !== 'movie' && type !== 'show')
            return NextResponse.json({ error: 'type debe ser movie o show' }, { status: 400 })

        const { traktId } = await resolveTraktIdFromTmdb({ type, tmdbId })
        const headers = await traktHeaders()

        const base = type === 'movie' ? 'movies' : 'shows'
        const url = `https://api.trakt.tv/${base}/${traktId}/lists/${tab}?page=${encodeURIComponent(page)}&limit=${encodeURIComponent(limit)}`
        const res = await fetch(url, { headers, cache: 'no-store' })
        const json = await res.json().catch(() => null)

        if (!res.ok) {
            const msg = json?.error || json?.message || 'Error cargando listas'
            return NextResponse.json({ error: msg }, { status: res.status })
        }

        const lists = Array.isArray(json) ? json : []

        const listsWithPreviews = await mapLimit(lists, 4, async (row) => {
            try {
                const listObj = row?.list || row || {}
                const userObj = row?.user || listObj?.user || {}

                // ✅ user id correcto para endpoints /users/:id (preferir username)
                const userId =
                    userObj?.username ||
                    userObj?.ids?.slug ||
                    null

                // ✅ list_id correcto: preferir slug
                const listId =
                    listObj?.ids?.slug ||
                    null

                if (!userId || !listId) {
                    return { ...row, previewPosters: [] }
                }

                // ✅ OJO: extended=images (no full,images)
                const itemsUrl =
                    `https://api.trakt.tv/users/${encodeURIComponent(userId)}` +
                    `/lists/${encodeURIComponent(String(listId))}` +
                    `/items?limit=5&extended=images`

                const itemsRes = await fetch(itemsUrl, { headers, cache: 'no-store' })
                if (!itemsRes.ok) return { ...row, previewPosters: [] }

                const itemsJson = await itemsRes.json().catch(() => [])
                const arr = Array.isArray(itemsJson) ? itemsJson : []

                // 1) Intento Trakt images
                let previews = arr
                    .map((i) => {
                        const entity = i?.movie || i?.show || null
                        const poster = entity?.images?.poster
                        return poster?.medium || poster?.thumb || poster?.full || null
                    })
                    .filter(Boolean)
                    .slice(0, 5)

                // 2) Fallback a TMDb si Trakt no devuelve imágenes
                if (previews.length === 0) {
                    const candidates = arr
                        .map((i) => {
                            if (i?.movie?.ids?.tmdb) return { kind: 'movie', tmdb: i.movie.ids.tmdb }
                            if (i?.show?.ids?.tmdb) return { kind: 'tv', tmdb: i.show.ids.tmdb }
                            return null
                        })
                        .filter(Boolean)
                        .slice(0, 5)

                    const tmdbPosters = await Promise.all(
                        candidates.map((c) => fetchTmdbPosterUrl(c.kind, c.tmdb))
                    )

                    previews = tmdbPosters.filter(Boolean).slice(0, 5)
                }

                return { ...row, previewPosters: previews }
            } catch (err) {
                console.error('Error fetching list previews', err)
                return { ...row, previewPosters: [] }
            }
        })

        const pg = readPaginationHeaders(res)
        return NextResponse.json({ items: listsWithPreviews, pagination: pg })
    } catch (e) {
        return NextResponse.json({ error: e?.message || 'Error' }, { status: 500 })
    }
}
