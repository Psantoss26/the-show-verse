// /src/app/api/links/justwatch/route.js
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function normalizeTitle(s) {
    return String(s || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '') // quita acentos
        .replace(/[^a-z0-9]+/g, ' ')
        .trim()
}

function extractNextDataJson(html) {
    if (!html) return null
    const m = html.match(/<script[^>]+id="__NEXT_DATA__"[^>]*>(.*?)<\/script>/s)
    if (!m?.[1]) return null
    try {
        return JSON.parse(m[1])
    } catch {
        return null
    }
}

function collectCandidates(root, out, depth = 0) {
    if (!root || depth > 14) return
    if (Array.isArray(root)) {
        for (const v of root) collectCandidates(v, out, depth + 1)
        return
    }
    if (typeof root !== 'object') return

    // Algunos nodos vienen como { content: {...} }
    const obj = root.content && typeof root.content === 'object' ? root.content : root

    const fullPath = obj.full_path || obj.fullPath || obj.fullPathname || obj.path || null
    const title = obj.title || obj.name || obj.original_title || obj.originalTitle || obj.original_name || null

    // En JustWatch suele venir un full_path tipo "/es/pelicula/..." o "/es/serie/..."
    if (typeof fullPath === 'string' && fullPath.startsWith('/') && typeof title === 'string') {
        out.push({
            fullPath,
            title,
            objectType: obj.object_type || obj.objectType || obj.type || null,
            year: obj.original_release_year || obj.originalReleaseYear || obj.release_year || obj.year || null,
            popularity: obj.popularity || obj.score || obj.scoring?.popularity || 0
        })
    }

    for (const k of Object.keys(root)) {
        collectCandidates(root[k], out, depth + 1)
    }
}

function scoreCandidate(c, { qTitle, qYear, qType, country }) {
    let score = 0

    const ct = normalizeTitle(c.title)
    const qt = qTitle

    if (ct === qt) score += 10

    // token overlap simple (robusto a títulos largos)
    const ctTokens = new Set(ct.split(/\s+/).filter(Boolean))
    const qtTokens = new Set(qt.split(/\s+/).filter(Boolean))
    if (ctTokens.size && qtTokens.size) {
        let inter = 0
        for (const t of qtTokens) if (ctTokens.has(t)) inter++
        const jacc = inter / Math.max(1, new Set([...ctTokens, ...qtTokens]).size)
        score += jacc * 8
    }

    // year
    const y = Number(c.year || 0)
    if (qYear && y === qYear) score += 4
    else if (qYear && y && Math.abs(y - qYear) <= 1) score += 1

    // type (movie/tv) => justwatch suele usar "movie"/"show" o rutas /pelicula/ /serie/
    const fp = String(c.fullPath || '')
    const looksMovie = fp.includes('/pelicula/') || fp.includes('/movie/')
    const looksShow = fp.includes('/serie/') || fp.includes('/show/') || fp.includes('/tv/')
    if (qType === 'movie' && looksMovie) score += 3
    if (qType === 'tv' && looksShow) score += 3

    // país/locale
    if (country && fp.startsWith(`/${country}/`)) score += 1

    // pequeño empuje por popularidad si existe
    const pop = Number(c.popularity || 0)
    if (Number.isFinite(pop) && pop > 0) score += Math.min(2, pop / 100)

    return score
}

function absolutizeJustWatchUrl(fullPathOrUrl) {
    if (!fullPathOrUrl) return null
    const u = String(fullPathOrUrl)
    if (u.startsWith('http://') || u.startsWith('https://')) return u
    if (u.startsWith('/')) return `https://www.justwatch.com${u}`
    return null
}

export async function GET(req) {
    const { searchParams } = new URL(req.url)

    const country = (searchParams.get('country') || 'es').toLowerCase() // "es"
    const title = searchParams.get('title') || ''
    const yearRaw = searchParams.get('year')
    const type = (searchParams.get('type') || '').toLowerCase() // "movie" | "tv"
    const watchnow = searchParams.get('watchnow')

    const year = yearRaw ? Number(yearRaw) : null
    const qTitle = normalizeTitle(title)

    if (!qTitle && !watchnow) {
        return NextResponse.json({ error: 'Missing title or watchnow' }, { status: 400 })
    }

    const headers = {
        'user-agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36',
        'accept-language': 'es-ES,es;q=0.9,en;q=0.8',
        accept: 'text/html,application/xhtml+xml'
    }

    try {
        // 1) Si ya nos pasan un enlace de justwatch, devuélvelo directo
        if (watchnow && /justwatch\.com/i.test(watchnow)) {
            return NextResponse.json({ url: watchnow }, { status: 200 })
        }

        // 2) Fuente: buscador de JustWatch
        const searchUrl = qTitle
            ? `https://www.justwatch.com/${country}/buscar?q=${encodeURIComponent(title)}`
            : watchnow

        const res = await fetch(searchUrl, {
            redirect: 'follow',
            headers,
            cache: 'no-store'
        })

        const html = await res.text()

        // 3) Parse __NEXT_DATA__ (lo más fiable)
        const next = extractNextDataJson(html)
        if (next) {
            const candidates = []
            collectCandidates(next, candidates)

            // filtra paths del país y con pinta de ficha (no “/buscar”)
            const filtered = candidates.filter((c) => {
                const fp = String(c.fullPath || '')
                if (!fp.startsWith('/')) return false
                if (fp.includes('/buscar')) return false
                // normalmente las fichas llevan /pelicula/ o /serie/
                return fp.includes('/pelicula/') || fp.includes('/serie/') || fp.includes('/movie/') || fp.includes('/show/')
            })

            if (filtered.length) {
                const best = filtered
                    .map((c) => ({
                        c,
                        s: scoreCandidate(c, { qTitle, qYear: year, qType: type, country })
                    }))
                    .sort((a, b) => b.s - a.s)[0]

                const url = absolutizeJustWatchUrl(best?.c?.fullPath)
                if (url) return NextResponse.json({ url }, { status: 200 })
            }
        }

        // 4) Fallback: si no hay __NEXT_DATA__, intenta sacar cualquier URL de ficha
        const m = html.match(/https?:\/\/www\.justwatch\.com\/[a-z]{2}\/(?:pelicula|serie|movie|show)\/[^\s"'<>]+/i)
        if (m?.[0]) return NextResponse.json({ url: m[0] }, { status: 200 })

        // 5) Último fallback: devuelve el buscador (mejor que null)
        if (qTitle) {
            return NextResponse.json(
                { url: `https://www.justwatch.com/${country}/buscar?q=${encodeURIComponent(title)}` },
                { status: 200 }
            )
        }

        return NextResponse.json({ url: null }, { status: 200 })
    } catch (e) {
        return NextResponse.json({ error: e?.message || 'JustWatch resolve failed' }, { status: 500 })
    }
}
