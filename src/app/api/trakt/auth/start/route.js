import { NextResponse } from 'next/server'
import crypto from 'crypto'
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

export async function GET(req) {
    const clientId = process.env.TRAKT_CLIENT_ID
    if (!clientId) {
        return NextResponse.json(
            { error: 'Missing TRAKT_CLIENT_ID in environment variables' },
            { status: 500 }
        )
    }

    const origin = getOrigin()
    const redirectUri =
        process.env.TRAKT_REDIRECT_URI ?? `${origin}/api/trakt/auth/callback`

    const state = crypto.randomUUID()

    // Opcional: a dónde volver tras conectar
    const returnTo = new URL(req.url).searchParams.get('returnTo') ?? '/history'

    cookies().set('trakt_oauth_state', state, { ...cookieBase, maxAge: 10 * 60 })
    cookies().set('trakt_return_to', returnTo, { ...cookieBase, maxAge: 10 * 60 })

    const url = new URL('https://trakt.tv/oauth/authorize')
    url.searchParams.set('response_type', 'code')
    url.searchParams.set('client_id', clientId)
    url.searchParams.set('redirect_uri', redirectUri)
    url.searchParams.set('state', state)

    return NextResponse.redirect(url.toString())
}
