// src/app/api/trakt/ratings/route.js
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { traktFetch } from '@/lib/trakt/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const TRAKT_API = 'https://api.trakt.tv'

function requireEnv(name) {
    const v = process.env[name]
    if (!v) throw new Error(`Missing env var: ${name}`)
    return v
}

function traktHeaders(token) {
    return {
        'Content-Type': 'application/json',
        'trakt-api-version': '2',
        'trakt-api-key': requireEnv('TRAKT_CLIENT_ID'),
        Authorization: `Bearer ${token}`,
    }
}

// Acepta: movie | show | episode | tv
function normalizeType(input) {
    const t = String(input || '').toLowerCase().trim()
    if (t === 'tv' || t === 'show') return 'show'
    if (t === 'movie') return 'movie'
    if (t === 'episode') return 'episode'
    return null
}

function typeToArrayKey(type) {
    if (type === 'movie') return 'movies'
    if (type === 'show') return 'shows'
    if (type === 'episode') return 'episodes'
    return null
}

async function readJsonSafe(req) {
    try {
        return await req.json()
    } catch {
        return null
    }
}

function normalizeIds(payload) {
    // Si ya viene ids (ej: { tmdb: 123 }), úsalo
    if (payload?.ids && typeof payload.ids === 'object') return payload.ids

    // Soporta tmdbId directo (por si tu front envía tmdbId)
    const tmdbId = payload?.tmdbId ?? payload?.tmdb
    if (tmdbId != null) return { tmdb: Number(tmdbId) }

    return null
}

export async function POST(req) {
    const body = await req.json().catch(() => ({}))

    const type = body?.type
    const ids = body?.ids ?? (body?.tmdbId ? { tmdb: Number(body.tmdbId) } : null)

    // ✅ rating puede ser null para borrar, pero tiene que existir la key
    const hasRatingKey = Object.prototype.hasOwnProperty.call(body, 'rating')
    const rating = body?.rating

    if (!type || !ids?.tmdb || !hasRatingKey) {
        return NextResponse.json(
            { error: 'Missing type/ids/rating' },
            { status: 400 }
        )
    }

    // normaliza
    const tmdb = Number(ids.tmdb)
    if (!Number.isFinite(tmdb)) {
        return NextResponse.json({ error: 'Invalid ids.tmdb' }, { status: 400 })
    }

    const isRemove = rating == null
    const intRating = isRemove ? null : Math.round(Number(rating))

    if (!isRemove && !(intRating >= 1 && intRating <= 10)) {
        return NextResponse.json({ error: 'Invalid rating (1..10)' }, { status: 400 })
    }

    // Trakt: payload por tipo
    const key = type === 'show' ? 'shows' : type === 'movie' ? 'movies' : null
    if (!key) {
        return NextResponse.json({ error: 'Invalid type (use "movie" or "show")' }, { status: 400 })
    }

    const item = isRemove ? { ids: { tmdb } } : { ids: { tmdb }, rating: intRating }
    const payload = { [key]: [item] }

    // ✅ endpoint Trakt correcto según sea add o remove
    const path = isRemove ? '/sync/ratings/remove' : '/sync/ratings'

    const traktRes = await traktFetch(path, {
        method: 'POST',
        body: JSON.stringify(payload)
    })

    return NextResponse.json(traktRes, { status: 200 })
}

export async function DELETE(req) {
    try {
        const cookieStore = await cookies()
        const token = cookieStore.get('trakt_access_token')?.value
        if (!token) {
            return NextResponse.json({ error: 'Not authenticated with Trakt' }, { status: 401 })
        }

        const payload = await readJsonSafe(req)
        const type = normalizeType(payload?.type)
        const ids = normalizeIds(payload)

        if (!type || !ids) {
            return NextResponse.json({ error: 'Missing type/ids' }, { status: 400 })
        }

        const key = typeToArrayKey(type)
        const body = { [key]: [{ ids }] }

        const r = await fetch(`${TRAKT_API}/sync/ratings/remove`, {
            method: 'POST',
            headers: traktHeaders(token),
            body: JSON.stringify(body),
            cache: 'no-store',
        })

        const data = await r.json().catch(() => ({}))
        if (!r.ok) {
            return NextResponse.json(
                { error: data?.error || data?.message || 'Trakt remove rating failed', details: data },
                { status: r.status }
            )
        }

        return NextResponse.json(data)
    } catch (e) {
        return NextResponse.json({ error: 'Unexpected error', details: e?.stack || String(e) }, { status: 500 })
    }
}
