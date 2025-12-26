import { NextResponse } from 'next/server'
import { traktApi, normalizeWatchedAt } from '@/lib/trakt/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req) {
    try {
        const { type, tmdbId, historyId, watchedAt } = await req.json()
        if (!type || !tmdbId || !historyId) {
            return NextResponse.json({ error: 'Falta type, tmdbId o historyId' }, { status: 400 })
        }

        const iso = normalizeWatchedAt(watchedAt)
        if (!iso) return NextResponse.json({ error: 'watchedAt inválido (usa YYYY-MM-DD)' }, { status: 400 })

        // 1) añadir el nuevo play (no pierdes historial si algo falla luego)
        const key = type === 'show' ? 'shows' : 'movies'
        await traktApi('/sync/history', {
            method: 'POST',
            body: { [key]: [{ ids: { tmdb: Number(tmdbId) }, watched_at: iso }] }
        })

        // 2) borrar el play antiguo
        await traktApi('/sync/history/remove', {
            method: 'POST',
            body: { ids: [Number(historyId)] }
        })

        return NextResponse.json({ ok: true })
    } catch (e) {
        return NextResponse.json({ error: e?.message || 'Error' }, { status: e?.status || 500 })
    }
}
