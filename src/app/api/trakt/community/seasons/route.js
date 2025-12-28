// src/app/api/trakt/community/seasons/route.js
import { NextResponse } from 'next/server'
import { resolveTraktIdFromTmdb, traktHeaders } from '../_utils'

export const dynamic = 'force-dynamic'

export async function GET(req) {
    try {
        const { searchParams } = new URL(req.url)
        const tmdbId = searchParams.get('tmdbId')
        const extended = searchParams.get('extended') || 'full' // full recomendado

        if (!tmdbId) return NextResponse.json({ error: 'Falta tmdbId' }, { status: 400 })

        const { traktId } = await resolveTraktIdFromTmdb({ type: 'show', tmdbId })
        const headers = await traktHeaders()

        const url = `https://api.trakt.tv/shows/${traktId}/seasons?extended=${encodeURIComponent(extended)}`
        const res = await fetch(url, { headers, cache: 'no-store' })
        const json = await res.json().catch(() => null)

        if (!res.ok) {
            const msg = json?.error || json?.message || 'Error cargando temporadas'
            return NextResponse.json({ error: msg }, { status: res.status })
        }

        return NextResponse.json({ items: Array.isArray(json) ? json : [] })
    } catch (e) {
        return NextResponse.json({ error: e?.message || 'Error' }, { status: 500 })
    }
}
