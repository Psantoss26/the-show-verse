import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'

import {
    readTraktCookies,
    tokenIsExpired,
    refreshAccessToken,
    setTraktCookies,
    traktGetUserSettings,
    traktSearchByTmdb,
    traktGetHistoryForItem,
    computeHistorySummary,
    mapHistoryEntries,
} from '@/lib/trakt/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function getValidTokenAndMaybeRefresh() {
    const store = await cookies()
    const { accessToken, refreshToken, expiresAtMs } = readTraktCookies(store)

    if (!accessToken) {
        return { token: null, refreshed: null }
    }

    // si no expira, ok
    if (!tokenIsExpired(expiresAtMs)) {
        return { token: accessToken, refreshed: null }
    }

    // expira y no hay refresh
    if (!refreshToken) {
        return { token: accessToken, refreshed: null }
    }

    // refresh
    try {
        const refreshed = await refreshAccessToken(refreshToken)
        return { token: refreshed.access_token, refreshed }
    } catch {
        // si falla refresh, devolvemos el viejo (el handler hará 401 si no sirve)
        return { token: accessToken, refreshed: null }
    }
}

export async function GET(req) {
    const { searchParams } = new URL(req.url)
    const type = searchParams.get('type') // 'movie' | 'show'
    const tmdbId = searchParams.get('tmdbId')

    if (!type || !tmdbId) {
        return NextResponse.json({ error: 'Missing type or tmdbId' }, { status: 400 })
    }
    if (type !== 'movie' && type !== 'show') {
        return NextResponse.json({ error: 'Invalid type (expected movie|show)' }, { status: 400 })
    }

    const { token, refreshed } = await getValidTokenAndMaybeRefresh()

    // no conectado
    if (!token) {
        return NextResponse.json({
            connected: false,
            found: false,
            traktUrl: null,
            watched: false,
            plays: 0,
            lastWatchedAt: null,
            history: [],
        })
    }

    // valida token (si falla -> 401 y connected false)
    try {
        await traktGetUserSettings(token)
    } catch {
        return NextResponse.json(
            {
                connected: false,
                found: false,
                traktUrl: null,
                watched: false,
                plays: 0,
                lastWatchedAt: null,
                history: [],
                error: 'Trakt auth check failed',
            },
            { status: 401 }
        )
    }

    let searchHit = null
    let historyRaw = []

    try {
        searchHit = await traktSearchByTmdb(token, { type, tmdbId })

        if (searchHit) {
            const obj = type === 'movie' ? searchHit.movie : searchHit.show
            const traktId = obj?.ids?.trakt || null

            if (traktId) {
                // sube el límite para que el modal tenga “últimos” de verdad
                historyRaw = await traktGetHistoryForItem(token, { type, traktId, limit: 25 })
            }
        }
    } catch (e) {
        return NextResponse.json(
            { error: e?.message || 'Trakt status failed' },
            { status: 500 }
        )
    }

    const summary = computeHistorySummary({ searchHit, history: historyRaw, type })
    const history = mapHistoryEntries(historyRaw) // ✅ ESTO ES LO QUE TE FALTA

    const res = NextResponse.json({
        connected: true,
        ...summary,
        history, // ✅ YA llega al modal
        // si tu UI espera estos campos, los dejamos:
        inWatchlist: false,
        rating: null,
        progress: null,
    })

    // si hubo refresh, actualiza cookies
    if (refreshed) {
        setTraktCookies(res, refreshed)
    }

    return res
}
