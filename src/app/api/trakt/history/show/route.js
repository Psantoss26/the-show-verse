// src/app/api/trakt/history/show/route.js
import { NextResponse } from 'next/server'

const TRAKT_BASE = 'https://api.trakt.tv'

function pickTraktToken(cookieStore) {
    // cookieStore: request.cookies
    return (
        cookieStore.get('trakt_access_token')?.value ||
        cookieStore.get('trakt_token')?.value ||
        cookieStore.get('access_token')?.value ||
        null
    )
}

export async function POST(request) {
    try {
        const token = pickTraktToken(request.cookies)
        if (!token) {
            return NextResponse.json({ error: 'No hay token de Trakt (no conectado).' }, { status: 401 })
        }

        const { tmdbId, seasonNumbers = [], watchedAt } = await request.json()

        if (!tmdbId) {
            return NextResponse.json({ error: 'tmdbId requerido' }, { status: 400 })
        }

        const TRAKT_CLIENT_ID = process.env.TRAKT_CLIENT_ID
        if (!TRAKT_CLIENT_ID) {
            return NextResponse.json({ error: 'Falta TRAKT_CLIENT_ID en el servidor.' }, { status: 500 })
        }

        const traktHeaders = {
            'Content-Type': 'application/json',
            'trakt-api-version': '2',
            'trakt-api-key': TRAKT_CLIENT_ID,
            Authorization: `Bearer ${token}`,
        }

        // 1) Lookup del show por TMDB ID
        const searchRes = await fetch(`${TRAKT_BASE}/search/tmdb/${tmdbId}?type=show`, {
            headers: traktHeaders,
            cache: 'no-store',
        })
        const searchJson = await searchRes.json()
        if (!searchRes.ok) {
            return NextResponse.json(
                { error: searchJson?.error || searchJson?.message || 'Error buscando show en Trakt' },
                { status: searchRes.status }
            )
        }

        const show = searchJson?.[0]?.show
        if (!show?.ids) {
            return NextResponse.json({ error: 'No se encontró el show en Trakt con ese TMDB id.' }, { status: 404 })
        }

        // 2) Normaliza temporadas
        const cleanSeasonNumbers = (seasonNumbers || [])
            .filter((n) => typeof n === 'number' && n > 0)

        if (cleanSeasonNumbers.length === 0) {
            return NextResponse.json(
                { error: 'No hay temporadas válidas (seasonNumbers vacío). Pasa seasons al modal/padre.' },
                { status: 400 }
            )
        }

        const seasons = cleanSeasonNumbers.map((number) => (watchedAt ? { number, watched_at: watchedAt } : { number }))

        // 3) Add o Remove
        const url = watchedAt ? `${TRAKT_BASE}/sync/history` : `${TRAKT_BASE}/sync/history/remove`
        const payload = {
            shows: [
                {
                    title: show.title,
                    year: show.year,
                    ids: show.ids,
                    seasons,
                },
            ],
        }

        const syncRes = await fetch(url, {
            method: 'POST',
            headers: traktHeaders,
            body: JSON.stringify(payload),
        })
        const syncJson = await syncRes.json().catch(() => ({}))

        if (!syncRes.ok) {
            return NextResponse.json(
                { error: syncJson?.error || syncJson?.message || 'Error sincronizando en Trakt', details: syncJson },
                { status: syncRes.status }
            )
        }

        return NextResponse.json(syncJson, { status: 200 })
    } catch (e) {
        return NextResponse.json({ error: e?.message || 'Error desconocido' }, { status: 500 })
    }
}
