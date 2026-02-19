// /api/tmdb/localized-images  (POST { type: "movie"|"tv", ids: number[], kind?: "backdrop"|"poster" })
import { NextResponse } from 'next/server'

const TMDB = 'https://api.themoviedb.org/3'
const API_KEY = process.env.NEXT_PUBLIC_TMDB_API_KEY

function pickBestByLangThenResolution(list, opts = {}) {
  const { preferLangs = ['en', 'en-US'], minWidth = 0 } = opts
  if (!Array.isArray(list) || list.length === 0) return null

  const area = (img) => (img?.width || 0) * (img?.height || 0)
  const lang = (img) => img?.iso_639_1 || null

  const sizeFiltered = minWidth > 0 ? list.filter((p) => (p?.width || 0) >= minWidth) : list
  const pool0 = sizeFiltered.length ? sizeFiltered : list

  const hasPreferred = pool0.some((p) => preferLangs.includes(lang(p)))
  const pool1 = hasPreferred ? pool0.filter((p) => preferLangs.includes(lang(p))) : pool0

  let best = null
  let bestArea = -1
  for (const p of pool1) {
    const a = area(p)
    if (a > bestArea) {
      bestArea = a
      best = p
    }
  }
  return best
}

// Backdrop: EN -> cualquier idioma, priorizando tamaño útil (mismo criterio que Favoritos)
function pickLocalizedBackdrop(backdrops = []) {
  const best = pickBestByLangThenResolution(backdrops, {
    preferLangs: ['en', 'en-US'],
    minWidth: 1280,
  })
  return best?.file_path || null
}

// Poster: EN -> cualquier idioma, priorizando mayor área disponible (mismo criterio que Favoritos)
function pickLocalizedPoster(posters = []) {
  const best = pickBestByLangThenResolution(posters, {
    preferLangs: ['en', 'en-US'],
    minWidth: 500,
  })
  return best?.file_path || null
}

async function poolMap(concurrency, items, fn) {
  const results = new Array(items.length)
  let i = 0
  let active = 0
  return new Promise((resolve) => {
    const tick = () => {
      while (active < concurrency && i < items.length) {
        const idx = i++
        const item = items[idx]
        active++
        fn(item, idx)
          .then((v) => (results[idx] = v))
          .catch(() => (results[idx] = [item, null])) // evita null suelto en Object.fromEntries
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

// POST route: siempre dinámico (no pre-renderizable en Vercel)
export const dynamic = 'force-dynamic'

const REVALIDATE_SECS = 86400 // 24h - usado en caché interna de fetch, no a nivel de ruta

export async function POST(req) {
  try {
    const { type = 'movie', ids = [], kind = 'backdrop' } = await req.json()
    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: 'ids vacíos' }, { status: 400 })
    }
    if (!['backdrop', 'poster'].includes(kind)) {
      return NextResponse.json({ error: 'kind inválido' }, { status: 400 })
    }

    const unique = [...new Set(ids)].slice(0, 400)

    const pairs = await poolMap(8, unique, async (id) => {
      // Mismo criterio que Favoritos/Pendientes: inglés + imágenes sin idioma (backdrops)
      const url = `${TMDB}/${type}/${id}/images?api_key=${API_KEY}&include_image_language=en,en-US,null`
      const r = await fetch(url, { cache: 'force-cache', next: { revalidate: REVALIDATE_SECS } })
      if (!r.ok) return [id, null]
      const j = await r.json()
      if (kind === 'poster') {
        return [id, pickLocalizedPoster(j?.posters || [])]
      }
      return [id, pickLocalizedBackdrop(j?.backdrops || [])]
    })

    const map = Object.fromEntries(pairs)
    const res = NextResponse.json({ ok: true, type, kind, map })
    res.headers.set('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=604800')
    return res
  } catch {
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}
