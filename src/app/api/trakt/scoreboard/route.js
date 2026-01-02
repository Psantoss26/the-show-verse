import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const TRAKT_BASE = 'https://api.trakt.tv'

function traktHeaders() {
    const key = process.env.TRAKT_CLIENT_ID
    if (!key) throw new Error('Missing TRAKT_CLIENT_ID')
    return {
        'Content-Type': 'application/json',
        'trakt-api-version': '2',
        'trakt-api-key': key,
    }
}

async function fetchTrakt(path) {
    const res = await fetch(`${TRAKT_BASE}${path}`, {
        headers: traktHeaders(),
        cache: 'no-store',
    })
    const json = await res.json().catch(() => null)
    if (!res.ok) {
        const msg = json?.error || json?.message || `Trakt error (${res.status})`
        throw new Error(msg)
    }
    return json
}

async function fetchTraktMaybe(path) {
    const res = await fetch(`${TRAKT_BASE}${path}`, {
        headers: traktHeaders(),
        cache: 'no-store',
    })
    const json = await res.json().catch(() => null)
    if (!res.ok) return null
    return json
}

function normalizeType(input) {
    const t = String(input || '').toLowerCase().trim()
    if (t === 'tv' || t === 'show') return 'show'
    if (t === 'movie') return 'movie'
    if (t === 'season') return 'season'
    if (t === 'episode') return 'episode'
    return null
}

