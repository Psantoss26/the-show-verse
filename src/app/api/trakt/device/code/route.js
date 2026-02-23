import { NextResponse } from 'next/server'

const TRAKT_API = 'https://api.trakt.tv'

function traktUserAgent() {
    return process.env.TRAKT_USER_AGENT || 'TheShowVerse/1.0 (Next.js; Trakt Device Flow)'
}

function traktHeaders() {
    return {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'trakt-api-version': '2',
        'trakt-api-key': process.env.TRAKT_CLIENT_ID,
        'User-Agent': traktUserAgent(),
    }
}

export async function POST() {
    const client_id = process.env.TRAKT_CLIENT_ID
    if (!client_id) {
        return NextResponse.json({ error: 'Missing TRAKT_CLIENT_ID' }, { status: 500 })
    }

    const r = await fetch(`${TRAKT_API}/oauth/device/code`, {
        method: 'POST',
        headers: traktHeaders(),
        body: JSON.stringify({ client_id }),
    })

    const data = await r.json().catch(() => ({}))
    return NextResponse.json(data, { status: r.status })
}
