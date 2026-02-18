// /src/app/api/trakt/show/completed/route.js
// Devuelve las series que el usuario ha completado (todos los episodios vistos)
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

async function safeJson(res) {
    try { return await res.json() } catch { return null }
}

async function fetchTmdbShow(tmdbId) {
    if (!TMDB_KEY || !tmdbId) return null
    const url = `${TMDB_BASE}/tv/${encodeURIComponent(tmdbId)}?api_key=${encodeURIComponent(TMDB_KEY)}&language=es-ES`
    const res = await fetch(url, { next: { revalidate: 60 * 60 * 24 } })
    if (!res.ok) return null
    const j = await safeJson(res)
    if (!j) return null
    return {
        name: j?.name || null,
        poster_path: j?.poster_path || null,
        backdrop_path: j?.backdrop_path || null,
        first_air_date: j?.first_air_date || null,
        vote_average: j?.vote_average || null,
        overview: j?.overview || null,
        number_of_seasons: j?.number_of_seasons || null,
        number_of_episodes: j?.number_of_episodes || null,
        genres: (j?.genres || []).map(g => g.name),
        status: j?.status || null,
        networks: (j?.networks || []).map(n => ({ name: n.name, logo_path: n.logo_path })),
    }
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
    const cookieStore = await cookies()
    const { accessToken, refreshToken, expiresAtMs } = readTraktCookies(cookieStore)

    if (!accessToken && !refreshToken) {
        return NextResponse.json({ connected: false, items: [] })
    }

    let token = accessToken
    let refreshedTokens = null

    try {
        if (!token || tokenIsExpired(expiresAtMs)) {
            if (!refreshToken) return NextResponse.json({ connected: false, items: [] })
            refreshedTokens = await refreshAccessToken(refreshToken)
            token = refreshedTokens.access_token
        }

        // 1. Obtener todas las series vistas por el usuario
        const watchedRes = await traktFetch('/sync/watched/shows?extended=noseasons', { token })
        if (!watchedRes.ok) throw new Error(`Trakt watched shows failed (${watchedRes.status})`)

        const watchedShows = Array.isArray(watchedRes.json) ? watchedRes.json : []

        // 2. Para cada serie, obtener el progreso detallado
        const progressResults = await mapLimit(watchedShows, 6, async (item) => {
            const show = item?.show
            const traktId = show?.ids?.trakt
            const tmdbId = show?.ids?.tmdb
            if (!traktId || !tmdbId) return null

            try {
                const progressRes = await traktFetch(
                    `/shows/${encodeURIComponent(traktId)}/progress/watched?hidden=false&specials=false&count_specials=false`,
                    { token }
                )
                if (!progressRes.ok) return null

                const progress = progressRes.json
                const aired = progress?.aired || 0
                const completed = progress?.completed || 0

                // Solo series completadas (todos los episodios emitidos vistos)
                if (completed <= 0 || completed < aired) return null

                const pct = 100

                // Info del último episodio visto
                const lastEp = progress?.last_episode || null
                const lastWatchedAt = progress?.last_watched_at || item?.last_watched_at || null

                return {
                    traktId,
                    tmdbId,
                    title: show?.title || 'Sin título',
                    year: show?.year || null,
                    aired,
                    completed,
                    pct,
                    nextEpisode: null,
                    lastEpisode: lastEp ? {
                        season: lastEp.season,
                        number: lastEp.number,
                        title: lastEp.title || null,
                    } : null,
                    lastWatchedAt,
                }
            } catch {
                return null
            }
        })

        const completedShows = progressResults.filter(Boolean)

        // Ordenar por último visto (más reciente primero)
        completedShows.sort((a, b) => {
            const ta = new Date(a.lastWatchedAt || 0).getTime()
            const tb = new Date(b.lastWatchedAt || 0).getTime()
            return tb - ta
        })

        // 3. Enriquecer con datos de TMDb
        const enriched = await mapLimit(completedShows, 8, async (item) => {
            const tmdb = await fetchTmdbShow(item.tmdbId).catch(() => null)
            return {
                ...item,
                title_es: tmdb?.name || null,
                poster_path: tmdb?.poster_path || null,
                backdrop_path: tmdb?.backdrop_path || null,
                first_air_date: tmdb?.first_air_date || null,
                vote_average: tmdb?.vote_average || null,
                overview: tmdb?.overview || null,
                number_of_seasons: tmdb?.number_of_seasons || null,
                total_episodes: tmdb?.number_of_episodes || null,
                genres: tmdb?.genres || [],
                tmdb_status: tmdb?.status || null,
                networks: tmdb?.networks || [],
                detailsHref: `/details/tv/${item.tmdbId}`,
            }
        })

        const res = NextResponse.json({
            connected: true,
            items: enriched,
            stats: {
                total: enriched.length,
                avgProgress: 100,
                totalEpisodesWatched: enriched.reduce((s, x) => s + x.completed, 0),
                totalEpisodesRemaining: 0,
            },
        })

        if (refreshedTokens) setTraktCookies(res, refreshedTokens)
        return res
    } catch (e) {
        const res = NextResponse.json(
            { connected: true, error: e?.message || 'Error cargando series completadas', items: [] },
            { status: 500 }
        )
        if (refreshedTokens) setTraktCookies(res, refreshedTokens)
        return res
    }
}
