import { NextResponse } from 'next/server'
import { traktApi, normalizeWatchedAt } from '@/lib/trakt/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req) {
    try {
        const { type, tmdbId, watchedAt } = await req.json()
        if (!type || !tmdbId) {
            return NextResponse.json({ error: 'Falta type o tmdbId' }, { status: 400 })
        }

        const iso = normalizeWatchedAt(watchedAt)
        if (!iso) return NextResponse.json({ error: 'watchedAt inválido (usa YYYY-MM-DD)' }, { status: 400 })

        const key = type === 'show' ? 'shows' : 'movies'
        const payload = {
            [key]: [{ ids: { tmdb: Number(tmdbId) }, watched_at: iso }]
        }

        const json = await traktApi('/sync/history', { method: 'POST', body: payload })
        return NextResponse.json({ ok: true, trakt: json })
    } catch (e) {
        return NextResponse.json({ error: e?.message || 'Error' }, { status: e?.status || 500 })
    }
}
