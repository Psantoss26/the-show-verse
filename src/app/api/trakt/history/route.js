// /src/app/api/trakt/history/route.js
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import {
    readTraktCookies,
    tokenIsExpired,
    refreshAccessToken,
    setTraktCookies,
    traktFetch,
} from '@/lib/trakt/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const TMDB_KEY =
    process.env.TMDB_API_KEY ||
    process.env.NEXT_PUBLIC_TMDB_API_KEY // fallback si no tienes server key separada

const TMDB_BASE = 'https://api.themoviedb.org/3'
const TMDB_IMG = 'https://image.tmdb.org/t/p/w185'

// ⚠️ Ajusta estas rutas a las que uses en tu app:
function detailsHrefFor(type, tmdbId) {
    if (!tmdbId) return null
    return type === 'movie' ? `/movie/${tmdbId}` : `/tv/${tmdbId}`
}

function ymdToIsoStart(ymd) {
    if (!ymd) return null
    return `${ymd}T00:00:00.000Z`
}
function ymdToIsoEnd(ymd) {
    if (!ymd) return null
    return `${ymd}T23:59:59.999Z`
}

async function safeJson(res) {
    try {
        return await res.json()
    } catch {
        return null
    }
}

async function fetchTmdbLocalized({ type, tmdbId }) {
    if (!TMDB_KEY || !tmdbId) return null
    const endpoint = type === 'movie' ? 'movie' : 'tv'
    const url = `${TMDB_BASE}/${endpoint}/${encodeURIComponent(
        tmdbId
    )}?api_key=${encodeURIComponent(TMDB_KEY)}&language=es-ES`

    // cachea para no freír TMDB en cada refresh
    const res = await fetch(url, { next: { revalidate: 60 * 60 * 24 } })
    if (!res.ok) return null
    const j = await safeJson(res)
    if (!j) return null

    const title = type === 'movie' ? j?.title : j?.name
    const posterPath = j?.poster_path || null
    const date = type === 'movie' ? j?.release_date : j?.first_air_date
    const year = date ? String(date).slice(0, 4) : null

    return { title, posterPath, year }
}

// mini mapLimit para no disparar 200 fetches en paralelo
async function mapLimit(arr, limit, fn) {
    const out = new Array(arr.length)
    let i = 0
    const workers = Array.from({ length: Math.max(1, limit) }, async () => {
        while (i < arr.length) {
            const idx = i++
            out[idx] = await fn(arr[idx], idx)
        }
    })
    await Promise.all(workers)
    return out
}

export async function GET(request) {
    const cookieStore = await cookies()
    const { accessToken, refreshToken, expiresAtMs } = readTraktCookies(cookieStore)

    const type = request.nextUrl.searchParams.get('type') || 'all' // all|movies|shows
    const from = request.nextUrl.searchParams.get('from') || null // YYYY-MM-DD
    const to = request.nextUrl.searchParams.get('to') || null // YYYY-MM-DD
    const page = Number(request.nextUrl.searchParams.get('page') || 1)
    const limit = Number(request.nextUrl.searchParams.get('limit') || 200)

    if (!accessToken && !refreshToken) {
        return NextResponse.json({ connected: false, items: [], stats: null })
    }

    let token = accessToken
    let refreshedTokens = null

    try {
        if (!token || tokenIsExpired(expiresAtMs)) {
            if (!refreshToken) return NextResponse.json({ connected: false, items: [], stats: null })
            refreshedTokens = await refreshAccessToken(refreshToken)
            token = refreshedTokens.access_token
        }

        // Trakt: /sync/history (all) o /sync/history/movies|shows
        const qs = new URLSearchParams()
        qs.set('page', String(page))
        qs.set('limit', String(limit))
        if (from) qs.set('start_at', ymdToIsoStart(from))
        if (to) qs.set('end_at', ymdToIsoEnd(to))

        const path =
            type === 'all'
                ? `/sync/history?${qs.toString()}`
                : `/sync/history/${encodeURIComponent(type)}?${qs.toString()}`

        const r = await traktFetch(path, { token })
        if (!r.ok) throw new Error(r?.json?.error || `Trakt history failed (${r.status})`)

        const raw = Array.isArray(r.json) ? r.json : []

        // Normaliza a {type:'movie'|'show', tmdbId, watched_at, ...}
        const normalized = raw
            .map((h) => {
                const isMovie = !!h?.movie
                const obj = isMovie ? h.movie : h.show
                const mediaType = isMovie ? 'movie' : 'show'
                const tmdbId = obj?.ids?.tmdb ?? null

                return {
                    id: h?.id ?? null,
                    watched_at: h?.watched_at ?? null,
                    type: mediaType,
                    tmdbId,
                    // fallback inglés por si TMDB falla
                    title: obj?.title ?? null,
                    year: obj?.year ?? null,
                }
            })
            .filter((x) => x.id && x.watched_at && x.type && x.tmdbId)

        // Enriquecemos con TMDB en español (y póster)
        const enriched = await mapLimit(normalized, 10, async (item) => {
            const tmdbType = item.type === 'movie' ? 'movie' : 'show'
            const tmdb = await fetchTmdbLocalized({
                type: tmdbType === 'movie' ? 'movie' : 'show', // usamos show->tv internamente
                tmdbId: item.tmdbId,
            }).catch(() => null)

            // show en TMDB es "tv"
            let tmdbFixed = tmdb
            if (!tmdbFixed && item.type === 'show') {
                tmdbFixed = await fetchTmdbLocalized({ type: 'show', tmdbId: item.tmdbId }).catch(() => null)
            }

            const title_es = tmdbFixed?.title || null
            const posterUrl = tmdbFixed?.posterPath ? `${TMDB_IMG}${tmdbFixed.posterPath}` : null
            const year = tmdbFixed?.year || item.year || null

            return {
                ...item,
                title_es,
                posterUrl,
                year,
                detailsHref: detailsHrefFor(item.type, item.tmdbId),
            }
        })

        // Stats
        const plays = enriched.length
        const uniqueKey = (x) => `${x.type}:${x.tmdbId}`
        const uniques = new Set(enriched.map(uniqueKey)).size
        const movies = enriched.filter((x) => x.type === 'movie').length
        const shows = enriched.filter((x) => x.type === 'show').length

        const res = NextResponse.json({
            connected: true,
            items: enriched,
            stats: { plays, uniques, movies, shows },
        })

        if (refreshedTokens) setTraktCookies(res, refreshedTokens)
        return res
    } catch (e) {
        const res = NextResponse.json(
            { connected: true, error: e?.message || 'Trakt history failed', items: [], stats: null },
            { status: 500 }
        )
        if (refreshedTokens) setTraktCookies(res, refreshedTokens)
        return res
    }
}
