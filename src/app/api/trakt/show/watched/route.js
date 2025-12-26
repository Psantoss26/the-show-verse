// src/app/api/trakt/show/watched/route.js
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import {
    readTraktCookies,
    tokenIsExpired,
    refreshAccessToken,
    setTraktCookies,
    traktSearchByTmdb,

    // ✅ CAMBIO: progress watched
    traktGetProgressWatchedForShow,
    mapProgressWatchedBySeason,
} from '@/lib/trakt/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request) {
    const cookieStore = await cookies()
    const { accessToken, refreshToken, expiresAtMs } = readTraktCookies(cookieStore)

    const tmdbId = request.nextUrl.searchParams.get('tmdbId')
    if (!tmdbId) return NextResponse.json({ error: 'Missing tmdbId' }, { status: 400 })

    if (!accessToken && !refreshToken) {
        return NextResponse.json({ connected: false })
    }

    let token = accessToken
    let refreshedTokens = null

    try {
        if (!token || tokenIsExpired(expiresAtMs)) {
            if (!refreshToken) return NextResponse.json({ connected: false })
            refreshedTokens = await refreshAccessToken(refreshToken)
            token = refreshedTokens.access_token
        }

        const hit = await traktSearchByTmdb(token, { type: 'show', tmdbId })
        const traktId = hit?.show?.ids?.trakt

        if (!traktId) {
            const res = NextResponse.json({ connected: true, found: false, watchedBySeason: {} })
            if (refreshedTokens) setTraktCookies(res, refreshedTokens)
            return res
        }

        const progress = await traktGetProgressWatchedForShow(token, { traktId })
        const watchedBySeason = mapProgressWatchedBySeason(progress)

        const res = NextResponse.json({ connected: true, found: true, traktId, watchedBySeason })
        if (refreshedTokens) setTraktCookies(res, refreshedTokens)
        return res
    } catch (e) {
        const res = NextResponse.json(
            { connected: true, error: e?.message || 'Trakt show watched failed' },
            { status: 500 }
        )
        if (refreshedTokens) setTraktCookies(res, refreshedTokens)
        return res
    }
}