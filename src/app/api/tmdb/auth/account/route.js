import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const TMDB = 'https://api.themoviedb.org/3'
const API_KEY = process.env.TMDB_API_KEY || process.env.NEXT_PUBLIC_TMDB_API_KEY

export async function GET(req) {
    try {
        if (!API_KEY) {
            return NextResponse.json({ error: 'Missing TMDB API key' }, { status: 500 })
        }

        const { searchParams } = new URL(req.url)
        const session_id = searchParams.get('session_id')
        if (!session_id) {
            return NextResponse.json({ error: 'Missing session_id' }, { status: 400 })
        }

        const url =
            `${TMDB}/account?api_key=${encodeURIComponent(API_KEY)}` +
            `&session_id=${encodeURIComponent(session_id)}`

        const res = await fetch(url, { cache: 'no-store', headers: { Accept: 'application/json' } })
        const json = await res.json().catch(() => ({}))

        if (!res.ok || json?.success === false) {
            return NextResponse.json(
                { error: json?.status_message || `TMDb ${res.status}` },
                { status: 500 }
            )
        }

        return NextResponse.json(json)
    } catch (e) {
        return NextResponse.json({ error: e?.message || 'Account error' }, { status: 500 })
    }
}