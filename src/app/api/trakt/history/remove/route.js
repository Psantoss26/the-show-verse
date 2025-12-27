import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'

export const dynamic = 'force-dynamic'

const TRAKT_BASE = 'https://api.trakt.tv'
const TRAKT_API_VERSION = '2'
const CLIENT_ID =
    process.env.TRAKT_CLIENT_ID ||
    process.env.NEXT_PUBLIC_TRAKT_CLIENT_ID ||
    ''

const TOKEN_COOKIE_CANDIDATES = [
    'trakt_access_token',
    'traktAccessToken',
    'access_token',
    'trakt_token',
    'trakt_auth'
]

async function readAccessToken(req) {
    // ✅ fallback por header (opcional)
    const h = req.headers.get('authorization')
    if (h && h.toLowerCase().startsWith('bearer ')) return h.slice(7)

    // ✅ Next 15: cookies() puede ser async
    const store = await cookies()

    for (const key of TOKEN_COOKIE_CANDIDATES) {
        const v = store.get(key)?.value
        if (!v) continue

        if (key === 'trakt_access_token' || key === 'traktAccessToken' || key === 'access_token') return v

        try {
            const parsed = JSON.parse(v)
            if (parsed?.access_token) return parsed.access_token
        } catch { }
    }
    return null
}

async function traktPost(path, token, body) {
    if (!CLIENT_ID) throw new Error('Falta TRAKT_CLIENT_ID')

    const res = await fetch(`${TRAKT_BASE}${path}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'trakt-api-version': TRAKT_API_VERSION,
            'trakt-api-key': CLIENT_ID,
            Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(body || {}),
        cache: 'no-store'
    })

    const json = await res.json().catch(() => ({}))
    if (!res.ok) {
        const msg = json?.error_description || json?.error || json?.message || `Trakt error (${res.status})`
        const err = new Error(msg)
        err.status = res.status
        throw err
    }
    return json
}

export async function POST(req) {
    try {
        const token = await readAccessToken(req)
        if (!token) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

        const body = await req.json().catch(() => ({}))
        const ids = Array.isArray(body?.ids) ? body.ids.map((x) => Number(x)).filter(Boolean) : []

        if (!ids.length) {
            return NextResponse.json({ error: 'ids debe ser un array con history ids' }, { status: 400 })
        }

        const data = await traktPost('/sync/history/remove', token, { ids })
        return NextResponse.json({ ok: true, data })
    } catch (e) {
        return NextResponse.json(
            { error: e?.message || 'Error eliminando del historial' },
            { status: e?.status || 500 }
        )
    }
}
