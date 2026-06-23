// /src/components/FeaturedHero.jsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Swiper, SwiperSlide } from "swiper/react";
import { Navigation, Autoplay, Pagination, EffectFade } from "swiper/modules";
import "swiper/swiper-bundle.css";
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
import LiquidButton from "@/components/LiquidButton";

import {
  buildImg,
  GENRES,
  getMediaTypeForItem,
  getPreviewBackdropFallback,
  fetchBestBackdropNoLang,
  fetchBestLogo,
  getBestTrailerCached,
  getArtworkPreference,
  preloadImage,
  yearOf,
  ratingOf,
  formatRuntime,
} from "@/lib/dashboard/media";

const HERO_BACKDROP_SIZE = "w1280";

const traktTypeOf = (mediaType) => (mediaType === "tv" ? "show" : "movie");

// Difuminado de bordes (superior e inferior) del hero: la imagen se desvanece
// gradualmente hacia el fondo en lugar de terminar en un corte recto.
const HERO_EDGE_FADE =
  "linear-gradient(to bottom, transparent 0%, #000 9%, #000 84%, transparent 100%)";
const HERO_EDGE_FADE_STYLE = {
  WebkitMaskImage: HERO_EDGE_FADE,
  maskImage: HERO_EDGE_FADE,
};

/* ====================================================================
 * Slide individual del hero a pantalla completa
 * ==================================================================== */
