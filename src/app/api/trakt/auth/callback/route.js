// src/app/api/trakt/auth/callback/route.js
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import {
    buildRedirectUri,
    readOAuthStateCookie,
    exchangeCodeForTokens,
    setTraktCookies,
} from '@/lib/trakt/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request) {
    const cookieStore = await cookies()

    const code = request.nextUrl.searchParams.get('code')
    const state = request.nextUrl.searchParams.get('state')
    const storedState = readOAuthStateCookie(cookieStore)

    if (!code) {
        return NextResponse.redirect(new URL('/settings/trakt?error=missing_code', request.nextUrl.origin))
    }

    if (!storedState || !state || storedState !== state) {
        return NextResponse.redirect(new URL('/settings/trakt?error=bad_state', request.nextUrl.origin))
    }

    try {
        const redirectUri = buildRedirectUri(request.nextUrl.origin)
        const tokens = await exchangeCodeForTokens({ code, redirectUri })

        const res = NextResponse.redirect(new URL('/settings/trakt?connected=1', request.nextUrl.origin))
        setTraktCookies(res, tokens)
        // borramos el state
        res.cookies.set('trakt_oauth_state', '', { path: '/', maxAge: 0 })
        return res
    } catch (e) {
        return NextResponse.redirect(
            new URL(`/settings/trakt?error=${encodeURIComponent(e?.message || 'exchange_failed')}`, request.nextUrl.origin)
        )
    }
}
