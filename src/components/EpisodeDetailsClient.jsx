// /src/components/EpisodeDetailsClient.jsx
"use client";

import {
  useMemo,
  useEffect,
  useState,
  useCallback,
  useRef,
  Children,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Swiper, SwiperSlide } from "swiper/react";
import "swiper/swiper-bundle.css";

import {
  ArrowLeft,
  Calendar as CalendarIcon,
  Clock as ClockIcon,
  Star as StarIcon,
  Users as UsersIcon,
  MonitorPlay,
  ImageOff,
  Eye,
  Play as PlayIcon,
  List as ListIcon,
} from "lucide-react";
import { offlineMutationFetch } from "@/lib/offline/syncQueue";

import {
  VisualMetaCard,
  DetailsTabsMenu,
} from "@/components/details/DetailAtoms";
import { AnimatedSection } from "@/components/details/AnimatedSection";
import AnimatedPosterFrame from "@/components/details/AnimatedPosterFrame";
import { CompactBadge, MiniStat } from "@/components/details/DetailHeaderBits";
import {
  formatDateEs,
  formatVoteCount,
  formatCountShort,
} from "@/lib/details/formatters";
import {
  fetchSeriesGraphRatingsCached,
  getSeriesGraphEpisodeRating,
} from "@/lib/details/seriesGraphRatings";
import StarRating from "@/components/StarRating";
import TraktWatchedControl from "@/components/trakt/TraktWatchedControl";
import TraktWatchedModal from "@/components/trakt/TraktWatchedModal";
import {
  invalidateTraktGetCache,
  traktGetItemStatus,
  traktGetShowWatched,
  traktSetEpisodeWatched,
  traktGetEpisodePlays,
  traktAddEpisodePlay,
  traktRemoveWatchPlay,
} from "@/lib/api/traktClient";

const episodeScoreboardCache = new Map();
const episodeScoreboardInflight = new Map();
const episodeStatsCache = new Map();
const episodeStatsInflight = new Map();
const episodeImdbCache = new Map();
const episodeImdbInflight = new Map();

function normalizeWatchedBySeason(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value;
}

function getWatchedSeasonEpisodes(watchedBySeason, seasonNumber) {
  if (!watchedBySeason || typeof watchedBySeason !== "object") return [];
  const value =
    watchedBySeason?.[Number(seasonNumber)] ??
    watchedBySeason?.[String(Number(seasonNumber))];
  return Array.isArray(value) ? value : [];
}

function scheduleAfterFirstPaint(task, delay = 0) {
  if (typeof window === "undefined") return () => {};

  let cancelled = false;
  let idleId = null;
  const timerId = window.setTimeout(() => {
    if (cancelled) return;

    if (typeof window.requestIdleCallback === "function") {
      idleId = window.requestIdleCallback(
        () => {
          if (!cancelled) task();
        },
        { timeout: 1200 },
      );
      return;
    }

    task();
  }, delay);

  return () => {
    cancelled = true;
    window.clearTimeout(timerId);
    if (idleId != null && typeof window.cancelIdleCallback === "function") {
      window.cancelIdleCallback(idleId);
    }
  };
}

async function fetchEpisodeScoreboardCached({
  showId,
  seasonNumber,
  episodeNumber,
  signal,
}) {
  const key = `${showId}:${seasonNumber}:${episodeNumber}`;
  if (episodeScoreboardCache.has(key)) {
    return episodeScoreboardCache.get(key);
  }
  if (episodeScoreboardInflight.has(key)) {
    return episodeScoreboardInflight.get(key);
  }

  const promise = fetch(
    `/api/scoreboard/public?type=episode&id=${encodeURIComponent(showId)}&season=${encodeURIComponent(seasonNumber)}&episode=${encodeURIComponent(episodeNumber)}`,
    {
      cache: "force-cache",
      signal,
    },
  )
    .then(async (res) => {
      const json = await res.json().catch(() => null);
      const value = res.ok && json?.found ? json : null;
      if (value) {
        episodeScoreboardCache.set(key, value);
      }
      return value;
    })
    .catch((error) => {
      if (error?.name === "AbortError") throw error;
      return null;
    })
    .finally(() => {
      episodeScoreboardInflight.delete(key);
    });

  episodeScoreboardInflight.set(key, promise);
  return promise;
}

async function fetchEpisodeStatsCached({
  showId,
  seasonNumber,
  episodeNumber,
  signal,
}) {
  const key = `${showId}:${seasonNumber}:${episodeNumber}`;
  if (episodeStatsCache.has(key)) {
    return episodeStatsCache.get(key);
  }
  if (episodeStatsInflight.has(key)) {
    return episodeStatsInflight.get(key);
  }

  const promise = fetch(
    `/api/trakt/stats?type=episode&tmdbId=${encodeURIComponent(showId)}&season=${encodeURIComponent(seasonNumber)}&episode=${encodeURIComponent(episodeNumber)}`,
    {
      cache: "force-cache",
      signal,
    },
  )
    .then(async (res) => {
      const json = await res.json().catch(() => null);
      const hasNumericStats = Object.values(json?.stats || {}).some(
        (value) => typeof value === "number",
      );
      const value = res.ok && json?.found && hasNumericStats ? json : null;
      if (value) {
        episodeStatsCache.set(key, value);
      }
      return value;
    })
    .catch((error) => {
      if (error?.name === "AbortError") throw error;
      return null;
    })
    .finally(() => {
      episodeStatsInflight.delete(key);
    });

  episodeStatsInflight.set(key, promise);
  return promise;
}

async function fetchEpisodeImdbCached({
  showId,
  seasonNumber,
  episodeNumber,
  imdbId,
  signal,
}) {
  const key = `${showId}:${imdbId}:${seasonNumber}:${episodeNumber}`;
  if (episodeImdbCache.has(key)) {
    return episodeImdbCache.get(key);
  }
  if (episodeImdbInflight.has(key)) {
    return episodeImdbInflight.get(key);
  }

  const qs = new URLSearchParams({
    season: String(seasonNumber),
    episode: String(episodeNumber),
    imdbId: String(imdbId),
  });

  const promise = fetch(`/api/tv/${showId}/episode-imdb?${qs}`, {
    cache: "force-cache",
    signal,
  })
    .then(async (res) => {
      const json = await res.json().catch(() => null);
      const value =
        res.ok &&
        (typeof json?.imdb?.rating === "number" ||
          typeof json?.imdb?.votes === "number")
          ? json.imdb
          : null;
      if (value) {
        episodeImdbCache.set(key, value);
      }
      return value;
    })
    .catch((error) => {
      if (error?.name === "AbortError") throw error;
      return null;
    })
    .finally(() => {
      episodeImdbInflight.delete(key);
    });

  episodeImdbInflight.set(key, promise);
  return promise;
}

