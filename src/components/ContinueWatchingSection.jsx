// /src/components/ContinueWatchingSection.jsx
"use client";

import { useRef, useEffect, useState, memo } from "react";
import { Swiper, SwiperSlide } from "swiper/react";
import { Navigation, FreeMode } from "swiper/modules";
import { AnimatePresence, motion, useInView } from "framer-motion";
import NextImage from "next/image";
import { useRouter } from "next/navigation";
import { Play, Heart, BookmarkPlus } from "lucide-react";

import { useAuth } from "@/context/AuthContext";
import { traktGetInProgress } from "@/lib/api/traktClient";
import {
  getMediaAccountStates,
  markAsFavorite,
  markInWatchlist,
} from "@/lib/api/tmdb";
import LiquidButton from "@/components/LiquidButton";
import {
  buildImg,
  PREVIEW_BACKDROP_SIZE,
  fetchBestBackdrop,
  getArtworkPreference,
  movieBackdropCache,
  getBackdropCacheKey,
  getPreviewBackdropFallback,
} from "@/lib/dashboard/media";

const EMPTY_ARRAY = [];
const MAX_ITEMS = 20;

/* =================== ANIMATION VARIANTS =================== */
const fadeInUp = {
  hidden: { opacity: 0, y: 40 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] },
  },
};

const scaleIn = {
  hidden: { opacity: 0, scale: 0.95 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: { duration: 0.4, ease: [0.22, 1, 0.36, 1] },
  },
};

const shimmer = {
  animate: {
    backgroundPosition: ["200% 0", "-200% 0"],
    transition: { duration: 8, ease: "linear", repeat: Infinity },
  },
};

/* =================== STYLE CONSTANTS =================== */
// Tamaños base (backdrop horizontal ~16:9) y alto de fila compartido.
const ROW_HEIGHT = "h-[126px] sm:h-[146px] md:h-[168px] xl:h-[190px]";
const BASE_WIDTH = "w-[224px] sm:w-[260px] md:w-[300px] xl:w-[338px]";
const ACTIVE_WIDTH = "sm:w-[400px] md:w-[470px] xl:w-[520px]";

const cwPreviewCardClass =
  "relative isolate grid h-full w-full grid-rows-[72%_28%] overflow-hidden rounded-lg text-white cursor-pointer transform-gpu " +
  "bg-black/20 bg-gradient-to-br from-white/10 via-transparent to-black/40 backdrop-blur-[50px] " +
  "shadow-[0_15px_40px_-10px_rgba(0,0,0,0.8)] transition-all duration-300";

const cwBackdropFadeStyle = {
  WebkitMaskImage:
    "radial-gradient(ellipse at center, black 76%, rgba(0,0,0,0.98) 90%, rgba(0,0,0,0.9) 100%)",
  maskImage:
    "radial-gradient(ellipse at center, black 76%, rgba(0,0,0,0.98) 90%, rgba(0,0,0,0.9) 100%)",
};

/* =================== HELPERS =================== */
function clampPct(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function nextEpisodeHref(show) {
  const ep = show?.nextEpisode;
  if (ep && Number.isFinite(ep.season) && Number.isFinite(ep.number)) {
    return `/details/tv/${show.id}/season/${ep.season}/episode/${ep.number}`;
  }
  return `/details/tv/${show.id}`;
}

function genresText(show) {
  const names = Array.isArray(show?.genres) ? show.genres : EMPTY_ARRAY;
  return names.slice(0, 2).join(" • ");
}

// Carga el mejor backdrop EN (inglés) de la serie, con caché compartida.
function useShowBackdrop(show) {
  const [backdropPath, setBackdropPath] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let abort = false;
    if (!show?.id) return;

    const reveal = (path) => {
      if (abort) return;
      setBackdropPath(path);
      setReady(!!path);
    };

    const load = async () => {
      const movie = {
        id: show.id,
        media_type: "tv",
        backdrop_path: show.backdrop_path,
        poster_path: show.poster_path,
      };
      const cacheKey = getBackdropCacheKey(movie, "tv");

      const { backdrop: userBackdrop } = getArtworkPreference(show.id);
      if (userBackdrop) {
        movieBackdropCache.set(cacheKey, userBackdrop);
        reveal(userBackdrop);
        return;
      }

      const cached = movieBackdropCache.get(cacheKey);
      if (cached !== undefined) {
        reveal(cached);
        return;
      }

      try {
        const preferred = await fetchBestBackdrop(show.id, "tv");
        const chosen = preferred || getPreviewBackdropFallback(movie);
        movieBackdropCache.set(cacheKey, chosen);
        reveal(chosen);
      } catch {
        const fallback = getPreviewBackdropFallback(movie);
        movieBackdropCache.set(cacheKey, fallback);
        reveal(fallback);
      }
    };

    load();
    return () => {
      abort = true;
    };
  }, [show]);

  return { backdropPath, ready };
}

