// src/app/api/trakt/episode/play/route.js
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import {
    readTraktCookies,
    tokenIsExpired,
    refreshAccessToken,
    setTraktCookies,
    normalizeWatchedAt,
    traktAddEpisodeToHistory,
} from '@/lib/trakt/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request) {
    const cookieStore = await cookies()
    const { accessToken, refreshToken, expiresAtMs } = readTraktCookies(cookieStore)

    const body = await request.json().catch(() => ({}))
    const { tmdbId, season, episode, watchedAt } = body || {}

    if (!tmdbId) return NextResponse.json({ error: 'Missing tmdbId' }, { status: 400 })
    const sn = Number(season)
    const en = Number(episode)
    if (!Number.isFinite(sn) || sn <= 0) return NextResponse.json({ error: 'Invalid season' }, { status: 400 })
    if (!Number.isFinite(en) || en <= 0) return NextResponse.json({ error: 'Invalid episode' }, { status: 400 })

    if (!accessToken && !refreshToken) return NextResponse.json({ connected: false }, { status: 401 })

    let token = accessToken
    let refreshedTokens = null

    try {
        if (!token || tokenIsExpired(expiresAtMs)) {
            if (!refreshToken) return NextResponse.json({ connected: false }, { status: 401 })
            refreshedTokens = await refreshAccessToken(refreshToken)
            token = refreshedTokens.access_token
        }

        const watchedAtIso = normalizeWatchedAt(watchedAt)

        await traktAddEpisodeToHistory(token, {
            showTmdbId: Number(tmdbId),
            season: Number(season),
            episode: Number(episode),
            watchedAtIso,
        })

        const res = NextResponse.json({ connected: true, ok: true })
        if (refreshedTokens) setTraktCookies(res, refreshedTokens)
        return res
    } catch (e) {
        return NextResponse.json({ error: e?.message || 'Trakt episode play failed' }, { status: 500 })
    }
}