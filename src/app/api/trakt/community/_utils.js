// src/app/api/trakt/community/_utils.js
import { cookies } from 'next/headers'

const TRAKT_BASE = 'https://api.trakt.tv'

export function traktClientId() {
    return process.env.TRAKT_CLIENT_ID || process.env.NEXT_PUBLIC_TRAKT_CLIENT_ID || ''
}

export async function traktHeaders() {
    const clientId = traktClientId()

    const h = {
        'content-type': 'application/json',
        'trakt-api-version': '2',
        'trakt-api-key': clientId,
    }

    // ✅ Next (dynamic APIs): cookies() puede ser Promise -> hay que await
    const c = await cookies()

    const token =
        c.get('trakt_access_token')?.value ||
        c.get('traktAccessToken')?.value ||
        c.get('trakt_token')?.value ||
        ''

    if (token) h.authorization = `Bearer ${token}`
    return h
}

export async function resolveTraktIdFromTmdb({ type, tmdbId }) {
    const headers = await traktHeaders()

    const url = `${TRAKT_BASE}/search/tmdb/${encodeURIComponent(
        String(tmdbId)
    )}?type=${encodeURIComponent(type)}`

    const res = await fetch(url, { headers, cache: 'no-store' })
    const json = await res.json().catch(() => null)

    if (!res.ok) {
        const msg = json?.error || json?.message || 'Error resolviendo ID en Trakt'
        throw new Error(msg)
    }

    const first = Array.isArray(json) ? json[0] : null
    const item = first?.[type] || null
    const traktId = item?.ids?.trakt || null
    const slug = item?.ids?.slug || null

    if (!traktId) throw new Error('No se encontró el item en Trakt para ese TMDb ID')
    return { traktId, slug }
}

export function readPaginationHeaders(res) {
    const itemCount = Number(res.headers.get('x-pagination-item-count') || 0)
    const pageCount = Number(res.headers.get('x-pagination-page-count') || 0)
    const page = Number(res.headers.get('x-pagination-page') || 1)
    const limit = Number(res.headers.get('x-pagination-limit') || 0)
    return {
        itemCount: Number.isFinite(itemCount) ? itemCount : 0,
        pageCount: Number.isFinite(pageCount) ? pageCount : 0,
        page: Number.isFinite(page) ? page : 1,
        limit: Number.isFinite(limit) ? limit : 0,
    }
}
