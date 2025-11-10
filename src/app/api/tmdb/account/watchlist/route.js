// src/app/api/account/watchlist/route.js
import { cookies } from 'next/headers'

const TMDB = 'https://api.themoviedb.org/3'
const API_KEY = process.env.NEXT_PUBLIC_TMDB_API_KEY

async function getAccount(sessionId) {
  const url = `${TMDB}/account?api_key=${API_KEY}&session_id=${sessionId}`
  const res = await fetch(url, { cache: 'no-store' })
  const data = await res.json()
  if (!res.ok) throw new Error(data.status_message || 'TMDB_ACCOUNT_ERROR')
  return data
}

// Listar watchlist
export async function GET(req) {
  const cookieStore = cookies()
  const sessionId = cookieStore.get('tmdb_session_id')?.value
  const { searchParams } = new URL(req.url)
  const type = searchParams.get('type') || 'movies' // 'movies' | 'tv'
  const page = searchParams.get('page') || '1'

  if (!sessionId) {
    return new Response(JSON.stringify({ error: 'NO_SESSION' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const accountRes = await fetch(`${TMDB}/account?api_key=${API_KEY}&session_id=${sessionId}`, {
    cache: 'no-store',
  })
  const accountData = await accountRes.json()
  if (!accountRes.ok) {
    return new Response(JSON.stringify({ error: accountData.status_message || 'TMDB_ACCOUNT_ERROR' }), {
      status: accountRes.status,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const url =
    type === 'tv'
      ? `${TMDB}/account/${accountData.id}/watchlist/tv?api_key=${API_KEY}&session_id=${sessionId}&page=${page}`
      : `${TMDB}/account/${accountData.id}/watchlist/movies?api_key=${API_KEY}&session_id=${sessionId}&page=${page}`

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

// Añadir / quitar en watchlist
export async function POST(req) {
  const cookieStore = cookies()
  const sessionId = cookieStore.get('tmdb_session_id')?.value

  if (!sessionId) {
    return new Response(JSON.stringify({ error: 'NO_SESSION' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const body = await req.json()
  const { mediaType, mediaId, watchlist } = body // 'movie' | 'tv'

  try {
    const account = await getAccount(sessionId)

    const url = `${TMDB}/account/${account.id}/watchlist?api_key=${API_KEY}&session_id=${sessionId}`
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json;charset=utf-8' },
      body: JSON.stringify({
        media_type: mediaType,
        media_id: mediaId,
        watchlist: !!watchlist,
      }),
    })

    const data = await res.json()

    if (!res.ok) {
      return new Response(JSON.stringify({ error: data.status_message || 'TMDB_ERROR' }), {
        status: res.status,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}
