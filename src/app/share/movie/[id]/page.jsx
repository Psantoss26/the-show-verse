import Link from 'next/link'
import { notFound } from 'next/navigation'

export const runtime = 'nodejs'
export const revalidate = 60 * 60 * 24 // 24h

const SITE_NAME = 'The Show Verse'

function getSiteUrl() {
    return (
        process.env.NEXT_PUBLIC_SITE_URL ||
        process.env.SITE_URL ||
        process.env.NEXT_PUBLIC_VERCEL_URL && `https://${process.env.NEXT_PUBLIC_VERCEL_URL}` ||
        process.env.VERCEL_URL && `https://${process.env.VERCEL_URL}` ||
        'http://localhost:3000'
    )
}

const TMDB_KEY =
    process.env.TMDB_API_KEY ||
    process.env.NEXT_PUBLIC_TMDB_API_KEY

async function fetchMovie(id) {
    if (!TMDB_KEY) return null
    const url =
        `https://api.themoviedb.org/3/movie/${encodeURIComponent(id)}` +
        `?api_key=${encodeURIComponent(TMDB_KEY)}&language=es-ES`

    const r = await fetch(url, { next: { revalidate } })
    if (!r.ok) return null
    return r.json()
}

function pickOgImage(movie) {
    // WhatsApp suele quedar mejor con backdrop horizontal
    if (movie?.backdrop_path) return `https://image.tmdb.org/t/p/w1280${movie.backdrop_path}`
    if (movie?.poster_path) return `https://image.tmdb.org/t/p/w780${movie.poster_path}`
    return null
}

function cleanDesc(s) {
    const txt = (s || '').trim()
    if (!txt) return ''
    return txt.length > 180 ? `${txt.slice(0, 177)}…` : txt
}

export async function generateMetadata({ params }) {
    const { id } = await params
    const siteUrl = getSiteUrl()

    const movie = await fetchMovie(id)

    // fallback (por si falla TMDb)
    if (!movie) {
        return {
            metadataBase: new URL(siteUrl),
            title: SITE_NAME,
            description: 'Detalles de película',
            openGraph: { title: SITE_NAME, siteName: SITE_NAME },
            twitter: { card: 'summary' }
        }
    }

    const title = movie.title || 'Película'
    const year = (movie.release_date || '').slice(0, 4)
    const pageTitle = `${SITE_NAME} | ${title}${year ? ` (${year})` : ''}`
    const description = cleanDesc(movie.overview) || `Ver detalles de ${title} en ${SITE_NAME}.`

    const ogImage = pickOgImage(movie)
    const canonicalPath = `/share/movie/${id}`
    const canonicalAbs = new URL(canonicalPath, siteUrl).toString()

    return {
        metadataBase: new URL(siteUrl),
        title: pageTitle,
        description,

        alternates: { canonical: canonicalAbs },

        openGraph: {
            type: 'video.movie',
            title: pageTitle,
            description,
            url: canonicalAbs,
            siteName: SITE_NAME,
            images: ogImage
                ? [{ url: ogImage, width: 1280, height: 720, alt: pageTitle }]
                : []
        },

        twitter: {
            card: ogImage ? 'summary_large_image' : 'summary',
            title: pageTitle,
            description,
            images: ogImage ? [ogImage] : []
        }
    }
}

export default async function ShareMoviePage({ params }) {
    const { id } = await params

    const movie = await fetchMovie(id)
    if (!movie) notFound()

    const title = movie.title || 'Película'
    const year = (movie.release_date || '').slice(0, 4)
    const ogImage = pickOgImage(movie)

    return (
        <main className="min-h-screen bg-[#101010] text-white flex items-center justify-center p-6">
            <div className="max-w-md w-full rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm p-5">
                <div className="flex gap-4">
                    {ogImage ? (
                        <img
                            src={ogImage}
                            alt={title}
                            className="w-28 h-20 object-cover rounded-xl border border-white/10 bg-black/30"
                            loading="eager"
                        />
                    ) : (
                        <div className="w-28 h-20 rounded-xl border border-white/10 bg-black/30" />
                    )}

                    <div className="min-w-0">
                        <div className="text-lg font-black tracking-tight truncate">{title}</div>
                        {year ? <div className="text-sm text-white/60 font-bold mt-1">{year}</div> : null}

                        <p className="text-sm text-white/70 mt-3 line-clamp-3">
                            {movie.overview || 'Abriendo detalles…'}
                        </p>

                        <Link
                            href={`/details/movie/${id}`}
                            className="inline-flex mt-4 px-4 h-10 items-center rounded-xl bg-yellow-500/15 border border-yellow-500/30 text-yellow-200 font-bold hover:bg-yellow-500/20"
                        >
                            Abrir detalles
                        </Link>
                    </div>
                </div>
            </div>
        </main>
    )
}