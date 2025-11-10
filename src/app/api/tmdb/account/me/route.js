// src/app/api/account/me/route.js
import { cookies } from 'next/headers'

const TMDB = 'https://api.themoviedb.org/3'
const API_KEY = process.env.NEXT_PUBLIC_TMDB_API_KEY

export async function GET() {
  const cookieStore = cookies()
  const sessionId = cookieStore.get('tmdb_session_id')?.value

  if (!sessionId) {
    return new Response(JSON.stringify({ error: 'NO_SESSION' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const url = `${TMDB}/account?api_key=${API_KEY}&session_id=${sessionId}`
  const res = await fetch(url, { cache: 'no-store' })
  const data = await res.json()

  if (!res.ok) {
    return new Response(JSON.stringify({ error: data.status_message || 'TMDB_ERROR' }), {
      status: res.status,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  return new Response(JSON.stringify({ account: data }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}
