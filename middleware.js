// src/middleware.js
import { NextResponse } from 'next/server'

const BOT_UA =
    /WhatsApp|facebookexternalhit|Facebot|Twitterbot|Slackbot|Discordbot|TelegramBot|LinkedInBot|Pinterest|Googlebot|bingbot/i

export function middleware(req) {
    const { pathname } = req.nextUrl

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
