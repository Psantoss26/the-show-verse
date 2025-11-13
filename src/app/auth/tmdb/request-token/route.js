// src/app/auth/tmdb/request-token/route.js
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'        // evita cacheo en build
export const revalidate = 0                   // idem

export async function GET() {
  const API_KEY = process.env.NEXT_PUBLIC_TMDB_API_KEY
  if (!API_KEY) {
    return NextResponse.json(
      { ok: false, error: 'Falta NEXT_PUBLIC_TMDB_API_KEY' },
      { status: 500 }
    )
  }

  try {
    const url = new URL('https://api.themoviedb.org/3/authentication/token/new')
    url.searchParams.set('api_key', API_KEY)

    const r = await fetch(url.toString(), {
      cache: 'no-store',
      headers: { 'Accept': 'application/json' },
    })

    const data = await r.json()

    if (!r.ok || !data?.success) {
      return NextResponse.json(
        { ok: false, error: data?.status_message || `TMDb ${r.status}` },
        { status: 500 }
      )
    }

    // opcional: devolver también una URL de autenticación lista
    const origin =
      process.env.NEXT_PUBLIC_APP_ORIGIN ||
      process.env.VERCEL_URL?.startsWith('http')
        ? process.env.VERCEL_URL
        : `https://${process.env.VERCEL_URL || 'localhost:3000'}`

    const redirect_to = `${origin}/auth/callback?request_token=${data.request_token}`

    return NextResponse.json({
      ok: true,
      request_token: data.request_token,
      expires_at: data.expires_at,
      authenticate_url: `https://www.themoviedb.org/authenticate/${data.request_token}?redirect_to=${encodeURIComponent(
        redirect_to
      )}`,
    })
  } catch (err) {
    console.error('TMDB request-token error:', err)
    return NextResponse.json(
      { ok: false, error: 'Fallo solicitando token a TMDb' },
      { status: 500 }
    )
  }
}
