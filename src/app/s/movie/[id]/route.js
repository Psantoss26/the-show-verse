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

    // fallback
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

    const r = await fetch(url, { next: { revalidate: 86400 } }) // literal
    if (!r.ok) return null
    return r.json()
}

function pickPoster(movie) {
    return movie?.poster_path ? `https://image.tmdb.org/t/p/w780${movie.poster_path}` : null
}

function pickBackdrop(movie) {
    return movie?.backdrop_path ? `https://image.tmdb.org/t/p/w1280${movie.backdrop_path}` : null
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
    const canonical = `${baseUrl}/s/movie/${encodeURIComponent(id)}`
    const detailsUrl = `${baseUrl}/details/movie/${encodeURIComponent(id)}`

    const movie = await fetchMovie(id)

    const titleRaw = movie?.title || 'Película'
    const year = (movie?.release_date || '').slice(0, 4)
    const title = `${SITE_NAME} | ${titleRaw}${year ? ` (${year})` : ''}`
    const description = shortDesc(movie?.overview) || `Ver detalles de ${titleRaw} en ${SITE_NAME}.`

    // ✅ Principal: POSTER (portada). Secundaria: BACKDROP.
    const poster = pickPoster(movie)
    // const backdrop = pickBackdrop(movie) // opcional: lo puedes dejar para twitter si quieres

    const ogImages = poster ? [{ url: poster, w: 780, h: 1170 }] : []

    const html = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}"/>

<link rel="canonical" href="${esc(canonical)}"/>

<meta property="og:site_name" content="${esc(SITE_NAME)}"/>
<meta property="og:type" content="video.movie"/>
<meta property="og:url" content="${esc(canonical)}"/>
<meta property="og:title" content="${esc(title)}"/>
<meta property="og:description" content="${esc(description)}"/>

${ogImages
            .map(
                (img) => `
<meta property="og:image" content="${esc(img.url)}"/>
<meta property="og:image:secure_url" content="${esc(img.url)}"/>
<meta property="og:image:width" content="${img.w}"/>
<meta property="og:image:height" content="${img.h}"/>
<meta property="og:image:type" content="image/jpeg"/>`
            )
            .join('\n')}

<meta name="twitter:card" content="summary_large_image"/>
<meta name="twitter:title" content="${esc(title)}"/>
<meta name="twitter:description" content="${esc(description)}"/>
${poster ? `<meta name="twitter:image" content="${esc(poster)}"/>` : ''}

<!-- Para usuarios humanos: redirige a la página real -->
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