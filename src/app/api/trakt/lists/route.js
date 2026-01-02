// /src/app/api/trakt/lists/route.js
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const TRAKT_API = 'https://api.trakt.tv'
const TRAKT_API_VERSION = '2'

// Usa el nombre que tengas en tu proyecto (ajusta si hace falta)
const TRAKT_CLIENT_ID =
    process.env.TRAKT_CLIENT_ID ||
    process.env.NEXT_PUBLIC_TRAKT_CLIENT_ID ||
    process.env.TRAKT_CLIENTID ||
    ''

function headersTrakt() {
    if (!TRAKT_CLIENT_ID) return null
    return {
        'Content-Type': 'application/json',
        'trakt-api-version': TRAKT_API_VERSION,
        'trakt-api-key': TRAKT_CLIENT_ID,
    }
}

async function traktGet(path, params = {}) {
    const h = headersTrakt()
    if (!h) {
        return { ok: false, status: 500, json: { error: 'Missing TRAKT_CLIENT_ID env var' } }
    }

    const url = new URL(`${TRAKT_API}${path}`)
    Object.entries(params).forEach(([k, v]) => {
        if (v !== undefined && v !== null) url.searchParams.set(k, String(v))
    })

    const res = await fetch(url.toString(), { headers: h, cache: 'no-store' })
    const json = await res.json().catch(() => null)
    return { ok: res.ok, status: res.status, json }
}

// Normaliza tanto /lists/trending (devuelve objetos con "list")
// como /lists/popular (devuelve "list" directo).
function normalizeList(item) {
    const l = item?.list ? item.list : item
    if (!l) return null

    const ids = l.ids || {}
    const traktId = ids.trakt ?? l.id ?? null
    const slug = ids.slug ?? null

    // URL web (Trakt usa slug normalmente)
    const traktUrl = slug ? `https://trakt.tv/lists/${slug}` : traktId ? `https://trakt.tv/lists/${traktId}` : null

    return {
        id: traktId,
        name: l.name ?? '',
        description: l.description ?? '',
        item_count: typeof l.item_count === 'number' ? l.item_count : 0,
        type: l.type ?? null, // puede venir 'personal' u 'official'
        privacy: l.privacy ?? null,
        user: l.user ?? null,
        ids,
        traktUrl,
    }
}

function isOfficialTraktList(l) {
    // Trakt suele marcarlo con type='official' en API
    if (l?.type === 'official') return true

    // Fallback: muchas oficiales pertenecen al usuario "trakt"
    const username = l?.user?.username?.toLowerCase?.()
    if (username === 'trakt') return true

    return false
}

export async function GET(req) {
    try {
        const { searchParams } = new URL(req.url)

        const mode = (searchParams.get('mode') || 'official').toLowerCase()
        const limit = Math.min(Math.max(Number(searchParams.get('limit') || 30), 1), 50)
        const page = Math.max(Number(searchParams.get('page') || 1), 1)

        const seen = new Set()
        const out = []

        const pushMany = (arr) => {
            for (const it of arr) {
                const norm = normalizeList(it)
                if (!norm?.id) continue
                const key = String(norm.id)
                if (seen.has(key)) continue
                seen.add(key)
                out.push(norm)
                if (out.length >= limit) break
            }
        }

        if (mode === 'trending') {
            const r = await traktGet('/lists/trending', { page, limit, extended: 'full' })
            if (!r.ok) return NextResponse.json({ error: 'Trakt lists failed', details: r.json }, { status: r.status })
            pushMany(Array.isArray(r.json) ? r.json : [])
            return NextResponse.json({ mode, page, limit, lists: out }, { status: 200 })
        }

        if (mode === 'popular') {
            const r = await traktGet('/lists/popular', { page, limit, extended: 'full' })
            if (!r.ok) return NextResponse.json({ error: 'Trakt lists failed', details: r.json }, { status: r.status })
            pushMany(Array.isArray(r.json) ? r.json : [])
            return NextResponse.json({ mode, page, limit, lists: out }, { status: 200 })
        }

        // ✅ mode === 'official' (tu caso)
        // Estrategia:
        // 1) pedir trending (trae bastante variedad)
        // 2) filtrar solo official
        // 3) si no llega, complementar con popular
        const t = await traktGet('/lists/trending', { page: 1, limit: 50, extended: 'full' })
        if (!t.ok) return NextResponse.json({ error: 'Trakt lists failed', details: t.json }, { status: t.status })

        const trending = (Array.isArray(t.json) ? t.json : [])
            .map(normalizeList)
            .filter(Boolean)
            .filter(isOfficialTraktList)

        pushMany(trending)

        if (out.length < limit) {
            const p = await traktGet('/lists/popular', { page: 1, limit: 50, extended: 'full' })
            if (p.ok) {
                const popular = (Array.isArray(p.json) ? p.json : [])
                    .map(normalizeList)
                    .filter(Boolean)
                    .filter(isOfficialTraktList)
                pushMany(popular)
            }
        }

        // paginado simple (si quieres page real para official, se puede hacer,
        // pero con esto ya te carga y evita el 404)
        return NextResponse.json({ mode, page, limit, lists: out.slice(0, limit) }, { status: 200 })
    } catch (e) {
        return NextResponse.json({ error: 'Trakt lists failed', details: String(e?.message || e) }, { status: 500 })
    }
}
