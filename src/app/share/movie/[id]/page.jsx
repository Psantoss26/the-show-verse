import Link from 'next/link'
import { notFound } from 'next/navigation'

const TMDB_KEY = process.env.TMDB_API_KEY || process.env.NEXT_PUBLIC_TMDB_API_KEY
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL || 'http://localhost:3000'

async function fetchMovie(id) {
    if (!TMDB_KEY) return null

    const url =
        `https://api.themoviedb.org/3/movie/${encodeURIComponent(id)}` +
        `?api_key=${encodeURIComponent(TMDB_KEY)}&language=es-ES`

    const r = await fetch(url, { next: { revalidate: 60 * 60 * 24 } }) // 24h
    if (!r.ok) return null
    return r.json()
}

function posterUrl(path) {
    return path ? `https://image.tmdb.org/t/p/w780${path}` : null
}

export async function generateMetadata({ params }) {
    // ✅ Next (según tu caso) puede darte params como Promise
    const { id } = await params

    const m = await fetchMovie(id)
    if (!m) {
        return {
            metadataBase: new URL(SITE_URL),
            title: 'The Show Verse',
            description: 'Detalles de película'
        }
    }

    const title = m.title || 'Película'
    const year = (m.release_date || '').slice(0, 4)
    const fullTitle = year ? `${title} (${year})` : title
    const desc =
        (m.overview && m.overview.trim()) ||
        `Mira detalles y puntuaciones de ${title} en The Show Verse.`

    const img = posterUrl(m.poster_path)

    return {
        metadataBase: new URL(SITE_URL),
        title: fullTitle,
        description: desc,
        alternates: {
            canonical: `/share/movie/${id}`
        },
        openGraph: {
            type: 'video.movie',
            title: fullTitle,
            description: desc,
            url: `/share/movie/${id}`,
            images: img ? [{ url: img, width: 780, height: 1170, alt: fullTitle }] : []
        },
        twitter: {
            card: img ? 'summary_large_image' : 'summary',
            title: fullTitle,
            description: desc,
            images: img ? [img] : []
        }
    }
}

export default async function ShareMoviePage({ params }) {
    const { id } = await params
    const m = await fetchMovie(id)
    if (!m) notFound()

    const title = m.title || 'Película'
    const year = (m.release_date || '').slice(0, 4)
    const img = posterUrl(m.poster_path)

    return (
        <main className="min-h-screen bg-[#101010] text-white flex items-center justify-center p-6">
            <div className="max-w-md w-full rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm p-5">
                <div className="flex gap-4">
                    {img ? (
                        // <img> a propósito (simple y compatible con crawlers)
                        <img
                            src={img}
                            alt={title}
                            className="w-24 h-36 object-cover rounded-xl border border-white/10 bg-black/30"
                            loading="eager"
                        />
                    ) : (
                        <div className="w-24 h-36 rounded-xl border border-white/10 bg-black/30" />
                    )}

                    <div className="min-w-0">
                        <div className="text-lg font-black tracking-tight truncate">{title}</div>
                        {year ? <div className="text-sm text-white/60 font-bold mt-1">{year}</div> : null}

                        <p className="text-sm text-white/70 mt-3 line-clamp-3">
                            {m.overview || 'Abriendo detalles…'}
                        </p>

                        <Link
                            href={`/details/movie/${id}`}
                            className="inline-flex mt-4 px-4 h-10 items-center rounded-xl bg-yellow-500/15 border border-yellow-500/30 text-yellow-200 font-bold hover:bg-yellow-500/20"
                        >
                            Abrir en The Show Verse
                        </Link>
                    </div>
                </div>
            </div>
        </main>
    )
}
