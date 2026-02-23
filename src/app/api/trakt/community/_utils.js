// src/app/api/trakt/community/_utils.js
import { cookies } from 'next/headers'

const TRAKT_BASE = 'https://api.trakt.tv'

export function traktClientId() {
    return process.env.TRAKT_CLIENT_ID || process.env.NEXT_PUBLIC_TRAKT_CLIENT_ID || ''
}

function traktUserAgent() {
    return process.env.TRAKT_USER_AGENT || 'TheShowVerse/1.0 (Next.js; Trakt Community)'
}

export async function traktHeaders({ includeAuth = false } = {}) {
    const clientId = traktClientId()

    const h = {
        'content-type': 'application/json',
        accept: 'application/json',
        'trakt-api-version': '2',
        'trakt-api-key': clientId,
        'user-agent': traktUserAgent(),
    }

    if (!includeAuth) return h

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

export async function safeTraktBody(res) {
    const raw = await res.text().catch(() => '')
    if (!raw) return { json: null, text: '' }
    try {
        return { json: JSON.parse(raw), text: raw }
    } catch {
        return { json: null, text: raw }
    }
}

export function buildTraktErrorMessage({ res, json, text, fallback }) {
    const isCloudflare =
        Number(res?.status) === 403 && /cloudflare|attention required/i.test(String(text || ''))
    if (isCloudflare) {
        return 'Trakt/Cloudflare bloqueó temporalmente la petición de comunidad'
    }
    return json?.error || json?.message || fallback
}

export async function resolveTraktIdFromTmdb({ type, tmdbId }) {
    const headers = await traktHeaders()

    const url = `${TRAKT_BASE}/search/tmdb/${encodeURIComponent(
        String(tmdbId)
    )}?type=${encodeURIComponent(type)}`

    const res = await fetch(url, { headers, cache: 'no-store' })
    const { json, text } = await safeTraktBody(res)

    if (!res.ok) {
        const msg = buildTraktErrorMessage({
            res,
            json,
            text,
            fallback: 'Error resolviendo ID en Trakt'
        })
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
