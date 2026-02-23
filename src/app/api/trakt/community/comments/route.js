// src/app/api/trakt/community/comments/route.js
import { NextResponse } from 'next/server'
import {
    resolveTraktIdFromTmdb,
    traktHeaders,
    readPaginationHeaders,
    safeTraktBody,
    buildTraktErrorMessage,
} from '../_utils'

export const dynamic = 'force-dynamic'

export async function GET(req) {
    try {
        const { searchParams } = new URL(req.url)
        const type = (searchParams.get('type') || '').toLowerCase() // movie | show
        const tmdbId = searchParams.get('tmdbId')
        const sort = (searchParams.get('sort') || 'likes').toLowerCase() // likes | newest | oldest | replies
        const page = searchParams.get('page') || '1'
        const limit = searchParams.get('limit') || '20'

        if (!tmdbId) return NextResponse.json({ error: 'Falta tmdbId' }, { status: 400 })
        if (type !== 'movie' && type !== 'show')
            return NextResponse.json({ error: 'type debe ser movie o show' }, { status: 400 })

        const { traktId } = await resolveTraktIdFromTmdb({ type, tmdbId })

        const headers = await traktHeaders({ includeAuth: false })
        const base = type === 'movie' ? 'movies' : 'shows'
        const url = `https://api.trakt.tv/${base}/${traktId}/comments/${sort}?page=${encodeURIComponent(
            page
        )}&limit=${encodeURIComponent(limit)}`

        const res = await fetch(url, { headers, cache: 'no-store' })
        const { json, text } = await safeTraktBody(res)

        if (!res.ok) {
            const msg = buildTraktErrorMessage({
                res,
                json,
                text,
                fallback: 'Error cargando comentarios'
            })
            return NextResponse.json({ error: msg }, { status: res.status })
        }

        const pg = readPaginationHeaders(res)
        return NextResponse.json({
            items: Array.isArray(json) ? json : [],
            pagination: pg
        })
    } catch (e) {
        return NextResponse.json({ error: e?.message || 'Error' }, { status: 500 })
    }
}
