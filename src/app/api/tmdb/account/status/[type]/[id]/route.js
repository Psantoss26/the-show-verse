// src/app/api/account/status/[type]/[id]/route.js
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { backendFetchJson, setBackendAuthCookies } from '@/lib/backend/server'

const TMDB = 'https://api.themoviedb.org/3'
const API_KEY = process.env.NEXT_PUBLIC_TMDB_API_KEY

export async function GET(req, { params }) {
  const { type, id } = params // 'movie' | 'tv'

  try {
    const backend = await backendFetchJson(req, `/v1/items/${encodeURIComponent(id)}/${type}/status`)
    if (backend.ok) {
      const data = backend.json || {}
      const res = NextResponse.json({
        id: Number(id),
        favorite: Boolean(data.favorite),
        watchlist: Boolean(data.watchlist ?? data.inWatchlist),
        rated: data.rating ? { value: data.rating } : false,
        source: 'backend',
      })
      setBackendAuthCookies(res, backend, { secure: req.nextUrl?.protocol === 'https:' })
      return res
    }
    if (!backend.skipped && backend.status !== 401 && backend.status !== 404) {
      console.warn('Backend account status failed; falling back to TMDb', backend.error)
    }
  } catch (e) {
    console.warn('Backend account status failed; falling back to TMDb', e)
  }

  const cookieStore = await cookies()
  const sessionId = cookieStore.get('tmdb_session_id')?.value

  if (!sessionId) {
    return new Response(JSON.stringify({ error: 'NO_SESSION' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const url = `${TMDB}/${type}/${id}/account_states?api_key=${API_KEY}&session_id=${sessionId}`
  const res = await fetch(url, { cache: 'no-store' })
  const data = await res.json()

  if (!res.ok) {
    return new Response(JSON.stringify({ error: data.status_message || 'TMDB_ERROR' }), {
      status: res.status,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}
