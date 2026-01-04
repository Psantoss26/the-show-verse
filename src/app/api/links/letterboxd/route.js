// /src/app/api/links/letterboxd/route.js
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const CACHE = new Map()
const TTL = 1000 * 60 * 60 * 24 // 24h

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

function normImdb(raw) {
    if (!raw) return null
    const s = String(raw).trim()
    if (!s) return null
    return s.startsWith('tt') ? s : `tt${s}`
}

function pickLetterboxdFilmFromHtml(html) {
    if (!html) return null

    const abs = html.match(/https?:\/\/letterboxd\.com\/film\/[^\s"'<>]+/i)
    if (abs?.[0]) return abs[0]

    const rel = html.match(/href="(\/film\/[^"<>]+\/)"/i)
    if (rel?.[1]) return `https://letterboxd.com${rel[1]}`

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

    const imdb = normImdb(searchParams.get('imdb'))
    const title = searchParams.get('title')

    if (!imdb && !title) {
        return NextResponse.json({ error: 'Missing imdb or title' }, { status: 400 })
    }

    const key = imdb ? `imdb:${imdb}` : `title:${title}`
    const hit = cacheGet(key)
    if (hit) return NextResponse.json({ url: hit })

    const fallback = imdb
        ? `https://letterboxd.com/imdb/${encodeURIComponent(imdb)}/`
        : `https://letterboxd.com/search/${encodeURIComponent(title)}/`

    try {
        const res = await safeFetch(fallback)
        const finalUrl = res?.url || fallback

        // ✅ ya estamos en /film/<slug>/
        if (/letterboxd\.com\/film\//i.test(finalUrl)) {
            cacheSet(key, finalUrl)
            return NextResponse.json({ url: finalUrl })
        }

        const ct = res.headers.get('content-type') || ''
        if (ct.includes('text/html')) {
            const html = await res.text()
            const film = pickLetterboxdFilmFromHtml(html)
            if (film) {
                cacheSet(key, film)
                return NextResponse.json({ url: film })
            }
        }

        cacheSet(key, fallback)
        return NextResponse.json({ url: fallback })
    } catch {
        return NextResponse.json({ url: fallback })
    }
}
