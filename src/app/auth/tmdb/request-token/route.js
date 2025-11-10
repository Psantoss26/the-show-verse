// src/app/api/auth/tmdb/request-token/route.js
import { NextResponse } from 'next/server'

const TMDB = 'https://api.themoviedb.org/3'
const API_KEY = process.env.NEXT_PUBLIC_TMDB_API_KEY

export async function GET(req) {
  if (!API_KEY) {
    return NextResponse.json(
      { error: 'Falta NEXT_PUBLIC_TMDB_API_KEY en .env' },
      { status: 500 }
    )
  }

  // 1) Pedimos un request_token a TMDB
  const tokenUrl = `${TMDB}/authentication/token/new?api_key=${API_KEY}`
  const tokenRes = await fetch(tokenUrl, { cache: 'no-store' })
  const tokenData = await tokenRes.json()

  if (!tokenRes.ok || !tokenData.success) {
    return NextResponse.json(
      { error: tokenData.status_message || 'No se pudo obtener request_token' },
      { status: tokenRes.status || 500 }
    )
  }

  const requestToken = tokenData.request_token

  // 2) Construimos la URL de autenticación de TMDB con redirect a nuestra callback
  const origin =
    req.headers.get('origin') ||
    process.env.NEXT_PUBLIC_BASE_URL ||
    'http://localhost:3000'

  const redirectUrl = `${origin}/api/auth/tmdb/callback`
  const authUrl = `https://www.themoviedb.org/authenticate/${requestToken}?redirect_to=${encodeURIComponent(
    redirectUrl
  )}`

  // 3) Devolvemos la URL para que el cliente haga window.location.href = authUrl
  return NextResponse.json({ authUrl })
}
