import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 3600

const TRAKT_BASE = 'https://api.trakt.tv'
const TMDB_BASE = 'https://api.themoviedb.org/3'

const TRAKT_CLIENT_ID =
    process.env.TRAKT_CLIENT_ID ||
    process.env.NEXT_PUBLIC_TRAKT_CLIENT_ID ||
    process.env.TRAKT_CLIENTID ||
    ''

const TMDB_KEY = String(process.env.TMDB_API_KEY || process.env.NEXT_PUBLIC_TMDB_API_KEY || '').trim()

function json(res, status = 200) {
    return new NextResponse(JSON.stringify(res), {
        status,
        headers: { 'content-type': 'application/json' },
    })
}

function pickFirst(v) {
    return Array.isArray(v) ? v[0] : v
}

function clampInt(n, { min, max, fallback }) {
    const x = Number.parseInt(String(n), 10)
    if (!Number.isFinite(x)) return fallback
    return Math.max(min, Math.min(max, x))
}

async function traktFetchRaw(path, { params } = {}) {
    if (!TRAKT_CLIENT_ID) {
        const e = new Error('Missing TRAKT_CLIENT_ID env var')
        e.status = 500
        throw e
    }

    const url = new URL(`${TRAKT_BASE}${path}`)
    if (params) {
        Object.entries(params).forEach(([k, v]) => {
            if (v !== undefined && v !== null) url.searchParams.set(k, String(v))
        })
    }

    const res = await fetch(url.toString(), {
        headers: {
            'Content-Type': 'application/json',
            'trakt-api-version': '2',
            'trakt-api-key': TRAKT_CLIENT_ID,
        },
        cache: 'no-store',
    })

    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
        const e = new Error(data?.error || data?.message || 'Trakt request failed')
        e.status = res.status
        throw e
    }
    return { data, headers: res.headers }
}

async function tmdbFetch(path, params = {}) {
    if (!TMDB_KEY) {
        const e = new Error('Missing TMDB key')
        e.status = 401
        throw e
    }

    const url = new URL(`${TMDB_BASE}${path}`)
    url.searchParams.set('api_key', TMDB_KEY)
    Object.entries(params).forEach(([k, v]) => {
        if (v !== undefined && v !== null) url.searchParams.set(k, String(v))
    })

    const res = await fetch(url.toString(), { cache: 'force-cache' })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
        const e = new Error(data?.status_message || 'TMDb request failed')
        e.status = res.status
        throw e
    }
    return data
}

async function tmdbFind(externalId, externalSource = 'imdb_id') {
    return tmdbFetch(`/find/${encodeURIComponent(externalId)}`, {
        external_source: externalSource,
    })
}

// Concurrencia limitada
async function mapLimit(arr, limit, fn) {
    const out = new Array(arr.length)
    let i = 0
    const workers = new Array(Math.min(limit, arr.length)).fill(0).map(async () => {
        while (i < arr.length) {
            const idx = i++
            try {
                out[idx] = await fn(arr[idx], idx)
            } catch {
                out[idx] = arr[idx]
            }
        }
    })
    await Promise.all(workers)
    return out
}

function getItemRef(it) {
    const movieTmdb = it?.movie?.ids?.tmdb
    const movieImdb = it?.movie?.ids?.imdb
    if (movieTmdb) return { mediaType: 'movie', tmdbId: movieTmdb }
    if (movieImdb) return { mediaType: 'movie', externalId: movieImdb, externalSource: 'imdb_id' }

    const showTmdb = it?.show?.ids?.tmdb
    const showImdb = it?.show?.ids?.imdb
    if (showTmdb) return { mediaType: 'tv', tmdbId: showTmdb }
    if (showImdb) return { mediaType: 'tv', externalId: showImdb, externalSource: 'imdb_id' }

    // season/episode -> usa show para poster
    if ((it?.season || it?.episode) && showTmdb) return { mediaType: 'tv', tmdbId: showTmdb }
    if ((it?.season || it?.episode) && showImdb) return { mediaType: 'tv', externalId: showImdb, externalSource: 'imdb_id' }

    const personTmdb = it?.person?.ids?.tmdb
    if (personTmdb) return { mediaType: 'person', tmdbId: personTmdb }

    return null
}

