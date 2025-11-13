// /api/tmdb/localized-images  (POST { type: "movie"|"tv", ids: number[] })
import { NextResponse } from 'next/server'

const TMDB = 'https://api.themoviedb.org/3'
const API_KEY = process.env.NEXT_PUBLIC_TMDB_API_KEY

// Prioriza ES y luego EN por mayor vote_count
function pickLocalized(backdrops = []) {
  const byVotes = (a, b) => (b.vote_count || 0) - (a.vote_count || 0)
  const es = backdrops.filter(b => b.iso_639_1 === 'es' || b.iso_639_1 === 'es-ES').sort(byVotes)
  const en = backdrops.filter(b => b.iso_639_1 === 'en' || b.iso_639_1 === 'en-US').sort(byVotes)
  return (es[0]?.file_path) || (en[0]?.file_path) || null
}

async function poolMap(concurrency, items, fn) {
  const results = new Array(items.length)
  let i = 0
  let active = 0
  return new Promise((resolve) => {
    const tick = () => {
      while (active < concurrency && i < items.length) {
        const idx = i++
        active++
        fn(items[idx], idx)
          .then(v => (results[idx] = v))
          .catch(() => (results[idx] = null))
          .finally(() => {
            active--
            if (i >= items.length && active === 0) resolve(results)
            else setTimeout(tick, 60)
          })
      }
    }
    tick()
  })
}

export const revalidate = 86400 // 24h (ISR)

export async function POST(req) {
  try {
    const { type = 'movie', ids = [] } = await req.json()
    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: 'ids vacíos' }, { status: 400 })
    }

    const unique = [...new Set(ids)].slice(0, 400)

    const pairs = await poolMap(8, unique, async (id) => {
      const url = `${TMDB}/${type}/${id}/images?api_key=${API_KEY}&include_image_language=es-ES,es,en-US,en`
      const r = await fetch(url, { cache: 'force-cache', next: { revalidate } })
      if (!r.ok) return [id, null]
      const j = await r.json()
      return [id, pickLocalized(j?.backdrops || [])]
    })

    const map = Object.fromEntries(pairs)
    const res = NextResponse.json({ ok: true, type, map })
    res.headers.set('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=604800')
    return res
  } catch {
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}
