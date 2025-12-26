import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import {
    readTraktCookies,
    tokenIsExpired,
    refreshAccessToken,
    setTraktCookies,
    normalizeWatchedAt,
    traktAddEpisodeToHistory,
    traktRemoveEpisodeFromHistory
} from '@/lib/trakt/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request) {
    const cookieStore = await cookies()
    const { accessToken, refreshToken, expiresAtMs } = readTraktCookies(cookieStore)

    const body = await request.json().catch(() => ({}))
    const { tmdbId, season, episode, watched, watchedAt } = body || {}

    if (!tmdbId) return NextResponse.json({ error: 'Missing tmdbId' }, { status: 400 })
    const sn = Number(season)
    const en = Number(episode)
    if (!Number.isFinite(sn) || sn <= 0) return NextResponse.json({ error: 'Invalid season' }, { status: 400 })
    if (!Number.isFinite(en) || en <= 0) return NextResponse.json({ error: 'Invalid episode' }, { status: 400 })

    if (!accessToken && !refreshToken) {
        return NextResponse.json({ connected: false }, { status: 401 })
    }

    let token = accessToken
    let refreshedTokens = null

    try {
        if (!token || tokenIsExpired(expiresAtMs)) {
            if (!refreshToken) return NextResponse.json({ connected: false }, { status: 401 })
            refreshedTokens = await refreshAccessToken(refreshToken)
            token = refreshedTokens.access_token
        }

        if (watched) {
            const watchedAtIso = normalizeWatchedAt(watchedAt) // admite YYYY-MM-DD / DD-MM-YYYY / ISO
            await traktAddEpisodeToHistory(token, {
                showTmdbId: tmdbId,
                season: sn,
                episode: en,
                watchedAtIso
            })
        } else {
            await traktRemoveEpisodeFromHistory(token, {
                showTmdbId: tmdbId,
                season: sn,
                episode: en
            })
        }

        const res = NextResponse.json({ connected: true, ok: true, watched: !!watched })
        if (refreshedTokens) setTraktCookies(res, refreshedTokens)
        return res
    } catch (e) {
        const res = NextResponse.json(
            { connected: true, error: e?.message || 'Trakt episode watched failed' },
            { status: 500 }
        )
        if (refreshedTokens) setTraktCookies(res, refreshedTokens)
        return res
    }
}
