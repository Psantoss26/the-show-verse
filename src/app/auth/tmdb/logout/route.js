// src/app/api/auth/tmdb/logout/route.js
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'

const TMDB = 'https://api.themoviedb.org/3'
const API_KEY = process.env.NEXT_PUBLIC_TMDB_API_KEY

export async function POST() {
  const cookieStore = cookies()
  const sessionCookie = cookieStore.get('tmdb_session_id')
  const sessionId = sessionCookie?.value

  if (!sessionId) {
    const res = NextResponse.json({ ok: true, message: 'No había sesión' })
    res.cookies.set('tmdb_session_id', '', { path: '/', maxAge: 0 })
    return res
  }

  // Intentamos invalidar la sesión también en TMDB (opcional pero mejor)
  try {
    const url = `${TMDB}/authentication/session?api_key=${API_KEY}`
    await fetch(url, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json;charset=utf-8' },
      body: JSON.stringify({ session_id: sessionId })
    })
  } catch (e) {
    console.error('Error invalidando sesión en TMDB:', e)
  }

  const res = NextResponse.json({ ok: true })
  res.cookies.set('tmdb_session_id', '', { path: '/', maxAge: 0 })
  return res
}
