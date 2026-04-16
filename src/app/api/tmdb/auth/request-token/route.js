import { NextResponse } from 'next/server'
import { headers } from 'next/headers'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const TMDB = 'https://api.themoviedb.org/3'
const API_KEY = process.env.TMDB_API_KEY || process.env.NEXT_PUBLIC_TMDB_API_KEY

function cleanOrigin(s) {
    return String(s || '').replace(/\/+$/, '')
}

async function resolveOrigin(req) {
    const forced =
        process.env.TMDB_APP_ORIGIN ||
        process.env.NEXT_PUBLIC_APP_ORIGIN ||
        process.env.NEXT_PUBLIC_APP_URL ||
        process.env.APP_URL

    if (forced) return cleanOrigin(forced)

    const nextOrigin = req?.nextUrl?.origin
    if (nextOrigin && nextOrigin !== 'null') return cleanOrigin(nextOrigin)

    const h = await headers()
    const proto = (h.get('x-forwarded-proto') || 'http').split(',')[0].trim()
    const host = (h.get('x-forwarded-host') || h.get('host') || '')
        .split(',')[0]
        .trim()

    if (host) return `${proto}://${host}`
    if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`

    return 'http://localhost:3000'
}

export async function GET(req) {
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

        const origin = await resolveOrigin(req)
        const redirect_to = `${origin}/auth/callback`
        const authenticate_url =
            `https://www.themoviedb.org/authenticate/${json.request_token}` +
            `?redirect_to=${encodeURIComponent(redirect_to)}`

        return NextResponse.json({
            request_token: json.request_token,
            expires_at: json.expires_at,
            redirect_to,
            authenticate_url,
        })
    } catch (e) {
        return NextResponse.json({ error: e?.message || 'Request token error' }, { status: 500 })
    }
}
