// src/app/api/trakt/item/history/route.js
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import {
    readTraktCookies,
    tokenIsExpired,
    refreshAccessToken,
    setTraktCookies,
    normalizeWatchedAt,
    traktAddToHistory,
    traktRemoveHistoryEntries
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

    const op = String(payload?.op || '').trim() // add | update | remove
    const type = payload?.type // movie | show
    const tmdbId = payload?.tmdbId
    const watchedAt = payload?.watchedAt || null
    const historyId = payload?.historyId

    if (op !== 'add' && op !== 'update' && op !== 'remove') {
        return NextResponse.json({ error: 'Invalid op. Use add|update|remove.' }, { status: 400 })
    }

    if (op !== 'remove') {
        if (type !== 'movie' && type !== 'show') {
            return NextResponse.json({ error: 'Invalid type. Use movie|show.' }, { status: 400 })
        }
        if (!tmdbId) return NextResponse.json({ error: 'Missing tmdbId' }, { status: 400 })
    }

    if ((op === 'update' || op === 'remove') && !historyId) {
        return NextResponse.json({ error: 'Missing historyId' }, { status: 400 })
    }

    let token = accessToken
    let refreshedTokens = null

    const ensureToken = async () => {
        if (!token || tokenIsExpired(expiresAtMs)) {
            if (!refreshToken) throw new Error('Not connected to Trakt')
            refreshedTokens = await refreshAccessToken(refreshToken)
            token = refreshedTokens.access_token
        }
    }

    try {
        await ensureToken()

        // ✅ op: add => añade UN nuevo visionado (no borra los anteriores)
        if (op === 'add') {
            const watchedAtIso = normalizeWatchedAt(watchedAt)
            await traktAddToHistory(token, { type, tmdbId, watchedAtIso })

            const res = NextResponse.json({ ok: true })
            if (refreshedTokens) setTraktCookies(res, refreshedTokens)
            return res
        }

        // ✅ op: update => remove entry (historyId) + add con nueva fecha
        if (op === 'update') {
            const watchedAtIso = normalizeWatchedAt(watchedAt)
            await traktRemoveHistoryEntries(token, { ids: [historyId] })
            await traktAddToHistory(token, { type, tmdbId, watchedAtIso })

            const res = NextResponse.json({ ok: true })
            if (refreshedTokens) setTraktCookies(res, refreshedTokens)
            return res
        }

        // ✅ op: remove => quita SOLO ese visionado (no todos)
        if (op === 'remove') {
            await traktRemoveHistoryEntries(token, { ids: [historyId] })

            const res = NextResponse.json({ ok: true })
            if (refreshedTokens) setTraktCookies(res, refreshedTokens)
            return res
        }
    } catch (e) {
        // reintento con refresh 1 vez
        try {
            if (!refreshToken) throw e
            refreshedTokens = await refreshAccessToken(refreshToken)
            token = refreshedTokens.access_token

            if (op === 'add') {
                const watchedAtIso = normalizeWatchedAt(watchedAt)
                await traktAddToHistory(token, { type, tmdbId, watchedAtIso })
            } else if (op === 'update') {
                const watchedAtIso = normalizeWatchedAt(watchedAt)
                await traktRemoveHistoryEntries(token, { ids: [historyId] })
                await traktAddToHistory(token, { type, tmdbId, watchedAtIso })
            } else if (op === 'remove') {
                await traktRemoveHistoryEntries(token, { ids: [historyId] })
            }

            const res = NextResponse.json({ ok: true })
            setTraktCookies(res, refreshedTokens)
            return res
        } catch (err2) {
            const res = NextResponse.json(
                { ok: false, error: err2?.message || e?.message || 'Trakt history op failed' },
                { status: 500 }
            )
            if (refreshedTokens) setTraktCookies(res, refreshedTokens)
            return res
        }
    }
}
