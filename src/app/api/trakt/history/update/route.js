import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'

const TRAKT_BASE = 'https://api.trakt.tv'

function getAccessToken(req) {
    const c = cookies()
    const cookieToken =
        c.get('trakt_access_token')?.value ||
        c.get('traktAccessToken')?.value ||
        c.get('trakt_accessToken')?.value ||
        null

    const header = req.headers.get('authorization') || ''
    const headerToken = header.toLowerCase().startsWith('bearer ') ? header.slice(7) : null

    return headerToken || cookieToken
}

async function traktFetch(path, token, init = {}) {
    const res = await fetch(`${TRAKT_BASE}${path}`, {
        ...init,
        headers: {
            'Content-Type': 'application/json',
            'trakt-api-version': '2',
            'trakt-api-key': process.env.TRAKT_CLIENT_ID,
            Authorization: `Bearer ${token}`,
            ...(init.headers || {})
        },
        cache: 'no-store'
    })

    const json = await res.json().catch(() => ({}))
    if (!res.ok) {
        throw new Error(json?.error_description || json?.message || 'Error Trakt')
    }
    return json
}

export async function POST(req) {
    try {
        const token = getAccessToken(req)
        if (!token) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

        const body = await req.json().catch(() => ({}))
        const historyId = Number(body?.historyId)
        const watchedAt = body?.watchedAt
        const target = body?.target

        if (!historyId || !watchedAt || !target?.kind || !target?.traktId) {
            return NextResponse.json({ error: 'historyId, watchedAt y target son requeridos' }, { status: 400 })
        }

        // 1) remove old history entry
        const removed = await traktFetch('/sync/history/remove', token, {
            method: 'POST',
            body: JSON.stringify({ ids: [historyId] })
        })

        // 2) add again with new watched_at
        let payload = null

        if (target.kind === 'movie') {
            payload = {
                movies: [{ ids: { trakt: Number(target.traktId) }, watched_at: watchedAt }]
            }
        } else if (target.kind === 'episode') {
            payload = {
                episodes: [{ ids: { trakt: Number(target.traktId) }, watched_at: watchedAt }]
            }
        } else if (target.kind === 'show_episode') {
            const season = Number(target.season)
            const episode = Number(target.episode)
            if (!season || !episode) {
                return NextResponse.json({ error: 'season/episode requerido para show_episode' }, { status: 400 })
            }
            payload = {
                shows: [
                    {
                        ids: { trakt: Number(target.traktId) },
                        seasons: [
                            {
                                number: season,
                                episodes: [{ number: episode, watched_at: watchedAt }]
                            }
                        ]
                    }
                ]
            }
        } else {
            return NextResponse.json({ error: 'target.kind inválido' }, { status: 400 })
        }

        const added = await traktFetch('/sync/history', token, {
            method: 'POST',
            body: JSON.stringify(payload)
        })

        return NextResponse.json({ ok: true, removed, added })
    } catch (e) {
        return NextResponse.json({ error: e?.message || 'Error' }, { status: 500 })
    }
}
