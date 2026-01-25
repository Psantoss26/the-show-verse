'use client'

import Link from 'next/link'
import { useEffect, useState, useMemo, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, ArrowLeft, Film, ExternalLink, Clock, Calendar, Sparkles } from 'lucide-react'
import { getExternalIds } from '@/lib/api/tmdb'
import { fetchOmdbByImdb } from '@/lib/api/omdb'

function Poster({ posterPath, alt }) {
    const [failed, setFailed] = useState(false)
    const [loaded, setLoaded] = useState(false)

    if (!posterPath || failed) {
        return (
            <div className="w-full h-full bg-gradient-to-br from-zinc-900 via-zinc-800 to-zinc-900 flex items-center justify-center text-zinc-700">
                <Film className="w-8 h-8 opacity-40" />
            </div>
        )
    }

    return (
        <>
            {!loaded && (
                <div className="absolute inset-0 bg-zinc-900 animate-pulse" />
            )}
            <img
                src={`https://image.tmdb.org/t/p/w500${posterPath}`}
                alt={alt}
                className={`w-full h-full object-cover transition-opacity duration-500 ${loaded ? 'opacity-100' : 'opacity-0'}`}
                loading="lazy"
                onLoad={() => setLoaded(true)}
                onError={() => setFailed(true)}
            />
        </>
    )
}

