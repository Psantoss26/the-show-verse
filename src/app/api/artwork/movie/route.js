// /src/app/api/artwork/movie/route.js
import { NextResponse } from 'next/server'
import { saveMovieArtworkOverride } from '@/lib/artworkOverrides'

export async function POST(req) {
    try {
        const body = await req.json()
        const { movieId, poster, backdrop } = body || {}

        if (!movieId) {
            return NextResponse.json(
                { ok: false, error: 'movieId es requerido' },
                { status: 400 }
            )
        }

        // 🔐 Aquí podrías comprobar que el usuario es admin:
        // const session = await auth();
        // if (!session?.user?.isAdmin) { ... }

        await saveMovieArtworkOverride({
            movieId,
            poster: poster ?? null,
            backdrop: backdrop ?? null
        })

        return NextResponse.json({ ok: true })
    } catch (err) {
        console.error('Error guardando override de artwork:', err)
        return NextResponse.json(
            { ok: false, error: 'Error interno guardando override' },
            { status: 500 }
        )
    }
}
