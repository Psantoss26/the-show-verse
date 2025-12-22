// /src/app/page.jsx
import MainDashboardClient from '@/components/MainDashboardClient'
import { cookies } from 'next/headers'

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
  fetchRecommendedMovies,
} from '@/lib/api/tmdb'

export const revalidate = 1800 // 30 minutos

/* ====================================================================
 * MISMO CRITERIO QUE EN CLIENTE (MainDashboardClient.jsx):
 *  1) Idioma EN (si existe)
 *  2) Mejor resolución (área)
 *  3) Votos (vote_count, luego vote_average)
 * ==================================================================== */
function pickBestBackdropByLangResVotesServer(list, opts = {}) {
  const {
    preferLangs = ['en', 'en-US'],
    resolutionWindow = 0.98,
    minWidth = 1200,
  } = opts

  if (!Array.isArray(list) || list.length === 0) return null

  const area = (img) => (img?.width || 0) * (img?.height || 0)
  const lang = (img) => img?.iso_639_1 || null

  const sizeFiltered = minWidth > 0 ? list.filter((b) => (b?.width || 0) >= minWidth) : list
  const pool0 = sizeFiltered.length ? sizeFiltered : list

  const hasPreferred = pool0.some((b) => preferLangs.includes(lang(b)))
  const pool1 = hasPreferred ? pool0.filter((b) => preferLangs.includes(lang(b))) : pool0

  const maxArea = Math.max(...pool1.map(area))
  const threshold = maxArea * (typeof resolutionWindow === 'number' ? resolutionWindow : 1.0)
  const pool2 = pool1.filter((b) => area(b) >= threshold)

  const sorted = [...pool2].sort((a, b) => {
    const aA = area(a)
    const bA = area(b)
    if (bA !== aA) return bA - aA
    const w = (b.width || 0) - (a.width || 0)
    if (w !== 0) return w
    const vc = (b.vote_count || 0) - (a.vote_count || 0)
    if (vc !== 0) return vc
    const va = (b.vote_average || 0) - (a.vote_average || 0)
    return va
  })

  return sorted[0] || null
}

/* ========= Backdrop preferido (SERVER) ========= */
async function fetchBestBackdropServer(movieId) {
  try {
    const apiKey = process.env.NEXT_PUBLIC_TMDB_API_KEY
    if (!apiKey || !movieId) return null

    const url =
      `https://api.themoviedb.org/3/movie/${movieId}/images` +
      `?api_key=${apiKey}` +
      `&include_image_language=en,en-US,es,es-ES,null`

    const r = await fetch(url, { cache: 'force-cache' })
    if (!r.ok) return null

    const j = await r.json()
    const backs = Array.isArray(j?.backdrops) ? j.backdrops : []

    const best = pickBestBackdropByLangResVotesServer(backs, {
      preferLangs: ['en', 'en-US'],
      resolutionWindow: 0.98,
      minWidth: 1200,
    })

    return best?.file_path || null
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
      popular,
    ] = await Promise.all([
      fetchTopRatedMovies(),
      fetchCultClassics(),
      fetchMindBendingMovies(),
      fetchTopActionMovies(),
      fetchPopularInUS(),
      fetchUnderratedMovies(),
      fetchRisingMovies(),
      fetchTrendingMovies(),
      fetchPopularMovies(),
    ])

    const recommended = sessionId ? await fetchRecommendedMovies(sessionId) : []

    // ✅ Preparamos los backdrops del hero SIN flicker (mismo criterio que cliente)
    const topRatedWithBackdrop = await Promise.all(
      topRated.map(async (m) => {
        const preferred = await fetchBestBackdropServer(m.id)
        return {
          ...m,
          backdrop_path: preferred || m.backdrop_path || m.poster_path || null,
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
      recommended,
    }
  } catch (err) {
    console.error('Error cargando MainDashboard (SSR):', err)
    return {}
  }
}

/* =================== Página de Inicio =================== */
export default async function HomePage() {
  const cookieStore = await cookies()
  const sessionId = cookieStore.get('tmdb_session')?.value || null

  const dashboardData = await getDashboardData(sessionId)
  return <MainDashboardClient initialData={dashboardData} />
}
