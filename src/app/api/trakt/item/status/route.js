// src/app/api/trakt/item/status/route.js
import { NextResponse } from 'next/server'
import {
    getValidTraktToken,
    setTraktCookies,
    clearTraktCookies,
    traktApi,
    traktSearchByTmdb,
    traktGetHistoryForItem,
    computeHistorySummary,
    mapHistoryEntries
} from '@/lib/trakt/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request) {
    const type = request.nextUrl.searchParams.get('type') // movie | show
    const tmdbId = request.nextUrl.searchParams.get('tmdbId')

    if (type !== 'movie' && type !== 'show') {
        return NextResponse.json({ error: 'Invalid type. Use movie|show.' }, { status: 400 })
    }
    if (!tmdbId) {
        return NextResponse.json({ error: 'Missing tmdbId' }, { status: 400 })
    }

    const cookieStore = request.cookies
    let token = null
    let refreshedTokens = null
    let shouldClear = false

    try {
        const t = await getValidTraktToken(cookieStore)
        token = t.token
        refreshedTokens = t.refreshedTokens
        shouldClear = t.shouldClear

        if (!token) {
            const res = NextResponse.json({ connected: false })
            if (shouldClear) clearTraktCookies(res)
            return res
        }

        // ✅ auth check: si 401/403 => desconectado + limpiar cookies
        const auth = await traktApi('/users/settings', { token })
        if (!auth.ok) {
            const res = NextResponse.json({ connected: false })
            clearTraktCookies(res)
            return res
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
            { connected: false, error: e?.message || 'Trakt status failed' },
            { status: 500 }
        )
        // si refrescó antes de fallar, guardamos cookies igualmente
        if (refreshedTokens) setTraktCookies(res, refreshedTokens)
        return res
    }
}