function SectionTitle({ title, icon: Icon, className = "" }) {
  return (
    <div
      className={`flex items-center gap-3 sm:gap-4 mb-8 w-full ${className}`}
    >
      {Icon && (
        <div className="relative flex items-center justify-center w-11 h-11 sm:w-12 sm:h-12 rounded-[14px] bg-yellow-500/5 backdrop-blur-2xl shadow-[0_4px_24px_rgba(234,179,8,0.12)] shrink-0 overflow-hidden group-hover/section:bg-yellow-500/10 group-hover/section:shadow-[0_8px_32px_rgba(234,179,8,0.2)] transition-all duration-500">
          <div className="absolute inset-0 bg-gradient-to-br from-yellow-400/20 via-transparent to-transparent opacity-60" />
          <div className="absolute inset-0 shadow-[inset_0_1px_2px_rgba(255,255,255,0.15),inset_0_-1px_2px_rgba(0,0,0,0.2)] rounded-[14px] pointer-events-none" />
          <Icon className="relative z-10 w-5 h-5 sm:w-6 sm:h-6 text-yellow-500 group-hover/section:text-yellow-400 group-hover/section:scale-110 transition-all duration-500 drop-shadow-[0_2px_8px_rgba(234,179,8,0.4)]" />
        </div>
      )}
      <h2 className="text-2xl sm:text-[28px] font-black tracking-tight text-white drop-shadow-md shrink-0">
        {title}
      </h2>
      <div className="ml-2 sm:ml-4 flex-1 h-px bg-gradient-to-r from-white/20 via-white/5 to-transparent relative flex items-center">
        <div className="absolute left-0 w-2 h-2 rounded-full bg-yellow-500 shadow-[0_0_12px_rgba(234,179,8,1)] opacity-40 group-hover/section:opacity-100 group-hover/section:scale-150 transition-all duration-500" />
        <div className="absolute left-0 w-16 sm:w-24 h-[2px] bg-gradient-to-r from-yellow-500 to-transparent opacity-0 group-hover/section:opacity-100 transition-opacity duration-500" />
      </div>
    </div>
  );
}

