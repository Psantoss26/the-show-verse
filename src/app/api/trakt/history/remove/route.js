import { NextResponse } from 'next/server'
import {
    getValidTraktToken,
    setTraktCookies,
    clearTraktCookies,
    traktRemoveHistoryEntries
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
        const ids = Array.isArray(body?.ids) ? body.ids.map((x) => Number(x)).filter((n) => Number.isFinite(n) && n > 0) : []
        if (!ids.length) return NextResponse.json({ error: 'ids debe ser un array con history ids' }, { status: 400 })

        const out = await traktRemoveHistoryEntries(token, { ids })

        const res = NextResponse.json({ ok: true, data: out }, { headers: { 'Cache-Control': 'no-store' } })
        if (refreshedTokens) setTraktCookies(res, refreshedTokens)
        return res
    } catch (e) {
        return NextResponse.json({ error: e?.message || 'Error eliminando del historial' }, { status: 500 })
    }
}