/* ====================================================================
 * Tarjeta base (sin hover): backdrop + overlay de progreso
 * ==================================================================== */
function ContinueWatchingBaseCard({ show }) {
  const { backdropPath, ready } = useShowBackdrop(show);
  const bgSrc = backdropPath ? buildImg(backdropPath, PREVIEW_BACKDROP_SIZE) : null;
  const pct = clampPct(show?.pct);
  const ep = show?.nextEpisode;

  return (
    <div className="relative h-full w-full overflow-hidden rounded-lg bg-neutral-900">
      {!ready && (
        <div className="absolute inset-0 overflow-hidden bg-gradient-to-br from-neutral-900 via-neutral-800 to-neutral-900">
          <motion.div
            className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent"
            variants={shimmer}
            animate="animate"
            style={{ backgroundSize: "200% 100%" }}
          />
        </div>
      )}

      {bgSrc && (
        <NextImage
          key={bgSrc}
          src={bgSrc}
          alt={show?.title || ""}
          fill
          sizes="(min-width:1280px) 338px, (min-width:768px) 300px, 224px"
          className={`object-cover transition-opacity duration-200 ${
            ready ? "opacity-100" : "opacity-0"
          }`}
          loading="lazy"
        />
      )}

      {/* Overlay inferior: progreso + próximo episodio */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/45 to-transparent px-3 pb-2 pt-8">
        {ep && (
          <div className="mb-1 truncate text-[11px] font-semibold text-white drop-shadow">
            T{ep.season}:E{ep.number}
            <span className="ml-1 font-normal text-neutral-300">· Próximo</span>
          </div>
        )}
        <div className="h-1 w-full overflow-hidden rounded-full bg-white/25">
          <div
            className="h-full rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    </div>
  );
}

/* ====================================================================
 * Tarjeta hover: backdrop ampliado (16:9) + panel de info
 * con botones Continuar / Favoritos / Pendientes
 * ==================================================================== */
function ContinueWatchingPreviewCard({ show, index, totalCount }) {
  const { session, account } = useAuth();
  const router = useRouter();
  const { backdropPath, ready } = useShowBackdrop(show);

  const [loadingStates, setLoadingStates] = useState(false);
  const [favorite, setFavorite] = useState(false);
  const [watchlist, setWatchlist] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState("");

  const href = nextEpisodeHref(show);
  const prefetchedRef = useRef(false);

  const prefetchHref = () => {
    if (prefetchedRef.current) return;
    prefetchedRef.current = true;
    router.prefetch(href);
    if (typeof window !== "undefined") {
      fetch(href, { priority: "low" }).catch(() => {});
    }
  };

  useEffect(() => {
    let cancel = false;
    const load = async () => {
      if (!show?.id || !session || !account?.id) {
        setFavorite(false);
        setWatchlist(false);
        return;
      }
      try {
        setLoadingStates(true);
        const st = await getMediaAccountStates("tv", show.id, session);
        if (!cancel) {
          setFavorite(!!st.favorite);
          setWatchlist(!!st.watchlist);
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
  }, [show, session, account]);

  const requireLogin = () => {
    if (!session || !account?.id) {
      window.location.href = `/login?next=${encodeURIComponent(
        window.location.pathname + window.location.search,
      )}`;
      return true;
    }
    return false;
  };

  const handleContinue = (e) => {
    e.stopPropagation();
    router.push(href);
  };

  const handleToggleFavorite = async (e) => {
    e.stopPropagation();
    if (requireLogin() || updating || !show) return;
    try {
      setUpdating(true);
      setError("");
      const next = !favorite;
      setFavorite(next);
      await markAsFavorite({
        accountId: account.id,
        sessionId: session,
        type: "tv",
        mediaId: show.id,
        favorite: next,
        title: show.title,
        posterPath: show.poster_path || show.backdrop_path || null,
      });
    } catch {
      setFavorite((v) => !v);
      setError("No se pudo actualizar favoritos.");
    } finally {
      setUpdating(false);
    }
  };

  const handleToggleWatchlist = async (e) => {
    e.stopPropagation();
    if (requireLogin() || updating || !show) return;
    try {
      setUpdating(true);
      setError("");
      const next = !watchlist;
      setWatchlist(next);
      await markInWatchlist({
        accountId: account.id,
        sessionId: session,
        type: "tv",
        mediaId: show.id,
        watchlist: next,
        title: show.title,
        posterPath: show.poster_path || show.backdrop_path || null,
      });
    } catch {
      setWatchlist((v) => !v);
      setError("No se pudo actualizar pendientes.");
    } finally {
      setUpdating(false);
    }
  };

  const bgSrc = backdropPath ? buildImg(backdropPath, PREVIEW_BACKDROP_SIZE) : null;
  const pct = clampPct(show?.pct);
  const ep = show?.nextEpisode;
  const genres = genresText(show);

  const progressLabel = (() => {
    const parts = [];
    if (Number.isFinite(show?.completed) && Number.isFinite(show?.aired)) {
      parts.push(`${show.completed}/${show.aired} eps`);
    }
    if (pct) parts.push(`${pct}%`);
    return parts.join(" · ");
  })();

  // Determinar la alineación horizontal de la tarjeta absoluta
  let alignmentClass = "left-1/2 -translate-x-1/2";
  if (index === 0) {
    alignmentClass = "left-0";
  } else if (index === totalCount - 1) {
    alignmentClass = "right-0";
  }

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.12 } }}
      transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
      className={`absolute top-1/2 -translate-y-1/2 ${alignmentClass} w-[280px] sm:w-[320px] md:w-[380px] xl:w-[420px] rounded-xl text-white cursor-pointer bg-[#141414] shadow-[0_20px_50px_rgba(0,0,0,0.85)] border border-white/10 z-50 flex flex-col overflow-hidden`}
      onClick={() => router.push(href)}
      onMouseEnter={prefetchHref}
      onFocus={prefetchHref}
      style={{ willChange: "transform, opacity" }}
    >
      {/* Backdrop de 16:9 */}
      <div className="relative w-full aspect-video overflow-hidden bg-neutral-900">
        {!ready && (
          <div className="absolute inset-0 overflow-hidden bg-gradient-to-br from-neutral-900 via-neutral-800 to-neutral-900">
            <motion.div
              className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent"
              variants={shimmer}
              animate="animate"
              style={{ backgroundSize: "200% 100%" }}
            />
          </div>
        )}

        {bgSrc && (
          <NextImage
            key={bgSrc}
            src={bgSrc}
            alt={show?.title || ""}
            fill
            sizes="(min-width:1280px) 420px, (min-width:768px) 380px, 320px"
            className={`scale-[1.015] object-cover transition-opacity duration-200 ${
              ready ? "opacity-100" : "opacity-0"
            }`}
            style={cwBackdropFadeStyle}
            loading="eager"
            fetchPriority="high"
          />
        )}

        {/* Barra de progreso verde superpuesta al pie del backdrop */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-b from-transparent to-black/85" />
        <div className="absolute inset-x-3 bottom-2">
          <div className="h-1 w-full overflow-hidden rounded-full bg-white/20">
            <div
              className="h-full rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      </div>

      {/* Panel de info (debajo del backdrop) */}
      <div className="w-full bg-[#141414] px-3.5 py-3 sm:px-4 sm:py-3.5 border-t border-white/5">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 text-[11px] text-neutral-200 sm:text-xs">
              {ep && (
                <span className="font-semibold text-white">
                  T{ep.season} · E{ep.number}
                  {ep.title ? `: ${ep.title}` : ""}
                </span>
              )}
              {progressLabel && (
                <span className="text-neutral-300">• {progressLabel}</span>
              )}
            </div>

            {genres && (
              <div className="mt-0.5 line-clamp-1 text-[11px] text-neutral-100/90 sm:text-xs">
                {genres}
              </div>
            )}

            {error && (
              <p className="mt-0.5 line-clamp-1 text-[11px] text-red-400">
                {error}
              </p>
            )}
          </div>

          <div className="flex flex-shrink-0 items-center gap-2 sm:gap-2.5">
            <LiquidButton
              onClick={handleContinue}
              active
              activeColor="yellow"
              groupId="continue-watching-actions"
              title="Continuar viendo"
              className="!h-9 !w-9 !bg-white !text-black [&_svg]:!h-5 [&_svg]:!w-5"
            >
              <Play className="ml-0.5 fill-current text-black" />
            </LiquidButton>

            <LiquidButton
              onClick={handleToggleFavorite}
              loading={loadingStates || updating}
              active={favorite}
              activeColor="red"
              groupId="continue-watching-actions"
              title={favorite ? "Quitar de favoritos" : "Añadir a favoritos"}
              className="!h-9 !w-9 [&_svg]:!h-5 [&_svg]:!w-5"
            >
              <Heart className={favorite ? "fill-current" : ""} />
            </LiquidButton>

            <LiquidButton
              onClick={handleToggleWatchlist}
              loading={loadingStates || updating}
              active={watchlist}
              activeColor="blue"
              groupId="continue-watching-actions"
              title={watchlist ? "Quitar de pendientes" : "Añadir a pendientes"}
              className="!h-9 !w-9 [&_svg]:!h-5 [&_svg]:!w-5"
            >
              <BookmarkPlus className={watchlist ? "fill-current" : ""} />
            </LiquidButton>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

/* =================== SKELETON =================== */
function ContinueWatchingSkeleton() {
  return (
    <div className="flex gap-4 overflow-hidden">
      {Array.from({ length: 5 }).map((_, i) => (
        <div
          key={i}
          className={`relative ${BASE_WIDTH} ${ROW_HEIGHT} flex-shrink-0 overflow-hidden rounded-lg bg-gradient-to-br from-neutral-900 via-neutral-800 to-neutral-900`}
        >
          <motion.div
            className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent"
            variants={shimmer}
            animate="animate"
            style={{ backgroundSize: "200% 100%" }}
          />
        </div>
      ))}
    </div>
  );
}

/* ====================================================================
 * Sección "Continuar viendo"
 * ==================================================================== */
function ContinueWatchingSection({ isMobile, hydrated }) {
  const { session } = useAuth();
  const router = useRouter();

  // null = cargando, [] = vacío / sin sesión
  const [shows, setShows] = useState(null);

  const swiperRef = useRef(null);
  const rowRef = useRef(null);
  const hoverIntentRef = useRef(0);
  const [isHoveredRow, setIsHoveredRow] = useState(false);
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(false);
  const [hoveredId, setHoveredId] = useState(null);
  const [hoveredIndex, setHoveredIndex] = useState(null);
  const isInView = useInView(rowRef, { once: true, margin: "-100px" });

  useEffect(() => {
    if (!session) {
      setShows(EMPTY_ARRAY);
      return;
    }

    let abort = false;
    setShows(null);

    const load = async () => {
      try {
        const res = await traktGetInProgress();
        const items = Array.isArray(res?.items) ? res.items : EMPTY_ARRAY;
        const mapped = items
          .filter(
            (it) =>
              it?.tmdbId &&
              it?.nextEpisode &&
              Number.isFinite(it.nextEpisode.season) &&
              Number.isFinite(it.nextEpisode.number),
          )
          .slice(0, MAX_ITEMS)
          .map((it) => ({
            id: it.tmdbId,
            title: it.title,
            backdrop_path: it.backdrop_path || null,
            poster_path: it.poster_path || null,
            overview: it.overview || null,
            genres: Array.isArray(it.genres) ? it.genres : EMPTY_ARRAY,
            pct: it.pct,
            completed: it.completed,
            aired: it.aired,
            nextEpisode: it.nextEpisode,
            lastEpisode: it.lastEpisode,
            lastWatchedAt: it.lastWatchedAt,
          }));
        if (!abort) setShows(mapped);
      } catch {
        if (!abort) setShows(EMPTY_ARRAY);
      }
    };

    load();
    return () => {
      abort = true;
    };
  }, [session]);

  const updateNav = (swiper) => {
    if (!swiper) return;
    const hasOverflow = !swiper.isLocked;
    setCanPrev(hasOverflow && !swiper.isBeginning);
    setCanNext(hasOverflow && !swiper.isEnd);
  };

  const handleSwiper = (swiper) => {
    swiperRef.current = swiper;
    updateNav(swiper);
  };

  const moveSlides = (dir) => {
    const swiper = swiperRef.current;
    if (!swiper) return;
    const count = isMobile ? 1 : 3;
    for (let i = 0; i < count; i += 1) {
      if (dir < 0) swiper.slidePrev();
      else swiper.slideNext();
    }
  };

  // Sin sesión o sin series en progreso: la sección no se renderiza.
  if (!session) return null;
  if (Array.isArray(shows) && shows.length === 0) return null;

  const loading = shows === null;
  const hasActivePreview = !!hoveredId;
  const showPrev = (isHoveredRow || hasActivePreview) && canPrev;
  const showNext = (isHoveredRow || hasActivePreview) && canNext;

  const Header = (
    <motion.div variants={scaleIn} className="mb-5 px-1 sm:px-0">
      <div className="mb-1.5 flex items-center gap-2">
        <div className="h-px w-8 bg-amber-500" />
        <span className="text-[10px] font-bold uppercase tracking-widest text-amber-400">
          CONTINUAR
        </span>
      </div>
      <h3 className="bg-gradient-to-r from-white via-neutral-100 to-neutral-200 bg-clip-text text-xl font-black tracking-tighter text-transparent sm:text-2xl md:text-3xl">
        Continuar viendo<span className="text-amber-500">.</span>
      </h3>
    </motion.div>
  );

  if (loading) {
    return (
      <motion.div
        ref={rowRef}
        initial="hidden"
        animate="visible"
        variants={fadeInUp}
        className="relative"
      >
        {Header}
        <ContinueWatchingSkeleton />
      </motion.div>
    );
  }

  const breakpoints = {
    0: { slidesPerView: "auto", spaceBetween: 12 },
    640: { slidesPerView: "auto", spaceBetween: 14 },
    1024: { slidesPerView: "auto", spaceBetween: 16 },
    1280: { slidesPerView: "auto", spaceBetween: 18 },
  };

  const swiperKey = `continue-watching-${hydrated ? "h" : "s"}-${isMobile ? "m" : "d"}`;

  return (
    <motion.div
      ref={rowRef}
      initial="hidden"
      animate={isInView ? "visible" : "hidden"}
      variants={fadeInUp}
      className="relative group"
    >
      {Header}

      <div
        className="relative"
        onMouseEnter={() => setIsHoveredRow(true)}
        onMouseLeave={() => {
          hoverIntentRef.current += 1;
          setIsHoveredRow(false);
          setHoveredId(null);
          setHoveredIndex(null);
        }}
      >
        <div className={!hydrated ? "pointer-events-none touch-none" : ""}>
          <Swiper
            key={swiperKey}
            slidesPerView="auto"
            spaceBetween={12}
            onSwiper={handleSwiper}
            onSlideChange={updateNav}
            onResize={updateNav}
            onReachBeginning={updateNav}
            onReachEnd={updateNav}
            loop={false}
            watchOverflow={true}
            grabCursor={!isMobile}
            simulateTouch={true}
            allowTouchMove={true}
            preventClicks={true}
            preventClicksPropagation={true}
            threshold={isMobile ? 2 : 5}
            touchRatio={isMobile ? 1.5 : 1}
            freeMode={
              !isMobile
                ? { enabled: true, momentum: true, momentumRatio: 0.5 }
                : false
            }
            modules={[Navigation, FreeMode]}
            className="group relative !py-14 sm:!py-16 md:!py-20 !-my-14 sm:!-my-16 md:!-my-20"
            wrapperClass="flex items-center"
            breakpoints={breakpoints}
          >
            {shows.map((show, i) => {
              const itemKey = `tv:${show.id}`;
              const isActive = hydrated && !isMobile && hoveredId === itemKey;

              const base =
                "relative flex-shrink-0 transition-all duration-300 ease-in-out";
              const sizeClasses = `${BASE_WIDTH} ${isActive ? "z-[90]" : "z-10"}`;

              return (
                <SwiperSlide key={itemKey} className="!w-auto select-none">
                  <div
                    className={`${base} ${sizeClasses} ${ROW_HEIGHT} ${
                      isActive ? "overflow-visible" : "overflow-hidden"
                    }`}
                    onMouseEnter={() => {
                      if (!isMobile) {
                        setHoveredIndex(i);
                        setHoveredId(itemKey);
                      }
                    }}
                    onMouseLeave={() => {
                      hoverIntentRef.current += 1;
                      setHoveredId((prev) => (prev === itemKey ? null : prev));
                      setHoveredIndex(null);
                    }}
                  >
                    <AnimatePresence initial={false} mode="popLayout">
                      {isActive ? (
                        <div
                          key="preview"
                          className="hidden sm:block"
                        >
                          <ContinueWatchingPreviewCard
                            show={show}
                            index={i}
                            totalCount={shows.length}
                          />
                        </div>
                      ) : (
                        <motion.div
                          key="base"
                          initial={{ opacity: 0, scale: 0.95 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{
                            opacity: 0,
                            scale: 0.98,
                            transition: { duration: 0.12 },
                          }}
                          transition={{ duration: 0.18, ease: [0.4, 0, 0.2, 1] }}
                          className="h-full w-full cursor-pointer"
                          style={{ willChange: "transform, opacity" }}
                          onClick={() => router.push(nextEpisodeHref(show))}
                        >
                          <ContinueWatchingBaseCard show={show} />
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </SwiperSlide>
              );
            })}
          </Swiper>
        </div>

        <AnimatePresence>
          {showPrev && !isMobile && (
            <motion.button
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                moveSlides(-1);
              }}
              className="absolute inset-y-0 left-0 z-30 hidden w-32 items-center justify-start bg-gradient-to-r from-black/90 via-black/70 to-transparent transition-all duration-300 hover:from-black/95 hover:via-black/80 sm:flex group/nav"
            >
              <motion.span
                className="ml-6 text-4xl font-bold text-white drop-shadow-[0_0_12px_rgba(0,0,0,0.95)] transition-transform group-hover/nav:scale-110"
                whileHover={{ x: -4 }}
              >
                ‹
              </motion.span>
            </motion.button>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {showNext && !isMobile && (
            <motion.button
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                moveSlides(1);
              }}
              className="absolute inset-y-0 right-0 z-30 hidden w-32 items-center justify-end bg-gradient-to-l from-black/90 via-black/70 to-transparent transition-all duration-300 hover:from-black/95 hover:via-black/80 sm:flex group/nav"
            >
              <motion.span
                className="mr-6 text-4xl font-bold text-white drop-shadow-[0_0_12px_rgba(0,0,0,0.95)] transition-transform group-hover/nav:scale-110"
                whileHover={{ x: 4 }}
              >
                ›
              </motion.span>
            </motion.button>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

export default memo(ContinueWatchingSection);
