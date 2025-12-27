import { NextResponse } from 'next/server'
import {
    getValidTraktToken,
    setTraktCookies,
    clearTraktCookies,
    normalizeWatchedAt,
    traktRemoveHistoryEntries,
    traktFetch
} from '@/lib/trakt/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request) {
    try {
        const cookieStore = request.cookies
        const { token, refreshedTokens, shouldClear } = await getValidTraktToken(cookieStore)

        if (!token) {
            const res = NextResponse.json({ error: 'No autorizado' }, { status: 401 })
            if (shouldClear) clearTraktCookies(res)
            return res
        }

        const body = await request.json().catch(() => ({}))
        const historyId = Number(body?.historyId)
        const target = body?.target
        const watchedAtIso = normalizeWatchedAt(body?.watchedAt)

        if (!historyId || !target?.kind || !target?.traktId) {
            return NextResponse.json({ error: 'historyId y target son requeridos' }, { status: 400 })
        }

        // 1) remove old
        await traktRemoveHistoryEntries(token, { ids: [historyId] })

        // 2) add again with new watched_at
        let payload = null

        if (target.kind === 'movie') {
            payload = { movies: [{ ids: { trakt: Number(target.traktId) }, watched_at: watchedAtIso }] }
        } else if (target.kind === 'episode') {
            payload = { episodes: [{ ids: { trakt: Number(target.traktId) }, watched_at: watchedAtIso }] }
        } else if (target.kind === 'show_episode') {
            const season = Number(target.season)
            const episode = Number(target.episode)
            if (!season || !episode) return NextResponse.json({ error: 'season/episode requerido para show_episode' }, { status: 400 })

            payload = {
                shows: [{
                    ids: { trakt: Number(target.traktId) },
                    seasons: [{ number: season, episodes: [{ number: episode, watched_at: watchedAtIso }] }]
                }]
            }
        } else {
            return NextResponse.json({ error: 'target.kind inválido' }, { status: 400 })
        }

        const added = await traktFetch('/sync/history', { token, method: 'POST', body: payload })
        if (!added.ok) return NextResponse.json({ error: 'Error Trakt al añadir' }, { status: added.status })

        const res = NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } })
        if (refreshedTokens) setTraktCookies(res, refreshedTokens)
        return res
    } catch (e) {
        return NextResponse.json({ error: e?.message || 'Error' }, { status: 500 })
    }
}
