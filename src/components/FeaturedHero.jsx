// /src/components/FeaturedHero.jsx
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import NextImage from "next/image";
import { useRouter } from "next/navigation";
import {
  Play,
  X,
  Heart,
  BookmarkPlus,
  Eye,
  EyeOff,
  Info,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

import { useAuth } from "@/context/AuthContext";
import {
  markAsFavorite,
  markInWatchlist,
  getMovieDetails,
  getExternalIds,
} from "@/lib/api/tmdb";
import { fetchImdbRatingByImdb } from "@/lib/api/imdbRatings";
import { traktGetItemStatus, traktSetWatched } from "@/lib/api/traktClient";

import {
  buildImg,
  GENRES,
  getMediaTypeForItem,
  getPreviewBackdropFallback,
  fetchBestBackdropNoLang,
  fetchBestPosterNoLang,
  fetchBestLogo,
  getBestTrailerCached,
  getArtworkPreference,
  yearOf,
  ratingOf,
  formatRuntime,
} from "@/lib/dashboard/media";

// El hero convive con previews interactivas en la misma vista. Usamos tamaños
// acotados para no competir con los backdrops de hover del dashboard.
const HERO_BACKDROP_SIZE = "w1280";
const HERO_POSTER_SIZE = "w780";
const YOUTUBE_QUALITY_HINT = "highres";
const YOUTUBE_QUALITY_FALLBACK = "hd1080";
const YOUTUBE_QUALITY_RETRY_DELAYS = [150, 750, 1800];

const traktTypeOf = (mediaType) => (mediaType === "tv" ? "show" : "movie");

function HeroActionButton({
  children,
  active = false,
  disabled = false,
  loading = false,
  title,
  onClick,
  className = "",
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={active}
      disabled={disabled || loading}
      onClick={onClick}
      className={`inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/15 bg-white/12 text-white shadow-[0_8px_28px_rgba(0,0,0,0.35)] backdrop-blur-md transition-colors hover:bg-white/22 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-300 disabled:cursor-wait disabled:opacity-70 sm:h-11 sm:w-11 [&_svg]:h-4 [&_svg]:w-4 sm:[&_svg]:h-5 sm:[&_svg]:w-5 ${active ? "bg-white text-black hover:bg-white/90" : ""} ${className}`}
    >
      {loading ? (
        <span className="h-4 w-4 rounded-full border-2 border-current border-t-transparent" />
      ) : (
        children
      )}
    </button>
  );
}

/* ====================================================================
 * Slide individual del hero a pantalla completa
 * ==================================================================== */
function FeaturedSlide({
  movie,
  backdropPath,
  posterPath,
  logoPath,
  isActive,
  isMobile,
  shouldLoadMedia,
}) {
  const { session, account } = useAuth();
  const router = useRouter();

  const mediaType = getMediaTypeForItem(movie);
  const href = `/details/${mediaType}/${movie.id}`;

  const [extras, setExtras] = useState({ runtime: null, imdbRating: null });
  const [favorite, setFavorite] = useState(false);
  const [watchlist, setWatchlist] = useState(false);
  const [watched, setWatched] = useState(false);
  const [loadingStates, setLoadingStates] = useState(false);
  const [updating, setUpdating] = useState("");
  const [error, setError] = useState("");

  const [showTrailer, setShowTrailer] = useState(false);
  const [trailer, setTrailer] = useState(null);
  const [trailerLoading, setTrailerLoading] = useState(false);
  const trailerIframeRef = useRef(null);

  // Al dejar de ser el slide activo, cerramos el trailer.
  useEffect(() => {
    if (!isActive) setShowTrailer(false);
  }, [isActive]);

  useEffect(() => {
    setShowTrailer(false);
    setTrailer(null);
  }, [movie?.id]);

  // Estado de cuenta (favorito/pendiente/visto). El backend devuelve los tres
  // estados en una sola llamada (igual que DetailsClient), con source "backend".
  useEffect(() => {
    let cancel = false;
    const load = async () => {
      if (!isActive || !movie || !account?.id) {
        setFavorite(false);
        setWatchlist(false);
        setWatched(false);
        return;
      }
      try {
        setLoadingStates(true);
        const status = await traktGetItemStatus({
          type: traktTypeOf(mediaType),
          tmdbId: movie.id,
        }).catch(() => null);
        if (!cancel && status) {
          setFavorite(!!status.favorite);
          setWatchlist(!!status.watchlist || !!status.inWatchlist);
          setWatched(!!status.watched);
        }
      } catch {
        // silencio
      } finally {
        if (!cancel) setLoadingStates(false);
      }
    };
    load();
    return () => {
      cancel = true;
    };
  }, [isActive, movie, account, mediaType]);

  // Extras: duración/temporadas + nota IMDb
  useEffect(() => {
    let abort = false;
    if (!isActive || !movie) return;

    const load = async () => {
      try {
        let runtime = null;
        let imdbId = movie?.imdb_id || null;

        if (mediaType === "movie") {
          const details = await getMovieDetails(movie.id).catch(() => null);
          runtime = details?.runtime ? formatRuntime(details.runtime) : null;
        } else {
          const r = await fetch(
            `https://api.themoviedb.org/3/tv/${movie.id}?api_key=${process.env.NEXT_PUBLIC_TMDB_API_KEY}`,
          ).catch(() => null);
          if (r?.ok) {
            const d = await r.json();
            if (d?.number_of_seasons) {
              runtime = `${d.number_of_seasons} Temp.`;
              if (d.number_of_episodes)
                runtime += ` · ${d.number_of_episodes} Eps.`;
            }
          }
        }

        let imdbRating = null;
        try {
          if (!imdbId) {
            const ext = await getExternalIds(mediaType, movie.id);
            imdbId = ext?.imdb_id || null;
          }
          if (imdbId) {
            const ds = await fetchImdbRatingByImdb(imdbId);
            if (typeof ds?.rating === "number") imdbRating = ds.rating;
          }
        } catch { }

        if (!abort) setExtras({ runtime, imdbRating });
      } catch {
        if (!abort) setExtras({ runtime: null, imdbRating: null });
      }
    };

    load();
    return () => {
      abort = true;
    };
  }, [isActive, movie, mediaType]);

  const requireLogin = () => {
    if (!session || !account?.id) {
      window.location.href = `/login?next=${encodeURIComponent(
        window.location.pathname + window.location.search,
      )}`;
      return true;
    }
    return false;
  };

  const navigateToDetails = () => router.push(href);

  const handleToggleTrailer = async (e) => {
    e.stopPropagation();
    if (showTrailer) {
      setShowTrailer(false);
      return;
    }
    try {
      setTrailerLoading(true);
      setError("");
      const t = await getBestTrailerCached(movie.id, mediaType);
      if (!t?.key) {
        setError("No hay trailer disponible.");
        return;
      }
      setTrailer(t);
      setShowTrailer(true);
    } catch {
      setError("No se pudo cargar el trailer.");
    } finally {
      setTrailerLoading(false);
    }
  };

  const handleToggleFavorite = async (e) => {
    e.stopPropagation();
    if (requireLogin() || updating) return;
    const next = !favorite;
    setUpdating("favorite");
    setFavorite(next);
    try {
      await markAsFavorite({
        accountId: account.id,
        sessionId: session,
        type: mediaType,
        mediaId: movie.id,
        favorite: next,
        title: movie.title || movie.name,
        posterPath: movie.poster_path || movie.backdrop_path || null,
      });
    } catch {
      setFavorite((v) => !v);
      setError("No se pudo actualizar favoritos.");
    } finally {
      setUpdating("");
    }
  };

  const handleToggleWatchlist = async (e) => {
    e.stopPropagation();
    if (requireLogin() || updating) return;
    const next = !watchlist;
    setUpdating("watchlist");
    setWatchlist(next);
    try {
      await markInWatchlist({
        accountId: account.id,
        sessionId: session,
        type: mediaType,
        mediaId: movie.id,
        watchlist: next,
        title: movie.title || movie.name,
        posterPath: movie.poster_path || movie.backdrop_path || null,
      });
    } catch {
      setWatchlist((v) => !v);
      setError("No se pudo actualizar pendientes.");
    } finally {
      setUpdating("");
    }
  };

  const handleToggleWatched = async (e) => {
    e.stopPropagation();
    if (requireLogin() || updating) return;
    const next = !watched;
    setUpdating("watched");
    setWatched(next);
    try {
      await traktSetWatched({
        type: traktTypeOf(mediaType),
        tmdbId: movie.id,
        watched: next,
      });
    } catch {
      setWatched((v) => !v);
      setError("No se pudo actualizar el visionado.");
    } finally {
      setUpdating("");
    }
  };

  const genres = useMemo(() => {
    const ids =
      movie.genre_ids ||
      (Array.isArray(movie.genres) ? movie.genres.map((g) => g.id) : []);
    return ids
      .map((id) => GENRES[id])
      .filter(Boolean)
      .slice(0, 3)
      .join(" · ");
  }, [movie]);

  const bgSrc = isMobile
    ? posterPath
      ? buildImg(posterPath, HERO_POSTER_SIZE)
      : null
    : backdropPath
      ? buildImg(backdropPath, HERO_BACKDROP_SIZE)
      : null;
  const logoSrc = logoPath ? buildImg(logoPath, "original") : null;
  const title = movie.title || movie.name || "";
  const overview =
    typeof movie.overview === "string" && movie.overview.trim()
      ? movie.overview.trim()
      : "";

  const trailerSrc = trailer?.key
    ? `https://www.youtube-nocookie.com/embed/${trailer.key}` +
    `?autoplay=1&mute=1&playsinline=1&rel=0&modestbranding=1` +
    `&controls=0&iv_load_policy=3&disablekb=1&fs=0&enablejsapi=1` +
    `&vq=${YOUTUBE_QUALITY_HINT}&hd=1` + // pista de máxima calidad
    `&origin=${typeof window !== "undefined"
      ? encodeURIComponent(window.location.origin)
      : ""
    }`
    : null;

  return (
    <div
      className="relative h-full w-full cursor-pointer select-none overflow-hidden bg-black"
      onClick={navigateToDetails}
    >
      {/* Fondo: poster textless en móvil; backdrop completo en escritorio. */}
      <div className="absolute inset-0">
        {!showTrailer && shouldLoadMedia && bgSrc && (
          <NextImage
            key={bgSrc}
            src={bgSrc}
            alt={title}
            fill
            loading="lazy"
            fetchPriority="low"
            sizes="100vw"
            className={isMobile ? "object-contain object-center" : "object-contain object-right"}
          />
        )}

        {showTrailer && (
          <>
            {(trailerLoading || !trailerSrc) && (
              <div className="absolute inset-0 animate-pulse bg-neutral-900" />
            )}
            {trailerSrc && (
              <div className="absolute inset-0 overflow-hidden">
                <div className="absolute inset-y-0 right-0 aspect-video h-full max-w-full">
                  <iframe
                    key={trailer.key}
                    ref={trailerIframeRef}
                    className="pointer-events-none absolute inset-0 h-full w-full"
                    src={trailerSrc}
                    title={`Trailer - ${title}`}
                    width="1920"
                    height="1080"
                    allow="autoplay; encrypted-media; picture-in-picture"
                    allowFullScreen={false}
                    onLoad={() => {
                      try {
                        const win = trailerIframeRef.current?.contentWindow;
                        if (!win) return;
                        const target = "https://www.youtube-nocookie.com";
                        const cmd = (func, args = []) =>
                          win.postMessage(
                            JSON.stringify({ event: "command", func, args }),
                            target,
                          );
                        const requestBestQuality = () => {
                          cmd("unMute");
                          cmd("setVolume", [25]);
                          // Fuerza la máxima resolución disponible del reproductor.
                          cmd("setPlaybackQualityRange", [
                            YOUTUBE_QUALITY_HINT,
                            YOUTUBE_QUALITY_FALLBACK,
                          ]);
                          cmd("setPlaybackQuality", [YOUTUBE_QUALITY_HINT]);
                        };
                        YOUTUBE_QUALITY_RETRY_DELAYS.forEach((delay) => {
                          setTimeout(requestBestQuality, delay);
                        });
                      } catch { }
                    }}
                  />
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Degradados estilo Prime: la izquierda puede convertirse en fondo negro
          cuando el hero ya llegó al alto máximo y el backdrop mantiene formato. */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            isMobile
              ? "linear-gradient(to top, #000 0%, rgba(0,0,0,0.82) 12%, rgba(0,0,0,0.42) 30%, rgba(0,0,0,0.1) 48%, transparent 64%)"
              : "linear-gradient(to right, #000 0%, rgba(0,0,0,0.96) 24%, rgba(0,0,0,0.55) 46%, rgba(0,0,0,0.12) 68%, transparent 84%)",
        }}
      />
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 hidden h-3/5 sm:block"
        style={{
          background:
            "linear-gradient(to top, #000 0%, rgba(0,0,0,0.55) 35%, transparent 100%)",
        }}
      />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-black/70 to-transparent sm:h-28" />

      {/* Contenido: anclado en la zona inferior (no centrado) con amplio margen
          lateral izquierdo y un margen inferior cómodo. */}
      <div className="absolute inset-x-0 bottom-0 z-10">
        <div className="w-full px-5 pb-12 sm:px-16 sm:pb-24 lg:px-32 lg:pb-28">
          <div className="max-w-[22rem] sm:max-w-xl">
            {/* Logo del título o nombre */}
            {logoSrc ? (
              <div className="relative mb-3 h-20 w-[72%] max-w-[15rem] sm:mb-5 sm:h-40 sm:max-w-lg lg:h-48 lg:max-w-xl">
                <NextImage
                  src={logoSrc}
                  alt={title}
                  fill
                  sizes="(min-width:1024px) 580px, (min-width:640px) 510px, 72vw"
                  className="object-contain object-left drop-shadow-[0_4px_20px_rgba(0,0,0,0.8)]"
                />
              </div>
            ) : (
              <h2 className="mb-3 text-3xl font-black leading-tight tracking-tight text-white drop-shadow-[0_2px_12px_rgba(0,0,0,0.9)] sm:mb-5 sm:text-6xl">
                {title}
              </h2>
            )}

            {/* Metadatos + puntuaciones */}
            <div className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1.5 text-xs text-neutral-200 sm:mb-3 sm:gap-x-3 sm:gap-y-2 sm:text-sm">
              {yearOf(movie) && (
                <span className="font-semibold">{yearOf(movie)}</span>
              )}
              {extras.runtime && <span>· {extras.runtime}</span>}

              <span className="inline-flex items-center gap-1.5">
                <NextImage
                  src="/logo-TMDb.png"
                  alt="TMDb"
                  className="h-3 w-auto"
                  width={36}
                  height={12}
                  loading="lazy"
                  style={{ width: "auto" }}
                />
                <span className="font-semibold">{ratingOf(movie)}</span>
              </span>

              {typeof extras.imdbRating === "number" && (
                <span className="inline-flex items-center gap-1.5">
                  <NextImage
                    src="/logo-IMDb.svg"
                    alt="IMDb"
                    className="h-4 w-auto"
                    width={34}
                    height={16}
                    loading="lazy"
                    style={{ width: "auto" }}
                  />
                  <span className="font-semibold">
                    {extras.imdbRating.toFixed(1)}
                  </span>
                </span>
              )}
            </div>

            {genres && (
              <div className="mb-2 text-xs font-medium text-amber-300/90 sm:mb-3 sm:text-sm">
                {genres}
              </div>
            )}

            {overview && (
              <p className="mb-4 line-clamp-2 max-w-xl text-xs leading-relaxed text-neutral-200/90 sm:mb-5 sm:line-clamp-3 sm:text-base">
                {overview}
              </p>
            )}

            {/* Botones de acción */}
            <div className="flex flex-wrap items-center gap-2.5 sm:gap-3">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  navigateToDetails();
                }}
                className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-xs font-bold text-black shadow-lg transition hover:bg-white/90 sm:px-6 sm:py-2.5 sm:text-base"
              >
                <Info className="h-4 w-4 sm:h-5 sm:w-5" />
                Más información
              </button>

              <HeroActionButton
                onClick={handleToggleTrailer}
                loading={trailerLoading}
                active
                title={showTrailer ? "Cerrar trailer" : "Ver trailer"}
                className="bg-white text-black hover:bg-white/90"
              >
                {showTrailer ? (
                  <X className="text-black" />
                ) : (
                  <Play className="ml-0.5 fill-current text-black" />
                )}
              </HeroActionButton>

              <HeroActionButton
                onClick={handleToggleFavorite}
                loading={loadingStates || updating === "favorite"}
                active={favorite}
                title={favorite ? "Quitar de favoritos" : "Añadir a favoritos"}
              >
                <Heart className={favorite ? "fill-current" : ""} />
              </HeroActionButton>

              <HeroActionButton
                onClick={handleToggleWatchlist}
                loading={loadingStates || updating === "watchlist"}
                active={watchlist}
                title={watchlist ? "Quitar de pendientes" : "Añadir a pendientes"}
              >
                <BookmarkPlus className={watchlist ? "fill-current" : ""} />
              </HeroActionButton>

              <HeroActionButton
                onClick={handleToggleWatched}
                loading={loadingStates || updating === "watched"}
                active={watched}
                title={watched ? "Marcar como no visto" : "Marcar como visto"}
              >
                {watched ? <Eye /> : <EyeOff />}
              </HeroActionButton>
            </div>

            {error && (
              <p className="mt-2 text-xs text-red-400">{error}</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ====================================================================
 * Hero destacado a pantalla completa (carrusel)
 * ==================================================================== */
export default function FeaturedHero({ items = [], isMobile }) {
  const assetsRef = useRef({});
  const resolvingAssetsRef = useRef(new Set());
  const [activeIndex, setActiveIndex] = useState(0);
  const [assets, setAssets] = useState({}); // id -> { backdrop, poster, logo }

  const list = useMemo(
    () => (Array.isArray(items) ? items.filter((m) => m?.id) : []),
    [items],
  );

  useEffect(() => {
    assetsRef.current = assets;
  }, [assets]);

  useEffect(() => {
    if (activeIndex >= list.length) setActiveIndex(0);
  }, [activeIndex, list.length]);

  const resolveAssetsFor = useCallback(
    async (movie) => {
      if (!movie?.id) return;
      const id = movie.id;
      if (assetsRef.current[id] || resolvingAssetsRef.current.has(id)) return;

      resolvingAssetsRef.current.add(id);
      const mediaType = getMediaTypeForItem(movie);
      let backdrop = null;
      let poster = null;
      let logo = null;

      try {
        const { backdrop: userBackdrop } = getArtworkPreference(id);
        backdrop =
          userBackdrop ||
          (await fetchBestBackdropNoLang(id, mediaType)) ||
          getPreviewBackdropFallback(movie);
      } catch {
        backdrop = getPreviewBackdropFallback(movie);
      }

      try {
        poster = await fetchBestPosterNoLang(id, mediaType);
      } catch {
        poster = null;
      }

      try {
        logo = await fetchBestLogo(id, mediaType, ["en", null]);
      } catch { }

      setAssets((prev) =>
        prev[id] ? prev : { ...prev, [id]: { backdrop, poster, logo } },
      );
      resolvingAssetsRef.current.delete(id);
    },
    [],
  );

  // Carga solo los assets del slide activo. No hay precarga de slides futuros:
  // las previews del dashboard conservan prioridad absoluta.
  useEffect(() => {
    if (!list.length) return;
    resolveAssetsFor(list[activeIndex]);
  }, [list, activeIndex, resolveAssetsFor]);

  if (!list.length) return null;

  const activeMovie = list[activeIndex] || list[0];
  const activeAssets = assets[activeMovie.id] || {};
  const activeBackdrop =
    activeAssets.backdrop || getPreviewBackdropFallback(activeMovie) || null;
  const activePoster = activeAssets.poster || null;

  const goToPrevious = () => {
    setActiveIndex((current) =>
      current <= 0 ? list.length - 1 : current - 1,
    );
  };

  const goToNext = () => {
    setActiveIndex((current) =>
      current >= list.length - 1 ? 0 : current + 1,
    );
  };

  return (
    <section
      className="relative isolate aspect-[2/3] w-full overflow-hidden bg-black sm:aspect-video sm:max-h-[88dvh]"
      aria-label="Contenido destacado"
    >
      <FeaturedSlide
        key={activeMovie.id}
        movie={activeMovie}
        backdropPath={activeBackdrop}
        posterPath={activePoster}
        logoPath={activeAssets.logo || null}
        isActive
        isMobile={isMobile}
        shouldLoadMedia
      />

      {/* Flechas (solo desktop) */}
      {!isMobile && list.length > 1 && (
        <>
          <button
            type="button"
            aria-label="Anterior"
            onClick={goToPrevious}
            className="group/arrow absolute left-4 top-1/2 z-20 hidden h-14 w-14 -translate-y-1/2 items-center justify-center text-white drop-shadow-[0_3px_10px_rgba(0,0,0,0.95)] transition-transform duration-300 hover:scale-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-300/70 sm:flex"
          >
            <ChevronLeft className="h-9 w-9 transition-transform duration-300 group-hover/arrow:-translate-x-0.5" />
          </button>
          <button
            type="button"
            aria-label="Siguiente"
            onClick={goToNext}
            className="group/arrow absolute right-4 top-1/2 z-20 hidden h-14 w-14 -translate-y-1/2 items-center justify-center text-white drop-shadow-[0_3px_10px_rgba(0,0,0,0.95)] transition-transform duration-300 hover:scale-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-300/70 sm:flex"
          >
            <ChevronRight className="h-9 w-9 transition-transform duration-300 group-hover/arrow:translate-x-0.5" />
          </button>
        </>
      )}

      {list.length > 1 && (
        <div
          className="absolute bottom-4 left-1/2 z-20 flex -translate-x-1/2 items-center gap-2"
          aria-label="Diapositivas destacadas"
        >
          {list.map((movie, index) => (
            <button
              key={movie.id}
              type="button"
              aria-label={`Ver destacado ${index + 1}`}
              aria-current={index === activeIndex ? "true" : undefined}
              onClick={() => setActiveIndex(index)}
              className={`h-2 rounded-full transition-colors ${
                index === activeIndex
                  ? "w-6 bg-amber-500"
                  : "w-2 bg-white/45 hover:bg-white/70"
              }`}
            />
          ))}
        </div>
      )}
    </section>
  );
}
