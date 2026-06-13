// src/middleware.js
import { NextResponse } from 'next/server'

const BOT_UA =
    /WhatsApp|facebookexternalhit|Facebot|Twitterbot|Slackbot|Discordbot|TelegramBot|LinkedInBot|Pinterest|Googlebot|bingbot/i
const ACCESS_COOKIE = 'showverse_device_access'
const ACCESS_ROUTE = '/api/private-access'
const PUBLIC_API_ROUTES = new Set(['/api/health'])
const PUBLIC_FILE_RE = /\.(?:avif|gif|ico|jpg|jpeg|js|json|map|png|svg|txt|webmanifest|webp|woff|woff2)$/i

async function sha256(value) {
    const bytes = new TextEncoder().encode(value)
    const hash = await crypto.subtle.digest('SHA-256', bytes)
    return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

function privateAccessKey() {
    return process.env.SHOWVERSE_PRIVATE_ACCESS_KEY || ''
}

function isPrivateAccessEnabled() {
    return Boolean(privateAccessKey())
}

function isPublicAsset(pathname) {
    return (
        pathname.startsWith('/_next/') ||
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
        isPrivateAccessEnabled() &&
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
    matcher: ['/((?!_next/static|_next/image).*)']
}
