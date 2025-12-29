// src/app/api/tmdb/ratings/route.js
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const TMDB_API = 'https://api.themoviedb.org/3'

function requireEnv(name) {
    const v = process.env[name]
    if (!v) throw new Error(`Missing env var: ${name}`)
    return v
}

function tmdbHeaders() {
    // Recomendado: TMDB_READ_ACCESS_TOKEN (Bearer)
    return {
        'Content-Type': 'application/json;charset=utf-8',
        Authorization: `Bearer ${requireEnv('TMDB_READ_ACCESS_TOKEN')}`,
    }
}

function normalizeMediaType(mediaType) {
    const t = String(mediaType || '').toLowerCase().trim()
    if (t === 'tv' || t === 'movie') return t
    if (t === 'show') return 'tv'
    return 'movie'
}

async function readJsonSafe(req) {
    try {
        return await req.json()
    } catch {
        return null
    }
}

export async function POST(req) {
    try {
        const payload = await readJsonSafe(req)
        const mediaType = normalizeMediaType(payload?.mediaType)
        const tmdbId = payload?.tmdbId
        const ratingRaw = payload?.rating

        if (!tmdbId || typeof ratingRaw !== 'number') {
            return NextResponse.json({ error: 'Missing mediaType/tmdbId/rating' }, { status: 400 })
        }

        // TMDb acepta 0.5..10 en pasos 0.5
        const rating = Math.max(0.5, Math.min(10, Math.round(ratingRaw * 2) / 2))

        // si usas session_id en cookie:
        const cookieStore = await cookies()
        const sessionId = cookieStore.get('tmdb_session_id')?.value
        if (!sessionId) {
            return NextResponse.json({ error: 'Not authenticated with TMDb' }, { status: 401 })
        }

        const r = await fetch(
            `${TMDB_API}/${mediaType}/${tmdbId}/rating?session_id=${encodeURIComponent(sessionId)}`,
            {
                method: 'POST',
                headers: tmdbHeaders(),
                body: JSON.stringify({ value: rating }),
                cache: 'no-store',
            }
        )

        const data = await r.json().catch(() => ({}))
        if (!r.ok) {
            return NextResponse.json(
                { error: data?.status_message || 'TMDb rating failed', details: data },
                { status: r.status }
            )
        }

        return NextResponse.json(data)
    } catch (e) {
        return NextResponse.json(
            { error: 'Unexpected error', details: e?.stack || String(e) },
            { status: 500 }
        )
    }
}

export async function DELETE(req) {
    try {
        const payload = await readJsonSafe(req)
        const mediaType = normalizeMediaType(payload?.mediaType)
        const tmdbId = payload?.tmdbId

        if (!tmdbId) {
            return NextResponse.json({ error: 'Missing mediaType/tmdbId' }, { status: 400 })
        }

        const cookieStore = await cookies()
        const sessionId = cookieStore.get('tmdb_session_id')?.value
        if (!sessionId) {
            return NextResponse.json({ error: 'Not authenticated with TMDb' }, { status: 401 })
        }

        const r = await fetch(
            `${TMDB_API}/${mediaType}/${tmdbId}/rating?session_id=${encodeURIComponent(sessionId)}`,
            {
                method: 'DELETE',
                headers: tmdbHeaders(),
                cache: 'no-store',
            }
        )

        const data = await r.json().catch(() => ({}))
        if (!r.ok) {
            return NextResponse.json(
                { error: data?.status_message || 'TMDb remove rating failed', details: data },
                { status: r.status }
            )
        }

        return NextResponse.json(data)
    } catch (e) {
        return NextResponse.json(
            { error: 'Unexpected error', details: e?.stack || String(e) },
            { status: 500 }
        )
    }
}
