import { headers } from 'next/headers'

export const runtime = 'nodejs'

const TMDB_KEY = process.env.TMDB_API_KEY || process.env.NEXT_PUBLIC_TMDB_API_KEY
const SITE_NAME = 'The Show Verse'

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

async function fetchTv(id) {
    if (!TMDB_KEY) return null
    const url =
        `https://api.themoviedb.org/3/tv/${encodeURIComponent(id)}` +
        `?api_key=${encodeURIComponent(TMDB_KEY)}&language=es-ES`

    const r = await fetch(url, { next: { revalidate: 86400 } })
    if (!r.ok) return null
    return r.json()
}

function pickBackdrop(tv) {
    return tv?.backdrop_path ? `https://image.tmdb.org/t/p/w1280${tv.backdrop_path}` : null
}

function pickPoster(tv) {
    return tv?.poster_path ? `https://image.tmdb.org/t/p/w780${tv.poster_path}` : null
}

function shortDesc(s) {
    const t = (s || '').trim()
    if (!t) return ''
    return t.length > 180 ? `${t.slice(0, 177)}…` : t
}

export async function GET(_req, ctx) {
    const params = ctx?.params && typeof ctx.params.then === 'function' ? await ctx.params : ctx.params
    const id = params?.id

    const baseUrl = await getBaseUrlFromHeaders()

    // ✅ Todo apunta a /details/tv/:id
    const detailsUrl = `${baseUrl}/details/tv/${encodeURIComponent(id)}`
    const canonical = detailsUrl

    const tv = await fetchTv(id)

    const nameRaw = tv?.name || tv?.original_name || 'Serie'
    const year = (tv?.first_air_date || '').slice(0, 4)
    const shareTitle = `${nameRaw}${year ? ` (${year})` : ''}`
    const description = shortDesc(tv?.overview) || `Ver detalles de ${nameRaw}.`

    // ✅ Preferimos BACKDROP, poster como fallback
    const backdrop = pickBackdrop(tv)
    const poster = pickPoster(tv)

    const ogImages = [
        ...(backdrop ? [{ url: backdrop, w: 1280, h: 720, type: 'image/jpeg' }] : []),
        ...(poster ? [{ url: poster, w: 780, h: 1170, type: 'image/jpeg' }] : [])
    ]

    const twitterImage = backdrop || poster || ''

    const html = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>

<title>${esc(shareTitle)}</title>
<meta name="description" content="${esc(description)}"/>

<link rel="canonical" href="${esc(canonical)}"/>

<meta property="og:site_name" content="${esc(SITE_NAME)}"/>
<meta property="og:type" content="video.tv_show"/>
<meta property="og:url" content="${esc(canonical)}"/>
<meta property="og:title" content="${esc(shareTitle)}"/>
<meta property="og:description" content="${esc(description)}"/>

${ogImages
            .map(
                (img) => `
<meta property="og:image" content="${esc(img.url)}"/>
<meta property="og:image:secure_url" content="${esc(img.url)}"/>
<meta property="og:image:width" content="${img.w}"/>
<meta property="og:image:height" content="${img.h}"/>
<meta property="og:image:type" content="${img.type}"/>`
            )
            .join('\n')}

<meta name="twitter:card" content="summary_large_image"/>
<meta name="twitter:title" content="${esc(shareTitle)}"/>
<meta name="twitter:description" content="${esc(description)}"/>
${twitterImage ? `<meta name="twitter:image" content="${esc(twitterImage)}"/>` : ''}

<!-- Humanos: redirige a detalles -->
<meta http-equiv="refresh" content="0;url=${esc(detailsUrl)}"/>
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