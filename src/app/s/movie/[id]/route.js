import { headers } from 'next/headers'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

const TMDB_KEY = process.env.TMDB_API_KEY || process.env.NEXT_PUBLIC_TMDB_API_KEY
const SITE_NAME = 'The Show Verse'

// mismo regex que middleware (bots típicos)
const BOT_UA =
    /WhatsApp|facebookexternalhit|Facebot|Twitterbot|Slackbot|Discordbot|TelegramBot|LinkedInBot|Pinterest|Googlebot|bingbot/i

function esc(s) {
    return String(s || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
}

async function getBaseUrlFromHeaders() {
    const h = await headers()
    const protoRaw = h.get('x-forwarded-proto') || 'https'
    const hostRaw = h.get('x-forwarded-host') || h.get('host') || ''
    const proto = protoRaw.split(',')[0].trim()
    const host = hostRaw.split(',')[0].trim()
    if (host) return `${proto}://${host}`

    return (
        process.env.NEXT_PUBLIC_SITE_URL ||
        process.env.SITE_URL ||
        (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '') ||
        'http://localhost:3000'
    )
}

async function fetchMovie(id) {
    if (!TMDB_KEY) return null
    const url =
        `https://api.themoviedb.org/3/movie/${encodeURIComponent(id)}` +
        `?api_key=${encodeURIComponent(TMDB_KEY)}&language=es-ES`

    const r = await fetch(url, { next: { revalidate: 86400 } })
    if (!r.ok) return null
    return r.json()
}

function shortDesc(s) {
    const t = (s || '').trim()
    if (!t) return ''
    return t.length > 180 ? `${t.slice(0, 177)}…` : t
}

export async function GET(req, ctx) {
    const h = await headers()
    const ua = h.get('user-agent') || ''

    const params = ctx?.params && typeof ctx.params.then === 'function' ? await ctx.params : ctx.params
    const id = params?.id

    const baseUrl = await getBaseUrlFromHeaders()

    // ✅ URL REAL que vas a compartir
    const detailsUrl = `${baseUrl}/details/movie/${encodeURIComponent(id)}`
    const canonical = detailsUrl

    // ✅ Humanos: no deberían ver /s/... nunca
    if (!BOT_UA.test(ua)) {
        return NextResponse.redirect(detailsUrl, 307)
    }

    const movie = await fetchMovie(id)
    const titleRaw = movie?.title || 'Película'
    const year = (movie?.release_date || '').slice(0, 4)

    const shareTitle = `${titleRaw}${year ? ` (${year})` : ''}`
    const description = shortDesc(movie?.overview) || `Ver detalles de ${titleRaw}.`

    // ✅ Imagen cuadrada (no se recorta el contenido)
    const ogSquare = `${baseUrl}/s/movie/${encodeURIComponent(id)}/og`

    const html = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${esc(shareTitle)}</title>
<meta name="description" content="${esc(description)}"/>

<link rel="canonical" href="${esc(canonical)}"/>

<meta property="og:site_name" content="${esc(SITE_NAME)}"/>
<meta property="og:type" content="video.movie"/>
<meta property="og:url" content="${esc(canonical)}"/>
<meta property="og:title" content="${esc(shareTitle)}"/>
<meta property="og:description" content="${esc(description)}"/>

<meta property="og:image" content="${esc(ogSquare)}"/>
<meta property="og:image:secure_url" content="${esc(ogSquare)}"/>
<meta property="og:image:width" content="1024"/>
<meta property="og:image:height" content="1024"/>
<meta property="og:image:type" content="image/png"/>

<meta name="twitter:card" content="summary_large_image"/>
<meta name="twitter:title" content="${esc(shareTitle)}"/>
<meta name="twitter:description" content="${esc(description)}"/>
<meta name="twitter:image" content="${esc(ogSquare)}"/>
</head>
<body></body>
</html>`

    return new Response(html, {
        status: 200,
        headers: {
            'content-type': 'text/html; charset=utf-8',
            'cache-control': 'public, s-maxage=86400, stale-while-revalidate=604800'
        }
    })
}