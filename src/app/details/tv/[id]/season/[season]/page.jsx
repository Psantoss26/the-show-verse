// src/app/details/tv/[id]/season/[season]/page.jsx
import SeasonDetailsClient from '@/components/SeasonDetailsClient'

export const revalidate = 3600 // 1h

const TMDB_API_KEY = process.env.NEXT_PUBLIC_TMDB_API_KEY
const OMDB_API_KEY = process.env.OMDB_API_KEY || process.env.NEXT_PUBLIC_OMDB_API_KEY

async function tmdbFetch(path) {
    const url = `https://api.themoviedb.org/3${path}${path.includes('?') ? '&' : '?'}api_key=${TMDB_API_KEY}&language=es-ES`
    const res = await fetch(url, { next: { revalidate } })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(json?.status_message || `TMDb error ${res.status}`)
    return json
}

async function omdbFetch(imdbId) {
    if (!OMDB_API_KEY || !imdbId) return null
    const url = `https://www.omdbapi.com/?i=${encodeURIComponent(imdbId)}&apikey=${encodeURIComponent(OMDB_API_KEY)}`
    const res = await fetch(url, { next: { revalidate } })
    const json = await res.json().catch(() => null)
    if (!res.ok || !json || json?.Response === 'False') return null
    return json
}

function parseOmdbRating(x) {
    const n = Number(String(x || '').replace(',', '.'))
    return Number.isFinite(n) ? n : null
}

export default async function SeasonPage({ params }) {
    if (!TMDB_API_KEY) throw new Error('Missing NEXT_PUBLIC_TMDB_API_KEY')

    const p = await params
    const showId = Number(p?.id)
    const seasonNumber = Number(p?.season)

    if (!Number.isFinite(showId) || !Number.isFinite(seasonNumber)) {
        return (
            <div className="min-h-screen bg-[#101010] text-white flex items-center justify-center">
                <div className="text-zinc-400">Ruta inválida (id/season).</div>
            </div>
        )
    }

    const [show, season] = await Promise.all([
        tmdbFetch(`/tv/${showId}?append_to_response=external_ids`),
        tmdbFetch(`/tv/${showId}/season/${seasonNumber}`)
    ])

    const showImdbId = show?.external_ids?.imdb_id || null
    const omdb = await omdbFetch(showImdbId)

    const imdb = showImdbId
        ? {
            id: showImdbId,
            rating: parseOmdbRating(omdb?.imdbRating),
            votes: omdb?.imdbVotes || null
        }
        : null

    return (
        <SeasonDetailsClient
            showId={showId}
            seasonNumber={seasonNumber}
            show={show}
            season={season}
            imdb={imdb}
        />
    )
}
