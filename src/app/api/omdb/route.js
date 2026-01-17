import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

// cache + inflight en memoria (vive mientras el proceso esté levantado)
const g = globalThis
g.__omdbCache = g.__omdbCache || new Map()
g.__omdbInflight = g.__omdbInflight || new Map()

const cache = g.__omdbCache
const inflight = g.__omdbInflight

const KEY = process.env.OMDB_API_KEY || process.env.NEXT_PUBLIC_OMDB_API_KEY

function json(body, status = 200, extraHeaders = {}) {
  return NextResponse.json(body, {
    status,
    headers: {
      // CDN cache friendly (prod) + SWR
      'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=604800',
      ...extraHeaders
    }
  })
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n))
}

async function fetchWithTimeout(url, timeoutMs) {
  const controller = new AbortController()
  const t = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const r = await fetch(url, {
      signal: controller.signal,
      // En prod Next puede cachear además de nuestro Map
      next: { revalidate: 60 * 60 * 24 } // 24h
    })
    const text = await r.text()

    let data
    try {
      data = JSON.parse(text)
    } catch {
      // ✅ nunca devolvemos HTML “en bruto”
      data = {
        Response: 'False',
        Error: 'OMDb upstream did not return JSON'
      }
    }

    return { ok: r.ok, status: r.status, data }
  } finally {
    clearTimeout(t)
  }
}

export async function GET(req) {
  try {
    if (!KEY) return json({ error: 'OMDB_API_KEY missing in env' }, 500)

    const { searchParams } = new URL(req.url)
    const imdb = searchParams.get('i')
    if (!imdb) return json({ error: 'Missing imdb id (param i)' }, 400)

    // ✅ Por defecto rápido (listas). Si quieres más en detalles: añade &timeoutMs=8000 desde el fetch.
    const timeoutMs = clamp(Number(searchParams.get('timeoutMs') || 2500), 800, 20000)

    const url =
      `https://www.omdbapi.com/?apikey=${encodeURIComponent(KEY)}` +
      `&i=${encodeURIComponent(imdb)}` +
      `&plot=short` +
      `&r=json` +
      `&tomatoes=true`

    // ✅ cache (éxitos: 24h, fallos: 60s)
    const cached = cache.get(url)
    const now = Date.now()
    if (cached && cached.exp > now) {
      return json(cached.body, 200, { 'X-OMDB-CACHE': 'HIT' })
    }

    // ✅ dedupe seguro: compartimos SOLO el body, no una Response
    if (inflight.has(url)) {
      const body = await inflight.get(url)
      return json(body, 200, { 'X-OMDB-CACHE': 'DEDUPED' })
    }

    const p = (async () => {
      try {
        const { ok, data } = await fetchWithTimeout(url, timeoutMs)
        // aunque ok=false, devolvemos JSON con forma OMDb (Response False)
        return ok ? data : (data || { Response: 'False', Error: 'OMDb upstream error' })
      } catch (e) {
        const isAbort = e?.name === 'AbortError'
        return { Response: 'False', Error: isAbort ? 'OMDb timeout' : 'OMDb proxy failed' }
      } finally {
        inflight.delete(url)
      }
    })()

    inflight.set(url, p)
    const body = await p

    const success = body && body.Response !== 'False'
    cache.set(url, { exp: now + (success ? 24 * 60 * 60 * 1000 : 60 * 1000), body })

    return json(body, 200, { 'X-OMDB-CACHE': success ? 'MISS' : 'MISS-FAIL' })
  } catch (err) {
    return json({ Response: 'False', Error: 'OMDb route crashed' }, 500)
  }
}