// src/app/api/trakt/item/watched/route.js
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import {
    readTraktCookies,
    tokenIsExpired,
    refreshAccessToken,
    setTraktCookies,
    normalizeWatchedAt,
    traktAddToHistory,
    traktRemoveFromHistory,
} from '@/lib/trakt/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request) {
    const cookieStore = await cookies()
    const { accessToken, refreshToken, expiresAtMs } = readTraktCookies(cookieStore)

    if (!accessToken && !refreshToken) {
        return NextResponse.json({ error: 'Not connected to Trakt' }, { status: 401 })
    }

    let payload = null
    try {
        payload = await request.json()
    } catch {
        return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
    }

    const type = payload?.type // movie | show
    const tmdbId = payload?.tmdbId
    const watched = !!payload?.watched
    const watchedAt = payload?.watchedAt || null

    if (type !== 'movie' && type !== 'show') {
        return NextResponse.json({ error: 'Invalid type. Use movie|show.' }, { status: 400 })
    }
    if (!tmdbId) {
        return NextResponse.json({ error: 'Missing tmdbId' }, { status: 400 })
    }

    let token = accessToken
    let refreshedTokens = null

    try {
        if (!token || tokenIsExpired(expiresAtMs)) {
            if (!refreshToken) return NextResponse.json({ error: 'Not connected to Trakt' }, { status: 401 })
            refreshedTokens = await refreshAccessToken(refreshToken)
            token = refreshedTokens.access_token
        }

        if (watched) {
            const watchedAtIso = normalizeWatchedAt(watchedAt)
            await traktAddToHistory(token, { type, tmdbId, watchedAtIso })

            const res = NextResponse.json({
                ok: true,
                watched: true,
                lastWatchedAt: watchedAtIso,
            })
            if (refreshedTokens) setTraktCookies(res, refreshedTokens)
            return res
        } else {
            await traktRemoveFromHistory(token, { type, tmdbId })

            const res = NextResponse.json({
                ok: true,
                watched: false,
                lastWatchedAt: null,
            })
            if (refreshedTokens) setTraktCookies(res, refreshedTokens)
            return res
        }
    } catch (e) {
        // Si falla por 401 real, intenta refresh una vez
        try {
            if (!refreshToken) throw e
            refreshedTokens = await refreshAccessToken(refreshToken)
            token = refreshedTokens.access_token

            if (watched) {
                const watchedAtIso = normalizeWatchedAt(watchedAt)
                await traktAddToHistory(token, { type, tmdbId, watchedAtIso })
                const res = NextResponse.json({ ok: true, watched: true, lastWatchedAt: watchedAtIso })
                setTraktCookies(res, refreshedTokens)
                return res
            } else {
                await traktRemoveFromHistory(token, { type, tmdbId })
                const res = NextResponse.json({ ok: true, watched: false, lastWatchedAt: null })
                setTraktCookies(res, refreshedTokens)
                return res
            }
        } catch (err2) {
            const res = NextResponse.json(
                { ok: false, error: err2?.message || e?.message || 'Trakt watched failed' },
                { status: 500 }
            )
            if (refreshedTokens) setTraktCookies(res, refreshedTokens)
            return res
        }
    }
}
