// src/app/api/tv/[id]/ratings/route.js
import { NextResponse } from 'next/server'

const TMDB_API_KEY =
  process.env.TMDB_API_KEY || process.env.NEXT_PUBLIC_TMDB_API_KEY

const TMDB_BASE_URL = 'https://api.themoviedb.org/3'
const RATINGS_REVALIDATE_SECONDS = 60 * 60 * 24 * 30 // 30 días

// OMDb (IMDb)
const OMDB_API_KEY = process.env.OMDB_API_KEY
const OMDB_BASE_URL = 'https://www.omdbapi.com/'

// Trakt
const TRAKT_CLIENT_ID = process.env.TRAKT_CLIENT_ID
const TRAKT_BASE_URL = 'https://api.trakt.tv'

/**
 * Pequeño helper para llamar a TMDb con control de errores.
 */
async function tmdbFetch(path, searchParams = {}) {
  if (!TMDB_API_KEY) {
    throw new Error(
      'TMDB_API_KEY o NEXT_PUBLIC_TMDB_API_KEY no está configurada en el entorno.'
    )
  }

  const url = new URL(TMDB_BASE_URL + path)

  url.searchParams.set('api_key', TMDB_API_KEY)

  // parámetros extra
  for (const [k, v] of Object.entries(searchParams)) {
    if (v !== undefined && v !== null) {
      url.searchParams.set(k, String(v))
    }
  }

  const res = await fetch(url.toString(), {
    next: { revalidate: RATINGS_REVALIDATE_SECONDS }
  })

  const status = res.status
  let json = null
  try {
    json = await res.json()
  } catch {
    json = null
  }

  if (!res.ok) {
    const msg =
      json?.status_message || json?.error || 'Error en la llamada a TMDb.'
    const err = new Error(msg)
    err.status = status
    throw err
  }

  return json
}

/**
 * Llama a OMDb y devuelve TODA una temporada de golpe.
 * Si hay cualquier problema, devuelve null (no rompemos el endpoint).
 */
async function omdbFetchSeason(imdbId, seasonNumber) {
  if (!OMDB_API_KEY || !imdbId) return null

  const url = new URL(OMDB_BASE_URL)
  url.searchParams.set('apikey', OMDB_API_KEY)
  url.searchParams.set('i', imdbId)
  url.searchParams.set('Season', String(seasonNumber))

  try {
    const res = await fetch(url.toString(), {
      next: { revalidate: RATINGS_REVALIDATE_SECONDS }
    })
    const json = await res.json()
    if (!res.ok || json?.Response === 'False') return null
    return json
  } catch {
    return null
  }
}

function traktHeaders() {
  if (!TRAKT_CLIENT_ID) return null
  return {
    'Content-Type': 'application/json',
    'trakt-api-version': '2',
    'trakt-api-key': TRAKT_CLIENT_ID
  }
}

