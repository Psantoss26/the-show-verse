// src/app/api/account/favorite/route.js
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
  const { mediaType, mediaId, favorite } = body // 'movie' | 'tv'

  try {
    const account = await getAccount(sessionId)

    const url = `${TMDB}/account/${account.id}/favorite?api_key=${API_KEY}&session_id=${sessionId}`
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json;charset=utf-8' },
      body: JSON.stringify({
        media_type: mediaType,
        media_id: mediaId,
        favorite: !!favorite,
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
