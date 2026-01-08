import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const TMDB = 'https://api.themoviedb.org/3'
const API_KEY = process.env.NEXT_PUBLIC_TMDB_API_KEY

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

export async function POST(req) {
    if (!API_KEY) {
        return NextResponse.json({ error: 'Falta NEXT_PUBLIC_TMDB_API_KEY' }, { status: 500 })
    }

    // ✅ Lee cookies desde el request (sin cookies() async)
    const existing = req.cookies?.get?.('tmdb_session_id')?.value
    if (existing) {
        return NextResponse.json({ ok: true, session_id: existing, reused: true })
    }

    let body = {}
    try { body = await req.json() } catch { }

    const request_token = body?.request_token || body?.requestToken
    if (!request_token) {
        return NextResponse.json({ error: 'Falta request_token' }, { status: 400 })
    }

    const url = `${TMDB}/authentication/session/new?api_key=${encodeURIComponent(API_KEY)}`
    const MAX = 4

    for (let attempt = 1; attempt <= MAX; attempt++) {
        const r = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json;charset=utf-8',
                Accept: 'application/json'
            },
            body: JSON.stringify({ request_token })
        })

        const data = await r.json().catch(() => ({}))

        if (r.ok && data?.success && data?.session_id) {
            const res = NextResponse.json({ ok: true, session_id: data.session_id })

            res.cookies.set('tmdb_session_id', data.session_id, {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'lax',
                path: '/',
                maxAge: 60 * 60 * 24 * 30
            })

            return res
        }

        const msg = data?.status_message || `TMDb ${r.status}`
        const retriable = data?.status_code === 17 || /session denied/i.test(msg)

        // ✅ Pequeño retry por la latencia tras “Aprobar”
        if (retriable && attempt < MAX) {
            await sleep(250 * attempt)
            continue
        }

        return NextResponse.json({ error: msg, status_code: data?.status_code }, { status: 500 })
    }

    return NextResponse.json({ error: 'No se pudo crear la sesión' }, { status: 500 })
}