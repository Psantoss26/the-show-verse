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
import { traktGetItemStatus } from "@/lib/api/traktClient";

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
const HERO_BACKDROP_SIZE = "original";
const HERO_POSTER_SIZE = "w780";
const HERO_AUTO_ADVANCE_MS = 5000;
const HERO_SWIPE_THRESHOLD_PX = 60;
const YOUTUBE_QUALITY_HINT = "highres";
const YOUTUBE_QUALITY_MIN = "hd1080";
const YOUTUBE_QUALITY_RETRY_DELAYS = [150, 750, 1800, 3200];

const traktTypeOf = (mediaType) => (mediaType === "tv" ? "show" : "movie");

const HERO_ACTION_COLORS = {
  blue: {
    rgb: "59, 130, 246",
    secondary: "147, 197, 253",
    glow: "rgba(59, 130, 246, 0.5)",
  },
  red: {
    rgb: "239, 68, 68",
    secondary: "252, 165, 165",
    glow: "rgba(239, 68, 68, 0.5)",
  },
  yellow: {
    rgb: "234, 179, 8",
    secondary: "253, 224, 71",
    glow: "rgba(234, 179, 8, 0.5)",
  },
  green: {
    rgb: "34, 197, 94",
    secondary: "134, 239, 172",
    glow: "rgba(34, 197, 94, 0.5)",
  },
};

