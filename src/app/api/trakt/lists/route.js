import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const TRAKT_API = 'https://api.trakt.tv'
const TRAKT_API_VERSION = '2'

const TRAKT_CLIENT_ID =
    process.env.TRAKT_CLIENT_ID ||
    process.env.NEXT_PUBLIC_TRAKT_CLIENT_ID ||
    process.env.TRAKT_CLIENTID ||
    ''

const TMDB_BASE = 'https://api.themoviedb.org/3'
const TMDB_KEY = String(process.env.TMDB_API_KEY || process.env.NEXT_PUBLIC_TMDB_API_KEY || '').trim()

function headersTrakt() {
    if (!TRAKT_CLIENT_ID) return null
    return {
        'Content-Type': 'application/json',
        'trakt-api-version': TRAKT_API_VERSION,
        'trakt-api-key': TRAKT_CLIENT_ID,
    }
}

async function traktGet(path, params = {}) {
    const h = headersTrakt()
    if (!h) return { ok: false, status: 500, json: { error: 'Missing TRAKT_CLIENT_ID env var' } }

    const url = new URL(`${TRAKT_API}${path}`)
    Object.entries(params).forEach(([k, v]) => {
        if (v !== undefined && v !== null) url.searchParams.set(k, String(v))
    })

    const res = await fetch(url.toString(), { headers: h, cache: 'no-store' })
    const json = await res.json().catch(() => null)
    return { ok: res.ok, status: res.status, json }
}

async function tmdbFetch(path, params = {}) {
    if (!TMDB_KEY) return null
    const url = new URL(`${TMDB_BASE}${path}`)
    url.searchParams.set('api_key', TMDB_KEY)
    Object.entries(params).forEach(([k, v]) => {
        if (v !== undefined && v !== null) url.searchParams.set(k, String(v))
    })
    const res = await fetch(url.toString(), { cache: 'force-cache' })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) return null
    return data
}

async function tmdbFind(externalId, externalSource = 'imdb_id') {
    return tmdbFetch(`/find/${encodeURIComponent(externalId)}`, { external_source: externalSource })
}

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

// Normaliza tanto:
// - /lists/trending (objetos con {watchers, list, user?})
// - /lists/popular, /lists/official (list directo)
function normalizeList(item) {
    const l = item?.list ? item.list : item
    if (!l) return null

    // ✅ IMPORTANTÍSIMO: el user puede venir en el wrapper
    const user = item?.user || l?.user || null
    const username = user?.username || null

    const ids = l.ids || {}
    const traktId = ids.trakt ?? l.id ?? null
    const slug = ids.slug ?? null
    const key = slug || traktId

    // ✅ Web URL correcta (user list vs global list)
    const traktUrl =
        username && key
            ? `https://trakt.tv/users/${encodeURIComponent(username)}/lists/${encodeURIComponent(String(key))}`
            : key
                ? `https://trakt.tv/lists/${encodeURIComponent(String(key))}`
                : null

    return {
        id: traktId,
        slug,
        name: l.name ?? '',
        description: l.description ?? '',
        item_count: typeof l.item_count === 'number' ? l.item_count : 0,
        type: l.type ?? null,
        privacy: l.privacy ?? null,
        user: user ? { ...user, username } : null,
        ids,
        traktUrl,
    }
}

function isOfficialTraktList(l) {
    if (l?.type === 'official') return true
    const username = l?.user?.username?.toLowerCase?.()
    if (username === 'trakt') return true
    return false
}

function buildInternalUrl(list) {
    const username = list?.user?.username || 'official'
    const listKey = list?.ids?.slug || list?.ids?.trakt || list?.id
    if (!listKey) return null
    return `/lists/trakt/${encodeURIComponent(username)}/${encodeURIComponent(String(listKey))}`
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
    if (it?.season?.ids?.trakt && showTmdb) return { mediaType: 'tv', tmdbId: showTmdb }
    if (it?.episode?.ids?.trakt && showTmdb) return { mediaType: 'tv', tmdbId: showTmdb }

    const personTmdb = it?.person?.ids?.tmdb
    if (personTmdb) return { mediaType: 'person', tmdbId: personTmdb }

    return null
}

