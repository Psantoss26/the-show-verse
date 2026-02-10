// /app/api/imdb/top-rated/route.js
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const revalidate = 43200 // 12 horas

// ✅ Mejor: clave server-side
const API_KEY = process.env.TMDB_API_KEY || process.env.NEXT_PUBLIC_TMDB_API_KEY
const BASE_URL = 'https://api.themoviedb.org/3'
const OMDB_KEY = process.env.OMDB_API_KEY

function buildUrl(path, params = {}) {
  const url = new URL(`${BASE_URL}${path}`)
  url.searchParams.set('api_key', API_KEY || '')
  url.searchParams.set('language', 'es-ES')
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null) url.searchParams.set(k, v)
  })
  return url.toString()
}

async function fetchJson(url, init) {
  const res = await fetch(url, init)
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json?.status_message || `Request failed (${res.status})`)
  return json
}

async function tmdbDiscoverSeed({ type = 'movie', pages = 3 }) {
  const seeds = [
    buildUrl(`/discover/${type}`, { sort_by: 'popularity.desc', page: 1 }),
    buildUrl(`/${type}/top_rated`, { page: 1 }),
  ]
  for (let p = 2; p <= pages; p++) {
    seeds.push(buildUrl(`/discover/${type}`, { sort_by: 'popularity.desc', page: p }))
  }

  const batches = await Promise.allSettled(seeds.map((u) => fetchJson(u, { next: { revalidate: 60 * 60 * 12 } })))
  const items = []
  for (const b of batches) {
    if (b.status === 'fulfilled' && Array.isArray(b.value.results)) {
      items.push(...b.value.results)
    }
  }
  const map = new Map()
  for (const it of items) map.set(it.id, it)
  return [...map.values()]
}

async function tmdbImdbId(type, id) {
  const data = await fetchJson(buildUrl(`/${type}/${id}/external_ids`, { language: undefined }), {
    next: { revalidate: 60 * 60 * 24 },
  })
  return data?.imdb_id || null
}

async function omdbByImdb(imdb) {
  if (!OMDB_KEY) return null
  const url = `https://www.omdbapi.com/?apikey=${OMDB_KEY}&i=${imdb}`
  const res = await fetch(url, { next: { revalidate: 60 * 60 * 24 } })
  const j = await res.json().catch(() => ({}))
  if (j?.Response === 'False') return null
  return j
}

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url)
    const type = searchParams.get('type') === 'tv' ? 'tv' : 'movie'
    const pages = Math.min(Math.max(parseInt(searchParams.get('pages') || '3', 10), 1), 5)
    const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '20', 10), 1), 50)
    const minVotes = Math.max(parseInt(searchParams.get('minVotes') || '10000', 10), 0)

    if (!API_KEY) {
      return NextResponse.json(
        { error: 'TMDb key missing (set TMDB_API_KEY in Vercel env)' },
        { status: 500 }
      )
    }

    // 1) Semillas desde TMDb
    const candidates = await tmdbDiscoverSeed({ type, pages })

    // ✅ Si no hay OMDb key, devolvemos “top” basado en TMDb (fallback)
    if (!OMDB_KEY) {
      console.warn('[IMDb Top-Rated] OMDB_KEY not configured, using TMDb fallback')
      const fallback = [...candidates]
        .sort((a, b) => (b.vote_average || 0) - (a.vote_average || 0) || (b.vote_count || 0) - (a.vote_count || 0))
        .slice(0, limit)

      const res = NextResponse.json({ items: fallback, meta: { source: 'tmdb-fallback', type } })
      res.headers.set('Cache-Control', 'public, s-maxage=43200, stale-while-revalidate=86400')
      return res
    }

    // 2) Enriquecer con IMDb (paralelo)
    const concurrency = 8
    const queue = [...candidates]
    const enriched = []

    async function worker() {
      while (queue.length) {
        const item = queue.shift()
        try {
          const imdb = await tmdbImdbId(type, item.id)
          if (!imdb) continue

          const o = await omdbByImdb(imdb)
          if (!o) continue

          const imdbRating = o?.imdbRating && o.imdbRating !== 'N/A' ? Number(o.imdbRating) : null
          const imdbVotes = o?.imdbVotes ? Number(String(o.imdbVotes).replace(/,/g, '')) : 0
          if (!imdbRating) continue
          if (imdbVotes < minVotes) continue

          enriched.push({
            ...item,
            imdb_id: imdb,
            _imdb: { rating: imdbRating, votes: imdbVotes },
          })
        } catch {
          // seguimos
        }
      }
    }

    await Promise.all(new Array(concurrency).fill(0).map(worker))

    // 3) Orden por rating IMDb y votos
    enriched.sort((a, b) => {
      const r = (b._imdb?.rating || 0) - (a._imdb?.rating || 0)
      if (r !== 0) return r
      return (b._imdb?.votes || 0) - (a._imdb?.votes || 0)
    })

    const items = enriched.slice(0, limit)

    const res = NextResponse.json({ items, meta: { source: 'imdb+omdb', type } })
    res.headers.set('Cache-Control', 'public, s-maxage=43200, stale-while-revalidate=86400')
    return res
  } catch {
    return NextResponse.json({ error: 'Failed to build IMDb top' }, { status: 500 })
  }
}