function HeroActionButton({
  children,
  active = false,
  activeColor = "blue",
  disabled = false,
  loading = false,
  solid = false,
  title,
  onClick,
  className = "",
}) {
  const colors = HERO_ACTION_COLORS[activeColor] || HERO_ACTION_COLORS.blue;
  const [ripples, setRipples] = useState([]);

  const handleClick = (event) => {
    if (disabled || loading) return;

    const rect = event.currentTarget.getBoundingClientRect();
    const id =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random()}`;

    setRipples((prev) => [
      ...prev,
      {
        id,
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      },
    ]);

    window.setTimeout(() => {
      setRipples((prev) => prev.filter((ripple) => ripple.id !== id));
    }, 620);

    onClick?.(event);
  };

  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={active}
      disabled={disabled || loading}
      data-hero-action-button="true"
      onClick={handleClick}
      className={`group/hero-action relative isolate flex h-9 w-9 items-center justify-center overflow-visible rounded-full border border-white/10 bg-black/20 bg-gradient-to-br from-white/10 via-white/[0.02] to-black/40 text-white backdrop-blur-[50px] transition-[scale,background-color,color,box-shadow,border-color] duration-300 ease-out hover:scale-110 active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-300 disabled:cursor-not-allowed disabled:opacity-60 sm:h-10 sm:w-10 [&_svg]:h-5 [&_svg]:w-5 ${className}`}
      style={{
        containerType: "inline-size",
        backgroundColor:
          solid && !disabled
            ? "#fff"
            : active && !disabled
              ? `rgba(${colors.rgb}, 0.3)`
              : undefined,
        backgroundImage: solid && !disabled ? "none" : undefined,
        color:
          solid && !disabled
            ? "#000"
            : active && !disabled
              ? `rgb(${colors.secondary})`
              : undefined,
        boxShadow:
          solid && !disabled
            ? "inset 0 1.5px 2px rgba(255,255,255,0.15), 0 10px 30px -10px rgba(255,255,255,0.55)"
            : active && !disabled
              ? `inset 0 1.5px 2px rgba(255,255,255,0.15), 0 0 20px ${colors.glow}`
              : "inset 0 1.5px 2px rgba(255,255,255,0.15), 0 10px 30px -10px rgba(0,0,0,0.5)",
      }}
    >
      <span className="pointer-events-none absolute inset-0 overflow-hidden rounded-full">
        <span
          className="absolute inset-0 rounded-full opacity-0 transition-opacity duration-300 group-hover/hero-action:opacity-100"
          style={{
            background: `linear-gradient(135deg, rgba(${colors.secondary}, 0.22), transparent 42%, rgba(${colors.rgb}, 0.14), transparent 78%)`,
            animation:
              active && !loading
                ? "heroLiquidShine 3s ease-in-out infinite"
                : undefined,
          }}
        />
        <span
          className="absolute inset-0 rounded-full opacity-0 transition-opacity duration-300 group-hover/hero-action:opacity-60"
          style={{
            border: `2px solid rgb(${colors.rgb})`,
            animation:
              active && !loading
                ? "heroLiquidPulse 2s ease-in-out infinite"
                : undefined,
          }}
        />
        {ripples.map((ripple) => (
          <span
            key={ripple.id}
            className="absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{
              left: ripple.x,
              top: ripple.y,
              background: `rgba(${colors.secondary}, 0.65)`,
              animation: "heroActionRipple 620ms ease-out forwards",
            }}
          />
        ))}
      </span>

      <span className="relative z-10 flex h-full w-full items-center justify-center">
        {loading ? (
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent" />
        ) : (
          children
        )}
      </span>

      {title && (
        <span className="pointer-events-none absolute left-1/2 top-full z-[100] mt-2 -translate-x-1/2 scale-95 whitespace-nowrap rounded-lg border border-white/10 bg-black/90 px-2.5 py-1 text-[10px] font-bold text-white opacity-0 shadow-xl transition-all delay-[1200ms] duration-200 ease-out group-hover/hero-action:scale-100 group-hover/hero-action:opacity-100">
          {title}
        </span>
      )}

      <style jsx>{`
        @keyframes heroLiquidShine {
          0%,
          100% {
            transform: translateX(-100%) translateY(-100%) rotate(0deg);
            opacity: 0;
          }
          50% {
            transform: translateX(100%) translateY(100%) rotate(180deg);
            opacity: 1;
          }
        }

        @keyframes heroLiquidPulse {
          0%,
          100% {
            transform: scale(1);
            opacity: 0.3;
          }
          50% {
            transform: scale(1.15);
            opacity: 0.7;
          }
        }

        @keyframes heroActionRipple {
          from {
            opacity: 0.75;
            scale: 0;
          }
          to {
            opacity: 0;
            scale: 16;
          }
        }
      `}</style>
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
  onTrailerVisibilityChange,
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
  const [loadedBackdropSrc, setLoadedBackdropSrc] = useState("");
  const trailerIframeRef = useRef(null);

  // Al dejar de ser el slide activo, cerramos el trailer.
  useEffect(() => {
    if (isActive) return;
    setShowTrailer(false);
    onTrailerVisibilityChange?.(false);
  }, [isActive, onTrailerVisibilityChange]);

  useEffect(() => {
    setShowTrailer(false);
    setTrailer(null);
    onTrailerVisibilityChange?.(false);
  }, [movie?.id, onTrailerVisibilityChange]);

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
      onTrailerVisibilityChange?.(false);
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
      onTrailerVisibilityChange?.(true);
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
      className="relative w-full h-full bg-black cursor-pointer sm:absolute sm:inset-0 sm:h-full sm:w-full sm:block select-none"
      onClick={navigateToDetails}
    >
      {/* Fondo/Poster: en móvil se muestra arriba (relative), en escritorio de fondo (absolute) */}
      <div className="relative w-full aspect-[2/3] sm:absolute sm:inset-0 sm:aspect-auto sm:h-full">
        {!showTrailer && shouldLoadMedia && bgSrc && (
          <div
            key={bgSrc}
            className={`hero-backdrop-reveal absolute inset-0 ${
              isMobile
                ? "hero-backdrop-reveal-mobile"
                : "hero-backdrop-reveal-desktop"
            } ${loadedBackdropSrc === bgSrc ? "hero-backdrop-ready" : "hero-backdrop-loading"}`}
          >
            <NextImage
              src={bgSrc}
              alt={title}
              fill
              loading={isActive ? "eager" : "lazy"}
              fetchPriority={isActive ? "high" : "low"}
              quality={100}
              sizes="100vw"
              onLoad={() => setLoadedBackdropSrc(bgSrc)}
              className={
                isMobile
                  ? "object-contain object-top"
                  : "object-contain object-right"
              }
            />
          </div>
        )}

        {showTrailer && (
          <>
            {(trailerLoading || !trailerSrc) && (
              <div className="absolute inset-0 animate-pulse bg-neutral-900" />
            )}
            {trailerSrc && (
              <div className="absolute inset-0 overflow-hidden">
                <div className="absolute inset-y-0 right-0 aspect-video h-full max-w-full overflow-hidden">
                  <iframe
                    key={trailer.key}
                    ref={trailerIframeRef}
                    className="pointer-events-none absolute left-1/2 top-1/2 h-[116%] w-[116%] -translate-x-1/2 -translate-y-1/2"
                    src={trailerSrc}
                    title={`Trailer - ${title}`}
                    width="3840"
                    height="2160"
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
                          // Pide la máxima resolución disponible; YouTube ajusta
                          // al mejor nivel real que tenga cada trailer.
                          cmd("setPlaybackQualityRange", [
                            YOUTUBE_QUALITY_MIN,
                            YOUTUBE_QUALITY_HINT,
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

      {/* Difuminado lateral izquierdo (solo escritorio): oscurece la zona de
          logo/información/botones, fundiéndose hacia el centro-derecha. */}
      <div
        className="pointer-events-none absolute inset-0 hidden sm:block transition-opacity duration-500"
        style={{
          background: showTrailer
            ? // Al reproducir el trailer el difuminado lateral se recoge para
              // mostrar más parte del vídeo (termina antes, ~62%).
              "linear-gradient(to right," +
              " #000 0%," +
              " rgba(0,0,0,0.9) 12%," +
              " rgba(0,0,0,0.62) 24%," +
              " rgba(0,0,0,0.36) 34%," +
              " rgba(0,0,0,0.18) 44%," +
              " rgba(0,0,0,0.06) 54%," +
              " transparent 62%)"
            : "linear-gradient(to right," +
              " #000 0%," +
              " rgba(0,0,0,0.93) 16%," +
              " rgba(0,0,0,0.74) 30%," +
              " rgba(0,0,0,0.52) 42%," +
              " rgba(0,0,0,0.32) 52%," +
              " rgba(0,0,0,0.17) 62%," +
              " rgba(0,0,0,0.07) 70%," +
              " rgba(0,0,0,0.02) 78%," +
              " transparent 86%)",
        }}
      />

      {/* Tapa-hueco lateral izquierdo (solo escritorio): el backdrop es
          object-contain object-right, así que al ensanchar la ventana queda un
          hueco a la izquierda cuyo tamaño = 100% - anchoImagen, donde
          anchoImagen = 88dvh * 16/9 (alto limitado por max-h-[88dvh]). Este
          panel negro cubre SIEMPRE ese hueco (+2rem de margen) y se funde 14rem
          dentro de la imagen, escalando con el ancho de la ventana para que el
          borde izquierdo del backdrop no sea visible nunca. */}
      <div
        className="pointer-events-none absolute inset-y-0 left-0 hidden sm:block"
        style={{
          width: "calc(100% - 88dvh * 16 / 9 + 42rem)",
          background:
            "linear-gradient(to right," +
            " #000 0%," +
            " #000 calc(100% - 40rem)," +
            " rgba(0,0,0,0.88) calc(100% - 34rem)," +
            " rgba(0,0,0,0.72) calc(100% - 28rem)," +
            " rgba(0,0,0,0.56) calc(100% - 23rem)," +
            " rgba(0,0,0,0.42) calc(100% - 18rem)," +
            " rgba(0,0,0,0.29) calc(100% - 14rem)," +
            " rgba(0,0,0,0.19) calc(100% - 10rem)," +
            " rgba(0,0,0,0.11) calc(100% - 7rem)," +
            " rgba(0,0,0,0.055) calc(100% - 4.5rem)," +
            " rgba(0,0,0,0.022) calc(100% - 2.5rem)," +
            " rgba(0,0,0,0.006) calc(100% - 1rem)," +
            " transparent 100%)",
        }}
      />

      {/* Difuminado inferior (solo escritorio): negro sólido en el borde para
          ocultar el corte de la imagen contra el fin de FeaturedHero, fundiendo
          suavemente hacia arriba y cubriendo los puntos indicadores. */}
      <div
        className="pointer-events-none absolute inset-x-0 -bottom-px hidden h-[22%] sm:block"
        style={{
          background:
            "linear-gradient(to top, #000 0%, rgba(0,0,0,0.85) 14%, rgba(0,0,0,0.4) 46%, transparent 100%)",
        }}
      />

      {/* Contenido: relativo debajo en móvil, absoluto en escritorio */}
      <div className="absolute bottom-0 left-0 right-0 z-10 w-full bg-gradient-to-t from-black via-black/95 to-transparent px-7 pb-8 pt-12 sm:absolute sm:inset-x-0 sm:bottom-0 sm:bg-none sm:px-20 sm:pb-28 lg:px-40 lg:pb-32 sm:pt-0">
        <div className="max-w-full sm:max-w-xl">
            {/* Logo del título o nombre */}
            {logoSrc ? (
              <div
                className="hero-reveal hero-logo-reveal relative mb-3 h-20 w-[72%] max-w-[15rem] sm:mb-5 sm:h-40 sm:max-w-lg lg:h-48 lg:max-w-xl"
                style={{ "--hero-delay": "80ms" }}
              >
                <NextImage
                  src={logoSrc}
                  alt={title}
                  fill
                  sizes="(min-width:1024px) 580px, (min-width:640px) 510px, 72vw"
                  className="object-contain object-left drop-shadow-[0_4px_20px_rgba(0,0,0,0.8)]"
                />
              </div>
            ) : (
              <h2
                className="hero-reveal hero-title-reveal mb-3 text-3xl font-black leading-tight tracking-tight text-white drop-shadow-[0_2px_12px_rgba(0,0,0,0.9)] sm:mb-5 sm:text-6xl"
                style={{ "--hero-delay": "80ms" }}
              >
                {title}
              </h2>
            )}

            {/* Metadatos + puntuaciones */}
            <div
              className="hero-reveal mb-2 flex flex-wrap items-center gap-x-2 gap-y-1.5 text-xs text-neutral-200 sm:mb-3 sm:gap-x-3 sm:gap-y-2 sm:text-sm"
              style={{ "--hero-delay": "170ms" }}
            >
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
              <div
                className="hero-reveal mb-2 text-xs font-medium text-amber-300/90 sm:mb-3 sm:text-sm"
                style={{ "--hero-delay": "230ms" }}
              >
                {genres}
              </div>
            )}

            {overview && (
              <p
                className="hero-reveal mb-4 line-clamp-2 max-w-xl text-xs leading-relaxed text-neutral-200/90 sm:mb-5 sm:line-clamp-3 sm:text-base"
                style={{ "--hero-delay": "290ms" }}
              >
                {overview}
              </p>
            )}

            {/* Botones de acción */}
            <div
              className="hero-reveal flex flex-nowrap items-center gap-2 sm:gap-3"
              style={{ "--hero-delay": "360ms" }}
            >
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  navigateToDetails();
                }}
                className="featured-info-button inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-full bg-white px-3.5 text-xs font-bold leading-none text-black shadow-lg transition hover:bg-white/90 sm:h-10 sm:gap-2 sm:px-4 sm:text-sm"
              >
                <Info className="h-4 w-4" />
                <span className="[text-box:trim-both_cap_alphabetic]">
                  Más información
                </span>
              </button>

              <HeroActionButton
                onClick={handleToggleTrailer}
                loading={trailerLoading}
                active
                activeColor="yellow"
                solid
                title={showTrailer ? "Cerrar trailer" : "Ver trailer"}
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
                activeColor="red"
                title={favorite ? "Quitar de favoritos" : "Añadir a favoritos"}
              >
                <Heart className={favorite ? "fill-current" : ""} />
              </HeroActionButton>

              <HeroActionButton
                onClick={handleToggleWatchlist}
                loading={loadingStates || updating === "watchlist"}
                active={watchlist}
                activeColor="blue"
                title={watchlist ? "Quitar de pendientes" : "Añadir a pendientes"}
              >
                <BookmarkPlus className={watchlist ? "fill-current" : ""} />
              </HeroActionButton>

              {/* Indicador de visionado: solo informativo. No se puede accionar
                  desde aquí para evitar borrar el historial de visionado con un
                  único clic. */}
              <HeroActionButton
                active={watched}
                activeColor="green"
                title={watched ? "Visto" : "No visto"}
                className="pointer-events-none"
              >
                {watched ? <Eye /> : <EyeOff />}
              </HeroActionButton>
            </div>

            {error && (
              <p
                className="hero-reveal mt-2 text-xs text-red-400"
                style={{ "--hero-delay": "420ms" }}
              >
                {error}
              </p>
            )}
          </div>
      </div>

      <style jsx>{`
        .hero-backdrop-reveal {
          opacity: 0;
          transform: translate3d(0, 0, 0);
          filter: blur(0);
          will-change: opacity, transform, filter;
        }

        .hero-backdrop-loading {
          opacity: 0;
        }

        .hero-backdrop-ready {
          animation: heroBackdropReveal 920ms cubic-bezier(0.16, 1, 0.3, 1)
            both;
        }

        .hero-backdrop-reveal-mobile.hero-backdrop-ready {
          animation-name: heroPosterRevealMobile;
        }

        .hero-reveal {
          animation: heroContentReveal 680ms cubic-bezier(0.22, 1, 0.36, 1)
            both;
          animation-delay: var(--hero-delay, 0ms);
          transform-origin: left center;
          will-change: opacity, transform, filter;
        }

        @keyframes heroBackdropReveal {
          from {
            opacity: 0;
            transform: translate3d(18px, 0, 0) scale(1.025);
            filter: blur(10px) saturate(0.9);
          }
          55% {
            opacity: 1;
          }
          to {
            opacity: 1;
            transform: translate3d(0, 0, 0) scale(1);
            filter: blur(0) saturate(1);
          }
        }

        @keyframes heroPosterRevealMobile {
          from {
            opacity: 0;
            transform: translate3d(0, 10px, 0);
            filter: blur(8px) saturate(0.92);
          }
          60% {
            opacity: 1;
          }
          to {
            opacity: 1;
            transform: translate3d(0, 0, 0);
            filter: blur(0) saturate(1);
          }
        }

        .hero-logo-reveal,
        .hero-title-reveal {
          animation-name: heroTitleReveal;
        }

        @keyframes heroContentReveal {
          from {
            opacity: 0;
            transform: translate3d(0, 18px, 0);
            filter: blur(8px);
          }
          to {
            opacity: 1;
            transform: translate3d(0, 0, 0);
            filter: blur(0);
          }
        }

        @keyframes heroTitleReveal {
          from {
            opacity: 0;
            transform: translate3d(0, 24px, 0) scale(0.96);
            filter: blur(10px);
          }
          to {
            opacity: 1;
            transform: translate3d(0, 0, 0) scale(1);
            filter: blur(0);
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .hero-backdrop-reveal,
          .hero-backdrop-loading,
          .hero-backdrop-ready,
          .hero-reveal,
          .hero-logo-reveal,
          .hero-title-reveal {
            animation: none;
            opacity: 1;
            transform: none;
            filter: none;
          }
        }
      `}</style>
    </div>
  );
}

/* ====================================================================
 * Hero destacado a pantalla completa (carrusel)
 * ==================================================================== */
export default function FeaturedHero({ items = [], isMobile }) {
  const assetsRef = useRef({});
  const resolvingAssetsRef = useRef(new Set());
  const pointerStartRef = useRef(null);
  const suppressClickRef = useRef(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [assets, setAssets] = useState({}); // id -> { backdrop, poster, logo }
  const [isInteracting, setIsInteracting] = useState(false);
  const [trailerOpen, setTrailerOpen] = useState(false);

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

  const goToPrevious = useCallback(() => {
    setActiveIndex((current) =>
      current <= 0 ? list.length - 1 : current - 1,
    );
  }, [list.length]);

  const goToNext = useCallback(() => {
    setActiveIndex((current) =>
      current >= list.length - 1 ? 0 : current + 1,
    );
  }, [list.length]);

  useEffect(() => {
    if (list.length <= 1 || isInteracting || trailerOpen) return;

    const timer = window.setTimeout(goToNext, HERO_AUTO_ADVANCE_MS);
    return () => window.clearTimeout(timer);
  }, [activeIndex, goToNext, isInteracting, list.length, trailerOpen]);

  if (!list.length) return null;

  const activeMovie = list[activeIndex] || list[0];
  const activeAssets = assets[activeMovie.id] || {};
  const activeBackdrop =
    activeAssets.backdrop || getPreviewBackdropFallback(activeMovie) || null;
  const activePoster = activeAssets.poster || null;

  const handlePointerDown = (event) => {
    if (event.button !== 0 && event.pointerType === "mouse") return;
    pointerStartRef.current = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
    };
    suppressClickRef.current = false;
    setIsInteracting(true);
  };

  const handlePointerMove = (event) => {
    const start = pointerStartRef.current;
    if (!start || start.id !== event.pointerId) return;

    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (
      Math.abs(dx) > HERO_SWIPE_THRESHOLD_PX &&
      Math.abs(dx) > Math.abs(dy) * 1.35
    ) {
      suppressClickRef.current = true;
      pointerStartRef.current = null;
      if (dx < 0) {
        goToNext();
      } else {
        goToPrevious();
      }
    }
  };

  const handlePointerEnd = (event) => {
    const start = pointerStartRef.current;
    if (start?.id === event.pointerId) pointerStartRef.current = null;
    window.setTimeout(() => {
      setIsInteracting(false);
    }, 120);
  };

  const handleClickCapture = (event) => {
    if (!suppressClickRef.current) return;
    suppressClickRef.current = false;
    event.preventDefault();
    event.stopPropagation();
  };

  const indicators = list.length > 1 && (
    <div className="flex items-center justify-center gap-2" aria-label="Diapositivas destacadas">
      {list.map((movie, index) => (
        <button
          key={movie.id}
          type="button"
          aria-label={`Ver destacado ${index + 1}`}
          aria-current={index === activeIndex ? "true" : undefined}
          onClick={(event) => {
            event.stopPropagation();
            setActiveIndex(index);
          }}
          className={`h-2 rounded-full transition-colors ${
            index === activeIndex
              ? "w-6 bg-amber-500"
              : "w-2 bg-white/45 hover:bg-white/70"
          }`}
        />
      ))}
    </div>
  );

  return (
    <>
      <section
        className="relative isolate w-full touch-pan-y overflow-hidden bg-black h-[calc(100dvh-7.8rem-env(safe-area-inset-bottom))] sm:h-auto sm:aspect-video sm:max-h-[88dvh]"
        aria-label="Contenido destacado"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
        onPointerLeave={handlePointerEnd}
        onClickCapture={handleClickCapture}
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
          onTrailerVisibilityChange={setTrailerOpen}
        />

        {/* Flechas (solo desktop) */}
        {!isMobile && list.length > 1 && (
          <>
            <button
              type="button"
              aria-label="Anterior"
              onClick={(event) => {
                event.stopPropagation();
                goToPrevious();
              }}
              className="group/arrow absolute left-4 top-1/2 z-20 hidden h-14 w-14 -translate-y-1/2 items-center justify-center text-white drop-shadow-[0_3px_10px_rgba(0,0,0,0.95)] transition-transform duration-300 hover:scale-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-300/70 sm:flex"
            >
              <ChevronLeft className="h-9 w-9 transition-transform duration-300 group-hover/arrow:-translate-x-0.5" />
            </button>
            <button
              type="button"
              aria-label="Siguiente"
              onClick={(event) => {
                event.stopPropagation();
                goToNext();
              }}
              className="group/arrow absolute right-4 top-1/2 z-20 hidden h-14 w-14 -translate-y-1/2 items-center justify-center text-white drop-shadow-[0_3px_10px_rgba(0,0,0,0.95)] transition-transform duration-300 hover:scale-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-300/70 sm:flex"
            >
              <ChevronRight className="h-9 w-9 transition-transform duration-300 group-hover/arrow:translate-x-0.5" />
            </button>
          </>
        )}

        {!isMobile && indicators && (
          <div className="absolute bottom-4 left-1/2 z-20 -translate-x-1/2">
            {indicators}
          </div>
        )}
      </section>

      {isMobile && indicators && (
        <div className="flex h-9 items-center justify-center bg-black sm:hidden">
          {indicators}
        </div>
      )}
    </>
  );
}
