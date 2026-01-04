// /src/app/api/links/justwatch/route.js
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const CACHE = new Map() // key -> { ts, url }
const TTL = 1000 * 60 * 60 * 6 // 6h

function cacheGet(key) {
    const hit = CACHE.get(key)
    if (!hit) return null
    if (Date.now() - hit.ts > TTL) {
        CACHE.delete(key)
        return null
    }
    return hit.url || null
}
function cacheSet(key, url) {
    CACHE.set(key, { ts: Date.now(), url })
}

function normCountry(raw) {
    const c = String(raw || 'es').trim().toLowerCase()
    if (!c) return 'es'
    // acepta es-ES / ES / es
    return c.includes('-') ? c.split('-')[0] : c
}

// 1) Tu extractor original (para HTML que contiene link absoluto)
function pickJustWatchFromHtml(html) {
    if (!html) return null
    const m = html.match(/https?:\/\/www\.justwatch\.com[^\s"'<>]+/i)
    return m?.[0] || null
}

// 2) Nuevo: intenta sacar una ficha (película/serie) desde la página de búsqueda
function pickJustWatchTitleFromHtml(html, country = 'es') {
    if (!html) return null

    // a) URL absoluta ya con /es/pelicula/... o /es/serie/...
    const abs = html.match(
        new RegExp(`https?:\\/\\/www\\.justwatch\\.com\\/${country}\\/(?:pelicula|serie)\\/[^\\s"'<>]+`, 'i')
    )
    if (abs?.[0]) return abs[0]

    // b) href relativo típico
    const rel = html.match(
        new RegExp(`href="(\\/${country}\\/(?:pelicula|serie)\\/[^\\"<>]+)"`, 'i')
    )
    if (rel?.[1]) return `https://www.justwatch.com${rel[1]}`

    // c) fallback por si el href no trae /es delante
    const rel2 = html.match(/href="(\/(?:pelicula|serie)\/[^"<>]+)"/i)
    if (rel2?.[1]) return `https://www.justwatch.com/${country}${rel2[1]}`

    return null
}

async function safeFetch(url) {
    return fetch(url, {
        redirect: 'follow',
        headers: {
            'user-agent': 'Mozilla/5.0 (compatible; ShowVerse/1.0)',
            'accept-language': 'es-ES,es;q=0.9,en;q=0.8'
        },
        cache: 'no-store'
    })
}

export async function GET(req) {
    const { searchParams } = new URL(req.url)

    const watchnow = searchParams.get('watchnow')
    const title = searchParams.get('title')
    const country = normCountry(searchParams.get('country') || 'es')

    // ✅ cache key
    const key = watchnow
        ? `watchnow:${watchnow}`
        : title
            ? `title:${country}:${title}`
            : null

    if (key) {
        const hit = cacheGet(key)
        if (hit) return NextResponse.json({ url: hit })
    }

    // --------------- MODO 1: watchnow (tu caso actual) ---------------
    if (watchnow) {
        try {
            const res = await safeFetch(watchnow)

            const finalUrl = res?.url || watchnow
            if (finalUrl.includes('justwatch.com')) {
                cacheSet(key, finalUrl)
                return NextResponse.json({ url: finalUrl })
            }

            const ct = res.headers.get('content-type') || ''
            if (ct.includes('text/html')) {
                const html = await res.text()
                const jw = pickJustWatchFromHtml(html)
                if (jw) {
                    cacheSet(key, jw)
                    return NextResponse.json({ url: jw })
                }
            }

            cacheSet(key, watchnow)
            return NextResponse.json({ url: watchnow })
        } catch {
            return NextResponse.json({ url: watchnow })
        }
    }

    // --------------- MODO 2: title -> buscar -> ficha ---------------
    if (!title) {
        return NextResponse.json({ error: 'Missing watchnow or title' }, { status: 400 })
    }

    const searchUrl = `https://www.justwatch.com/${country}/buscar?q=${encodeURIComponent(title)}`
    try {
        const res = await safeFetch(searchUrl)
        const finalUrl = res?.url || searchUrl

        // si por lo que sea ya acabó en ficha
        if (finalUrl.includes(`justwatch.com/${country}/`) && /(pelicula|serie)\//i.test(finalUrl)) {
            cacheSet(key, finalUrl)
            return NextResponse.json({ url: finalUrl })
        }

        const ct = res.headers.get('content-type') || ''
        if (ct.includes('text/html')) {
            const html = await res.text()
            const jw =
                pickJustWatchTitleFromHtml(html, country) ||
                pickJustWatchFromHtml(html)

            if (jw) {
                cacheSet(key, jw)
                return NextResponse.json({ url: jw })
            }
        }

        // fallback: búsqueda
        cacheSet(key, searchUrl)
        return NextResponse.json({ url: searchUrl })
    } catch {
        return NextResponse.json({ url: searchUrl })
    }
}
