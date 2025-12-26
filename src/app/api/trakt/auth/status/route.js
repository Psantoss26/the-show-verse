// src/app/api/trakt/item/status/route.js
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import {
    readTraktCookies,
    tokenIsExpired,
    refreshAccessToken,
    setTraktCookies,
    traktSearchByTmdb,
    traktGetHistoryForItem,
    computeHistorySummary,
    mapHistoryEntries
} from '@/lib/trakt/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request) {
    const cookieStore = await cookies()
    const { accessToken, refreshToken, expiresAtMs } = readTraktCookies(cookieStore)

    const type = request.nextUrl.searchParams.get('type') // movie | show
    const tmdbId = request.nextUrl.searchParams.get('tmdbId')

    if (type !== 'movie' && type !== 'show') {
        return NextResponse.json({ error: 'Invalid type. Use movie|show.' }, { status: 400 })
    }
    if (!tmdbId) {
        return NextResponse.json({ error: 'Missing tmdbId' }, { status: 400 })
    }

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

        const hit = await traktSearchByTmdb(token, { type, tmdbId })

        if (!hit) {
            const res = NextResponse.json({
                connected: true,
                found: false,
                traktUrl: null,
                watched: false,
                plays: 0,
                lastWatchedAt: null,
                history: []
            })
            if (refreshedTokens) setTraktCookies(res, refreshedTokens)
            return res
        }

        const obj = type === 'movie' ? hit.movie : hit.show
        const traktId = obj?.ids?.trakt

        let history = []
        if (traktId) {
            // sube el limit si quieres (20/30/50)
            history = await traktGetHistoryForItem(token, { type, traktId, limit: 30 })
        }

        const summary = computeHistorySummary({ searchHit: hit, history, type })

        const res = NextResponse.json({
            connected: true,
            ...summary,
            history: mapHistoryEntries(history)
        })

        if (refreshedTokens) setTraktCookies(res, refreshedTokens)
        return res
    } catch (e) {
        const res = NextResponse.json(
            { connected: true, error: e?.message || 'Trakt status failed' },
            { status: 500 }
        )
        if (refreshedTokens) setTraktCookies(res, refreshedTokens)
        return res
    }
}
