// /src/components/FeaturedHero.jsx
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

// "original" = máxima resolución de TMDb; NextImage la reescala según el
// viewport, así que la imagen del hero se ve nítida en pantallas grandes/retina.
const HERO_BACKDROP_SIZE = "original";

const traktTypeOf = (mediaType) => (mediaType === "tv" ? "show" : "movie");

/* ====================================================================
 * Slide individual del hero a pantalla completa
 * ==================================================================== */
function FeaturedSlide({
  movie,
  backdropPath,
  logoPath,
  isActive,
  onTrailerPlay,
  onTrailerClose,
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
      onTrailerClose?.(); // reanuda el carrusel
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
      onTrailerPlay?.();
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
    `&vq=hd1080&hd=1` + // pista de máxima calidad
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
      {/* Fondo: backdrop completo. Mantiene su formato; si el hero llega a su
          alto máximo, el sobrante queda negro en el lado de la información. */}
      <div className="absolute inset-0">
        {!showTrailer && bgSrc && (
          <NextImage
            key={bgSrc}
            src={bgSrc}
            alt={title}
            fill
            priority={isActive}
            sizes="100vw"
            className="object-contain object-right"
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
                          // Fuerza la máxima resolución disponible del reproductor.
                          cmd("setPlaybackQualityRange", ["hd2160", "hd1080"]);
                          cmd("setPlaybackQuality", ["hd1080"]);
                        }, 150);
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
        className="pointer-events-none absolute inset-0 hidden sm:block"
        style={{
          background:
            "linear-gradient(to right, #000 0%, rgba(0,0,0,0.96) 24%, rgba(0,0,0,0.55) 46%, rgba(0,0,0,0.12) 68%, transparent 84%)",
        }}
      />
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 h-3/5"
        style={{
          background:
            "linear-gradient(to top, #000 0%, rgba(0,0,0,0.55) 35%, transparent 100%)",
        }}
      />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-black/70 to-transparent sm:h-28" />

      {/* Contenido: anclado en la zona inferior (no centrado) con amplio margen
          lateral izquierdo y un margen inferior cómodo. */}
      <div className="absolute inset-x-0 bottom-0 z-10">
        <div className="w-full px-8 pb-20 sm:px-16 sm:pb-24 lg:px-32 lg:pb-28">
          <div className="max-w-xl">
            {/* Logo del título o nombre */}
            {logoSrc ? (
              <div className="relative mb-5 h-28 w-[78%] max-w-md sm:h-40 sm:max-w-lg lg:h-48 lg:max-w-xl">
                <NextImage
                  src={logoSrc}
                  alt={title}
                  fill
                  sizes="(min-width:1024px) 580px, (min-width:640px) 510px, 78vw"
                  className="object-contain object-left drop-shadow-[0_4px_20px_rgba(0,0,0,0.8)]"
                />
              </div>
            ) : (
              <h2 className="mb-5 text-4xl font-black leading-tight tracking-tight text-white drop-shadow-[0_2px_12px_rgba(0,0,0,0.9)] sm:text-6xl">
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

  // Pausa el carrusel cuando empieza un trailer (para que se vea completo) y lo
  // reanuda si el usuario cierra el trailer.
  const pauseAutoplay = useCallback(() => {
    try {
      swiperRef.current?.autoplay?.stop();
    } catch { }
  }, []);

  const resumeAutoplay = useCallback(() => {
    if (!hydrated) return;
    try {
      swiperRef.current?.autoplay?.start();
    } catch { }
  }, [hydrated]);

  // Carga progresiva de backdrops textless + logos del título (cliente).
  // getMovieImages cachea la respuesta completa por título, así que pedir
  // backdrop, cartel y logo no implica peticiones de red adicionales.
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
          } catch { }

          if (backdrop) await preloadImage(buildImg(backdrop, HERO_BACKDROP_SIZE));

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
      className="relative aspect-video max-h-[72dvh] w-full bg-black sm:max-h-[88dvh]"
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
                onTrailerPlay={pauseAutoplay}
                onTrailerClose={resumeAutoplay}
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
