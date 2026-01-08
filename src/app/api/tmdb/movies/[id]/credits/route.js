import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const API_KEY = process.env.TMDB_API_KEY || process.env.NEXT_PUBLIC_TMDB_API_KEY

export async function GET(_req, { params }) {
    const { id } = await params // ✅ Next 15: params puede ser Promise

    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })
    if (!API_KEY) return NextResponse.json({ error: 'Missing TMDB API key' }, { status: 500 })

    const url = `https://api.themoviedb.org/3/movie/${id}/credits?api_key=${encodeURIComponent(API_KEY)}`
    const res = await fetch(url, { cache: 'no-store' })
    const json = await res.json().catch(() => ({}))

    if (!res.ok) {
        return NextResponse.json(
            { error: json?.status_message || 'TMDb error' },
            { status: res.status }
        )
    }

    return NextResponse.json(json)
}