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

export async function POST(req) {
    const { device_code } = await req.json().catch(() => ({}))

    const client_id = process.env.TRAKT_CLIENT_ID
    const client_secret = process.env.TRAKT_CLIENT_SECRET

    if (!client_id || !client_secret) {
        return NextResponse.json({ error: 'Missing Trakt env vars' }, { status: 500 })
    }
    if (!device_code) {
        return NextResponse.json({ error: 'Missing device_code' }, { status: 400 })
    }

    // Trakt espera "code" (device_code) + client_id + client_secret :contentReference[oaicite:6]{index=6}
    const r = await fetch(`${TRAKT_API}/oauth/device/token`, {
        method: 'POST',
        headers: traktHeaders(),
        body: JSON.stringify({
            code: device_code,
            client_id,
            client_secret,
        }),
    })

    const data = await r.json().catch(() => ({}))
    return NextResponse.json(data, { status: r.status })
}
