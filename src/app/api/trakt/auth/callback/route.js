import { NextResponse } from 'next/server'
import { cookies, headers } from 'next/headers'

export const runtime = 'nodejs'

function getOrigin() {
    const h = headers()
    const proto = h.get('x-forwarded-proto') ?? 'https'
    const host = h.get('x-forwarded-host') ?? h.get('host')
    return `${proto}://${host}`
}

const cookieBase = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
}

async function exchangeCodeForToken({ code, redirectUri }) {
    const res = await fetch('https://api.trakt.tv/oauth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            code,
            client_id: process.env.TRAKT_CLIENT_ID,
            client_secret: process.env.TRAKT_CLIENT_SECRET,
            redirect_uri: redirectUri,
            grant_type: 'authorization_code',
        }),
    })

    if (!res.ok) {
        const txt = await res.text()
        throw new Error(`Trakt token exchange failed: ${res.status} ${txt}`)
    }
    return res.json()
}

export async function GET(req) {
    const url = new URL(req.url)
    const code = url.searchParams.get('code')
    const state = url.searchParams.get('state')

    const expectedState = cookies().get('trakt_oauth_state')?.value
    if (!code || !state || !expectedState || state !== expectedState) {
        return NextResponse.redirect(new URL('/trakt?error=state', getOrigin()))
    }

    const origin = getOrigin()
    const redirectUri =
        process.env.TRAKT_REDIRECT_URI ?? `${origin}/api/trakt/auth/callback`

    const token = await exchangeCodeForToken({ code, redirectUri })

    const expiresAt = Date.now() + token.expires_in * 1000 - 60_000

    cookies().set('trakt_access_token', token.access_token, {
        ...cookieBase,
        maxAge: token.expires_in,
    })
    cookies().set('trakt_refresh_token', token.refresh_token, {
        ...cookieBase,
        maxAge: 60 * 60 * 24 * 365,
    })
    cookies().set('trakt_expires_at', String(expiresAt), {
        ...cookieBase,
        maxAge: 60 * 60 * 24 * 365,
    })

    const returnTo = cookies().get('trakt_return_to')?.value ?? '/trakt'
    return NextResponse.redirect(new URL(returnTo, origin))
}
