// src/app/api/trakt/auth/start/route.js
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { buildAuthorizeUrl, newOAuthState, setOAuthStateCookie } from '@/lib/trakt/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request) {
    const origin = request.nextUrl.origin
    const state = newOAuthState()

    const authorizeUrl = buildAuthorizeUrl({ origin, state })

    const res = NextResponse.redirect(authorizeUrl)
    setOAuthStateCookie(res, state)
    return res
}
