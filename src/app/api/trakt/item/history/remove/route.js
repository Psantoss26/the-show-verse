import { NextResponse } from 'next/server'
import { traktApi } from '@/lib/trakt/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req) {
    try {
        const { historyId } = await req.json()
        if (!historyId) return NextResponse.json({ error: 'Falta historyId' }, { status: 400 })

        const json = await traktApi('/sync/history/remove', {
            method: 'POST',
            body: { ids: [Number(historyId)] }
        })

        return NextResponse.json({ ok: true, trakt: json })
    } catch (e) {
        return NextResponse.json({ error: e?.message || 'Error' }, { status: e?.status || 500 })
    }
}