function FeaturedSlide({ movie, backdropPath, logoPath, isActive }) {
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
      if (!movie || !account?.id) {
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
  }, [movie, account, mediaType]);

  // Extras: duración/temporadas + nota IMDb
  useEffect(() => {
    let abort = false;
    if (!movie) return;

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
        } catch {}

        if (!abort) setExtras({ runtime, imdbRating });
      } catch {
        if (!abort) setExtras({ runtime: null, imdbRating: null });
      }
    };

    load();
    return () => {
      abort = true;
    };
  }, [movie, mediaType]);

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

  const bgSrc = backdropPath ? buildImg(backdropPath, HERO_BACKDROP_SIZE) : null;
  const logoSrc = logoPath ? buildImg(logoPath, "w500") : null;
  const title = movie.title || movie.name || "";
  const overview =
    typeof movie.overview === "string" && movie.overview.trim()
      ? movie.overview.trim()
      : "";

  const trailerSrc = trailer?.key
    ? `https://www.youtube-nocookie.com/embed/${trailer.key}` +
      `?autoplay=1&mute=1&playsinline=1&rel=0&modestbranding=1` +
      `&controls=0&iv_load_policy=3&disablekb=1&fs=0&enablejsapi=1` +
      `&origin=${
        typeof window !== "undefined"
          ? encodeURIComponent(window.location.origin)
          : ""
      }`
    : null;

  return (
    <div
      className="relative h-full w-full cursor-pointer select-none overflow-hidden bg-black"
      onClick={navigateToDetails}
    >
      {/* Fondo: backdrop o trailer. La máscara vertical difumina los bordes
          superior e inferior para que la imagen se funda con el fondo en vez de
          cortarse en seco. */}
      <div className="absolute inset-0" style={HERO_EDGE_FADE_STYLE}>
        {!showTrailer && bgSrc && (
          <>
            {/* Relleno difuminado para cubrir los bordes sin recortar la imagen */}
            <NextImage
              key={`${bgSrc}-blur`}
              src={bgSrc}
              alt=""
              aria-hidden="true"
              fill
              sizes="100vw"
              className="scale-110 object-cover opacity-50 blur-2xl"
            />
            {/* Backdrop completo, sin recorte */}
            <NextImage
              key={bgSrc}
              src={bgSrc}
              alt={title}
              fill
              priority={isActive}
              sizes="100vw"
              className="object-contain"
            />
          </>
        )}

        {showTrailer && (
          <>
            {(trailerLoading || !trailerSrc) && (
              <div className="absolute inset-0 animate-pulse bg-neutral-900" />
            )}
            {trailerSrc && (
              <div className="absolute inset-0 overflow-hidden">
                <iframe
                  key={trailer.key}
                  ref={trailerIframeRef}
                  className="pointer-events-none absolute left-1/2 top-1/2 h-[160%] w-[120%] -translate-x-1/2 -translate-y-1/2 sm:h-[135%] sm:w-[105%]"
                  src={trailerSrc}
                  title={`Trailer - ${title}`}
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
                      setTimeout(() => {
                        cmd("unMute");
                        cmd("setVolume", [25]);
                      }, 150);
                    } catch {}
                  }}
                />
              </div>
            )}
          </>
        )}
      </div>

      {/* Degradados para legibilidad */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black via-black/45 via-40% to-transparent" />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-black/85 via-black/20 to-transparent" />

      {/* Contenido */}
      <div className="absolute inset-x-0 bottom-0 z-10">
        <div className="w-full px-5 pb-10 sm:px-10 sm:pb-14 lg:px-16 lg:pb-16">
          <div className="max-w-xl">
            {/* Logo del título o nombre */}
            {logoSrc ? (
              <div className="relative mb-4 h-20 w-[60%] max-w-sm sm:h-28 sm:w-[70%]">
                <NextImage
                  src={logoSrc}
                  alt={title}
                  fill
                  sizes="(min-width:640px) 420px, 60vw"
                  className="object-contain object-left drop-shadow-[0_4px_20px_rgba(0,0,0,0.8)]"
                />
              </div>
            ) : (
              <h2 className="mb-4 text-3xl font-black leading-tight tracking-tight text-white drop-shadow-[0_2px_12px_rgba(0,0,0,0.9)] sm:text-5xl">
                {title}
              </h2>
            )}

            {/* Metadatos + puntuaciones */}
            <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-neutral-200">
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
                  />
                  <span className="font-semibold">
                    {extras.imdbRating.toFixed(1)}
                  </span>
                </span>
              )}
            </div>

            {genres && (
              <div className="mb-3 text-sm font-medium text-amber-300/90">
                {genres}
              </div>
            )}

            {overview && (
              <p className="mb-5 line-clamp-2 max-w-xl text-sm leading-relaxed text-neutral-200/90 sm:line-clamp-3 sm:text-base">
                {overview}
              </p>
            )}

            {/* Botones de acción */}
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  navigateToDetails();
                }}
                className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-bold text-black shadow-lg transition hover:bg-white/90 sm:px-6 sm:text-base"
              >
                <Info className="h-5 w-5" />
                Más información
              </button>

              <LiquidButton
                onClick={handleToggleTrailer}
                loading={trailerLoading}
                active
                activeColor="yellow"
                groupId="featured-hero-actions"
                title={showTrailer ? "Cerrar trailer" : "Ver trailer"}
                className="!h-11 !w-11 !bg-white !text-black [&_svg]:!h-5 [&_svg]:!w-5"
              >
                {showTrailer ? (
                  <X className="text-black" />
                ) : (
                  <Play className="ml-0.5 fill-current text-black" />
                )}
              </LiquidButton>

              <LiquidButton
                onClick={handleToggleFavorite}
                loading={loadingStates || updating === "favorite"}
                active={favorite}
                activeColor="red"
                groupId="featured-hero-actions"
                title={favorite ? "Quitar de favoritos" : "Añadir a favoritos"}
                className="!h-11 !w-11 [&_svg]:!h-5 [&_svg]:!w-5"
              >
                <Heart className={favorite ? "fill-current" : ""} />
              </LiquidButton>

              <LiquidButton
                onClick={handleToggleWatchlist}
                loading={loadingStates || updating === "watchlist"}
                active={watchlist}
                activeColor="blue"
                groupId="featured-hero-actions"
                title={watchlist ? "Quitar de pendientes" : "Añadir a pendientes"}
                className="!h-11 !w-11 [&_svg]:!h-5 [&_svg]:!w-5"
              >
                <BookmarkPlus className={watchlist ? "fill-current" : ""} />
              </LiquidButton>

              <LiquidButton
                onClick={handleToggleWatched}
                loading={loadingStates || updating === "watched"}
                active={watched}
                activeColor="green"
                groupId="featured-hero-actions"
                title={watched ? "Marcar como no visto" : "Marcar como visto"}
                className="!h-11 !w-11 [&_svg]:!h-5 [&_svg]:!w-5"
              >
                {watched ? <Eye /> : <EyeOff />}
              </LiquidButton>
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
export default function FeaturedHero({ items = [], isMobile, hydrated }) {
  const swiperRef = useRef(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [assets, setAssets] = useState({}); // id -> { backdrop, logo }

  const list = useMemo(
    () => (Array.isArray(items) ? items.filter((m) => m?.id) : []),
    [items],
  );

  // Carga progresiva de backdrops EN + logos del título (cliente)
  useEffect(() => {
    if (!list.length) return;
    let canceled = false;

    const load = async () => {
      const entries = await Promise.all(
        list.map(async (movie) => {
          const id = movie.id;
          const mediaType = getMediaTypeForItem(movie);

          let backdrop = null;
          try {
            const { backdrop: userBackdrop } = getArtworkPreference(id);
            backdrop =
              userBackdrop ||
              (await fetchBestBackdropNoLang(id, mediaType)) ||
              getPreviewBackdropFallback(movie);
          } catch {
            backdrop = getPreviewBackdropFallback(movie);
          }

          let logo = null;
          try {
            // Logo del título preferentemente en inglés (luego textless).
            logo = await fetchBestLogo(id, mediaType, ["en", null]);
          } catch {}

          if (backdrop) {
            await preloadImage(buildImg(backdrop, HERO_BACKDROP_SIZE));
          }
          return [id, { backdrop, logo }];
        }),
      );

      if (canceled) return;
      const map = {};
      for (const [id, value] of entries) map[id] = value;
      setAssets(map);
    };

    load();
    return () => {
      canceled = true;
    };
  }, [list]);

  if (!list.length) return null;

  return (
    <section
      className="relative h-[72vh] min-h-[460px] w-full sm:h-[88vh]"
      aria-label="Contenido destacado"
      style={{
        "--swiper-pagination-color": "#f59e0b",
        "--swiper-pagination-bullet-inactive-color": "#ffffff",
        "--swiper-pagination-bullet-inactive-opacity": "0.4",
        "--swiper-pagination-bullet-size": "8px",
      }}
    >
      <Swiper
        modules={[Navigation, Autoplay, Pagination, EffectFade]}
        effect="fade"
        fadeEffect={{ crossFade: true }}
        slidesPerView={1}
        loop={list.length > 1}
        autoplay={
          hydrated
            ? { delay: 7000, disableOnInteraction: false, pauseOnMouseEnter: true }
            : false
        }
        pagination={{ clickable: true }}
        onSwiper={(s) => {
          swiperRef.current = s;
        }}
        onSlideChange={(s) => setActiveIndex(s.realIndex)}
        className="h-full w-full"
      >
        {list.map((movie, index) => {
          const a = assets[movie.id] || {};
          const seededBackdrop =
            a.backdrop || getPreviewBackdropFallback(movie) || null;
          return (
            <SwiperSlide key={movie.id} className="!h-full">
              <FeaturedSlide
                movie={movie}
                backdropPath={seededBackdrop}
                logoPath={a.logo || null}
                isActive={index === activeIndex}
              />
            </SwiperSlide>
          );
        })}
      </Swiper>

      {/* Flechas (solo desktop) — estilo glass coherente con la app */}
      {!isMobile && list.length > 1 && (
        <>
          <button
            type="button"
            aria-label="Anterior"
            onClick={() => swiperRef.current?.slidePrev()}
            className="group/arrow absolute left-4 top-1/2 z-20 hidden h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full border border-white/15 bg-black/20 bg-gradient-to-br from-white/10 via-transparent to-black/40 text-white shadow-[0_10px_30px_-10px_rgba(0,0,0,0.7)] backdrop-blur-[50px] transition-all duration-300 hover:scale-110 hover:from-white/20 hover:shadow-[0_0_25px_rgba(255,255,255,0.18)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-300/70 sm:flex"
          >
            <ChevronLeft className="h-6 w-6 transition-transform duration-300 group-hover/arrow:-translate-x-0.5" />
          </button>
          <button
            type="button"
            aria-label="Siguiente"
            onClick={() => swiperRef.current?.slideNext()}
            className="group/arrow absolute right-4 top-1/2 z-20 hidden h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full border border-white/15 bg-black/20 bg-gradient-to-br from-white/10 via-transparent to-black/40 text-white shadow-[0_10px_30px_-10px_rgba(0,0,0,0.7)] backdrop-blur-[50px] transition-all duration-300 hover:scale-110 hover:from-white/20 hover:shadow-[0_0_25px_rgba(255,255,255,0.18)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-300/70 sm:flex"
          >
            <ChevronRight className="h-6 w-6 transition-transform duration-300 group-hover/arrow:translate-x-0.5" />
          </button>
        </>
      )}
    </section>
  );
}
