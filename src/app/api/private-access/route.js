import { NextResponse } from 'next/server'

const ACCESS_COOKIE = 'showverse_device_access'
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365

async function sha256(value) {
  const bytes = new TextEncoder().encode(value)
  const hash = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

function notFound() {
  return new NextResponse('Not Found', {
    status: 404,
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'x-robots-tag': 'noindex, nofollow',
    },
  })
}

function safeNextPath(value) {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return '/'
  return value
}

export async function GET(request) {
  const secret = process.env.SHOWVERSE_PRIVATE_ACCESS_KEY || ''
  if (!secret) return notFound()

  const url = new URL(request.url)
  const key = url.searchParams.get('key') || ''
  if (key !== secret) return notFound()

  const redirectUrl = new URL(safeNextPath(url.searchParams.get('next')), url.origin)
  const response = NextResponse.redirect(redirectUrl)
  response.cookies.set(ACCESS_COOKIE, await sha256(secret), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: COOKIE_MAX_AGE,
  })
  return response
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true })
  response.cookies.set(ACCESS_COOKIE, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  })
  return response
}
