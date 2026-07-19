// src/middleware.js
import { NextResponse } from 'next/server'

const BOT_UA =
    /WhatsApp|facebookexternalhit|Facebot|Twitterbot|Slackbot|Discordbot|TelegramBot|LinkedInBot|Pinterest|Googlebot|bingbot/i
const ACCESS_COOKIE = 'showverse_device_access'
const ACCESS_ROUTE = '/api/private-access'
// Rutas exentas del gate de acceso privado. El gate bloquea TODA la web para
// dispositivos no autorizados, así que la lista se limita a lo imprescindible:
//   - /api/health: sonda de monitorización/uptime (no expone contenido).
//   - Rutas de la extensión: van autenticadas por su propio token (Bearer
//     syncToken), no por la cookie del dispositivo, y se llaman sin cookies
//     (credentials: "omit"); sin exención el middleware devolvería 404 antes de
//     llegar a la ruta.
// Las rutas de auth (/api/auth/*) NO se eximen a propósito: el bloqueo es por
// dispositivo, no por login. Un dispositivo AUTORIZADO las usa con normalidad
// (pasa por su cookie de acceso); uno no autorizado no debe poder tocarlas.
const PUBLIC_API_ROUTES = new Set([
    '/api/health',
    '/api/netflix/extension-sync',
    '/api/netflix/extension-import',
    '/api/netflix/extension-progress',
])
const PUBLIC_FILE_RE = /\.(?:avif|gif|ico|jpg|jpeg|js|json|map|png|svg|txt|webmanifest|webp|woff|woff2)$/i

async function sha256(value) {
    const bytes = new TextEncoder().encode(value)
    const hash = await crypto.subtle.digest('SHA-256', bytes)
    return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

function privateAccessKey() {
    return process.env.SHOWVERSE_PRIVATE_ACCESS_KEY || ''
}

function requestHost(req) {
    return (
        req.headers.get('x-forwarded-host') ||
        req.headers.get('host') ||
        ''
    )
        .split(',')[0]
        .trim()
        .toLowerCase()
        .replace(/:\d+$/, '')
}

function privateAccessHosts() {
    return (process.env.SHOWVERSE_PRIVATE_ACCESS_HOSTS || '')
        .split(',')
        .map((host) => host.trim().toLowerCase().replace(/:\d+$/, ''))
        .filter(Boolean)
}

function hostMatches(host, pattern) {
    if (!host || !pattern) return false
    if (pattern.startsWith('*.')) {
        const suffix = pattern.slice(1)
        return host.endsWith(suffix)
    }
    return host === pattern
}

function isPrivateAccessEnabled(req) {
    // El gate solo actúa si hay llave definida. Así, definiéndola SOLO en el
    // entorno del NAS (y no en desarrollo local), queda activo en producción y
    // abierto en local sin más configuración.
    if (!privateAccessKey()) return false

    // Lista de hosts OPCIONAL: si se define, el gate solo actúa en esos dominios
    // (útil si el NAS es accesible por varios nombres y quieres restringir a
    // algunos). Vacía = se activa para cualquier host donde esté la llave.
    const hosts = privateAccessHosts()
    if (hosts.length > 0) {
        return hosts.some((allowedHost) => hostMatches(requestHost(req), allowedHost))
    }

    return true
}

function isPublicAsset(pathname) {
    return (
        pathname.startsWith('/_next/static/') ||
        pathname.startsWith('/images/') ||
        pathname.startsWith('/assets/') ||
        PUBLIC_API_ROUTES.has(pathname) ||
        pathname === '/favicon.ico' ||
        pathname === '/robots.txt' ||
        pathname === '/sitemap.xml' ||
        PUBLIC_FILE_RE.test(pathname)
    )
}

async function hasPrivateAccess(req) {
    const key = privateAccessKey()
    if (!key) return true
    const expected = await sha256(key)
    return req.cookies.get(ACCESS_COOKIE)?.value === expected
}

export async function middleware(req) {
    const { pathname } = req.nextUrl

    if (
        isPrivateAccessEnabled(req) &&
        pathname !== ACCESS_ROUTE &&
        !isPublicAsset(pathname) &&
        !(await hasPrivateAccess(req))
    ) {
        return new NextResponse('Not Found', {
            status: 404,
            headers: {
                'content-type': 'text/plain; charset=utf-8',
                'x-robots-tag': 'noindex, nofollow',
            },
        })
    }

    const ua = req.headers.get('user-agent') || ''
    if (!BOT_UA.test(ua)) return NextResponse.next()

    const url = req.nextUrl.clone()

    let m = pathname.match(/^\/details\/movie\/(\d+)\/?$/)
    if (m) {
        url.pathname = `/s/movie/${m[1]}`
        return NextResponse.rewrite(url)
    }

    m = pathname.match(/^\/details\/tv\/(\d+)\/?$/)
    if (m) {
        url.pathname = `/s/tv/${m[1]}`
        return NextResponse.rewrite(url)
    }

    m = pathname.match(/^\/details\/person\/(\d+)\/?$/)
    if (m) {
        url.pathname = `/s/person/${m[1]}`
        return NextResponse.rewrite(url)
    }

    return NextResponse.next()
}

export const config = {
    // El middleware solo necesita ejecutarse para:
    //  - rutas de página (gate de acceso privado + reescritura para bots en /details/*)
    //  - rutas /api/* (gate de acceso privado)
    // NO debe ejecutarse para recursos internos de Next ni assets estáticos:
    // cada ejecución cuenta como invocación/Edge Request en Vercel y antes se
    // disparaba en /_next/image, /_next/data, fuentes, favicon, sitemap y todo
    // fichero con extensión. Los excluimos del matcher para no malgastar
    // recursos (su lógica interna ya los trataba como públicos de todos modos).
    matcher: [
        '/((?!_next/static|_next/image|_next/data|favicon\\.ico|robots\\.txt|sitemap\\.xml|manifest\\.webmanifest|.*\\.(?:png|jpe?g|gif|webp|avif|svg|ico|css|js|map|json|txt|woff2?|webmanifest)$).*)',
    ],
}
