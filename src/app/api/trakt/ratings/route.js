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

// Acepta: movie | show | season | episode | tv
function normalizeType(input) {
    const t = String(input || '').toLowerCase().trim()
    if (t === 'tv' || t === 'show') return 'show'
    if (t === 'movie') return 'movie'
    if (t === 'season' || t === 'seasons') return 'season'
    if (t === 'episode' || t === 'episodes') return 'episode'
    return null
}

function typeToArrayKey(type) {
    if (type === 'movie') return 'movies'
    if (type === 'show') return 'shows'
    if (type === 'season') return 'seasons'
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
    // si viene ids
    if (payload?.ids && typeof payload.ids === 'object') return payload.ids

    // soporte directo
    const tmdbId = payload?.tmdbId ?? payload?.tmdb
    const traktId = payload?.traktId ?? payload?.trakt

    const ids = {}
    if (tmdbId != null) ids.tmdb = Number(tmdbId)
    if (traktId != null) ids.trakt = Number(traktId)

    return Object.keys(ids).length ? ids : null
}

function isValidRating(r) {
    const n = Math.round(Number(r))
    return Number.isFinite(n) && n >= 1 && n <= 10
}

/**
 * ✅ GET rating actual del usuario
 * - movie/show: /api/trakt/ratings?type=show&tmdbId=1399
 * - season/episode: /api/trakt/ratings?type=season&traktId=12345
 */
export async function GET(req) {
    try {
        const { searchParams } = new URL(req.url)
        const type = normalizeType(searchParams.get('type'))
        const tmdbId = searchParams.get('tmdbId')
        const traktIdParam = searchParams.get('traktId') || searchParams.get('id')

        if (!type) {
            return NextResponse.json({ error: 'Missing/invalid type' }, { status: 400 })
        }

        const key = typeToArrayKey(type)
        if (!key) {
            return NextResponse.json({ error: 'Invalid type' }, { status: 400 })
        }

        let traktId = traktIdParam ? Number(traktIdParam) : null

        // Para movie/show permitimos tmdbId y resolvemos a trakt id con search
        if (!traktId && (type === 'movie' || type === 'show') && tmdbId) {
            const safeType = type // movie|show
            const search = await fetch(`${TRAKT_API}/search/tmdb/${tmdbId}?type=${safeType}`, {
                headers: {
                    'Content-Type': 'application/json',
                    'trakt-api-version': '2',
                    'trakt-api-key': requireEnv('TRAKT_CLIENT_ID'),
                },
                cache: 'no-store',
            })
            const json = await search.json().catch(() => null)
            const hit = Array.isArray(json) ? json[0] : null
            const item = hit?.[safeType]
            traktId = item?.ids?.trakt ? Number(item.ids.trakt) : null
        }

        // season/episode requieren traktId
        if (!Number.isFinite(traktId)) {
            return NextResponse.json(
                { error: 'Missing traktId (season/episode) or tmdbId (movie/show)' },
                { status: 400 }
            )
        }

        // Trakt devuelve array con el item
        const data = await traktFetch(`/sync/ratings/${key}/${traktId}`, { cache: 'no-store' })
        const item = Array.isArray(data) ? data[0] : null
        const rating = item?.rating ?? null

        return NextResponse.json({ rating })
    } catch (e) {
        return NextResponse.json({ error: e?.message || 'Unexpected error' }, { status: 500 })
    }
}

export async function POST(req) {
    const body = await req.json().catch(() => ({}))

    const type = normalizeType(body?.type)
    const ids = normalizeIds(body)

    const hasRatingKey = Object.prototype.hasOwnProperty.call(body, 'rating')
    const rating = body?.rating

    if (!type || !ids || !hasRatingKey) {
        return NextResponse.json({ error: 'Missing type/ids/rating' }, { status: 400 })
    }

    const key = typeToArrayKey(type)
    if (!key) {
        return NextResponse.json({ error: 'Invalid type' }, { status: 400 })
    }

    const isRemove = rating == null

    if (!isRemove && !isValidRating(rating)) {
        return NextResponse.json({ error: 'Invalid rating (1..10)' }, { status: 400 })
    }

    // ✅ Reglas de ids:
    // - movie/show: puede usar tmdb (como hasta ahora) o trakt
    // - season/episode: requiere trakt
    if ((type === 'season' || type === 'episode') && !Number.isFinite(Number(ids?.trakt))) {
        return NextResponse.json({ error: 'Missing ids.trakt for season/episode' }, { status: 400 })
    }
    if ((type === 'movie' || type === 'show') && !(Number.isFinite(Number(ids?.tmdb)) || Number.isFinite(Number(ids?.trakt)))) {
        return NextResponse.json({ error: 'Missing ids.tmdb (or ids.trakt) for movie/show' }, { status: 400 })
    }

    const cleanIds = {}
    if (Number.isFinite(Number(ids?.trakt))) cleanIds.trakt = Number(ids.trakt)
    if (Number.isFinite(Number(ids?.tmdb))) cleanIds.tmdb = Number(ids.tmdb)

    const intRating = isRemove ? null : Math.round(Number(rating))

    const item = isRemove ? { ids: cleanIds } : { ids: cleanIds, rating: intRating }
    const payload = { [key]: [item] }

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
        if (!key) {
            return NextResponse.json({ error: 'Invalid type' }, { status: 400 })
        }

        // season/episode requieren trakt
        if ((type === 'season' || type === 'episode') && !Number.isFinite(Number(ids?.trakt))) {
            return NextResponse.json({ error: 'Missing ids.trakt for season/episode' }, { status: 400 })
        }

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
