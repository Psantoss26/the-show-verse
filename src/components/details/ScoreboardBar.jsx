// src/components/details/ScoreboardBar.jsx
'use client'

import { useEffect, useMemo, useState, useCallback } from 'react'
import { Loader2, Eye, Play, List, Heart, Star as StarIcon } from 'lucide-react'
import { formatVoteCount } from '@/lib/details/formatters'

function CompactBadge({ logo, logoClassName = 'h-4', value, suffix, sub, href }) {
    const inner = (
        <div className="flex items-center gap-2">
            <img src={logo} alt="" className={`${logoClassName} w-auto opacity-95`} />
            <div className="leading-tight">
                <div className="text-white font-black text-sm sm:text-base">
                    {value != null ? value : '—'}
                    {value != null && suffix ? suffix : ''}
                </div>
                {sub ? <div className="text-[10px] sm:text-[11px] text-zinc-400">{sub}</div> : null}
            </div>
        </div>
    )

    const baseClass =
        'shrink-0 rounded-xl border border-white/10 bg-black/20 px-3 py-2 hover:bg-white/10 hover:border-white/20 transition'

    return href ? (
        <a href={href} target="_blank" rel="noreferrer" className={baseClass} title="Abrir enlace">
            {inner}
        </a>
    ) : (
        <div className={baseClass}>{inner}</div>
    )
}

function MiniStat({ icon: Icon, value, tooltip }) {
    return (
        <div
            className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/20 px-3 py-1.5 text-xs text-zinc-300"
            title={tooltip}
        >
            <Icon className="h-4 w-4 text-zinc-400" />
            <span className="font-bold text-white">{value}</span>
        </div>
    )
}

function StarRating10({ rating, loading, connected, onConnect, onRate }) {
    const [hover, setHover] = useState(null)

    const effective = hover != null ? hover : rating

    const clickStar = (v) => {
        if (!connected) return onConnect?.()
        // toggle: si pulsas la misma, borra
        if (rating === v) return onRate?.(null)
        onRate?.(v)
    }

    return (
        <div className="flex items-center gap-2">
            {loading ? (
                <Loader2 className="h-5 w-5 animate-spin text-white/60" />
            ) : (
                <div className="flex items-center gap-1">
                    {Array.from({ length: 10 }).map((_, i) => {
                        const v = i + 1
                        const active = effective != null && v <= effective
                        return (
                            <button
                                key={v}
                                type="button"
                                onMouseEnter={() => setHover(v)}
                                onMouseLeave={() => setHover(null)}
                                onClick={() => clickStar(v)}
                                className="p-0.5"
                                title={!connected ? 'Conectar Trakt' : `Puntuar ${v}/10`}
                            >
                                <StarIcon
                                    className={`h-4 w-4 transition ${active ? 'text-yellow-400 fill-yellow-400' : 'text-white/25'}`}
                                />
                            </button>
                        )
                    })}
                </div>
            )}

            {!connected && !loading ? (
                <button
                    type="button"
                    onClick={() => onConnect?.()}
                    className="ml-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-zinc-200 hover:bg-white/10 transition"
                >
                    Conectar Trakt
                </button>
            ) : null}
        </div>
    )
}

function buildScoreboardUrl(params) {
    const sp = new URLSearchParams()
    sp.set('type', params.type)
    sp.set('tmdbId', String(params.tmdbId))
    if (params.season != null) sp.set('season', String(params.season))
    if (params.episode != null) sp.set('episode', String(params.episode))
    return `/api/trakt/scoreboard?${sp.toString()}`
}