export async function GET(req) {
    try {
        const { searchParams } = new URL(req.url)
        const type = normalizeType(searchParams.get('type')) // movie|show|season|episode
        const tmdbId = searchParams.get('tmdbId') // para season/episode: TMDb ID del SHOW
        const season = searchParams.get('season')
        const episode = searchParams.get('episode')

        if (!type || !tmdbId) {
            return NextResponse.json({ error: 'Missing type/tmdbId' }, { status: 400 })
        }

        // -------------------------
        // MOVIE/SHOW (igual que antes)
        // -------------------------
        if (type === 'movie' || type === 'show') {
            const safeType = type
            const plural = safeType === 'show' ? 'shows' : 'movies'

            const search = await fetchTrakt(`/search/tmdb/${tmdbId}?type=${safeType}`)
            const hit = Array.isArray(search) ? search[0] : null
            const item = hit?.[safeType]
            const ids = item?.ids

            if (!ids?.trakt) return NextResponse.json({ found: false })

            const traktId = ids.trakt

            const [summary, stats] = await Promise.all([
                fetchTrakt(`/${plural}/${traktId}?extended=full`),
                fetchTrakt(`/${plural}/${traktId}/stats`),
            ])

            const slug = summary?.ids?.slug || ids?.slug || traktId
            const traktUrl =
                type === 'show'
                    ? `https://trakt.tv/shows/${slug}`
                    : `https://trakt.tv/movies/${slug}`

            return NextResponse.json({
                found: true,
                ids: summary?.ids || ids,
                traktUrl,
                community: {
                    rating: typeof summary?.rating === 'number' ? summary.rating : null,
                    votes: typeof summary?.votes === 'number' ? summary.votes : null,
                },
                stats: {
                    watchers: typeof stats?.watchers === 'number' ? stats.watchers : null,
                    plays: typeof stats?.plays === 'number' ? stats.plays : null,
                    collectors: typeof stats?.collectors === 'number' ? stats.collectors : null,
                    comments: typeof stats?.comments === 'number' ? stats.comments : null,
                    lists: typeof stats?.lists === 'number' ? stats.lists : null,
                    favorited: typeof stats?.favorited === 'number' ? stats.favorited : null,
                },
                external: {
                    rtAudience: null,
                    justwatchRank: null,
                    justwatchDelta: null,
                    justwatchCountry: 'ES',
                },
            })
        }

        // -------------------------
        // SEASON / EPISODE (nuevo)
        // tmdbId = TMDb ID del show
        // -------------------------
        const seasonNumber = season != null ? Number(season) : null
        const episodeNumber = episode != null ? Number(episode) : null

        if (!Number.isFinite(seasonNumber) || (type === 'episode' && !Number.isFinite(episodeNumber))) {
            return NextResponse.json({ error: 'Missing season/episode params' }, { status: 400 })
        }

        // 1) resolver SHOW en Trakt por TMDb showId
        const searchShow = await fetchTrakt(`/search/tmdb/${tmdbId}?type=show`)
        const showHit = Array.isArray(searchShow) ? searchShow[0] : null
        const showItem = showHit?.show
        const showIds = showItem?.ids

        if (!showIds?.trakt) return NextResponse.json({ found: false })

        const traktShowId = showIds.trakt

        // 2) cargar summary del show para slug (URL)
        const showSummary = await fetchTrakt(`/shows/${traktShowId}?extended=full`)
        const showSlug = showSummary?.ids?.slug || showIds?.slug || traktShowId

        if (type === 'season') {
            // 3) temporadas del show para conseguir ids/rating/votes de temporada
            const seasons = await fetchTrakt(`/shows/${traktShowId}/seasons?extended=full`)
            const seasonObj = Array.isArray(seasons)
                ? seasons.find((s) => Number(s?.number) === Number(seasonNumber))
                : null

            if (!seasonObj?.ids?.trakt) return NextResponse.json({ found: false })

            const seasonIds = seasonObj.ids
            const traktUrl = `https://trakt.tv/shows/${showSlug}/seasons/${seasonNumber}`

            // 4) stats (si existe endpoint; si no, null)
            const stats =
                (await fetchTraktMaybe(`/seasons/${seasonIds.trakt}/stats`)) ||
                (await fetchTraktMaybe(`/shows/${traktShowId}/seasons/${seasonNumber}/stats`)) ||
                null

            return NextResponse.json({
                found: true,
                ids: seasonIds,
                traktUrl,
                community: {
                    rating: typeof seasonObj?.rating === 'number' ? seasonObj.rating : null,
                    votes: typeof seasonObj?.votes === 'number' ? seasonObj.votes : null,
                },
                stats: stats
                    ? {
                        watchers: typeof stats?.watchers === 'number' ? stats.watchers : null,
                        plays: typeof stats?.plays === 'number' ? stats.plays : null,
                        collectors: typeof stats?.collectors === 'number' ? stats.collectors : null,
                        comments: typeof stats?.comments === 'number' ? stats.comments : null,
                        lists: typeof stats?.lists === 'number' ? stats.lists : null,
                        favorited: typeof stats?.favorited === 'number' ? stats.favorited : null,
                    }
                    : {
                        watchers: null,
                        plays: null,
                        collectors: null,
                        comments: null,
                        lists: null,
                        favorited: null,
                    },
                external: {
                    rtAudience: null,
                    justwatchRank: null,
                    justwatchDelta: null,
                    justwatchCountry: 'ES',
                },
            })
        }

        // EPISODE
        const ep = await fetchTrakt(
            `/shows/${traktShowId}/seasons/${seasonNumber}/episodes/${episodeNumber}?extended=full`
        )
        const epIds = ep?.ids
        if (!epIds?.trakt) return NextResponse.json({ found: false })

        const traktUrl = `https://trakt.tv/shows/${showSlug}/seasons/${seasonNumber}/episodes/${episodeNumber}`

        const stats =
            (await fetchTraktMaybe(`/episodes/${epIds.trakt}/stats`)) ||
            (await fetchTraktMaybe(
                `/shows/${traktShowId}/seasons/${seasonNumber}/episodes/${episodeNumber}/stats`
            )) ||
            null

        return NextResponse.json({
            found: true,
            ids: epIds,
            traktUrl,
            community: {
                rating: typeof ep?.rating === 'number' ? ep.rating : null,
                votes: typeof ep?.votes === 'number' ? ep.votes : null,
            },
            stats: stats
                ? {
                    watchers: typeof stats?.watchers === 'number' ? stats.watchers : null,
                    plays: typeof stats?.plays === 'number' ? stats.plays : null,
                    collectors: typeof stats?.collectors === 'number' ? stats.collectors : null,
                    comments: typeof stats?.comments === 'number' ? stats.comments : null,
                    lists: typeof stats?.lists === 'number' ? stats.lists : null,
                    favorited: typeof stats?.favorited === 'number' ? stats.favorited : null,
                }
                : {
                    watchers: null,
                    plays: null,
                    collectors: null,
                    comments: null,
                    lists: null,
                    favorited: null,
                },
            external: {
                rtAudience: null,
                justwatchRank: null,
                justwatchDelta: null,
                justwatchCountry: 'ES',
            },
        })
    } catch (e) {
        return NextResponse.json({ error: e?.message || 'Error' }, { status: 500 })
    }
}
