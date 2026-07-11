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

// Protocolo real de la petición: cabecera del proxy → protocolo de la URL.
// Sirve para el `secure` de la cookie y para el origen del redirect. Es clave
// en un NAS servido por HTTP: forzar https rompería la cookie (el navegador la
// descarta) y el redirect (apuntaría a https:// inexistente).
function requestProtocol(request) {
  const forwarded = (request.headers.get('x-forwarded-proto') || '')
    .split(',')[0]
    .trim()
  if (forwarded) return forwarded
  const proto = request.nextUrl?.protocol || ''
  return proto ? proto.replace(/:$/, '') : 'http'
}

function cookieSecure(request) {
  return requestProtocol(request) === 'https'
}

function publicOrigin(request) {
  const forwardedHost = request.headers.get('x-forwarded-host')
  const host = forwardedHost || request.headers.get('host') || ''
  const proto = requestProtocol(request)

  if (host && !host.startsWith('0.0.0.0')) {
    return `${proto}://${host}`
  }

  return process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
}

export async function GET(request) {
  const secret = process.env.SHOWVERSE_PRIVATE_ACCESS_KEY || ''
  if (!secret) return notFound()

  const url = new URL(request.url)
  const key = url.searchParams.get('key') || ''
  if (key !== secret) return notFound()

  const redirectUrl = new URL('/', publicOrigin(request))
  const response = NextResponse.redirect(redirectUrl)
  response.cookies.set(ACCESS_COOKIE, await sha256(secret), {
    httpOnly: true,
    // `secure` según el protocolo real: HTTPS -> secure; HTTP (NAS local) ->
    // no-secure, para que el navegador SÍ guarde la cookie de autorización.
    secure: cookieSecure(request),
    sameSite: 'lax',
    path: '/',
    maxAge: COOKIE_MAX_AGE,
  })
  return response
}

export async function DELETE(request) {
  const response = NextResponse.json({ ok: true })
  response.cookies.set(ACCESS_COOKIE, '', {
    httpOnly: true,
    secure: cookieSecure(request),
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  })
  return response
}
