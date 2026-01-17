// src/middleware.js
import { NextResponse } from 'next/server'

const BOT_UA =
    /WhatsApp|facebookexternalhit|Facebot|Twitterbot|Slackbot|Discordbot|TelegramBot|LinkedInBot|Pinterest|Googlebot|bingbot/i

export function middleware(req) {
    const ua = req.headers.get('user-agent') || ''
    if (!BOT_UA.test(ua)) return NextResponse.next()

    const { pathname } = req.nextUrl

    // ✅ Solo para movies (puedes ampliar luego a tv/person)
    const m = pathname.match(/^\/details\/movie\/(\d+)\/?$/)
    if (m) {
        const id = m[1]
        const url = req.nextUrl.clone()

        // ✅ Reescribe internamente a tu HTML OG ultraligero
        url.pathname = `/s/movie/${id}`

        // (Opcional) no tocar search para que "details" sea exactamente igual
        return NextResponse.rewrite(url)
    }

    return NextResponse.next()
}

export const config = {
    matcher: ['/details/:path*']
}