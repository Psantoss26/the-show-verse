import Link from 'next/link'
import { notFound } from 'next/navigation'
import { headers } from 'next/headers'

export const runtime = 'nodejs'
export const revalidate = 86400

const SITE_NAME = 'The Show Verse'

async function getBaseUrlFromHeaders() {
    const h = await headers()
    const protoRaw = h.get('x-forwarded-proto') || 'https'
    const hostRaw = h.get('x-forwarded-host') || h.get('host') || ''

    const proto = protoRaw.split(',')[0].trim()
    const host = hostRaw.split(',')[0].trim()

    if (host) return `${proto}://${host}`

    // fallback (por si acaso)
    return (
        process.env.NEXT_PUBLIC_SITE_URL ||
        process.env.SITE_URL ||
        (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '') ||
        'http://localhost:3000'
    )
}

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
    // OG: mejor horizontal (WhatsApp queda muy bien con 1.91:1)
    if (movie?.backdrop_path) return `https://image.tmdb.org/t/p/w1280${movie.backdrop_path}`
    if (movie?.poster_path) return `https://image.tmdb.org/t/p/w780${movie.poster_path}`
    return null
}

function pickPoster(movie) {
    if (movie?.poster_path) return `https://image.tmdb.org/t/p/w500${movie.poster_path}`
    return null
}

function cleanDesc(s) {
    const txt = (s || '').trim()
    if (!txt) return ''
    return txt.length > 180 ? `${txt.slice(0, 177)}…` : txt
}

export async function generateMetadata({ params, searchParams }) {
    const { id } = await params

    // searchParams a veces es sync; a veces la envuelve Next
    const sp = searchParams && typeof searchParams.then === 'function' ? await searchParams : (searchParams || {})
    const v = sp?.v ? String(sp.v) : null

    const baseUrl = await getBaseUrlFromHeaders()
    const canonicalUrl = v
        ? `${baseUrl}/share/movie/${id}?v=${encodeURIComponent(v)}`
        : `${baseUrl}/share/movie/${id}`

    const movie = await fetchMovie(id)
    if (!movie) {
        return {
            title: 'The Show Verse',
            description: 'Detalles de película',
            alternates: { canonical: canonicalUrl },
            openGraph: { title: 'The Show Verse', url: canonicalUrl }
        }
    }

    const titleRaw = movie.title || 'Película'
    const year = (movie.release_date || '').slice(0, 4)
    const title = `The Show Verse | ${titleRaw}${year ? ` (${year})` : ''}`

    const description =
        (movie.overview && movie.overview.trim().slice(0, 180).replace(/…/g, '...')) ||
        `Ver detalles de ${titleRaw} en The Show Verse.`

    const poster = movie.poster_path ? `https://image.tmdb.org/t/p/w780${movie.poster_path}` : null
    const backdrop = movie.backdrop_path ? `https://image.tmdb.org/t/p/w1280${movie.backdrop_path}` : null

    return {
        title,
        description,
        alternates: { canonical: canonicalUrl },

        openGraph: {
            type: 'video.movie',
            title,
            description,
            url: canonicalUrl,
            siteName: 'The Show Verse',
            // ✅ Poster primero (portada), backdrop después (por si el scraper prefiere horizontal)
            images: [
                ...(poster ? [{ url: poster, width: 780, height: 1170, alt: title }] : []),
                ...(backdrop ? [{ url: backdrop, width: 1280, height: 720, alt: title }] : [])
            ]
        },

        twitter: {
            card: 'summary_large_image',
            title,
            description,
            images: backdrop ? [backdrop] : poster ? [poster] : []
        }
    }
}

export default async function ShareMoviePage({ params }) {
    const { id } = await params

    const movie = await fetchMovie(id)
    if (!movie) notFound()

    const title = movie.title || 'Película'
    const year = (movie.release_date || '').slice(0, 4)
    const poster = pickPoster(movie)

    return (
        <main className="min-h-screen bg-[#0b0b0d] text-white flex items-center justify-center p-6">
            <div className="w-full max-w-xl">
                <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-white/[0.06] shadow-[0_20px_60px_rgba(0,0,0,0.55)]">
                    {/* Glow */}
                    <div className="pointer-events-none absolute -inset-24 bg-[radial-gradient(circle_at_20%_10%,rgba(250,204,21,0.22),transparent_55%),radial-gradient(circle_at_80%_0%,rgba(16,185,129,0.18),transparent_55%)]" />

                    <div className="relative p-5 sm:p-6">
                        <div className="flex gap-4 sm:gap-5 items-start">
                            {/* Poster */}
                            <div className="shrink-0">
                                {poster ? (
                                    <img
                                        src={poster}
                                        alt={title}
                                        className="w-[92px] h-[138px] sm:w-[112px] sm:h-[168px] object-cover rounded-2xl border border-white/10 bg-black/30 shadow-[0_10px_30px_rgba(0,0,0,0.45)]"
                                        loading="eager"
                                    />
                                ) : (
                                    <div className="w-[92px] h-[138px] sm:w-[112px] sm:h-[168px] rounded-2xl border border-white/10 bg-black/30" />
                                )}
                            </div>

                            {/* Text */}
                            <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                    <div className="text-xl sm:text-2xl font-black tracking-tight truncate">
                                        {title}
                                    </div>
                                    {year ? (
                                        <span className="shrink-0 text-xs font-extrabold px-2 py-1 rounded-full bg-white/10 border border-white/10 text-white/80">
                                            {year}
                                        </span>
                                    ) : null}
                                </div>

                                <div className="mt-2 text-sm text-white/65 line-clamp-3">
                                    {movie.overview || 'Abriendo detalles…'}
                                </div>

                                <div className="mt-4 flex flex-wrap items-center gap-3">
                                    <Link
                                        href={`/details/movie/${id}`}
                                        className="group inline-flex items-center justify-center gap-2 h-11 px-5 rounded-2xl
                      bg-gradient-to-r from-yellow-400/25 to-emerald-400/15
                      border border-yellow-400/35 text-yellow-100 font-extrabold
                      hover:from-yellow-400/30 hover:to-emerald-400/20 hover:border-yellow-300/55
                      shadow-[0_10px_30px_rgba(0,0,0,0.35)]
                      transition-all active:scale-[0.98]"
                                    >
                                        <span className="text-base">Abrir detalles</span>
                                        <span
                                            aria-hidden
                                            className="inline-flex items-center justify-center w-7 h-7 rounded-xl
                        bg-black/35 border border-white/10
                        transition-transform group-hover:translate-x-0.5"
                                        >
                                            <svg
                                                width="16"
                                                height="16"
                                                viewBox="0 0 24 24"
                                                fill="none"
                                                xmlns="http://www.w3.org/2000/svg"
                                                className="text-yellow-200"
                                            >
                                                <path
                                                    d="M9 18L15 12L9 6"
                                                    stroke="currentColor"
                                                    strokeWidth="2.4"
                                                    strokeLinecap="round"
                                                    strokeLinejoin="round"
                                                />
                                            </svg>
                                        </span>
                                    </Link>

                                    <div className="text-xs font-bold text-white/45">
                                        The Show Verse
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* bottom fade */}
                    <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/35 to-transparent" />
                </div>
            </div>
        </main>
    )
}