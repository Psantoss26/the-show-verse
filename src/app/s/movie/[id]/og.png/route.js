import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const revalidate = 86400

const TMDB_KEY = process.env.TMDB_API_KEY || process.env.NEXT_PUBLIC_TMDB_API_KEY

async function fetchMovie(id) {
    if (!TMDB_KEY) return null
    const url =
        `https://api.themoviedb.org/3/movie/${encodeURIComponent(id)}` +
        `?api_key=${encodeURIComponent(TMDB_KEY)}&language=es-ES`

    const r = await fetch(url, { next: { revalidate: 86400 } })
    if (!r.ok) return null
    return r.json()
}

export async function GET(_req, ctx) {
    const params = ctx?.params && typeof ctx.params.then === 'function' ? await ctx.params : ctx.params
    const id = params?.id

    const m = await fetchMovie(id)

    const poster = m?.poster_path ? `https://image.tmdb.org/t/p/w500${m.poster_path}` : null
    const backdrop = m?.backdrop_path ? `https://image.tmdb.org/t/p/w780${m.backdrop_path}` : null

    // ✅ Elegimos “lo mejor”: poster si existe, si no backdrop
    const mainImg = poster || backdrop
    const bgImg = backdrop || poster

    return new ImageResponse(
        (
            <div
                style={{
                    width: '1024px',
                    height: '1024px',
                    position: 'relative',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: '#0b0b0d'
                }}
            >
                {/* Fondo blur */}
                {bgImg ? (
                    <img
                        src={bgImg}
                        alt=""
                        width="1024"
                        height="1024"
                        style={{
                            position: 'absolute',
                            inset: 0,
                            width: '1024px',
                            height: '1024px',
                            objectFit: 'cover',
                            filter: 'blur(22px) brightness(0.55)',
                            transform: 'scale(1.08)'
                        }}
                    />
                ) : null}

                {/* Overlay suave */}
                <div
                    style={{
                        position: 'absolute',
                        inset: 0,
                        background:
                            'radial-gradient(circle at 20% 10%, rgba(250,204,21,0.22), transparent 55%), radial-gradient(circle at 80% 0%, rgba(16,185,129,0.16), transparent 55%), linear-gradient(to top, rgba(0,0,0,0.65), rgba(0,0,0,0.15))'
                    }}
                />

                {/* Marco */}
                <div
                    style={{
                        position: 'relative',
                        width: '820px',
                        height: '820px',
                        borderRadius: '56px',
                        border: '2px solid rgba(255,255,255,0.14)',
                        background: 'rgba(0,0,0,0.25)',
                        boxShadow: '0 30px 90px rgba(0,0,0,0.6)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        overflow: 'hidden'
                    }}
                >
                    {/* Imagen principal en "contain" => se ve ENTERA */}
                    {mainImg ? (
                        <img
                            src={mainImg}
                            alt=""
                            width="820"
                            height="820"
                            style={{
                                width: '820px',
                                height: '820px',
                                objectFit: 'contain'
                            }}
                        />
                    ) : null}
                </div>
            </div>
        ),
        { width: 1024, height: 1024 }
    )
}