function DetailsArrowCarousel({
  children,
  className = "",
  arrowClassName = "inset-y-0",
  ...swiperProps
}) {
  const swiperRef = useRef(null);
  const [isHovered, setIsHovered] = useState(false);
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(false);
  const childrenCount = Children.count(children);

  const updateNav = useCallback((swiper) => {
    if (!swiper) return;
    const hasOverflow = !swiper.isLocked;
    setCanPrev(hasOverflow && !swiper.isBeginning);
    setCanNext(hasOverflow && !swiper.isEnd);
  }, []);

  const handleSwiper = useCallback(
    (swiper) => {
      swiperRef.current = swiper;
      updateNav(swiper);
      requestAnimationFrame(() => {
        swiper.update?.();
        updateNav(swiper);
      });
    },
    [updateNav],
  );

  useEffect(() => {
    const swiper = swiperRef.current;
    if (!swiper) return undefined;

    const refresh = () => {
      swiper.update?.();
      updateNav(swiper);
    };

    const raf = requestAnimationFrame(refresh);
    const t1 = window.setTimeout(refresh, 120);
    const t2 = window.setTimeout(refresh, 450);

    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [childrenCount, updateNav]);

  const getStep = useCallback((swiper) => {
    const current = swiper?.params?.slidesPerView;
    return typeof current === "number" ? Math.max(1, Math.floor(current)) : 1;
  }, []);

  const handlePrevClick = useCallback(
    (e) => {
      e.preventDefault();
      e.stopPropagation();
      const swiper = swiperRef.current;
      if (!swiper) return;
      swiper.slideTo(Math.max((swiper.activeIndex || 0) - getStep(swiper), 0));
    },
    [getStep],
  );

  const handleNextClick = useCallback(
    (e) => {
      e.preventDefault();
      e.stopPropagation();
      const swiper = swiperRef.current;
      if (!swiper) return;
      const maxIndex = Math.max((swiper.slides?.length || 1) - 1, 0);
      swiper.slideTo(
        Math.min((swiper.activeIndex || 0) + getStep(swiper), maxIndex),
      );
    },
    [getStep],
  );

  return (
    <div
      className="relative"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div style={{ overflowX: "clip", overflowY: "visible" }}>
        <Swiper
          {...swiperProps}
          observer={swiperProps.observer ?? true}
          observeParents={swiperProps.observeParents ?? true}
          resizeObserver={swiperProps.resizeObserver ?? true}
          onSwiper={(swiper) => {
            handleSwiper(swiper);
            swiperProps.onSwiper?.(swiper);
          }}
          onSlideChange={(swiper) => {
            updateNav(swiper);
            swiperProps.onSlideChange?.(swiper);
          }}
          onResize={(swiper) => {
            updateNav(swiper);
            swiperProps.onResize?.(swiper);
          }}
          onReachBeginning={(swiper) => {
            updateNav(swiper);
            swiperProps.onReachBeginning?.(swiper);
          }}
          onReachEnd={(swiper) => {
            updateNav(swiper);
            swiperProps.onReachEnd?.(swiper);
          }}
          className={className}
        >
          {children}
        </Swiper>
      </div>

      <AnimatePresence>
        {isHovered && canPrev && (
          <motion.button
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            type="button"
            onClick={handlePrevClick}
            className={`absolute -left-8 z-30 hidden w-7 items-center justify-center text-white/75 transition-colors hover:text-white pointer-events-auto sm:flex xl:-left-10 ${arrowClassName}`}
            aria-label="Anterior"
          >
            <motion.span
              className="relative text-4xl font-semibold drop-shadow-[0_0_12px_rgba(0,0,0,0.95)]"
              whileHover={{ x: -4 }}
            >
              ‹
            </motion.span>
          </motion.button>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isHovered && canNext && (
          <motion.button
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            type="button"
            onClick={handleNextClick}
            className={`absolute -right-8 z-30 hidden w-7 items-center justify-center text-white/75 transition-colors hover:text-white pointer-events-auto sm:flex xl:-right-10 ${arrowClassName}`}
            aria-label="Siguiente"
          >
            <motion.span
              className="relative text-4xl font-semibold drop-shadow-[0_0_12px_rgba(0,0,0,0.95)]"
              whileHover={{ x: 4 }}
            >
              ›
            </motion.span>
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function EpisodeDetailsClient({
  showId,
  seasonNumber,
  episodeNumber,
  show,
  episode,
  initialScoreboard,
  initialShowWatched,
  imdb,
  imdbId,
  imdbUrl,
}) {
  const router = useRouter();
  const traktRequestIdRef = useRef(0);

  const showName = show?.name || "Serie";
  const epName = episode?.name || `Episodio ${episodeNumber}`;
  const traktShowWatchedStorageKey = `showverse:trakt:showWatched:${showId}`;

  const stillPath = episode?.still_path || null;
  const heroBgPath =
    stillPath || show?.backdrop_path || show?.poster_path || null;

  const airDate = episode?.air_date ? formatDateEs(episode.air_date) : null;
  const runtime = Number(episode?.runtime || 0) || null;
  const vote =
    typeof episode?.vote_average === "number" && episode.vote_average > 0
      ? episode.vote_average
      : null;
  const voteCount =
    typeof episode?.vote_count === "number" ? episode.vote_count : null;

  const [episodeCredits, setEpisodeCredits] = useState(
    () => episode?.credits || null,
  );
  const cast = Array.isArray(episodeCredits?.cast) ? episodeCredits.cast : [];
  const guestStars = Array.isArray(episodeCredits?.guest_stars)
    ? episodeCredits.guest_stars
    : [];
  const initialWatchedBySeason = useMemo(
    () => normalizeWatchedBySeason(initialShowWatched?.watchedBySeason),
    [initialShowWatched],
  );
  const hasInitialShowWatched = !!initialWatchedBySeason;

  const tmdbEpisodeUrl = `https://www.themoviedb.org/tv/${showId}/season/${seasonNumber}/episode/${episodeNumber}`;

  const heroBackgroundStyle = useMemo(() => {
    if (!heroBgPath) return null;
    const url = `https://image.tmdb.org/t/p/original${heroBgPath}`;
    return { backgroundImage: `url(${url})` };
  }, [heroBgPath]);

  const fmtStat = useCallback((n) => {
    const v = typeof n === "number" ? n : 0;
    return formatVoteCount(v) ?? "0";
  }, []);

  // Tabs
  const [activeTab, setActiveTab] = useState("details");
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
    setIsMounted(true);
  }, []);

  useEffect(() => {
    setEpisodeCredits(episode?.credits || null);
  }, [episode, showId, seasonNumber, episodeNumber]);

  const parseScoreboardData = useCallback((r) => {
    if (!r?.found) return null;
    return {
      loading: false,
      rating:
        typeof r?.community?.rating === "number" ? r.community.rating : null,
      votes: typeof r?.community?.votes === "number" ? r.community.votes : null,
      stats: r?.stats || null,
      traktUrl: r?.traktUrl || null,
    };
  }, []);

  const hasNumericScoreboardStats = useCallback(
    (stats) =>
      Object.values(stats || {}).some((value) => typeof value === "number"),
    [],
  );

  const defaultScoreboard = useMemo(
    () => ({
      loading: false,
      rating: null,
      votes: null,
      stats: null,
      traktUrl: null,
    }),
    [],
  );

  const parsedInitialScoreboard = useMemo(
    () => parseScoreboardData(initialScoreboard),
    [initialScoreboard, parseScoreboardData],
  );
  const initialScoreboardHasStats = useMemo(
    () => hasNumericScoreboardStats(parsedInitialScoreboard?.stats),
    [parsedInitialScoreboard, hasNumericScoreboardStats],
  );

  // Trakt scoreboard
  const [tScoreboard, setTScoreboard] = useState(
    () => parsedInitialScoreboard || defaultScoreboard,
  );
  const [imdbData, setImdbData] = useState(() => imdb || null);
  const [watchedBySeason, setWatchedBySeason] = useState(
    () => initialWatchedBySeason || {},
  );
  const [watchedBySeasonLoaded, setWatchedBySeasonLoaded] = useState(
    hasInitialShowWatched,
  );

  const traktDecimal = useMemo(() => {
    if (tScoreboard.rating == null) return null;
    const v = Number(tScoreboard.rating); // Trakt ya viene 0..10
    if (!Number.isFinite(v) || v <= 0) return null;
    return v.toFixed(1); // punto
  }, [tScoreboard.rating]);

  useEffect(() => {
    const key = `${showId}:${seasonNumber}:${episodeNumber}`;
    if (initialScoreboard && initialScoreboardHasStats) {
      episodeScoreboardCache.set(key, initialScoreboard);
    }
  }, [
    showId,
    seasonNumber,
    episodeNumber,
    initialScoreboard,
    initialScoreboardHasStats,
  ]);

  useEffect(() => {
    setTScoreboard(parsedInitialScoreboard || defaultScoreboard);
  }, [parsedInitialScoreboard, defaultScoreboard]);

  useEffect(() => {
    if (initialScoreboardHasStats) return;

    let alive = true;
    const controller = new AbortController();
    const cancelSchedule = scheduleAfterFirstPaint(async () => {
      try {
        let json = await fetchEpisodeScoreboardCached({
          showId,
          seasonNumber,
          episodeNumber,
          signal: controller.signal,
        });
        if (!alive) return;

        const parsed = parseScoreboardData(json);
        const hasStats = hasNumericScoreboardStats(parsed?.stats);

        if (!hasStats) {
          const statsOnly = await fetchEpisodeStatsCached({
            showId,
            seasonNumber,
            episodeNumber,
            signal: controller.signal,
          });
          if (!alive) return;

          if (statsOnly?.found && hasNumericScoreboardStats(statsOnly?.stats)) {
            json = {
              ...(json || {}),
              found: true,
              traktUrl: json?.traktUrl || statsOnly?.traktUrl || null,
              community: json?.community || null,
              stats: statsOnly.stats,
            };
          }
        }

        setTScoreboard(parseScoreboardData(json) || defaultScoreboard);
      } catch (error) {
        if (!alive || error?.name === "AbortError") return;
        setTScoreboard(defaultScoreboard);
      }
    }, 80);

    return () => {
      alive = false;
      controller.abort();
      cancelSchedule();
    };
  }, [
    showId,
    seasonNumber,
    episodeNumber,
    initialScoreboardHasStats,
    parseScoreboardData,
    hasNumericScoreboardStats,
    defaultScoreboard,
  ]);

  useEffect(() => {
    setImdbData(imdb || null);
  }, [imdb, showId, seasonNumber, episodeNumber]);

  useEffect(() => {
    const key = `${showId}:${imdbId}:${seasonNumber}:${episodeNumber}`;
    if (imdb && imdbId) {
      episodeImdbCache.set(key, imdb);
    }
  }, [showId, imdbId, seasonNumber, episodeNumber, imdb]);

  useEffect(() => {
    if (imdb?.rating != null) return;

    let alive = true;
    const controller = new AbortController();
    const cancelSchedule = scheduleAfterFirstPaint(async () => {
      try {
        let nextImdb = null;

        const seriesGraphRatings = await fetchSeriesGraphRatingsCached({
          showId,
          title: showName,
          signal: controller.signal,
        });
        nextImdb = getSeriesGraphEpisodeRating({
          ratings: seriesGraphRatings,
          seasonNumber,
          episodeNumber,
          tmdbSeasons: show?.seasons,
          showId,
          title: showName,
        });

        if (nextImdb?.rating == null && imdbId) {
          nextImdb = await fetchEpisodeImdbCached({
            showId,
            seasonNumber,
            episodeNumber,
            imdbId,
            signal: controller.signal,
          });
        }

        if (alive) {
          setImdbData(nextImdb);
        }
      } catch (error) {
        if (!alive || error?.name === "AbortError") return;
        setImdbData(null);
      }
    }, 120);

    return () => {
      alive = false;
      controller.abort();
      cancelSchedule();
    };
  }, [
    showId,
    seasonNumber,
    episodeNumber,
    imdbId,
    imdb,
    showName,
    show?.seasons,
  ]);

  useEffect(() => {
    if (episodeCredits) return;

    let alive = true;
    const controller = new AbortController();
    const cancelSchedule = scheduleAfterFirstPaint(async () => {
      try {
        const res = await fetch(
          `/api/tmdb/tv/${encodeURIComponent(showId)}/season/${encodeURIComponent(seasonNumber)}/episode/${encodeURIComponent(episodeNumber)}/credits`,
          { cache: "force-cache", signal: controller.signal },
        );
        if (!res.ok) return;
        const credits = await res.json().catch(() => null);
        if (!alive) return;
        if (
          Array.isArray(credits?.cast) ||
          Array.isArray(credits?.guest_stars)
        ) {
          setEpisodeCredits(credits);
        }
      } catch (error) {
        if (alive && error?.name !== "AbortError") {
          setEpisodeCredits(null);
        }
      }
    }, 420);

    return () => {
      alive = false;
      controller.abort();
      cancelSchedule();
    };
  }, [episodeCredits, showId, seasonNumber, episodeNumber]);

  // =========================
  // Rating SOLO Trakt + StarRating
  // =========================
  const [isRatingOpen, setIsRatingOpen] = useState(false);
  const [userRating, setUserRating] = useState(null);
  const [ratingLoading, setRatingLoading] = useState(false);
  const [traktConnected, setTraktConnected] = useState(true);

  // Estado de Trakt para watched
  const [trakt, setTrakt] = useState({
    loading: false,
    connected: hasInitialShowWatched
      ? initialShowWatched?.connected !== false
      : false,
    found: hasInitialShowWatched ? initialShowWatched?.found !== false : false,
    watched: getWatchedSeasonEpisodes(initialWatchedBySeason, seasonNumber)
      .map((value) => Number(value))
      .includes(Number(episodeNumber)),
    error: "",
    traktId: initialShowWatched?.traktId ?? null,
  });
  const [watchedBusy, setWatchedBusy] = useState(false);
  const [episodePlaysOpen, setEpisodePlaysOpen] = useState(false);
  const [episodePlaysLoading, setEpisodePlaysLoading] = useState(false);
  const [episodePlaysLoaded, setEpisodePlaysLoaded] = useState(false);
  const [episodePlays, setEpisodePlays] = useState({
    plays: 0,
    history: [],
    lastWatchedAt: null,
  });

  // Cargar rating del usuario (Trakt) en segundo plano.
  useEffect(() => {
    let alive = true;
    const controller = new AbortController();
    const cancelSchedule = scheduleAfterFirstPaint(async () => {
      try {
        const res = await fetch(
          `/api/trakt/ratings?type=episode&tmdbId=${Number(showId)}&season=${Number(seasonNumber)}&episode=${Number(
            episodeNumber,
          )}`,
          { cache: "no-store", signal: controller.signal },
        );

        if (!alive) return;

        if (res.status === 401) {
          setTraktConnected(false);
          setUserRating(null);
          return;
        }

        setTraktConnected(true);

        const j = await res.json().catch(() => ({}));
        setUserRating(typeof j?.rating === "number" ? j.rating : null);
      } catch (e) {
        if (e?.name === "AbortError") return;
        console.error(e);
        if (alive) {
          setUserRating(null);
          setTraktConnected(false);
        }
      }
    }, 320);

    return () => {
      alive = false;
      controller.abort();
      cancelSchedule();
    };
  }, [showId, seasonNumber, episodeNumber]);

  const handleRate = useCallback(
    async (val) => {
      try {
        const next = val == null || Number(val) <= 0 ? null : Number(val);

        setRatingLoading(true);
        const res = await offlineMutationFetch(
          "/api/trakt/ratings",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              type: "episode",
              tmdbId: Number(showId), // TMDb ID de la SERIE (show)
              season: Number(seasonNumber),
              episode: Number(episodeNumber),
              rating: next, // null => remove
            }),
          },
          {
            label:
              next == null
                ? "Quitar valoracion de episodio"
                : "Guardar valoracion de episodio",
            dedupeKey: `trakt:episode-rating:${showId}:${seasonNumber}:${episodeNumber}`,
          },
        );

        if (res.status === 401) {
          window.location.href = `/api/trakt/auth/start?next=/details/tv/${showId}/season/${seasonNumber}/episode/${episodeNumber}`;
          return;
        }

        const j = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(j?.error || "Trakt rating failed");

        setTraktConnected(true);
        setUserRating(next);
      } catch (e) {
        console.error(e);
      } finally {
        setRatingLoading(false);
        setIsRatingOpen(false);
      }
    },
    [showId, seasonNumber, episodeNumber],
  );

  // Trigger (mismo hueco visual que antes)
  useEffect(() => {
    let nextWatchedBySeason = initialWatchedBySeason;
    let nextLoaded = hasInitialShowWatched;
    let nextTrakt = {
      loading: false,
      connected: hasInitialShowWatched
        ? initialShowWatched?.connected !== false
        : false,
      found: hasInitialShowWatched
        ? initialShowWatched?.found !== false
        : false,
      watched: false,
      error: "",
      traktId: initialShowWatched?.traktId ?? null,
    };

    if (typeof window !== "undefined" && !hasInitialShowWatched) {
      try {
        const cachedRaw = window.localStorage.getItem(
          traktShowWatchedStorageKey,
        );
        const cached = cachedRaw ? JSON.parse(cachedRaw) : null;
        const cachedWatched = normalizeWatchedBySeason(cached?.watchedBySeason);
        if (cachedWatched) {
          nextWatchedBySeason = cachedWatched;
          nextLoaded = true;
          nextTrakt = {
            loading: false,
            connected:
              typeof cached?.connected === "boolean" ? cached.connected : true,
            found: typeof cached?.found === "boolean" ? cached.found : true,
            watched: false,
            error: "",
            traktId: cached?.traktId ?? null,
          };
        }
      } catch {}
    }

    const seasonEpisodes = getWatchedSeasonEpisodes(
      nextWatchedBySeason,
      seasonNumber,
    );
    const isWatched = seasonEpisodes
      .map((value) => Number(value))
      .includes(Number(episodeNumber));

    traktRequestIdRef.current += 1;
    setWatchedBySeason(nextWatchedBySeason || {});
    setWatchedBySeasonLoaded(nextLoaded);
    setTrakt({
      ...nextTrakt,
      watched: isWatched,
    });
  }, [
    showId,
    seasonNumber,
    episodeNumber,
    initialShowWatched,
    initialWatchedBySeason,
    hasInitialShowWatched,
    traktShowWatchedStorageKey,
  ]);

  const applyShowWatchedPayload = useCallback(
    (payload) => {
      const nextWatchedBySeason =
        normalizeWatchedBySeason(payload?.watchedBySeason) || {};
      const seasonEpisodes = getWatchedSeasonEpisodes(
        nextWatchedBySeason,
        seasonNumber,
      );
      const isWatched = seasonEpisodes
        .map((value) => Number(value))
        .includes(Number(episodeNumber));

      setWatchedBySeason(nextWatchedBySeason);
      setWatchedBySeasonLoaded(true);
      setTrakt((prev) => ({
        ...prev,
        loading: false,
        connected:
          typeof payload?.connected === "boolean"
            ? payload.connected
            : prev.connected,
        found: payload?.found !== false,
        watched: isWatched,
        error: "",
        traktId: payload?.traktId ?? prev.traktId ?? null,
      }));

      return isWatched;
    },
    [seasonNumber, episodeNumber],
  );

  const reloadEpisodeTraktState = useCallback(
    async ({ background = false } = {}) => {
      const requestId = traktRequestIdRef.current + 1;
      traktRequestIdRef.current = requestId;

      setTrakt((prev) => ({
        ...prev,
        loading: background ? prev.loading : true,
        error: "",
      }));

      try {
        const statusRes = await traktGetItemStatus({
          type: "show",
          tmdbId: Number(showId),
        });

        if (requestId !== traktRequestIdRef.current) return null;

        if (!statusRes?.connected) {
          const nextState = {
            loading: false,
            connected: false,
            found: watchedBySeasonLoaded,
            watched: trakt.watched,
            error: "",
            traktId: null,
          };
          setTrakt(nextState);
          setTraktConnected(false);
          return nextState;
        }

        setTraktConnected(true);

        const watchedRes = await traktGetShowWatched({
          tmdbId: Number(showId),
        });
        if (requestId !== traktRequestIdRef.current) return null;

        applyShowWatchedPayload({
          connected: true,
          found: watchedRes?.found !== false,
          traktId: watchedRes?.traktId ?? statusRes?.traktId ?? null,
          watchedBySeason: watchedRes?.watchedBySeason,
        });
        return watchedRes;
      } catch (e) {
        console.error("Error cargando estado Trakt:", e);
        if (requestId !== traktRequestIdRef.current) return null;

        const isTransient =
          e?.code === "TRAKT_TRANSIENT" ||
          /timeout|rate limit|tempor|aborted|fetch|network/i.test(
            e?.message || "",
          );

        let nextState = null;
        setTrakt((prev) => {
          nextState = {
            ...prev,
            loading: false,
            connected: isTransient ? prev.connected : false,
            error: isTransient ? "" : e?.message || "Error",
          };
          return nextState;
        });

        if (!isTransient) setTraktConnected(false);
        return nextState;
      }
    },
    [showId, watchedBySeasonLoaded, trakt.watched, applyShowWatchedPayload],
  );

  useEffect(() => {
    if (typeof window === "undefined") return;

    try {
      if (watchedBySeasonLoaded && trakt?.connected) {
        window.localStorage.setItem(
          traktShowWatchedStorageKey,
          JSON.stringify({
            connected: !!trakt.connected,
            found: !!trakt.found,
            traktId: trakt.traktId ?? null,
            watchedBySeason:
              watchedBySeason && typeof watchedBySeason === "object"
                ? watchedBySeason
                : {},
          }),
        );
      } else if (watchedBySeasonLoaded && !trakt?.connected) {
        window.localStorage.removeItem(traktShowWatchedStorageKey);
      }
    } catch {}
  }, [
    watchedBySeasonLoaded,
    trakt?.connected,
    trakt?.found,
    trakt?.traktId,
    watchedBySeason,
    traktShowWatchedStorageKey,
  ]);

  useEffect(() => {
    const timer = window.setTimeout(
      () => {
        void reloadEpisodeTraktState({ background: true });
      },
      hasInitialShowWatched ? 2500 : 900,
    );

    return () => window.clearTimeout(timer);
  }, [reloadEpisodeTraktState, hasInitialShowWatched]);

  useEffect(() => {
    let cancelled = false;
    const timers = [];
    let ignoreFirstPageShow = true;

    const syncEpisodeTraktState = async ({ force = false } = {}) => {
      if (!force && watchedBusy) return;
      const latest = await reloadEpisodeTraktState({ background: true });
      if (cancelled) return;
      if (latest?.connected) setTraktConnected(true);
    };

    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        void syncEpisodeTraktState();
      }
    };
    const handlePageShow = () => {
      if (ignoreFirstPageShow) {
        ignoreFirstPageShow = false;
        return;
      }
      void syncEpisodeTraktState();
    };

    window.addEventListener("focus", syncEpisodeTraktState);
    window.addEventListener("pageshow", handlePageShow);
    document.addEventListener("visibilitychange", handleVisibility);

    if (trakt.loading) {
      [900, 2200].forEach((delay) => {
        const timer = window.setTimeout(() => {
          void syncEpisodeTraktState({ force: true });
        }, delay);
        timers.push(timer);
      });
    }

    return () => {
      cancelled = true;
      timers.forEach((timer) => window.clearTimeout(timer));
      window.removeEventListener("focus", syncEpisodeTraktState);
      window.removeEventListener("pageshow", handlePageShow);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [
    reloadEpisodeTraktState,
    trakt.loading,
    trakt.connected,
    trakt.error,
    watchedBusy,
  ]);

  // Cargar historial de plays del episodio
  const loadEpisodePlays = useCallback(async () => {
    if (episodePlaysLoaded) return;
    setEpisodePlaysLoading(true);
    try {
      const json = await traktGetEpisodePlays({
        tmdbId: Number(showId),
        season: Number(seasonNumber),
        episode: Number(episodeNumber),
      });
      setEpisodePlays({
        plays: json?.plays ?? 0,
        history: Array.isArray(json?.history) ? json.history : [],
        lastWatchedAt: json?.lastWatchedAt ?? null,
      });
      setEpisodePlaysLoaded(true);
    } catch (e) {
      console.error("Error loading episode plays:", e);
    } finally {
      setEpisodePlaysLoading(false);
    }
  }, [showId, seasonNumber, episodeNumber, episodePlaysLoaded]);

  const handleEpisodeAddPlay = useCallback(
    async (watchedAt) => {
      setWatchedBusy(true);
      try {
        await traktAddEpisodePlay({
          tmdbId: Number(showId),
          season: Number(seasonNumber),
          episode: Number(episodeNumber),
          watchedAt,
        });
        // Recargar historial después de añadir
        setEpisodePlaysLoaded(false);
        const json = await traktGetEpisodePlays({
          tmdbId: Number(showId),
          season: Number(seasonNumber),
          episode: Number(episodeNumber),
        });
        setEpisodePlays({
          plays: json?.plays ?? 0,
          history: Array.isArray(json?.history) ? json.history : [],
          lastWatchedAt: json?.lastWatchedAt ?? null,
        });
        setEpisodePlaysLoaded(true);
      } catch (e) {
        console.error("Error adding episode play:", e);
      } finally {
        setWatchedBusy(false);
      }
    },
    [showId, seasonNumber, episodeNumber],
  );

  const handleEpisodeUpdatePlay = useCallback(
    async (historyId, watchedAt) => {
      setWatchedBusy(true);
      try {
        // Remove old + add new
        await traktRemoveWatchPlay({ historyId });
        await traktAddEpisodePlay({
          tmdbId: Number(showId),
          season: Number(seasonNumber),
          episode: Number(episodeNumber),
          watchedAt,
        });
        setEpisodePlaysLoaded(false);
        const json = await traktGetEpisodePlays({
          tmdbId: Number(showId),
          season: Number(seasonNumber),
          episode: Number(episodeNumber),
        });
        setEpisodePlays({
          plays: json?.plays ?? 0,
          history: Array.isArray(json?.history) ? json.history : [],
          lastWatchedAt: json?.lastWatchedAt ?? null,
        });
        setEpisodePlaysLoaded(true);
      } catch (e) {
        console.error("Error updating episode play:", e);
      } finally {
        setWatchedBusy(false);
      }
    },
    [showId, seasonNumber, episodeNumber],
  );

  const handleEpisodeRemovePlay = useCallback(
    async (historyId) => {
      setWatchedBusy(true);
      try {
        await traktRemoveWatchPlay({ historyId });
        setEpisodePlaysLoaded(false);
        const json = await traktGetEpisodePlays({
          tmdbId: Number(showId),
          season: Number(seasonNumber),
          episode: Number(episodeNumber),
        });
        setEpisodePlays({
          plays: json?.plays ?? 0,
          history: Array.isArray(json?.history) ? json.history : [],
          lastWatchedAt: json?.lastWatchedAt ?? null,
        });
        setEpisodePlaysLoaded(true);
      } catch (e) {
        console.error("Error removing episode play:", e);
      } finally {
        setWatchedBusy(false);
      }
    },
    [showId, seasonNumber, episodeNumber],
  );

  // Toggle watched para el episodio
  const toggleEpisodeWatched = useCallback(async () => {
    if (trakt.loading || watchedBusy) return;

    let connected = !!trakt.connected;
    if (!connected) {
      const latest = await reloadEpisodeTraktState();
      connected = !!latest?.connected;
    }

    if (!connected) {
      window.location.href = `/api/trakt/auth/start?next=/details/tv/${showId}/season/${seasonNumber}/episode/${episodeNumber}`;
      return;
    }

    const newWatched = !trakt.watched;
    setWatchedBusy(true);

    try {
      const res = await traktSetEpisodeWatched({
        tmdbId: Number(showId),
        season: Number(seasonNumber),
        episode: Number(episodeNumber),
        watched: newWatched,
      });

      traktRequestIdRef.current += 1;
      invalidateTraktGetCache({
        tmdbId: Number(showId),
        traktId: res?.traktId ?? trakt.traktId ?? undefined,
      });
      applyShowWatchedPayload({
        connected: true,
        found: res?.found !== false,
        traktId: res?.traktId ?? trakt.traktId ?? null,
        watchedBySeason: res?.watchedBySeason,
      });
    } catch (e) {
      console.error("Error al marcar episodio:", e);
      const needsReauth = /401|unauthorized/i.test(e?.message || "");
      if (needsReauth) {
        window.location.href = `/api/trakt/auth/start?next=/details/tv/${showId}/season/${seasonNumber}/episode/${episodeNumber}`;
        return;
      }
      await reloadEpisodeTraktState({ background: true });
    } finally {
      setWatchedBusy(false);
    }
  }, [
    trakt.loading,
    trakt.connected,
    trakt.traktId,
    trakt.watched,
    watchedBusy,
    reloadEpisodeTraktState,
    showId,
    seasonNumber,
    episodeNumber,
    applyShowWatchedPayload,
  ]);

  return (
    <div className="relative min-h-screen bg-[#101010] text-gray-100 font-sans selection:bg-yellow-500/30">
      {/* Background */}
      <div className="fixed inset-0 z-0 overflow-hidden bg-[#0a0a0a]">
        {heroBackgroundStyle ? (
          <>
            <div
              className="absolute inset-0 bg-cover bg-center"
              style={{
                ...heroBackgroundStyle,
                transform: "scale(1)",
                filter: "blur(14px) brightness(0.65) saturate(1.05)",
              }}
            />
            <div
              className="absolute inset-0 bg-cover transition-opacity duration-1000"
              style={{
                ...heroBackgroundStyle,
                backgroundPosition: "center top",
                transform: "scale(1)",
                transformOrigin: "center top",
              }}
            />
          </>
        ) : (
          <div className="absolute inset-0 bg-[#0a0a0a]" />
        )}

        <div className="absolute inset-0 pointer-events-none bg-gradient-to-b from-black/60 via-transparent to-transparent" />
        <div className="absolute inset-0 pointer-events-none bg-gradient-to-r from-[#101010]/60 via-transparent to-transparent" />
        <div className="absolute inset-0 pointer-events-none bg-gradient-to-l from-[#101010]/60 via-transparent to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#101010] via-[#101010]/60 to-black/20 backdrop-blur-[2px]" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#101010] via-transparent to-transparent opacity-30" />
      </div>

      {/* Content */}
      <div className="relative z-10 px-4 py-8 lg:py-12 max-w-7xl mx-auto">
        {/* Back buttons */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.36, ease: [0.22, 1, 0.36, 1] }}
          className="flex flex-wrap items-center gap-2 mb-6"
        >
          <button
            type="button"
            onClick={() => router.back()}
            title="Volver"
            className="inline-flex items-center justify-center rounded-full bg-black/40 bg-gradient-to-br from-white/10 to-white/5 shadow-lg backdrop-blur-md p-2 text-zinc-200 hover:bg-white/10 transition"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>

          <Link
            href={`/details/tv/${showId}/season/${seasonNumber}`}
            className="inline-flex items-center gap-2 rounded-full bg-black/40 bg-gradient-to-br from-white/10 to-white/5 shadow-lg backdrop-blur-md px-4 py-2 text-xs font-bold uppercase tracking-wider text-zinc-200 hover:bg-white/10 transition"
          >
            Temporada {seasonNumber}
          </Link>

          <Link
            href={`/details/tv/${showId}`}
            className="inline-flex items-center gap-2 rounded-full bg-black/40 bg-gradient-to-br from-white/10 to-white/5 shadow-lg backdrop-blur-md px-4 py-2 text-xs font-bold uppercase tracking-wider text-zinc-200 hover:bg-white/10 transition"
          >
            <MonitorPlay className="w-4 h-4" /> {showName}
          </Link>
        </motion.div>

        {/* Hero */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
          className="flex flex-col lg:flex-row gap-8 lg:gap-12 mb-10 items-start transform-gpu"
        >
          {/* Left still */}
          <motion.div
            initial={{ opacity: 0, x: -20, scale: 0.985 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            transition={{ duration: 0.48, ease: [0.22, 1, 0.36, 1] }}
            className="w-full max-w-[520px] lg:max-w-[560px] mx-auto lg:mx-0 flex-shrink-0"
          >
            <AnimatedPosterFrame
              src={
                stillPath
                  ? `https://image.tmdb.org/t/p/original${stillPath}`
                  : null
              }
              alt={epName}
              aspect="video"
            />
          </motion.div>

          {/* Right info + SCOREBOARD + TABS */}
          <motion.div
            initial={{ opacity: 0, x: 18 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{
              duration: 0.46,
              delay: 0.04,
              ease: [0.22, 1, 0.36, 1],
            }}
            className="flex-1 flex flex-col min-w-0 w-full"
          >
            <div className="mb-5 px-1">
              <div className="text-xs font-bold uppercase tracking-widest text-zinc-400">
                Episodio {episodeNumber} · Temporada {seasonNumber}
              </div>

              <h1 className="text-4xl md:text-5xl lg:text-6xl font-black text-white leading-[1] tracking-tight text-balance drop-shadow-xl mb-3">
                {epName}
              </h1>

              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-base md:text-lg font-medium text-zinc-300">
                <span className="text-white font-bold tracking-wide">
                  {showName}
                </span>

                {airDate ? (
                  <>
                    <span className="text-zinc-600 text-[10px]">●</span>
                    <span className="inline-flex items-center gap-2">
                      <CalendarIcon className="w-4 h-4" /> {airDate}
                    </span>
                  </>
                ) : null}

                {runtime ? (
                  <>
                    <span className="text-zinc-600 text-[10px]">●</span>
                    <span className="inline-flex items-center gap-2">
                      <ClockIcon className="w-4 h-4" /> {runtime} min
                    </span>
                  </>
                ) : null}
              </div>
            </div>

            {/* SCOREBOARD */}
            <div className="relative isolate w-full overflow-hidden rounded-2xl bg-black/[0.08] bg-gradient-to-br from-white/10 via-transparent to-black/15 shadow-none backdrop-blur-[28px] mb-6">
              <div
                className="pointer-events-none absolute inset-0 rounded-[inherit] bg-gradient-to-br from-white/10 via-transparent to-white/[0.02]"
                style={{
                  WebkitMaskImage: "-webkit-radial-gradient(white, black)",
                }}
              />
              <div
                className="
      relative z-10
      py-3
      pl-[calc(1rem+env(safe-area-inset-left))]
      pr-[calc(1.25rem+env(safe-area-inset-right))]
      sm:px-4
      flex items-center gap-3 sm:gap-4
      overflow-x-clip overscroll-none [touch-action:pan-y]
    "
              >
                <div className="flex items-center gap-4 sm:gap-5 shrink-0">
                  <CompactBadge
                    logo="/logo-TMDb.png"
                    logoClassName="h-5 sm:h-5"
                    value={vote?.toFixed(1)}
                    sub={voteCount ? formatCountShort(voteCount) : undefined}
                    href={tmdbEpisodeUrl}
                    disableHoverLift
                    tooltip={tmdbEpisodeUrl ? "Ver en TMDb" : "TMDb"}
                  />

                  {/* Trakt (móvil sin sufijo / desktop con %) */}
                  {traktDecimal && (
                    <CompactBadge
                      logo="/logo-Trakt.png"
                      value={traktDecimal}
                      sub={
                        tScoreboard.votes
                          ? formatCountShort(tScoreboard.votes)
                          : undefined
                      }
                      href={tScoreboard.traktUrl}
                      disableHoverLift
                      tooltip={tScoreboard.traktUrl ? "Ver en Trakt" : "Trakt"}
                    />
                  )}

                  {imdbData?.rating != null && (
                    <CompactBadge
                      logo="/logo-IMDb.svg"
                      logoWrapClassName="min-w-[28px]"
                      logoClassName="!h-5 sm:!h-[22px] !max-h-none !max-w-[34px]"
                      value={Number(imdbData.rating).toFixed(1)}
                      sub={
                        imdbData?.votes
                          ? formatCountShort(imdbData.votes)
                          : undefined
                      }
                      href={imdbUrl || undefined}
                      disableHoverLift
                      tooltip={imdbUrl ? "Ver en IMDb" : "IMDb"}
                    />
                  )}
                </div>

                <div className="w-px h-6 bg-white/10 shrink-0" />
                <div className="flex-1 min-w-0" />
                <div className="w-px h-6 bg-white/10 shrink-0" />

                <div className="flex items-center gap-3 shrink-0 [&_[data-liquid-button]_svg]:!w-[22px] [&_[data-liquid-button]_svg]:!h-[22px] [&_[data-liquid-button]_.text-xl]:!text-[22px]">
                  {/* Botón de visionado — abre modal con historial de plays */}
                  <TraktWatchedControl
                    connected={trakt.connected}
                    watched={trakt.watched}
                    plays={episodePlays.plays}
                    badge={null}
                    busy={watchedBusy}
                    loading={trakt.loading && !watchedBySeasonLoaded}
                    onOpen={async () => {
                      setWatchedBusy(true);
                      try {
                        await loadEpisodePlays();
                      } finally {
                        setWatchedBusy(false);
                      }
                      setEpisodePlaysOpen(true);
                    }}
                  />

                  {/* Botón de rating */}
                  <StarRating
                    open={isRatingOpen}
                    rating={userRating}
                    loading={ratingLoading}
                    onClose={() => setIsRatingOpen(false)}
                    onRate={handleRate}
                  />
                </div>
              </div>

              {!tScoreboard.loading &&
                hasNumericScoreboardStats(tScoreboard?.stats) && (
                  <div className="relative z-10 border-t border-white/5 bg-black/[0.06] rounded-b-2xl">
                    <div
                      className="
          overflow-x-clip overscroll-none [touch-action:pan-y]
          py-2
          pl-[calc(1rem+env(safe-area-inset-left))]
          pr-[calc(1rem+env(safe-area-inset-right))]
        "
                    >
                      <div className="flex w-full min-w-0 items-center justify-start gap-2 sm:gap-3">
                        <div className="shrink-0">
                          <MiniStat
                            icon={Eye}
                            value={fmtStat(tScoreboard?.stats?.watchers)}
                            tooltip="Watchers"
                          />
                        </div>
                        <div className="shrink-0">
                          <MiniStat
                            icon={PlayIcon}
                            value={fmtStat(tScoreboard?.stats?.plays)}
                            tooltip="Plays"
                          />
                        </div>
                        <div className="shrink-0">
                          <MiniStat
                            icon={ListIcon}
                            value={fmtStat(tScoreboard?.stats?.lists)}
                            tooltip="Lists"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                )}
            </div>

            {/* Tabs (DETALLES / SINOPSIS) */}
            <div>
              <DetailsTabsMenu
                tabs={[
                  { id: "details", label: "Detalles" },
                  { id: "synopsis", label: "Sinopsis" },
                ]}
                activeTab={activeTab}
                onChangeTab={setActiveTab}
                layoutId="episodeTabInline"
              />

              <div className="relative min-h-[100px]">
                <AnimatePresence mode="wait" initial={false}>
                  {activeTab === "synopsis" && (
                    <div key="synopsis">
                      <div className="relative p-5 sm:p-6 rounded-xl overflow-hidden">
                        {/* Capa de fondo estilo ScoreboardBar (cristal más claro, difuminado de 15px) */}
                        <div
                          className="absolute inset-0 rounded-[inherit] bg-black/10 bg-gradient-to-br from-white/10 via-transparent to-black/20 backdrop-blur-[15px] pointer-events-none overflow-hidden"
                          style={{
                            WebkitMaskImage:
                              "-webkit-radial-gradient(white, black)",
                          }}
                        />
                        <p className="relative z-10 text-zinc-200 text-base md:text-lg leading-relaxed text-justify whitespace-pre-line">
                          {episode?.overview?.trim() ||
                            "No hay descripción disponible."}
                        </p>
                      </div>
                    </div>
                  )}

                  {activeTab === "details" && (
                    <div key="details">
                      <div className="flex flex-col gap-3 lg:flex-row lg:flex-nowrap lg:items-stretch lg:overflow-x-auto lg:pb-2 lg:[scrollbar-width:none]">
                        <VisualMetaCard
                          icon={MonitorPlay}
                          label="Serie"
                          value={showName}
                          className="w-full lg:w-auto lg:flex-auto lg:shrink-0"
                        />
                        <VisualMetaCard
                          icon={CalendarIcon}
                          label="Emisión"
                          value={airDate || "—"}
                          className="w-full lg:w-auto lg:flex-auto lg:shrink-0"
                        />
                        <VisualMetaCard
                          icon={ClockIcon}
                          label="Duración"
                          value={runtime ? `${runtime} min` : "—"}
                          className="w-full lg:w-auto lg:flex-auto lg:shrink-0"
                        />
                        <VisualMetaCard
                          icon={StarIcon}
                          label="Episodio"
                          value={`T${seasonNumber} · E${episodeNumber}`}
                          className="w-full lg:w-auto lg:flex-auto lg:shrink-0"
                        />
                      </div>
                    </div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </motion.div>
        </motion.div>

        {/* === ESTILOS PARA SSR SWIPER FIX (EVITAR SALTOS) === */}
        {!isMounted && (
          <style
            dangerouslySetInnerHTML={{
              __html: `
            .ssr-swiper-fix .swiper-slide { width: calc(33.333% - 8px) !important; margin-right: 12px !important; display: block; }
            @media (min-width: 500px) { .ssr-swiper-fix .swiper-slide { width: calc(33.333% - 9.33px) !important; margin-right: 14px !important; } }
            @media (min-width: 768px) { .ssr-swiper-fix .swiper-slide { width: calc(25% - 12px) !important; margin-right: 16px !important; } }
            @media (min-width: 1024px) { .ssr-swiper-fix .swiper-slide { width: calc(20% - 14.4px) !important; margin-right: 18px !important; } }
            @media (min-width: 1280px) { .ssr-swiper-fix .swiper-slide { width: calc(16.666% - 16.67px) !important; margin-right: 20px !important; } }
          `,
            }}
          />
        )}

        {/* === Reparto del episodio === */}
        {cast.length > 0 && (
          <AnimatedSection delay={0.04}>
            <section className="mb-16 group/section">
              <SectionTitle title="Reparto del episodio" icon={UsersIcon} />
              <DetailsArrowCarousel
                spaceBetween={12}
                slidesPerView={3}
                breakpoints={{
                  500: { slidesPerView: 3, spaceBetween: 14 },
                  768: { slidesPerView: 4, spaceBetween: 16 },
                  1024: { slidesPerView: 5, spaceBetween: 18 },
                  1280: { slidesPerView: 6, spaceBetween: 20 },
                }}
                className={`pb-8 !overflow-visible ${!isMounted ? "ssr-swiper-fix" : ""}`}
              >
                {cast.slice(0, 20).map((actor) => (
                  <SwiperSlide key={actor.id}>
                    <Link
                      href={`/details/person/${actor.id}`}
                      className="block group relative bg-zinc-900 rounded-xl overflow-hidden border border-zinc-800/80 shadow-md lg:hover:shadow-yellow-900/20 hover:border-yellow-500/30 transition-all duration-300"
                    >
                      <div className="aspect-[2/3] overflow-hidden relative">
                        {actor.profile_path ? (
                          <img
                            src={`https://image.tmdb.org/t/p/w342${actor.profile_path}`}
                            alt={actor.name}
                            className="w-full h-full object-cover transition-transform duration-500 ease-out group-hover:scale-110 grayscale-[15%] group-hover:grayscale-0"
                          />
                        ) : (
                          <div className="w-full h-full bg-neutral-800 flex items-center justify-center text-neutral-500 transition-colors duration-500 group-hover:bg-neutral-700">
                            <UsersIconComponent size={40} />
                          </div>
                        )}

                        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/10 to-transparent opacity-80 transition-opacity duration-500 group-hover:opacity-100" />

                        <div className="absolute bottom-0 left-0 right-0 p-3 pb-4 transition-transform duration-500 ease-out translate-y-2 group-hover:translate-y-0">
                          <p className="text-white font-extrabold text-xs sm:text-sm leading-tight line-clamp-1 drop-shadow-sm">
                            {actor.name}
                          </p>
                          <p className="mt-0.5 text-zinc-300 group-hover:text-yellow-400 text-[10px] sm:text-xs font-semibold leading-tight line-clamp-1 transition-colors duration-300 drop-shadow-sm">
                            {actor.character}
                          </p>
                        </div>
                      </div>
                    </Link>
                  </SwiperSlide>
                ))}
              </DetailsArrowCarousel>
            </section>
          </AnimatedSection>
        )}

        {/* === Invitados === */}
        {guestStars.length > 0 && (
          <AnimatedSection delay={0.04}>
            <section className="mb-16 group/section">
              <SectionTitle title="Invitados" icon={UsersIcon} />
              <DetailsArrowCarousel
                spaceBetween={12}
                slidesPerView={3}
                breakpoints={{
                  500: { slidesPerView: 3, spaceBetween: 14 },
                  768: { slidesPerView: 4, spaceBetween: 16 },
                  1024: { slidesPerView: 5, spaceBetween: 18 },
                  1280: { slidesPerView: 6, spaceBetween: 20 },
                }}
                className={`pb-8 !overflow-visible ${!isMounted ? "ssr-swiper-fix" : ""}`}
              >
                {guestStars.slice(0, 20).map((actor) => (
                  <SwiperSlide key={actor.id}>
                    <Link
                      href={`/details/person/${actor.id}`}
                      className="block group relative bg-zinc-900 rounded-xl overflow-hidden border border-zinc-800/80 shadow-md lg:hover:shadow-yellow-900/20 hover:border-yellow-500/30 transition-all duration-300"
                    >
                      <div className="aspect-[2/3] overflow-hidden relative">
                        {actor.profile_path ? (
                          <img
                            src={`https://image.tmdb.org/t/p/w342${actor.profile_path}`}
                            alt={actor.name}
                            className="w-full h-full object-cover transition-transform duration-500 ease-out group-hover:scale-110 grayscale-[15%] group-hover:grayscale-0"
                          />
                        ) : (
                          <div className="w-full h-full bg-neutral-800 flex items-center justify-center text-neutral-500 transition-colors duration-500 group-hover:bg-neutral-700">
                            <UsersIconComponent size={40} />
                          </div>
                        )}

                        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/10 to-transparent opacity-80 transition-opacity duration-500 group-hover:opacity-100" />

                        <div className="absolute bottom-0 left-0 right-0 p-3 pb-4 transition-transform duration-500 ease-out translate-y-2 group-hover:translate-y-0">
                          <p className="text-white font-extrabold text-xs sm:text-sm leading-tight line-clamp-1 drop-shadow-sm">
                            {actor.name}
                          </p>
                          <p className="mt-0.5 text-zinc-300 group-hover:text-yellow-400 text-[10px] sm:text-xs font-semibold leading-tight line-clamp-1 transition-colors duration-300 drop-shadow-sm">
                            {actor.character}
                          </p>
                        </div>
                      </div>
                    </Link>
                  </SwiperSlide>
                ))}
              </DetailsArrowCarousel>
            </section>
          </AnimatedSection>
        )}

        {/* Modal de historial de visionados del episodio */}
        <TraktWatchedModal
          open={episodePlaysOpen}
          onClose={() => {
            setEpisodePlaysOpen(false);
            invalidateTraktGetCache({
              tmdbId: Number(showId),
              traktId: trakt.traktId ?? undefined,
            });
            void reloadEpisodeTraktState({ background: true });
          }}
          plays={episodePlays.plays}
          history={episodePlays.history}
          onAddPlay={handleEpisodeAddPlay}
          onUpdatePlay={handleEpisodeUpdatePlay}
          onRemovePlay={handleEpisodeRemovePlay}
          busy={watchedBusy}
        />
      </div>
    </div>
  );
}

// Icon helper para el reparto
const UsersIconComponent = ({ size = 24, className }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
);
