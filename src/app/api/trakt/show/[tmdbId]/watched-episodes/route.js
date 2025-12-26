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

async function getTraktShowIdFromTmdb(tmdbId, token) {
    const url = `${TRAKT_API}/search/tmdb/${tmdbId}?type=show`
    const res = await fetch(url, { headers: traktHeaders(token), cache: 'no-store' })
    const json = await res.json()
    if (!res.ok) throw new Error(json?.error || 'Error buscando show en Trakt')
    const hit = Array.isArray(json) ? json[0] : null
    const traktId = hit?.show?.ids?.trakt
    if (!traktId) throw new Error('No se pudo resolver el show en Trakt')
    return traktId
}

export async function GET(_req, { params }) {
    try {
        const token = getAccessToken()
        if (!token) return NextResponse.json({ error: 'Trakt no conectado' }, { status: 401 })

        const tmdbId = Number(params.tmdbId)
        if (!Number.isFinite(tmdbId)) return NextResponse.json({ error: 'tmdbId inválido' }, { status: 400 })

        const traktId = await getTraktShowIdFromTmdb(tmdbId, token)

        // ✅ specials=false => fuera temporada 0
        const url = `${TRAKT_API}/shows/${traktId}/progress/watched?hidden=false&specials=false&extended=episodes`
        const res = await fetch(url, { headers: traktHeaders(token), cache: 'no-store' })
        const json = await res.json()
        if (!res.ok) throw new Error(json?.error || 'Error cargando progreso')

        const watchedBySeason = {}
        const seasons = Array.isArray(json?.seasons) ? json.seasons : []

        for (const s of seasons) {
            const sn = Number(s?.number)
            if (!Number.isFinite(sn) || sn < 1) continue
            const eps = Array.isArray(s?.episodes) ? s.episodes : []
            watchedBySeason[sn] = eps
                .filter((e) => e?.completed === true)
                .map((e) => Number(e?.number))
                .filter((n) => Number.isFinite(n))
                .sort((a, b) => a - b)
        }

        return NextResponse.json({ watchedBySeason })
    } catch (e) {
        return NextResponse.json({ error: e?.message || 'Error' }, { status: 500 })
    }
}
