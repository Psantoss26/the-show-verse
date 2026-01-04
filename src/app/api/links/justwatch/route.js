// /src/app/api/links/justwatch/route.js
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function isDetailJustWatchUrl(url, country = 'es') {
    if (!url) return false
    try {
        const u = new URL(url)
        if (!/justwatch\.com$/i.test(u.hostname) && !/justwatch\.com$/i.test(u.hostname.replace(/^www\./, ''))) {
            // aceptamos www.justwatch.com
        }
        const p = u.pathname || ''
        return (
            p.includes(`/${country}/pelicula/`) ||
            p.includes(`/${country}/serie/`) ||
            p.includes(`/${country}/show/`) // por si aparece en algún caso
        )
    } catch {
        return false
    }
}

function pickMetaUrl(html) {
    if (!html) return null

    // og:url
    const og = html.match(/<meta[^>]+property=["']og:url["'][^>]+content=["']([^"']+)["']/i)
    if (og?.[1]) return og[1]

    // canonical
    const canon = html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i)
    if (canon?.[1]) return canon[1]

    return null
}

function pickFirstDetailHref(html, country = 'es') {
    if (!html) return null

    // Busca el primer href a ficha (película/serie) en el HTML
    const re = new RegExp(
        `href=["'](\\/${country}\\/(?:pelicula|serie|show)\\/[^"'?#]+)`,
        'i'
    )
    const m = html.match(re)
    if (!m?.[1]) return null

    return `https://www.justwatch.com${m[1]}`
}

function pickFromNextData(html, country = 'es', year) {
    if (!html) return null

    const m = html.match(/<script[^>]+id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i)
    if (!m?.[1]) return null

    try {
        const json = JSON.parse(m[1])

        // Recorre el árbol buscando objetos con full_path + posible año
        const stack = [json]
        const candidates = []

        while (stack.length) {
            const node = stack.pop()
            if (!node) continue

            if (Array.isArray(node)) {
                for (const x of node) stack.push(x)
                continue
            }

            if (typeof node === 'object') {
                // candidato típico
                if (typeof node.full_path === 'string') {
                    const fp = node.full_path
                    const looksDetail =
                        fp.includes(`/${country}/pelicula/`) ||
                        fp.includes(`/${country}/serie/`) ||
                        fp.includes(`/${country}/show/`)

                    if (looksDetail) {
                        const y =
                            Number(node.original_release_year ?? node.release_year ?? node.year ?? node.first_air_year ?? NaN)
                        candidates.push({ full_path: fp, year: Number.isFinite(y) ? y : null })
                    }
                }

                for (const k of Object.keys(node)) stack.push(node[k])
            }
        }

        if (!candidates.length) return null

        // Si nos pasan año, intenta clavar año
        let best = candidates[0]
        if (year) {
            const y = Number(year)
            const exact = candidates.find((c) => c.year === y)
            if (exact) best = exact
        }

        return `https://www.justwatch.com${best.full_path}`
    } catch {
        return null
    }
}

async function fetchHtml(url, { signal } = {}) {
    const res = await fetch(url, {
        signal,
        redirect: 'follow',
        headers: {
            'user-agent':
                'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36',
            accept:
                'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
            'accept-language': 'es-ES,es;q=0.9,en;q=0.8',
            'cache-control': 'no-cache',
            pragma: 'no-cache'
        }
    })

    const html = await res.text().catch(() => '')
    return { res, html }
}

export async function GET(req) {
    const { searchParams } = new URL(req.url)
    const country = (searchParams.get('country') || 'es').toLowerCase()
    const watchnow = searchParams.get('watchnow')
    const title = searchParams.get('title')
    const year = searchParams.get('year') // opcional

    if (!watchnow && !title) {
        return NextResponse.json({ error: 'Missing watchnow or title' }, { status: 400 })
    }

    // URL de partida
    const startUrl = watchnow
        ? watchnow
        : `https://www.justwatch.com/${country}/buscar?q=${encodeURIComponent(title)}`

    try {
        const ac = new AbortController()
        const { res, html } = await fetchHtml(startUrl, { signal: ac.signal })

        // 1) Si por redirect ya estamos en ficha, perfecto
        if (res?.url && isDetailJustWatchUrl(res.url, country)) {
            return NextResponse.json({ url: res.url })
        }

        // 2) meta canonical / og:url (si fuera ficha)
        const metaUrl = pickMetaUrl(html)
        if (metaUrl && isDetailJustWatchUrl(metaUrl, country)) {
            return NextResponse.json({ url: metaUrl })
        }

        // 3) __NEXT_DATA__ (más robusto en búsquedas)
        const nextDataUrl = pickFromNextData(html, country, year)
        if (nextDataUrl && isDetailJustWatchUrl(nextDataUrl, country)) {
            return NextResponse.json({ url: nextDataUrl })
        }

        // 4) Fallback: primer href a /pelicula/ o /serie/
        const firstHref = pickFirstDetailHref(html, country)
        if (firstHref && isDetailJustWatchUrl(firstHref, country)) {
            return NextResponse.json({ url: firstHref })
        }

        // 5) Último recurso: devolver búsqueda (si quieres, o null)
        return NextResponse.json({ url: null })
    } catch (e) {
        return NextResponse.json({ error: e?.message || 'JustWatch resolve failed' }, { status: 500 })
    }
}
