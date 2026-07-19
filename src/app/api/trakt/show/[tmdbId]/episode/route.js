import { NextResponse } from 'next/server'
import { backendFetchJson, setBackendAuthCookies } from '@/lib/backend/server'

// Marcar/quitar episodio visto — ÍNTEGRO en el backend propio
// (/v1/history/episodes). Sin Trakt.
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

        if (backend.status === 401) {
            return NextResponse.json({ connected: false }, { status: 401 })
        }
        return NextResponse.json(
            { error: backend.error || 'No se pudo actualizar el episodio' },
            { status: backend.status || 502 },
        )
    } catch (e) {
        return NextResponse.json({ error: e?.message || 'Error' }, { status: 500 })
    }
}
