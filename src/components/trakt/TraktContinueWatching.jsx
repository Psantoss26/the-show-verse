'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useTraktAuth } from '@/lib/trakt/useTraktAuth'
import { getMovieDetails } from '@/lib/api/tmdb'

// Ajusta esta ruta a tu routing real
const movieHref = (tmdbId) => `/movie/${tmdbId}`

function posterSrc(tmdbMovie) {
    const path = tmdbMovie?.poster_path || tmdbMovie?.backdrop_path
    return path ? `https://image.tmdb.org/t/p/w342${path}` : '/placeholder-poster.png'
}

export default function TraktContinueWatching({ limit = 10 }) {
    const { isConnected, getValidAccessToken } = useTraktAuth()
    const [rows, setRows] = useState([])
    const [loading, setLoading] = useState(false)

    const hasItems = useMemo(() => rows?.length > 0, [rows])

    useEffect(() => {
        if (!isConnected) return

        let cancelled = false
        async function run() {
            setLoading(true)
            const token = await getValidAccessToken()
            if (!token) { setLoading(false); return }

            const r = await fetch(`/api/trakt/sync/playback?type=movies&limit=${limit}`, {
                headers: { Authorization: `Bearer ${token}` },
                cache: 'no-store',
            })

            if (!r.ok) {
                setLoading(false)
                return
            }

            const playback = await r.json()

            // playback[i].movie.ids.tmdb + playback[i].progress :contentReference[oaicite:12]{index=12}
            const tmdbIds = (playback || [])
                .map((p) => p?.movie?.ids?.tmdb)
                .filter(Boolean)

            const tmdbMovies = await Promise.all(
                tmdbIds.map(async (id) => {
                    try { return await getMovieDetails(id) } catch { return null }
                })
            )

            const merged = (playback || []).map((p, idx) => ({
                progress: p?.progress,
                paused_at: p?.paused_at,
                tmdbId: p?.movie?.ids?.tmdb,
                tmdb: tmdbMovies[idx],
            })).filter((x) => x.tmdbId && x.tmdb)

            if (!cancelled) setRows(merged)
            setLoading(false)
        }

        run()
        return () => { cancelled = true }
    }, [isConnected, getValidAccessToken, limit])

    if (!isConnected) return null
    if (loading && !hasItems) {
        return <div className="mt-6 text-xs text-white/60">Cargando “Seguir viendo”…</div>
    }
    if (!hasItems) return null

    return (
        <div className="mt-6">
            <div className="flex items-baseline justify-between">
                <h3 className="text-sm font-semibold">Seguir viendo</h3>
                <span className="text-xs text-white/60">desde Trakt</span>
            </div>

            <div className="mt-3 flex gap-3 overflow-x-auto pr-2 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
                {rows.map((x) => (
                    <Link
                        key={x.tmdbId}
                        href={movieHref(x.tmdbId)}
                        className="shrink-0 w-[130px] sm:w-[150px] group"
                        title={x.tmdb?.title}
                    >
                        <div className="relative rounded-xl overflow-hidden border border-white/10">
                            <img
                                src={posterSrc(x.tmdb)}
                                alt={x.tmdb?.title || 'poster'}
                                className="w-full h-auto block group-hover:opacity-90"
                                loading="lazy"
                            />
                            <div className="absolute left-0 right-0 bottom-0 h-1 bg-white/10">
                                <div
                                    className="h-full bg-white/70"
                                    style={{ width: `${Math.max(0, Math.min(100, x.progress || 0))}%` }}
                                />
                            </div>
                        </div>

                        <div className="mt-2">
                            <div className="text-xs font-medium line-clamp-2">{x.tmdb?.title}</div>
                            <div className="text-[11px] text-white/60">{Math.round(x.progress || 0)}%</div>
                        </div>
                    </Link>
                ))}
            </div>
        </div>
    )
}