async function fetchPreviewPostersForList(norm, previewCount) {
    if (!previewCount || previewCount <= 0) return []
    if (!TMDB_KEY) return []

    const username = norm?.user?.username || null
    const listKey = norm?.ids?.slug || norm?.ids?.trakt || norm?.id
    if (!listKey) return []

    // Para "official" o listas sin user
    const useGlobal = !username || username === 'official'

    const itemsPath = useGlobal
        ? `/lists/${encodeURIComponent(String(norm?.ids?.trakt || listKey))}/items`
        : `/users/${encodeURIComponent(username)}/lists/${encodeURIComponent(String(listKey))}/items`

    const r = await traktGet(itemsPath, { extended: 'full', page: 1, limit: previewCount })
    if (!r.ok || !Array.isArray(r.json)) return []

    const items = r.json
    const cache = new Map()

    const posters = await mapLimit(items, 8, async (it) => {
        const ref = getItemRef(it)
        if (!ref) return null

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
                    tmdbData =
                        ref.mediaType === 'movie'
                            ? (found?.movie_results || [])[0] || null
                            : (found?.tv_results || [])[0] || null
                }
            } catch {
                tmdbData = null
            }
            cache.set(cacheKey, tmdbData)
        }

        const tmdbData = cache.get(cacheKey)
        const posterPath = tmdbData?.poster_path || tmdbData?.profile_path || tmdbData?.backdrop_path || null
        return posterPath ? `https://image.tmdb.org/t/p/w342${posterPath}` : null
    })

    return posters.filter(Boolean).slice(0, previewCount)
}

export async function GET(req) {
    try {
        const { searchParams } = new URL(req.url)

        // ✅ soporta "mode" (tu UI) y también "tab" (por si acaso)
        const mode = (searchParams.get('mode') || searchParams.get('tab') || 'official').toLowerCase()

        const limit = Math.min(Math.max(Number(searchParams.get('limit') || 30), 1), 50)
        const page = Math.max(Number(searchParams.get('page') || 1), 1)

        // previews (posters) para arreglar “listas vacías”
        const preview = Math.min(Math.max(Number(searchParams.get('preview') || 6), 0), 10)

        const seen = new Set()
        const out = []

        const pushMany = (arr) => {
            for (const it of arr) {
                const norm = normalizeList(it)
                if (!norm?.id && !norm?.ids?.slug) continue
                const key = String(norm?.ids?.trakt || norm?.id || norm?.ids?.slug)
                if (seen.has(key)) continue
                seen.add(key)
                out.push(norm)
                if (out.length >= limit) break
            }
        }

        // 1) Fuente principal según modo
        if (mode === 'trending') {
            const r = await traktGet('/lists/trending', { page, limit, extended: 'full' })
            if (!r.ok) return NextResponse.json({ error: 'Trakt lists failed', details: r.json }, { status: r.status })
            pushMany(Array.isArray(r.json) ? r.json : [])
        } else if (mode === 'popular') {
            const r = await traktGet('/lists/popular', { page, limit, extended: 'full' })
            if (!r.ok) return NextResponse.json({ error: 'Trakt lists failed', details: r.json }, { status: r.status })
            pushMany(Array.isArray(r.json) ? r.json : [])
        } else {
            // ✅ OFFICIAL real (si Trakt lo soporta)
            const o = await traktGet('/lists/official', { page, limit, extended: 'full' })
            if (o.ok && Array.isArray(o.json) && o.json.length) {
                pushMany(o.json)
            } else {
                // fallback (tu estrategia antigua) por si /official no devuelve nada en tu región
                const t = await traktGet('/lists/trending', { page: 1, limit: 50, extended: 'full' })
                if (!t.ok) return NextResponse.json({ error: 'Trakt lists failed', details: t.json }, { status: t.status })

                const trending = (Array.isArray(t.json) ? t.json : [])
                    .map(normalizeList)
                    .filter(Boolean)
                    .filter(isOfficialTraktList)

                pushMany(trending)

                if (out.length < limit) {
                    const p = await traktGet('/lists/popular', { page: 1, limit: 50, extended: 'full' })
                    if (p.ok) {
                        const popular = (Array.isArray(p.json) ? p.json : [])
                            .map(normalizeList)
                            .filter(Boolean)
                            .filter(isOfficialTraktList)
                        pushMany(popular)
                    }
                }
            }
        }

        // 2) Enriquecemos con internalUrl + previewPosters (con concurrencia limitada)
        const sliced = out.slice(0, limit)
        const enriched = await mapLimit(sliced, 4, async (l) => {
            const internalUrl = buildInternalUrl(l)
            const previewPosters = preview > 0 ? await fetchPreviewPostersForList(l, preview) : []
            return {
                ...l,
                internalUrl,
                isOfficial: isOfficialTraktList(l),
                previewPosters,
            }
        })

        return NextResponse.json(
            {
                mode,
                page,
                limit,
                preview,
                lists: enriched,
            },
            { status: 200 }
        )
    } catch (e) {
        return NextResponse.json({ error: 'Trakt lists failed', details: String(e?.message || e) }, { status: 500 })
    }
}