async function traktFetch(path) {
  const headers = traktHeaders()
  if (!headers) return null

  try {
    const res = await fetch(`${TRAKT_BASE_URL}${path}`, {
      headers,
      next: { revalidate: RATINGS_REVALIDATE_SECONDS }
    })

    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

async function resolveTraktShowIdFromTmdb(tmdbId) {
  if (!tmdbId) return null
  const search = await traktFetch(
    `/search/tmdb/${encodeURIComponent(tmdbId)}?type=show&limit=1`
  )
  if (!Array.isArray(search) || !search.length) return null
  return search?.[0]?.show?.ids?.trakt || null
}

async function traktFetchEpisodesBySeason(tmdbId) {
  const out = new Map()

  const traktShowId = await resolveTraktShowIdFromTmdb(tmdbId)
  if (!traktShowId) return out

  const seasons = await traktFetch(
    `/shows/${encodeURIComponent(traktShowId)}/seasons?extended=full,episodes`
  )
  if (!Array.isArray(seasons)) return out

  for (const season of seasons) {
    const seasonNumber = Number(season?.number)
    if (!Number.isFinite(seasonNumber)) continue

    const epMap = new Map()
    const episodes = Array.isArray(season?.episodes) ? season.episodes : []

    for (const ep of episodes) {
      const episodeNumber = Number(ep?.number)
      if (!Number.isFinite(episodeNumber)) continue

      const ratingNum = Number(ep?.rating)
      const votesNum = Number(ep?.votes)

      epMap.set(episodeNumber, {
        rating: Number.isFinite(ratingNum) && ratingNum > 0 ? ratingNum : null,
        votes: Number.isFinite(votesNum) && votesNum > 0 ? votesNum : null,
        title: ep?.title || null,
        firstAired: ep?.first_aired || null
      })
    }

    out.set(seasonNumber, epMap)
  }

  return out
}

/**
 * Ejecuta promesas en lotes para limitar la concurrencia.
 */
async function runBatched(promisesFactories, batchSize = 4) {
  const results = []
  for (let i = 0; i < promisesFactories.length; i += batchSize) {
    const batch = promisesFactories.slice(i, i + batchSize)
    const batchResults = await Promise.all(batch.map((fn) => fn()))
    results.push(...batchResults)
  }
  return results
}

// 👇 IMPORTANTE: params es asíncrono, hay que hacerle await
export async function GET(request, context) {
  const { params } = context
  const { id } = await params

  if (!id) {
    return NextResponse.json(
      { error: 'Falta el parámetro id de la serie.' },
      { status: 400 }
    )
  }

  const url = new URL(request.url)
  const excludeSpecials = url.searchParams.get('excludeSpecials') === 'true'

  try {
    // 1) Detalles básicos de la serie (lista de temporadas + imdb_id)
    const show = await tmdbFetch(`/tv/${id}`, {
      language: 'es-ES',
      append_to_response: 'external_ids'
    })

    const allSeasons = Array.isArray(show.seasons) ? show.seasons : []

    const imdbId = show?.external_ids?.imdb_id || null
    const useOmdb = Boolean(imdbId && OMDB_API_KEY)
    const traktEpisodesBySeason = await traktFetchEpisodesBySeason(id)

    // Filtramos temporadas reales (y quitamos specials si toca)
    const seasons = allSeasons
      .filter((s) => {
        if (!s) return false
        if (excludeSpecials && s.season_number === 0) return false
        if (!s.episode_count || s.episode_count <= 0) return false
        return true
      })
      .sort((a, b) => a.season_number - b.season_number)

    // 2) Para cada temporada:
    //    - /tv/{id}/season/{n} en TMDb
    //    - Season en OMDb (IMDb) en una sola llamada
    const seasonFactories = seasons.map((seasonMeta) => async () => {
      try {
        const [seasonDetail, omdbSeason] = await Promise.all([
          tmdbFetch(`/tv/${id}/season/${seasonMeta.season_number}`, {
            language: 'es-ES'
          }),
          useOmdb
            ? omdbFetchSeason(imdbId, seasonMeta.season_number)
            : Promise.resolve(null)
        ])

        const tmdbEpisodes = Array.isArray(seasonDetail.episodes)
          ? seasonDetail.episodes
          : []
        const omdbEpisodes = Array.isArray(omdbSeason?.Episodes)
          ? omdbSeason.Episodes
          : []

        // índice por número de episodio en OMDb
        const omdbByEp = new Map()
        for (const ep of omdbEpisodes) {
          const n = Number(ep.Episode)
          if (Number.isFinite(n)) omdbByEp.set(n, ep)
        }

        const mappedEpisodes = tmdbEpisodes
          .filter((ep) => ep && typeof ep.episode_number === 'number')
          .sort((a, b) => a.episode_number - b.episode_number)
          .map((ep) => {
            // TMDb
            const tmdbRating =
              typeof ep.vote_average === 'number' ? ep.vote_average : null
            const tmdbVotes =
              typeof ep.vote_count === 'number' ? ep.vote_count : null

            // IMDb desde OMDb
            const om = omdbByEp.get(ep.episode_number) || null
            let imdbRating = null
            let imdbVotes = null

            if (om) {
              if (om.imdbRating && om.imdbRating !== 'N/A') {
                const r = Number(om.imdbRating)
                if (Number.isFinite(r)) imdbRating = r
              }
              if (om.imdbVotes && om.imdbVotes !== 'N/A') {
                const v = Number(String(om.imdbVotes).replace(/,/g, ''))
                if (Number.isFinite(v)) imdbVotes = v
              }
            }

            // Trakt como fallback de IMDb
            const traktEp =
              traktEpisodesBySeason
                .get(seasonMeta.season_number)
                ?.get(ep.episode_number) || null

            const traktRatingRaw = Number(traktEp?.rating)
            const traktVotesRaw = Number(traktEp?.votes)

            const traktRating =
              Number.isFinite(traktRatingRaw) && traktRatingRaw > 0
                ? traktRatingRaw
                : null
            const traktVotes =
              Number.isFinite(traktVotesRaw) && traktVotesRaw > 0
                ? traktVotesRaw
                : null

            const display = imdbRating ?? traktRating ?? null
            const source = imdbRating != null ? 'imdb' : traktRating != null ? 'trakt' : null

            const values = [imdbRating, traktRating].filter(
              (v) => typeof v === 'number'
            )
            const avg =
              values.length > 0
                ? Number(
                  (
                    values.reduce((a, b) => a + b, 0) / values.length
                  ).toFixed(1)
                )
                : null

            return {
              episodeNumber: ep.episode_number,
              name:
                ep.name ||
                om?.Title ||
                traktEp?.title ||
                `Episodio ${ep.episode_number}`,
              airDate: ep.air_date || om?.Released || null,
              tmdb: tmdbRating,
              tmdbVotes,
              imdb: imdbRating,
              imdbVotes,
              trakt: traktRating,
              traktVotes,
              display,
              source,
              avg
            }
          })

        const hasAnyRating = mappedEpisodes.some(
          (ep) =>
            typeof ep.imdb === 'number' || typeof ep.trakt === 'number'
        )

        if (!mappedEpisodes.length || !hasAnyRating) return null

        return {
          seasonNumber: seasonMeta.season_number,
          name: seasonMeta.name || `Temporada ${seasonMeta.season_number}`,
          episodeCount:
            seasonMeta.episode_count || mappedEpisodes.length,
          episodes: mappedEpisodes
        }
      } catch (e) {
        console.error(
          `Error cargando temporada ${seasonMeta.season_number} de ${id}:`,
          e
        )
        return null
      }
    })

    // 3) Ejecutamos en lotes para no abusar de las APIs
    const seasonsWithEpisodesRaw = await runBatched(seasonFactories, 4)
    const seasonsWithEpisodes = seasonsWithEpisodesRaw.filter(Boolean)

    const totalEpisodes = seasonsWithEpisodes.reduce(
      (acc, s) => acc + (s.episodeCount || 0),
      0
    )

    const payload = {
      meta: {
        id: show.id,
        name: show.name || show.original_name || '',
        totalSeasons: seasonsWithEpisodes.length,
        totalEpisodes,
        sources: ['imdb', 'trakt', 'avg', 'tmdb'],
        cacheTtlDays: 30
      },
      seasons: seasonsWithEpisodes
    }

    return NextResponse.json(payload, {
      status: 200,
      headers: {
        'Cache-Control': `public, s-maxage=${RATINGS_REVALIDATE_SECONDS}, stale-while-revalidate=${RATINGS_REVALIDATE_SECONDS}`
      }
    })
  } catch (err) {
    console.error('Error en /api/tv/[id]/ratings:', err)

    const status = err.status || 500

    if (status === 429) {
      return NextResponse.json(
        {
          error:
            'Se ha alcanzado el límite de peticiones a TMDb al obtener las puntuaciones por episodio. Inténtalo de nuevo más tarde.'
        },
        { status }
      )
    }

    return NextResponse.json(
      {
        error:
          err.message ||
          'Error inesperado al obtener las puntuaciones por episodio.'
      },
      { status }
    )
  }
}
