import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { backendFetchJson, setBackendAuthCookies } from '@/lib/backend/server'

const TRAKT_API = 'https://api.trakt.tv'
const TRAKT_CLIENT_ID = process.env.TRAKT_CLIENT_ID

function traktHeaders(token) {
    return {
        'Content-Type': 'application/json',
        'trakt-api-version': '2',
        'trakt-api-key': TRAKT_CLIENT_ID,
        Authorization: `Bearer ${token}`
    }
}

async function getAccessToken() {
    const cookieStore = await cookies()
    return cookieStore.get('trakt_access_token')?.value || null
}

export async function POST(req, { params }) {
    try {
        const { tmdbId: tmdbParam } = await params
        const tmdbId = Number(tmdbParam)
        if (!Number.isFinite(tmdbId)) return NextResponse.json({ error: 'tmdbId inválido' }, { status: 400 })

        const body = await req.json()
        const season = Number(body?.season)
        const episode = Number(body?.episode)
        const watched = !!body?.watched

        if (!Number.isFinite(season) || season < 1) return NextResponse.json({ error: 'season inválida' }, { status: 400 })
        if (!Number.isFinite(episode) || episode < 1) return NextResponse.json({ error: 'episode inválido' }, { status: 400 })

        const backend = await backendFetchJson(req, '/v1/history/episodes', {
            method: 'POST',
            body: JSON.stringify({
                tmdbId,
                season,
                episode,
                watched,
                watchedAt: body?.watchedAt || undefined,
                title: body?.title,
                posterPath: body?.posterPath,
            }),
        })

        if (backend.ok) {
            const res = NextResponse.json({
                connected: true,
                ok: true,
                watched,
                watchedBySeason: backend.json?.watchedBySeason || {},
                source: 'backend',
            })
            setBackendAuthCookies(res, backend, { secure: req.nextUrl.protocol === 'https:' })
            return res
        }
        if (!backend.skipped && backend.status !== 401) {
            console.warn('Backend show episode update failed; falling back to Trakt', backend.error)
        }

        const token = await getAccessToken()
        if (!token) return NextResponse.json({ error: 'Trakt no conectado' }, { status: 401 })

        const payload = {
            shows: [{
                ids: { tmdb: tmdbId },
                seasons: [{ number: season, episodes: [{ number: episode }] }]
            }]
        }

        // watched=true => añade a historial (marca visto)
        // watched=false => quita del historial (marca no visto)
        const url = watched ? `${TRAKT_API}/sync/history` : `${TRAKT_API}/sync/history/remove`
        const res = await fetch(url, {
            method: 'POST',
            headers: traktHeaders(token),
            body: JSON.stringify(payload)
        })

        const json = await res.json()
        if (!res.ok) throw new Error(json?.error || 'Error actualizando episodio')

        return NextResponse.json({ ok: true })
    } catch (e) {
        return NextResponse.json({ error: e?.message || 'Error' }, { status: 500 })
    }
}