function MovieCard({ movie, idx, imdbRating }) {
    const [isActive, setIsActive] = useState(false)
    const href = `/details/movie/${movie.id}`
    const poster = movie.poster_path || movie.backdrop_path || null
    const title = movie.title || 'Película sin título'
    const year = movie.release_date ? new Date(movie.release_date).getFullYear() : null
    const rating = movie.vote_average ? movie.vote_average.toFixed(1) : null

    const handleClick = (e) => {
        // En móvil: primer tap muestra overlay, segundo navega
        if (!isActive && window.innerWidth < 768) {
            e.preventDefault()
            setIsActive(true)
            setTimeout(() => setIsActive(false), 3000)
        }
    }

    const overlayOpacity = isActive
        ? "opacity-100"
        : "opacity-0 md:group-hover:opacity-100"

    const topTransform = isActive
        ? "translate-y-0"
        : "-translate-y-2 md:group-hover:translate-y-0"

    const bottomTransform = isActive
        ? "translate-y-0"
        : "translate-y-2 md:group-hover:translate-y-0"

    return (
        <div
            className="group relative animate-fade-in-up"
            style={{
                animationDelay: `${Math.min(idx * 50, 800)}ms`,
                animationFillMode: 'both'
            }}
        >
            <Link
                href={href}
                className="block relative w-full h-full"
                onClick={handleClick}
            >
                <div className="relative aspect-[2/3] w-full overflow-hidden rounded-xl bg-neutral-900 shadow-lg ring-1 ring-white/5 transition-all duration-500 md:group-hover:shadow-[0_0_30px_rgba(168,85,247,0.25)] md:group-hover:ring-purple-500/30 md:group-hover:scale-[1.03] md:group-hover:-translate-y-1">
                    
                    {/* Poster image */}
                    <div className="absolute inset-0">
                        <Poster posterPath={poster} alt={title} />
                    </div>

                    {/* Shine effect on hover */}
                    <div className="absolute inset-0 opacity-0 md:group-hover:opacity-100 transition-opacity duration-700 pointer-events-none">
                        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full md:group-hover:translate-x-full transition-transform duration-[1200ms] ease-out" />
                    </div>

                    {/* Overlay content */}
                    <div className={`absolute inset-0 transition-opacity duration-300 flex flex-col justify-between ${overlayOpacity}`}>
                        
                        {/* Top section with rating */}
                        <div className={`p-3 bg-gradient-to-b from-black/80 via-black/40 to-transparent flex justify-end items-start transform ${topTransform} transition-transform duration-300`}>
                            <div className="flex flex-col items-end gap-1">
                                {rating && (
                                    <div className="flex items-center gap-1.5 drop-shadow-[0_2px_4px_rgba(0,0,0,1)]">
                                        <span className="text-emerald-400 text-xs font-black font-mono tracking-tight">
                                            {rating}
                                        </span>
                                        <img
                                            src="/logo-TMDb.png"
                                            alt="TMDb"
                                            className="w-auto h-2.5 opacity-100"
                                        />
                                    </div>
                                )}
                                {imdbRating && (
                                    <div className="flex items-center gap-1.5 drop-shadow-[0_2px_4px_rgba(0,0,0,1)]">
                                        <span className="text-yellow-400 text-xs font-black font-mono tracking-tight">
                                            {imdbRating.toFixed(1)}
                                        </span>
                                        <img
                                            src="/logo-IMDb.png"
                                            alt="IMDb"
                                            className="w-auto h-3 opacity-100"
                                        />
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Bottom section with title and year */}
                        <div className={`p-3 bg-gradient-to-t from-black/90 via-black/50 to-transparent transform ${bottomTransform} transition-transform duration-300`}>
                            <div className="flex items-end justify-between gap-3">
                                <div className="min-w-0 text-left flex-1">
                                    <h3 className="text-white font-bold leading-tight line-clamp-2 drop-shadow-md text-xs sm:text-sm">
                                        {title}
                                    </h3>
                                </div>

                                {/* Year badge in bottom right corner */}
                                {year && (
                                    <div className="shrink-0 self-end">
                                        <p className="text-yellow-500 text-[10px] sm:text-xs font-bold drop-shadow-md flex items-center gap-1">
                                            <Calendar className="w-3 h-3" />
                                            {year}
                                        </p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Gradient border glow on hover */}
                    <div className="absolute -inset-[1px] rounded-xl opacity-0 md:group-hover:opacity-100 transition-opacity duration-500 pointer-events-none -z-10">
                        <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-purple-500 via-pink-500 to-purple-500 blur-sm animate-border-rotate" />
                    </div>
                </div>

                {/* Outer glow */}
                <div className="absolute -inset-3 bg-gradient-to-r from-purple-600/0 via-purple-600/20 to-pink-600/0 rounded-2xl blur-xl opacity-0 md:group-hover:opacity-100 transition-opacity duration-500 -z-20" />
            </Link>

            <style jsx>{`
                @keyframes border-rotate {
                    0% {
                        background-position: 0% 50%;
                    }
                    50% {
                        background-position: 100% 50%;
                    }
                    100% {
                        background-position: 0% 50%;
                    }
                }

                .animate-border-rotate {
                    background-size: 200% 200%;
                    animation: border-rotate 3s linear infinite;
                }
            `}</style>
        </div>
    )
}

function LoadingSkeleton() {
    return (
        <div className="space-y-8 animate-fade-in">
            {/* Header skeleton */}
            <div className="bg-neutral-900/60 border border-white/5 p-6 sm:p-8 rounded-3xl backdrop-blur-md">
                <div className="flex items-start gap-4">
                    <div className="h-12 w-12 rounded-2xl bg-white/5 border border-white/10 animate-pulse" />
                    <div className="flex-1 space-y-3">
                        <div className="h-8 w-3/4 bg-white/5 rounded-lg animate-pulse" />
                        <div className="h-4 w-full bg-white/5 rounded animate-pulse" />
                        <div className="h-4 w-2/3 bg-white/5 rounded animate-pulse" />
                        <div className="flex gap-2 mt-4">
                            <div className="h-6 w-20 bg-white/5 rounded animate-pulse" />
                            <div className="h-6 w-20 bg-white/5 rounded animate-pulse" />
                        </div>
                    </div>
                </div>
            </div>

            {/* Grid skeleton */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6">
                {Array.from({ length: 12 }).map((_, i) => (
                    <div
                        key={i}
                        className="aspect-[2/3] rounded-2xl bg-zinc-900/40 border border-white/5 animate-pulse"
                        style={{
                            animationDelay: `${i * 50}ms`,
                            animationDuration: '1.5s'
                        }}
                    />
                ))}
            </div>
        </div>
    )
}

export default function CollectionDetailsClient({ collectionId }) {
    const router = useRouter()

    const [state, setState] = useState({
        loading: true,
        error: null,
        collection: null,
        parts: [],
    })

    const [mounted, setMounted] = useState(false)
    const [imdbRatings, setImdbRatings] = useState({})
    const imdbIdCacheRef = useRef({})

    useEffect(() => {
        setMounted(true)
    }, [])

    // Fetch IMDb ratings for movies
    useEffect(() => {
        if (!state.parts.length) return

        const fetchImdbRatings = async () => {
            const ratings = {}
            
            // Process movies in batches to avoid overwhelming the API
            for (const movie of state.parts) {
                try {
                    const key = `movie:${movie.id}`
                    
                    // Get IMDb ID from TMDb external IDs
                    let imdbId = imdbIdCacheRef.current[key]
                    if (!imdbId) {
                        const ext = await getExternalIds('movie', movie.id)
                        imdbId = ext?.imdb_id || null
                        if (imdbId) {
                            imdbIdCacheRef.current[key] = imdbId
                        }
                    }

                    if (!imdbId) continue

                    // Fetch OMDB data
                    const omdb = await fetchOmdbByImdb(imdbId)
                    const rating = omdb?.imdbRating && omdb.imdbRating !== 'N/A'
                        ? Number(omdb.imdbRating)
                        : null

                    if (rating) {
                        ratings[key] = rating
                    }
                } catch (e) {
                    // Silently fail for individual movies
                    console.error(`Error fetching IMDb for movie ${movie.id}:`, e)
                }
            }

            setImdbRatings(ratings)
        }

        fetchImdbRatings()
    }, [state.parts])

    useEffect(() => {
        let cancelled = false
        if (!collectionId) return

        ; (async () => {
            try {
                setState((p) => ({ ...p, loading: true, error: null }))
                const res = await fetch(`/api/tmdb/collection?id=${collectionId}`, { cache: 'no-store' })
                const json = await res.json().catch(() => ({}))
                
                if (!res.ok) {
                    throw new Error(json?.error || 'No se pudo cargar la colección')
                }
                
                if (cancelled) return

                setState({
                    loading: false,
                    error: null,
                    collection: json?.collection || null,
                    parts: Array.isArray(json?.items) ? json.items : [],
                })
            } catch (e) {
                if (cancelled) return
                setState({
                    loading: false,
                    error: e?.message || 'Error al cargar la colección',
                    collection: null,
                    parts: [],
                })
            }
        })()

        return () => {
            cancelled = true
        }
    }, [collectionId])

    const { collection, parts } = state
    const tmdbUrl = useMemo(
        () => collectionId ? `https://www.themoviedb.org/collection/${collectionId}` : null,
        [collectionId]
    )

    const totalRuntime = useMemo(() => {
        if (!parts.length) return 0
        return parts.reduce((sum, movie) => sum + (movie.runtime || 0), 0)
    }, [parts])

    const handleBack = useCallback(() => {
        router.back()
    }, [router])

    return (
        <div className="min-h-screen bg-[#101010] text-gray-100 overflow-hidden">
            {/* Animated backdrop */}
            {collection?.backdrop_path && mounted && (
                <div className="fixed inset-0 z-0">
                    <div className="absolute inset-0 animate-fade-in" style={{ animationDuration: '1s' }}>
                        <img
                            src={`https://image.tmdb.org/t/p/original${collection.backdrop_path}`}
                            alt=""
                            className="w-full h-full object-cover scale-110 blur-2xl opacity-20"
                        />
                    </div>
                    <div className="absolute inset-0 bg-gradient-to-b from-[#101010] via-[#101010]/95 to-[#101010]" />
                    <div className="absolute inset-0 bg-gradient-to-t from-[#101010] via-transparent to-transparent" />
                </div>
            )}

            <div className="relative z-10 max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 lg:py-12">
                {/* Top bar with animations */}
                <div className={`mb-6 sm:mb-8 flex items-center gap-3 sm:gap-4 transition-all duration-500 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4'}`}>
                    <button
                        onClick={handleBack}
                        className="group p-2.5 rounded-xl bg-zinc-900/80 backdrop-blur-sm border border-zinc-800 text-zinc-400 hover:text-white hover:border-zinc-600 hover:bg-zinc-800 transition-all duration-300 hover:scale-105 active:scale-95"
                        title="Volver"
                    >
                        <ArrowLeft className="w-5 h-5 transition-transform duration-300 group-hover:-translate-x-1" />
                    </button>

                    <div className="h-8 w-[1px] bg-gradient-to-b from-transparent via-zinc-700 to-transparent" />

                    {tmdbUrl && (
                        <a
                            href={tmdbUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="group ml-auto p-2.5 rounded-xl bg-zinc-900/80 backdrop-blur-sm border border-zinc-800 text-zinc-400 hover:text-blue-400 hover:border-blue-500/50 hover:bg-blue-500/10 transition-all duration-300 hover:scale-105 active:scale-95"
                            title="Ver en TMDb"
                        >
                            <ExternalLink className="w-5 h-5 transition-transform duration-300 group-hover:rotate-12" />
                        </a>
                    )}
                </div>

                {state.loading ? (
                    <LoadingSkeleton />
                ) : state.error ? (
                    <div className="rounded-2xl border border-red-500/20 bg-red-950/20 backdrop-blur-sm p-6 text-zinc-300 animate-fade-in">
                        <div className="flex items-start gap-3">
                            <div className="shrink-0 w-10 h-10 rounded-full bg-red-500/20 flex items-center justify-center">
                                <Film className="w-5 h-5 text-red-400" />
                            </div>
                            <div>
                                <p className="font-bold text-red-300 text-lg">Error al cargar la colección</p>
                                <p className="mt-1 text-sm text-zinc-400">{state.error}</p>
                            </div>
                        </div>
                    </div>
                ) : (
                    <>
                        {/* Enhanced Header */}
                        <div className={`relative overflow-hidden bg-gradient-to-br from-neutral-900/80 via-neutral-900/60 to-purple-950/30 border border-white/10 p-6 sm:p-8 lg:p-10 rounded-3xl backdrop-blur-xl mb-8 transition-all duration-700 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
                            {/* Decorative gradient */}
                            <div className="absolute top-0 right-0 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
                            <div className="absolute bottom-0 left-0 w-80 h-80 bg-blue-500/10 rounded-full blur-3xl translate-y-1/2 -translate-x-1/2" />
                            
                            <div className="relative flex items-start gap-4 sm:gap-6">
                                {/* Icon with gradient */}
                                <div className="shrink-0 relative group">
                                    <div className="absolute inset-0 bg-gradient-to-br from-purple-500/20 to-pink-500/20 rounded-2xl blur-xl group-hover:blur-2xl transition-all duration-500" />
                                    <div className="relative h-12 w-12 sm:h-14 sm:w-14 rounded-2xl bg-gradient-to-br from-purple-500/10 to-pink-500/10 border border-purple-500/20 flex items-center justify-center group-hover:scale-110 transition-transform duration-500">
                                        <Film className="h-6 w-6 sm:h-7 sm:w-7 text-purple-300 group-hover:rotate-12 transition-transform duration-500" />
                                    </div>
                                </div>

                                <div className="min-w-0 flex-1">
                                    {/* Title with gradient */}
                                    <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black leading-tight break-words bg-gradient-to-r from-white via-purple-100 to-white bg-clip-text text-transparent animate-fade-in">
                                        {collection?.name || 'Colección'}
                                    </h1>

                                    {/* Description */}
                                    {collection?.description && (
                                        <p className="mt-3 sm:mt-4 text-base sm:text-lg text-neutral-300/90 leading-relaxed max-w-4xl animate-fade-in" style={{ animationDelay: '200ms' }}>
                                            {collection.description}
                                        </p>
                                    )}

                                    {/* Stats with icons */}
                                    <div className="mt-4 sm:mt-6 flex flex-wrap gap-2 sm:gap-3">
                                        <div className="group relative overflow-hidden rounded-xl bg-white/5 hover:bg-white/10 px-3 sm:px-4 py-2 border border-white/10 hover:border-purple-500/30 transition-all duration-300 hover:scale-105 animate-fade-in" style={{ animationDelay: '300ms' }}>
                                            <div className="absolute inset-0 bg-gradient-to-r from-purple-500/0 via-purple-500/10 to-purple-500/0 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                                            <div className="relative flex items-center gap-2">
                                                <Film className="w-4 h-4 text-purple-400" />
                                                <span className="text-xs sm:text-sm font-bold text-white">
                                                    {parts.length} {parts.length === 1 ? 'película' : 'películas'}
                                                </span>
                                            </div>
                                        </div>

                                        {totalRuntime > 0 && (
                                            <div className="group relative overflow-hidden rounded-xl bg-white/5 hover:bg-white/10 px-3 sm:px-4 py-2 border border-white/10 hover:border-blue-500/30 transition-all duration-300 hover:scale-105 animate-fade-in" style={{ animationDelay: '400ms' }}>
                                                <div className="absolute inset-0 bg-gradient-to-r from-blue-500/0 via-blue-500/10 to-blue-500/0 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                                                <div className="relative flex items-center gap-2">
                                                    <Clock className="w-4 h-4 text-blue-400" />
                                                    <span className="text-xs sm:text-sm font-bold text-white">
                                                        {Math.round(totalRuntime / 60)}h total
                                                    </span>
                                                </div>
                                            </div>
                                        )}

                                        {parts.length > 0 && parts[0]?.release_date && (
                                            <div className="group relative overflow-hidden rounded-xl bg-white/5 hover:bg-white/10 px-3 sm:px-4 py-2 border border-white/10 hover:border-pink-500/30 transition-all duration-300 hover:scale-105 animate-fade-in" style={{ animationDelay: '500ms' }}>
                                                <div className="absolute inset-0 bg-gradient-to-r from-pink-500/0 via-pink-500/10 to-pink-500/0 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                                                <div className="relative flex items-center gap-2">
                                                    <Sparkles className="w-4 h-4 text-pink-400" />
                                                    <span className="text-xs sm:text-sm font-bold text-white">
                                                        Desde {new Date(parts[0].release_date).getFullYear()}
                                                    </span>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Grid */}
                        {parts.length > 0 ? (
                            <div className="relative z-0 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 sm:gap-6">
                                {parts.map((movie, idx) => (
                                    <MovieCard 
                                        key={`${movie.id}-${idx}`} 
                                        movie={movie} 
                                        idx={idx}
                                        imdbRating={imdbRatings[`movie:${movie.id}`]}
                                    />
                                ))}
                            </div>
                        ) : (
                            <div className="py-20 text-center text-zinc-500 animate-fade-in">
                                <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-white/5 border border-white/10 mb-4">
                                    <Film className="h-10 w-10 opacity-40" />
                                </div>
                                <p className="text-sm font-medium">No hay películas en esta colección</p>
                            </div>
                        )}
                    </>
                )}
            </div>

            <style jsx>{`
                @keyframes fade-in {
                    from {
                        opacity: 0;
                    }
                    to {
                        opacity: 1;
                    }
                }

                @keyframes fade-in-up {
                    from {
                        opacity: 0;
                        transform: translateY(20px);
                    }
                    to {
                        opacity: 1;
                        transform: translateY(0);
                    }
                }

                .animate-fade-in {
                    animation: fade-in 0.5s ease-out forwards;
                }

                .animate-fade-in-up {
                    animation: fade-in-up 0.6s ease-out forwards;
                }
            `}</style>
        </div>
    )
}
