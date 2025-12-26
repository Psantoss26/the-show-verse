import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'

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

// ⚠️ Ajusta esto a cómo guardas el token
function getAccessToken() {
    return cookies().get('trakt_access_token')?.value || null
}

export async function POST(req, { params }) {
    try {
        const token = getAccessToken()
        if (!token) return NextResponse.json({ error: 'Trakt no conectado' }, { status: 401 })

        const tmdbId = Number(params.tmdbId)
        if (!Number.isFinite(tmdbId)) return NextResponse.json({ error: 'tmdbId inválido' }, { status: 400 })

        const body = await req.json()
        const season = Number(body?.season)
        const episode = Number(body?.episode)
        const watched = !!body?.watched

        if (!Number.isFinite(season) || season < 1) return NextResponse.json({ error: 'season inválida' }, { status: 400 })
        if (!Number.isFinite(episode) || episode < 1) return NextResponse.json({ error: 'episode inválido' }, { status: 400 })

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
