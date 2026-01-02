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

const TMDB_KEY = process.env.TMDB_API_KEY || process.env.NEXT_PUBLIC_TMDB_API_KEY
const TMDB_BASE = 'https://api.themoviedb.org/3'

function detailsHrefFor(type, tmdbId) {
    if (!tmdbId) return null
    const mediaType = type === 'movie' ? 'movie' : 'tv'
    return `/details/${mediaType}/${tmdbId}`
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
    const url = `${TMDB_BASE}/${endpoint}/${encodeURIComponent(tmdbId)}?api_key=${encodeURIComponent(
        TMDB_KEY
    )}&language=es-ES`

    const res = await fetch(url, { next: { revalidate: 60 * 60 * 24 } })
    if (!res.ok) return null
    const j = await safeJson(res)
    if (!j) return null

    const title = type === 'movie' ? j?.title : j?.name
    const poster_path = j?.poster_path || null
    const date = type === 'movie' ? j?.release_date : j?.first_air_date
    const year = date ? String(date).slice(0, 4) : null

    return { title, poster_path, year }
}

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
    // ✅ FIX: cookies() es Promise en tu Next
    const cookieStore = await cookies()
    const { accessToken, refreshToken, expiresAtMs } = readTraktCookies(cookieStore)

    const type = request.nextUrl.searchParams.get('type') || 'all' // all|movies|shows
    const from = request.nextUrl.searchParams.get('from') || null
    const to = request.nextUrl.searchParams.get('to') || null
    const page = Number(request.nextUrl.searchParams.get('page') || 1)
    const limit = Number(request.nextUrl.searchParams.get('limit') || 200)
    const extended = request.nextUrl.searchParams.get('extended') || 'full'

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

        const qs = new URLSearchParams()
        qs.set('page', String(page))
        qs.set('limit', String(limit))
        qs.set('extended', extended)
        if (from) qs.set('start_at', ymdToIsoStart(from))
        if (to) qs.set('end_at', ymdToIsoEnd(to))

        const path =
            type === 'all'
                ? `/sync/history?${qs.toString()}`
                : `/sync/history/${encodeURIComponent(type)}?${qs.toString()}`

        const r = await traktFetch(path, { token })
        if (!r.ok) throw new Error(r?.json?.error || `Trakt history failed (${r.status})`)

        const raw = Array.isArray(r.json) ? r.json : []

        // ✅ Normaliza e INCLUYE info de episodio (season/number)
        const normalized = raw
            .map((h) => {
                const id = h?.id ?? null
                const watched_at = h?.watched_at ?? null

                // MOVIE
                if (h?.movie) {
                    const obj = h.movie
                    const tmdbId = obj?.ids?.tmdb ?? null
                    return { id, watched_at, type: 'movie', tmdbId, title: obj?.title ?? null, year: obj?.year ?? null }
                }

                // EPISODE => lo devolvemos como type:'show' + episode meta
                if (h?.show && h?.episode) {
                    const show = h.show
                    const ep = h.episode
                    const tmdbId = show?.ids?.tmdb ?? null

                    const season = ep?.season ?? null
                    const number = ep?.number ?? null
                    const episodeTitle = ep?.title ?? null

                    return {
                        id,
                        watched_at,
                        type: 'show',
                        tmdbId,
                        title: show?.title ?? null,
                        year: show?.year ?? null,

                        // ✅ lo que tu HistoryClient lee con getEpisodeMeta()
                        episode: { season, number, title: episodeTitle },
                        season,
                        number,
                        episodeTitle,
                    }
                }

                // SHOW (por si llega así)
                if (h?.show) {
                    const obj = h.show
                    const tmdbId = obj?.ids?.tmdb ?? null
                    return { id, watched_at, type: 'show', tmdbId, title: obj?.title ?? null, year: obj?.year ?? null }
                }

                return null
            })
            .filter(Boolean)
            .filter((x) => x.id && x.watched_at && x.type && x.tmdbId)

        // ✅ Enriquecemos con TMDb ES + poster_path (para que tu Poster() no refetchee)
        const enriched = await mapLimit(normalized, 10, async (item) => {
            const tmdbType = item.type === 'movie' ? 'movie' : 'show'
            const tmdb = await fetchTmdbLocalized({ type: tmdbType, tmdbId: item.tmdbId }).catch(() => null)

            return {
                ...item,
                title_es: tmdb?.title || null,
                poster_path: tmdb?.poster_path || null,
                year: tmdb?.year || item.year || null,
                detailsHref: detailsHrefFor(item.type, item.tmdbId),
            }
        })

        const plays = enriched.length
        const uniques = new Set(enriched.map((x) => `${x.type}:${x.tmdbId}`)).size
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