export async function GET(req, ctx) {
    try {
        const routeParams = await Promise.resolve(ctx?.params || {})

        const username = decodeURIComponent(String(pickFirst(routeParams?.username || '')).trim())
        const listId = decodeURIComponent(String(pickFirst(routeParams?.listId || '')).trim())
        if (!username || !listId) return json({ error: 'Missing params' }, 400)

        const { searchParams } = new URL(req.url)
        const page = clampInt(searchParams.get('page'), { min: 1, max: 5000, fallback: 1 })
        const limit = clampInt(searchParams.get('limit'), { min: 6, max: 100, fallback: 48 })

        const isOfficialLike = username === 'official'

        // Helpers: intentamos user-list, y si falla, fallback a global list
        const tryUserList = async () => {
            const { data: list } = await traktFetchRaw(
                `/users/${encodeURIComponent(username)}/lists/${encodeURIComponent(listId)}`
            )
            const { data: items, headers } = await traktFetchRaw(
                `/users/${encodeURIComponent(username)}/lists/${encodeURIComponent(listId)}/items`,
                { params: { extended: 'full', page, limit } }
            )
            return { list, items, headers, source: 'user' }
        }

        const tryGlobalList = async () => {
            const { data: list } = await traktFetchRaw(`/lists/${encodeURIComponent(listId)}`)
            const { data: items, headers } = await traktFetchRaw(
                `/lists/${encodeURIComponent(listId)}/items`,
                { params: { extended: 'full', page, limit } }
            )
            return { list, items, headers, source: 'global' }
        }

        let list, items, headers, source

        if (isOfficialLike) {
            ; ({ list, items, headers, source } = await tryGlobalList())
        } else {
            try {
                ; ({ list, items, headers, source } = await tryUserList())
            } catch (e) {
                // ✅ fallback robusto: si ese username/listId no es user-list, probamos global
                ; ({ list, items, headers, source } = await tryGlobalList())
            }
        }

        const pageCount = Number(headers?.get('X-Pagination-Page-Count') || 0) || null
        const itemCount = Number(headers?.get('X-Pagination-Item-Count') || 0) || null

        // 3) Enriquecemos SOLO esta página con TMDb
        const cache = new Map()
        let tmdbAuthFailed = false

        const enriched = await mapLimit(Array.isArray(items) ? items : [], 8, async (it) => {
            if (tmdbAuthFailed) return { ...it, _tmdb: null }

            const ref = getItemRef(it)
            if (!ref) return { ...it, _tmdb: null }

            const cacheKey = ref.tmdbId
                ? `${ref.mediaType}:${ref.tmdbId}`
                : `${ref.mediaType}:imdb:${ref.externalId}`

            if (!cache.has(cacheKey)) {
                let tmdbData = null
                try {
                    if (ref.tmdbId) {
                        if (ref.mediaType === 'movie') tmdbData = await tmdbFetch(`/movie/${ref.tmdbId}`, { language: 'es-ES' })
                        else if (ref.mediaType === 'tv') tmdbData = await tmdbFetch(`/tv/${ref.tmdbId}`, { language: 'es-ES' })
                        else if (ref.mediaType === 'person') tmdbData = await tmdbFetch(`/person/${ref.tmdbId}`, { language: 'es-ES' })
                    } else if (ref.externalId && (ref.mediaType === 'movie' || ref.mediaType === 'tv')) {
                        const found = await tmdbFind(ref.externalId, ref.externalSource)
                        const candidate =
                            ref.mediaType === 'movie'
                                ? (found?.movie_results || [])[0]
                                : (found?.tv_results || [])[0]
                        tmdbData = candidate || null
                    }
                } catch (e) {
                    if (e?.status === 401 || e?.status === 403) tmdbAuthFailed = true
                    tmdbData = null
                }
                cache.set(cacheKey, tmdbData)
            }

            const tmdbData = cache.get(cacheKey)
            return {
                ...it,
                _tmdb: tmdbData
                    ? {
                        id: tmdbData.id,
                        media_type: ref.mediaType,
                        poster_path: tmdbData.poster_path || tmdbData.profile_path || null,
                        backdrop_path: tmdbData.backdrop_path || null,
                    }
                    : null,
            }
        })

        const total = Number(itemCount || list?.item_count || 0) || 0
        const hasMore = pageCount ? page < pageCount : total ? page * limit < total : enriched.length === limit

        return json({
            list,
            items: enriched,
            user: isOfficialLike ? null : { username },
            page,
            limit,
            total,
            hasMore,
            tmdbAuthFailed,
            source, // 'user' | 'global' (debug útil)
        })
    } catch (e) {
        return json({ error: e?.message || 'Error' }, e?.status || 500)
    }
}
