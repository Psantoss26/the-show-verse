import { NextResponse } from 'next/server'
import { backendFetchJson, setBackendAuthCookies } from '@/lib/backend/server'

// Episodios vistos por temporada — ÍNTEGRO desde el backend propio (/v1/history).
// Sin Trakt.
export async function GET(request, { params }) {
    try {
        const { tmdbId: tmdbParam } = await params
        const tmdbId = Number(tmdbParam)
        if (!Number.isFinite(tmdbId)) return NextResponse.json({ error: 'tmdbId inválido' }, { status: 400 })

        const backend = await backendFetchJson(request, `/v1/history/shows/${encodeURIComponent(tmdbId)}`)
        if (backend.ok) {
            const res = NextResponse.json({
                connected: true,
                found: Boolean(backend.json?.found),
                watchedBySeason: backend.json?.watchedBySeason || {},
                episodes: Array.isArray(backend.json?.episodes) ? backend.json.episodes : [],
                source: 'backend',
            })
            setBackendAuthCookies(res, backend, { secure: request.nextUrl.protocol === 'https:' })
            return res
        }

        if (backend.status === 401) {
            return NextResponse.json({ connected: false, watchedBySeason: {} }, { status: 401 })
        }
        // Sin datos del backend: devolvemos vacío (no rompemos la UI).
        return NextResponse.json({ connected: true, found: false, watchedBySeason: {} })
    } catch (e) {
        return NextResponse.json({ error: e?.message || 'Error' }, { status: 500 })
    }
}
