import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const TMDB = 'https://api.themoviedb.org/3'
const API_KEY = process.env.TMDB_API_KEY || process.env.NEXT_PUBLIC_TMDB_API_KEY

export async function GET() {
    try {
        if (!API_KEY) {
            return NextResponse.json({ error: 'Missing TMDB API key' }, { status: 500 })
        }

        const url = `${TMDB}/authentication/token/new?api_key=${encodeURIComponent(API_KEY)}`
        const res = await fetch(url, { cache: 'no-store', headers: { Accept: 'application/json' } })
        const json = await res.json().catch(() => ({}))

        if (!res.ok || !json?.success) {
            return NextResponse.json(
                { error: json?.status_message || `TMDb ${res.status}` },
                { status: 500 }
            )
        }

        return NextResponse.json({ request_token: json.request_token, expires_at: json.expires_at })
    } catch (e) {
        return NextResponse.json({ error: e?.message || 'Request token error' }, { status: 500 })
    }
}