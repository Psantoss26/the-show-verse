// /src/app/page.jsx
import MainDashboardClient from '@/components/MainDashboardClient'

import {
  fetchTopRatedMovies,
  fetchCultClassics,
  fetchMindBendingMovies,
  fetchTopActionMovies,
  fetchPopularInUS,
  fetchUnderratedMovies,
  fetchRisingMovies,
  fetchTrendingMovies,
  fetchPopularMovies,
  fetchRecommendedMovies
} from '@/lib/api/tmdb'

export const revalidate = 1800 // 30 minutos

/* ========= elegir mejor backdrop: ES -> EN, y por calidad (SERVER) ========= */
async function fetchBackdropEsThenEnServer(movieId) {
  try {
    const url =
      `https://api.themoviedb.org/3/movie/${movieId}/images` +
      `?api_key=${process.env.NEXT_PUBLIC_TMDB_API_KEY}` +
      `&language=es-ES&include_image_language=es,es-ES,en,en-US`

    const r = await fetch(url, { cache: 'force-cache' })
    const j = await r.json()
    const backs = Array.isArray(j?.backdrops) ? j.backdrops : []

    const pickBest = (arr) => {
      if (!arr.length) return null
      const sorted = [...arr].sort((a, b) => {
        const vc = (b.vote_count || 0) - (a.vote_count || 0)
        if (vc !== 0) return vc
        const va = (b.vote_average || 0) - (a.vote_average || 0)
        if (va !== 0) return va
        return (b.width || 0) - (a.width || 0)
      })
      const topVote = sorted[0]?.vote_count || 0
      const topSet = sorted.filter((x) => (x.vote_count || 0) === topVote)
      topSet.sort((a, b) => (b.width || 0) - (a.width || 0))
      return topSet[0] || sorted[0]
    }

    const es = backs.filter(
      (b) => b.iso_639_1 === 'es' || b.iso_639_1 === 'es-ES'
    )
    const en = backs.filter(
      (b) => b.iso_639_1 === 'en' || b.iso_639_1 === 'en-US'
    )

    const bestES = pickBest(es)
    if (bestES?.file_path) return bestES.file_path

    const bestEN = pickBest(en)
    if (bestEN?.file_path) return bestEN.file_path

    return null
  } catch {
    return null
  }
}

/* ======== Carga de datos en el SERVIDOR ======== */
async function getDashboardData(sessionId = null) {
  try {
    const [
      topRated,
      cult,
      mind,
      action,
      us,
      underrated,
      rising,
      trending,
      popular
    ] = await Promise.all([
      fetchTopRatedMovies(),
      fetchCultClassics(),
      fetchMindBendingMovies(),
      fetchTopActionMovies(),
      fetchPopularInUS(),
      fetchUnderratedMovies(),
      fetchRisingMovies(),
      fetchTrendingMovies(),
      fetchPopularMovies()
    ])

    const recommended = sessionId
      ? await fetchRecommendedMovies(sessionId)
      : []

    // Preparamos los backdrops del hero SIN flicker (ES/EN por votos)
    const topRatedWithBackdrop = await Promise.all(
      topRated.map(async (m) => {
        const preferred = await fetchBackdropEsThenEnServer(m.id)
        return {
          ...m,
          backdrop_path: preferred || m.backdrop_path || m.poster_path || null
        }
      })
    )

    return {
      topRated: topRatedWithBackdrop,
      cult,
      mind,
      action,
      us,
      underrated,
      rising,
      trending,
      popular,
      recommended
    }
  } catch (err) {
    console.error('Error cargando MainDashboard (SSR):', err)
    return {}
  }
}

/* =================== Página de Inicio =================== */
export default async function HomePage() {
  const dashboardData = await getDashboardData(null)
  return <MainDashboardClient initialData={dashboardData} />
}