export default function ScoreboardBar({
    tmdb, // { value: number|null, votes?: number|null, href?: string }
    traktParams, // { type:'season'|'episode', tmdbId:number, season:number, episode?:number }
    imdb // { id?: string, rating?: number|null, votes?: string|null }
}) {
    const [tScoreboard, setTScoreboard] = useState({ loading: true, found: false })
    const [userRating, setUserRating] = useState(null)
    const [ratingBusy, setRatingBusy] = useState(false)
    const [traktConnected, setTraktConnected] = useState(true)

    const traktUrl = tScoreboard?.traktUrl || null

    const traktCommunityPct = useMemo(() => {
        const r = tScoreboard?.community?.rating
        if (typeof r !== 'number') return null
        return Math.round(r * 10)
    }, [tScoreboard])

    const traktVotes = tScoreboard?.community?.votes ?? null

    const traktIdForUserRating = useMemo(() => {
        if (traktParams?.type === 'season') return tScoreboard?.ids?.season?.trakt ?? null
        if (traktParams?.type === 'episode') return tScoreboard?.ids?.episode?.trakt ?? null
        return null
    }, [tScoreboard, traktParams])

    // 1) Fetch scoreboard
    useEffect(() => {
        let alive = true
        const url = buildScoreboardUrl(traktParams)

        setTScoreboard({ loading: true, found: false })
        fetch(url, { cache: 'no-store' })
            .then((r) => r.json())
            .then((json) => {
                if (!alive) return
                if (json?.found) setTScoreboard({ loading: false, ...json })
                else setTScoreboard({ loading: false, found: false })
            })
            .catch(() => {
                if (!alive) return
                setTScoreboard({ loading: false, found: false })
            })

        return () => {
            alive = false
        }
    }, [traktParams])

    // 2) Fetch user rating (requires traktId)
    useEffect(() => {
        let alive = true
        if (!traktIdForUserRating) return

        setRatingBusy(true)
        fetch(`/api/trakt/ratings?type=${traktParams.type}&traktId=${traktIdForUserRating}`, { cache: 'no-store' })
            .then(async (r) => {
                if (r.status === 401) {
                    setTraktConnected(false)
                    return { rating: null }
                }
                return r.json()
            })
            .then((json) => {
                if (!alive) return
                setTraktConnected(true)
                setUserRating(json?.rating ?? null)
            })
            .catch(() => {
                if (!alive) return
            })
            .finally(() => {
                if (!alive) return
                setRatingBusy(false)
            })

        return () => {
            alive = false
        }
    }, [traktIdForUserRating, traktParams?.type])

    const onConnect = useCallback(() => {
        window.location.href = '/api/trakt/auth/start'
    }, [])

    const onRate = useCallback(
        async (val) => {
            if (!traktIdForUserRating) return
            setRatingBusy(true)
            const prev = userRating
            setUserRating(val)

            try {
                const r = await fetch('/api/trakt/ratings', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    cache: 'no-store',
                    body: JSON.stringify({
                        type: traktParams.type,
                        ids: { trakt: traktIdForUserRating },
                        rating: val
                    })
                })

                if (r.status === 401) {
                    setTraktConnected(false)
                    setUserRating(prev)
                    onConnect()
                    return
                }

                if (!r.ok) {
                    setUserRating(prev)
                }
            } catch {
                setUserRating(prev)
            } finally {
                setRatingBusy(false)
            }
        },
        [traktIdForUserRating, traktParams?.type, userRating, onConnect]
    )

    const imdbHref = imdb?.id ? `https://www.imdb.com/title/${imdb.id}` : null

    return (
        <div className="w-full border border-white/10 bg-white/5 backdrop-blur-sm rounded-2xl overflow-hidden mb-6">
            <div
                className="
          py-3
          pl-[calc(1rem+env(safe-area-inset-left))]
          pr-[calc(1.25rem+env(safe-area-inset-right))]
          sm:px-4
          flex items-center gap-3 sm:gap-4
          overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden
        "
            >
                {/* A) Ratings */}
                <div className="flex items-center gap-3 sm:gap-4 shrink-0">
                    {tScoreboard.loading ? (
                        <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                    ) : null}

                    <CompactBadge
                        logo="/logo-TMDb.png"
                        logoClassName="h-4"
                        value={tmdb?.value != null ? Number(tmdb.value).toFixed(1) : null}
                        sub={tmdb?.votes != null ? `${formatVoteCount(tmdb.votes)} votes` : null}
                        href={tmdb?.href}
                    />

                    {traktCommunityPct != null ? (
                        <>
                            <div className="sm:hidden">
                                <CompactBadge
                                    logo="/logo-Trakt.png"
                                    value={traktCommunityPct}
                                    sub={traktVotes != null ? `${formatVoteCount(traktVotes)} votes` : null}
                                    href={traktUrl}
                                />
                            </div>
                            <div className="hidden sm:block">
                                <CompactBadge
                                    logo="/logo-Trakt.png"
                                    value={traktCommunityPct}
                                    suffix="%"
                                    sub={traktVotes != null ? `${formatVoteCount(traktVotes)} votes` : null}
                                    href={traktUrl}
                                />
                            </div>
                        </>
                    ) : null}

                    {imdb?.rating != null || imdb?.id ? (
                        <CompactBadge
                            logo="/logo-IMDb.png"
                            logoClassName="h-5"
                            value={imdb?.rating != null ? Number(imdb.rating).toFixed(1) : null}
                            sub={imdb?.votes ? `${formatVoteCount(imdb.votes)} votes` : null}
                            href={imdbHref}
                        />
                    ) : null}
                </div>

                {/* Separador */}
                <div className="w-px h-6 bg-white/10 shrink-0" />

                {/* B) User rating */}
                <div className="flex items-center gap-3 shrink-0">
                    <StarRating10
                        rating={userRating}
                        loading={ratingBusy}
                        connected={traktConnected}
                        onConnect={onConnect}
                        onRate={onRate}
                    />
                </div>
            </div>

            {/* Footer stats (si hay) */}
            {!tScoreboard.loading && tScoreboard?.stats ? (
                <div className="border-t border-white/5 bg-black/10">
                    <div
                        className="
              overflow-x-auto
              [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden
              py-2
              pl-[calc(1rem+env(safe-area-inset-left))]
              pr-[calc(1rem+env(safe-area-inset-right))]
            "
                    >
                        <div className="flex items-center gap-3 min-w-max">
                            <div className="shrink-0">
                                <MiniStat icon={Eye} value={formatVoteCount(tScoreboard?.stats?.watchers ?? 0)} tooltip="Watchers" />
                            </div>
                            <div className="shrink-0">
                                <MiniStat icon={Play} value={formatVoteCount(tScoreboard?.stats?.plays ?? 0)} tooltip="Plays" />
                            </div>
                            <div className="shrink-0">
                                <MiniStat icon={List} value={formatVoteCount(tScoreboard?.stats?.lists ?? 0)} tooltip="Lists" />
                            </div>
                            <div className="shrink-0">
                                <MiniStat icon={Heart} value={formatVoteCount(tScoreboard?.stats?.favorited ?? 0)} tooltip="Favorited" />
                            </div>
                        </div>
                    </div>
                </div>
            ) : null}
        </div>
    )
}
