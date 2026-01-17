// src/app/share/movie/[id]/head.jsx
export const revalidate = 86400 // literal (Next 16)
export const runtime = 'nodejs'

const SITE_NAME = 'The Show Verse'
const TMDB_KEY = process.env.TMDB_API_KEY || process.env.NEXT_PUBLIC_TMDB_API_KEY

function siteUrl() {
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

function cleanDesc(s) {
    const t = (s || '').trim()
    if (!t) return ''
    return t.length > 180 ? `${t.slice(0, 177)}…` : t
}

export default async function Head({ params }) {
    const { id } = await params
    const base = siteUrl()
    const canonical = `${base}/share/movie/${id}`

    const movie = await fetchMovie(id)

    const titleRaw = movie?.title || 'Película'
    const year = (movie?.release_date || '').slice(0, 4)
    const title = `${SITE_NAME} | ${titleRaw}${year ? ` (${year})` : ''}`
    const description = cleanDesc(movie?.overview) || `Ver detalles de ${titleRaw} en ${SITE_NAME}.`

    // ✅ Primero poster (portada), segundo backdrop (por si WhatsApp prefiere horizontal)
    const poster = movie?.poster_path ? `https://image.tmdb.org/t/p/w780${movie.poster_path}` : null
    const backdrop = movie?.backdrop_path ? `https://image.tmdb.org/t/p/w1280${movie.backdrop_path}` : null

    return (
        <>
            <title>{title}</title>
            <meta name="description" content={description} />

            <meta property="og:site_name" content={SITE_NAME} />
            <meta property="og:type" content="video.movie" />
            <meta property="og:url" content={canonical} />
            <meta property="og:title" content={title} />
            <meta property="og:description" content={description} />

            {poster && (
                <>
                    <meta property="og:image" content={poster} />
                    <meta property="og:image:secure_url" content={poster} />
                    <meta property="og:image:width" content="780" />
                    <meta property="og:image:height" content="1170" />
                    <meta property="og:image:type" content="image/jpeg" />
                </>
            )}

            {backdrop && (
                <>
                    <meta property="og:image" content={backdrop} />
                    <meta property="og:image:secure_url" content={backdrop} />
                    <meta property="og:image:width" content="1280" />
                    <meta property="og:image:height" content="720" />
                    <meta property="og:image:type" content="image/jpeg" />
                </>
            )}

            <meta name="twitter:card" content="summary_large_image" />
            <meta name="twitter:title" content={title} />
            <meta name="twitter:description" content={description} />
            {backdrop ? <meta name="twitter:image" content={backdrop} /> : poster ? <meta name="twitter:image" content={poster} /> : null}
        </>
    )
}