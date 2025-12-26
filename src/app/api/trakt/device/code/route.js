import { NextResponse } from 'next/server'

const TRAKT_API = 'https://api.trakt.tv'

function traktHeaders() {
    return {
        'Content-Type': 'application/json',
        'trakt-api-version': '2',
        'trakt-api-key': process.env.TRAKT_CLIENT_ID,
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
