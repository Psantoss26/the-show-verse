"use client";


import OptimizedImage from "@/components/OptimizedImage";
import { useMemo, useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";

import {
  Layers,
  Calendar as CalendarIcon,
  Film as FilmIcon,
  MonitorPlay,
  ImageOff,
  Clock as ClockIcon,
  LayoutGrid,
  AlignJustify,
} from "lucide-react";
import { offlineMutationFetch } from "@/lib/offline/syncQueue";

import DetailsInfoTabs from "@/components/details/DetailsInfoTabs";
import {
  AnimatedSection,
  StaggerContainer,
} from "@/components/details/AnimatedSection";
import AnimatedPosterFrame from "@/components/details/AnimatedPosterFrame";
import StreamingHoverOverlay from "@/components/details/StreamingHoverOverlay";
import StreamingProviderLogo from "@/components/details/StreamingProviderLogo";
import DetailsScoreboardPanel from "@/components/details/DetailsScoreboardPanel";
import ExternalLinksModal from "@/components/details/ExternalLinksModal";
import LiquidGlassOpticalLayers from "@/components/ui/LiquidGlassOpticalLayers";
import { LIQUID_GLASS_CARD } from "@/lib/ui/liquidGlass";
import {
  buildTraktHref,
  buildImdbHref,
} from "@/lib/details/ratingLinks";
import { pickPrimaryProvider } from "@/lib/streaming/platformWordmark";
import { createPlatformItem } from "@/lib/streaming/providers";
import {
  formatDateEs,
  formatCountShort,
} from "@/lib/details/formatters";
import { buildTvExternalLinks } from "@/lib/details/tvExternalLinks";
import {
  fetchSeriesGraphRatingsCached,
  getSeriesGraphSeasonAggregate,
} from "@/lib/details/seriesGraphRatings";
import TraktEpisodesWatchedModal from "@/components/trakt/TraktEpisodesWatchedModal";
import SubrouteDetailsActionRow from "@/components/details/SubrouteDetailsActionRow";
import {
  invalidateTraktGetCache,
  traktGetShowWatched,
  traktSetSeasonWatched,
  traktSetEpisodeWatched,
} from "@/lib/api/traktClient";

const seasonScoreboardCache = new Map();
const seasonScoreboardInflight = new Map();
const seasonStatsCache = new Map();
const seasonStatsInflight = new Map();
const seasonImdbCache = new Map();
const seasonImdbInflight = new Map();

function normalizeWatchedBySeason(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value;
}

function getSeasonWatchedEpisodes(watchedBySeason, seasonNumber) {
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

async function fetchSeasonScoreboardCached({ showId, seasonNumber, signal }) {
  const key = `${showId}:${seasonNumber}`;
  if (seasonScoreboardCache.has(key)) {
    return seasonScoreboardCache.get(key);
  }
  if (seasonScoreboardInflight.has(key)) {
    return seasonScoreboardInflight.get(key);
  }

  const promise = fetch(
    `/api/scoreboard/public?type=season&id=${encodeURIComponent(showId)}&season=${encodeURIComponent(seasonNumber)}`,
    {
      cache: "force-cache",
      signal,
    },
  )
    .then(async (res) => {
      const json = await res.json().catch(() => null);
      const value = res.ok && json?.found ? json : null;
      if (value) {
        seasonScoreboardCache.set(key, value);
      }
      return value;
    })
    .catch((error) => {
      if (error?.name === "AbortError") throw error;
      return null;
    })
    .finally(() => {
      seasonScoreboardInflight.delete(key);
    });

  seasonScoreboardInflight.set(key, promise);
  return promise;
}

async function fetchSeasonStatsCached({ showId, seasonNumber, signal }) {
  const key = `${showId}:${seasonNumber}`;
  if (seasonStatsCache.has(key)) {
    return seasonStatsCache.get(key);
  }
  if (seasonStatsInflight.has(key)) {
    return seasonStatsInflight.get(key);
  }

  const promise = fetch(
    `/api/trakt/stats?type=season&tmdbId=${encodeURIComponent(showId)}&season=${encodeURIComponent(seasonNumber)}`,
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
        seasonStatsCache.set(key, value);
      }
      return value;
    })
    .catch((error) => {
      if (error?.name === "AbortError") throw error;
      return null;
    })
    .finally(() => {
      seasonStatsInflight.delete(key);
    });

  seasonStatsInflight.set(key, promise);
  return promise;
}

async function fetchSeasonImdbCached({
  showId,
  showImdbId,
  seasonNumber,
  signal,
}) {
  const key = `${showId}:${showImdbId}:${seasonNumber}`;
  if (seasonImdbCache.has(key)) {
    return seasonImdbCache.get(key);
  }
  if (seasonImdbInflight.has(key)) {
    return seasonImdbInflight.get(key);
  }

  const promise = fetch(
    `/api/ratings/season?showId=${encodeURIComponent(showId)}&imdbId=${encodeURIComponent(showImdbId)}&season=${encodeURIComponent(seasonNumber)}`,
    {
      cache: "force-cache",
      signal,
    },
  )
    .then(async (res) => {
      const json = await res.json().catch(() => null);
      const value =
        res.ok &&
        (typeof json?.rating === "number" || typeof json?.votes === "number")
          ? json
          : null;
      if (value) {
        seasonImdbCache.set(key, value);
      }
      return value;
    })
    .catch((error) => {
      if (error?.name === "AbortError") throw error;
      return null;
    })
    .finally(() => {
      seasonImdbInflight.delete(key);
    });

  seasonImdbInflight.set(key, promise);
  return promise;
}

export default function SeasonDetailsClient({
  showId,
  seasonNumber,
  show,
  season,
  showImdbId,
  initialScoreboard,
  initialShowWatched,
  imdb,
  imdbUrl,
}) {
  const router = useRouter();
  const traktRequestIdRef = useRef(0);

  const [episodesView, setEpisodesView] = useState("list"); // 'list' | 'grid'

  const showName = show?.name || show?.title || "Serie";
  const seasonName =
    season?.name?.trim() ||
    (Number(seasonNumber) === 0 ? "Especiales" : `Temporada ${seasonNumber}`);
  const seasonExternalLinks = useMemo(
    () =>
      buildTvExternalLinks({
        showId,
        title: showName,
        originalTitle: show?.original_name,
        homepage: show?.homepage,
      }),
    [showId, showName, show?.original_name, show?.homepage],
  );

  const posterPath = season?.poster_path || show?.poster_path || null;
  const heroBgPath =
    show?.backdrop_path || season?.poster_path || show?.poster_path || null;

  const episodes = Array.isArray(season?.episodes) ? season.episodes : [];
  const totalEp = episodes.length;
  const initialWatchedBySeason = useMemo(
    () => normalizeWatchedBySeason(initialShowWatched?.watchedBySeason),
    [initialShowWatched],
  );
  const hasInitialShowWatched = !!initialWatchedBySeason;
  const traktShowWatchedStorageKey = `showverse:trakt:showWatched:${showId}`;

  // Plataformas de streaming de la SERIE (una temporada no tiene plataforma
  // propia): se usa la principal para el overlay "Ver en" de la portada.
  const [showProviders, setShowProviders] = useState([]);
  useEffect(() => {
    if (!showId || !showName) return;
    const controller = new AbortController();
    (async () => {
      try {
        const params = new URLSearchParams({ title: showName, type: "tv" });
        const year = String(show?.first_air_date || "").slice(0, 4);
        if (year && Number(year) > 0) params.set("year", year);
        const imdb = show?.imdb_id || show?.external_ids?.imdb_id || showImdbId;
        if (imdb) params.set("imdbId", imdb);
        params.set("tmdbId", String(showId));
        const res = await fetch(`/api/streaming?${params.toString()}`, {
          signal: controller.signal,
        });
        if (!res.ok) return;
        const json = await res.json().catch(() => null);
        setShowProviders(Array.isArray(json?.providers) ? json.providers : []);
      } catch (error) {
        if (error?.name !== "AbortError") {
          console.warn("No se pudieron cargar plataformas de la serie:", error);
        }
      }
    })();
    return () => controller.abort();
  }, [showId, showName, show?.first_air_date, show?.imdb_id, showImdbId]);

  // Plataforma principal del overlay, según orden de prioridad (Netflix, Prime,
  // Crunchyroll, HBO Max, Disney+, Movistar+).
  const seasonPrimaryProvider = useMemo(
    () => pickPrimaryProvider(showProviders),
    [showProviders],
  );

  const airDate = season?.air_date ? formatDateEs(season.air_date) : null;
  const seasonPlatformItems = useMemo(
    () =>
      showProviders
        .map((provider) =>
          createPlatformItem(provider, {
            endpointType: "tv",
            justwatchUrl: null,
            title: showName,
          }),
        )
        .filter((provider) => provider.icon && provider.hasValidLink),
    [showProviders, showName],
  );
  const seasonProduction = useMemo(
    () =>
      (Array.isArray(show?.production_companies)
        ? show.production_companies
        : []
      )
        .slice(0, 3)
        .map((company) => company?.name)
        .filter(Boolean)
        .join(", ") || null,
    [show?.production_companies],
  );
  const showCreators = useMemo(
    () =>
      (Array.isArray(show?.created_by) ? show.created_by : [])
        .map((creator) => creator?.name)
        .filter(Boolean)
        .join(", "),
    [show?.created_by],
  );
  const showNetwork = useMemo(
    () =>
      (Array.isArray(show?.networks) ? show.networks : [])
        .map((network) => network?.name)
        .filter(Boolean)
        .join(", "),
    [show?.networks],
  );
  const seasonDetailCards = useMemo(
    () => [
      { icon: MonitorPlay, label: "Serie", value: showName },
      { icon: CalendarIcon, label: "Estreno", value: airDate || "—" },
      {
        icon: Layers,
        label: "Temporada",
        value:
          Number(seasonNumber) === 0 ? "Especiales" : String(seasonNumber),
      },
      {
        icon: FilmIcon,
        label: "Episodios",
        value: totalEp ? String(totalEp) : "—",
      },
    ],
    [showName, airDate, seasonNumber, totalEp],
  );
  const seasonVote =
    typeof season?.vote_average === "number" && season.vote_average > 0
      ? season.vote_average
      : null;

  const tmdbSeasonUrl = `https://www.themoviedb.org/tv/${showId}/season/${seasonNumber}`;

  const heroBackgroundStyle = useMemo(() => {
    if (!heroBgPath) return null;
    const url = `https://image.tmdb.org/t/p/original${heroBgPath}`;
    return { backgroundImage: `url(${url})` };
  }, [heroBgPath]);

  // evita "null votes" + si TMDb no trae vote_count para temporada, lo estimamos sumando votos de episodios
  const tmdbVotesSeason = useMemo(() => {
    const direct =
      typeof season?.vote_count === "number" ? season.vote_count : null;
    if (direct && direct > 0) return direct;

    const sum = episodes.reduce((acc, ep) => {
      const v = typeof ep?.vote_count === "number" ? ep.vote_count : 0;
      return acc + v;
    }, 0);

    return sum > 0 ? sum : null;
  }, [season?.vote_count, episodes]);

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
  const [watchedBusy, setWatchedBusy] = useState(false);
  const [traktEpisodesOpen, setTraktEpisodesOpen] = useState(false);
  const [platformsOpen, setPlatformsOpen] = useState(false);
  const [episodeBusyKey, setEpisodeBusyKey] = useState("");

  // Ref para optimistic updates del modal
  const watchedBySeasonRef = useRef(watchedBySeason);
  watchedBySeasonRef.current = watchedBySeason;

  const [trakt, setTrakt] = useState(() => {
    const seasonEpisodes = getSeasonWatchedEpisodes(
      initialWatchedBySeason,
      seasonNumber,
    );
    const watchedEpisodes = new Set(
      seasonEpisodes
        .map((episodeNumber) => Number(episodeNumber))
        .filter((episodeNumber) => Number.isFinite(episodeNumber)),
    ).size;
    return {
      loading: false,
      connected: hasInitialShowWatched
        ? initialShowWatched?.connected !== false
        : false,
      found: hasInitialShowWatched
        ? initialShowWatched?.found !== false
        : false,
      traktId: initialShowWatched?.traktId ?? null,
      watched: watchedEpisodes > 0,
      error: "",
    };
  });

  useEffect(() => {
    setTScoreboard(parsedInitialScoreboard || defaultScoreboard);
  }, [parsedInitialScoreboard, defaultScoreboard, showId, seasonNumber]);

  useEffect(() => {
    const key = `${showId}:${seasonNumber}`;
    if (parsedInitialScoreboard && initialScoreboardHasStats) {
      seasonScoreboardCache.set(key, initialScoreboard);
    }
  }, [
    showId,
    seasonNumber,
    parsedInitialScoreboard,
    initialScoreboard,
    initialScoreboardHasStats,
  ]);

  useEffect(() => {
    setImdbData(imdb || null);
  }, [imdb, showId, seasonNumber]);

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
      traktId: initialShowWatched?.traktId ?? null,
      watched: false,
      error: "",
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
            traktId: cached?.traktId ?? null,
            watched: false,
            error: "",
          };
        }
      } catch {}
    }

    const seasonEpisodes = getSeasonWatchedEpisodes(
      nextWatchedBySeason,
      seasonNumber,
    );
    const watchedEpisodes = new Set(
      seasonEpisodes
        .map((episodeNumber) => Number(episodeNumber))
        .filter((episodeNumber) => Number.isFinite(episodeNumber)),
    ).size;

    traktRequestIdRef.current += 1;
    setWatchedBySeason(nextWatchedBySeason || {});
    setWatchedBySeasonLoaded(nextLoaded);
    setTrakt({
      ...nextTrakt,
      watched: watchedEpisodes > 0,
    });
  }, [
    showId,
    seasonNumber,
    initialShowWatched,
    initialWatchedBySeason,
    hasInitialShowWatched,
    traktShowWatchedStorageKey,
  ]);

  const seasonWatchedEpisodes = useMemo(() => {
    const uniqueEpisodes = new Set(
      getSeasonWatchedEpisodes(watchedBySeason, seasonNumber)
        .map((episodeNumber) => Number(episodeNumber))
        .filter((episodeNumber) => Number.isFinite(episodeNumber)),
    );
    return uniqueEpisodes.size;
  }, [watchedBySeason, seasonNumber]);

  const seasonProgressPct = useMemo(() => {
    if (!totalEp || seasonWatchedEpisodes <= 0) return null;
    return Math.min(
      100,
      Math.round((seasonWatchedEpisodes / Math.max(totalEp, 1)) * 100),
    );
  }, [seasonWatchedEpisodes, totalEp]);

  const seasonFullyWatched =
    totalEp > 0 && seasonWatchedEpisodes >= Math.max(totalEp, 1);
  const seasonButtonWatched =
    seasonFullyWatched || seasonWatchedEpisodes > 0 || !!trakt.watched;
  const seasonProgressBadge =
    seasonProgressPct != null ? `${seasonProgressPct}%` : null;

  const applyShowWatchedPayload = useCallback(
    (payload) => {
      const nextWatchedBySeason =
        normalizeWatchedBySeason(payload?.watchedBySeason) || {};
      const seasonEpisodes = getSeasonWatchedEpisodes(
        nextWatchedBySeason,
        seasonNumber,
      );
      const watchedEpisodes = new Set(
        seasonEpisodes
          .map((episodeNumber) => Number(episodeNumber))
          .filter((episodeNumber) => Number.isFinite(episodeNumber)),
      ).size;

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
        traktId: payload?.traktId ?? prev.traktId ?? null,
        watched: watchedEpisodes > 0,
        error: "",
      }));

      return watchedEpisodes > 0;
    },
    [seasonNumber],
  );

  const reloadSeasonTraktState = useCallback(
    async ({ background = false } = {}) => {
      const requestId = traktRequestIdRef.current + 1;
      traktRequestIdRef.current = requestId;

      setTrakt((prev) => ({
        ...prev,
        loading: background ? prev.loading : true,
        error: "",
      }));

      try {
        const watchedRes = await traktGetShowWatched({
          tmdbId: Number(showId),
        });
        if (requestId !== traktRequestIdRef.current) return null;

        setTraktConnected(watchedRes?.connected !== false);
        applyShowWatchedPayload({
          connected: watchedRes?.connected !== false,
          found: watchedRes?.found !== false,
          traktId: watchedRes?.traktId ?? null,
          watchedBySeason: watchedRes?.watchedBySeason,
        });
        return watchedRes;
      } catch (error) {
        if (requestId !== traktRequestIdRef.current) return null;

        const isTransient =
          error?.code === "TRAKT_TRANSIENT" ||
          /timeout|rate limit|tempor|aborted|fetch|network/i.test(
            error?.message || "",
          );

        let nextState = null;
        setTrakt((prev) => {
          nextState = {
            ...prev,
            loading: false,
            connected: isTransient ? prev.connected : false,
            error: isTransient ? "" : error?.message || "Error",
          };
          return nextState;
        });

        if (!isTransient) setTraktConnected(false);
        return nextState;
      }
    },
    [applyShowWatchedPayload, showId],
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
    const key = `${showId}:${showImdbId}:${seasonNumber}`;
    if (imdb && showImdbId) {
      seasonImdbCache.set(key, imdb);
    }
  }, [showId, showImdbId, seasonNumber, imdb]);

  const traktDecimal = useMemo(() => {
    if (tScoreboard.rating == null) return null;
    const v = Number(tScoreboard.rating); // Trakt ya viene 0..10
    if (!Number.isFinite(v) || v <= 0) return null;
    return v.toFixed(1); // punto
  }, [tScoreboard.rating]);

  useEffect(() => {
    if (initialScoreboardHasStats) return;

    let alive = true;
    const controller = new AbortController();
    const cancelSchedule = scheduleAfterFirstPaint(async () => {
      try {
        let json = await fetchSeasonScoreboardCached({
          showId,
          seasonNumber,
          signal: controller.signal,
        });
        if (!alive) return;

        const parsed = parseScoreboardData(json);
        const hasStats = hasNumericScoreboardStats(parsed?.stats);

        if (!hasStats) {
          const statsOnly = await fetchSeasonStatsCached({
            showId,
            seasonNumber,
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
    initialScoreboardHasStats,
    parseScoreboardData,
    hasNumericScoreboardStats,
    defaultScoreboard,
  ]);

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
        nextImdb = getSeriesGraphSeasonAggregate({
          ratings: seriesGraphRatings,
          seasonNumber,
          tmdbSeasons: show?.seasons,
          showId,
          title: showName,
        });

        if (nextImdb?.rating == null && showImdbId) {
          nextImdb = await fetchSeasonImdbCached({
            showId,
            showImdbId,
            seasonNumber,
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
  }, [showId, showImdbId, seasonNumber, imdb, showName, show?.seasons]);

  // Rate (Trakt)
  const [userRating, setUserRating] = useState(null);
  const [ratingLoading, setRatingLoading] = useState(false);
  const [traktConnected, setTraktConnected] = useState(true);

  useEffect(() => {
    setTraktConnected((prev) => (trakt.connected ? true : prev));
  }, [trakt.connected]);

  // cargar rating actual del usuario al entrar
  useEffect(() => {
    let alive = true;
    const controller = new AbortController();
    const cancelSchedule = scheduleAfterFirstPaint(async () => {
      try {
        const res = await fetch(
          `/api/trakt/ratings?type=season&tmdbId=${Number(showId)}&season=${Number(seasonNumber)}`,
          {
            cache: "no-store",
            signal: controller.signal,
          },
        );

        if (!alive) return;

        if (res.status === 401) {
          setTraktConnected(false);
          setUserRating(null);
          return;
        }

        setTraktConnected(true);
        const json = await res.json().catch(() => ({}));
        setUserRating(typeof json?.rating === "number" ? json.rating : null);
      } catch (e) {
        if (e?.name === "AbortError") return;
        console.error(e);
        if (alive) {
          // si falla la carga, no rompemos UI
          setUserRating(null);
        }
      } finally {
        if (alive) setRatingLoading(false);
      }
    }, 160);

    return () => {
      alive = false;
      controller.abort();
      cancelSchedule();
    };
  }, [showId, seasonNumber]);

  const handleRate = useCallback(
    async (val) => {
      try {
        setRatingLoading(true);

        const res = await offlineMutationFetch(
          "/api/trakt/ratings",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              type: "season",
              tmdbId: Number(showId),
              season: Number(seasonNumber),
              rating: val ?? null,
            }),
          },
          {
            label:
              val == null
                ? "Quitar valoracion de temporada"
                : "Guardar valoracion de temporada",
            dedupeKey: `trakt:season-rating:${showId}:${seasonNumber}`,
          },
        );

        if (res.status === 401) {
          window.location.href = `/login?next=/details/tv/${showId}/season/${seasonNumber}`;
          return false;
        }

        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json?.error || "Trakt rating failed");

        setUserRating(val ?? null);
        setTraktConnected(true);
        return true;
      } catch (e) {
        console.error(e);
        return false;
      } finally {
        setRatingLoading(false);
      }
    },
    [showId, seasonNumber],
  );

  useEffect(() => {
    const hasBootstrap = hasInitialShowWatched;
    const timer = window.setTimeout(
      () => {
        void reloadSeasonTraktState({ background: true });
      },
      hasBootstrap ? 2500 : 900,
    );

    return () => window.clearTimeout(timer);
  }, [reloadSeasonTraktState, hasInitialShowWatched]);

  useEffect(() => {
    let cancelled = false;
    const timers = [];
    let ignoreFirstPageShow = true;

    const syncSeasonTraktState = async ({ force = false } = {}) => {
      if (!force && watchedBusy) return;
      const latest = await reloadSeasonTraktState({ background: true });
      if (cancelled) return;
      if (latest?.connected) setTraktConnected(true);
    };

    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        void syncSeasonTraktState();
      }
    };
    const handlePageShow = () => {
      if (ignoreFirstPageShow) {
        ignoreFirstPageShow = false;
        return;
      }
      void syncSeasonTraktState();
    };

    window.addEventListener("focus", syncSeasonTraktState);
    window.addEventListener("pageshow", handlePageShow);
    document.addEventListener("visibilitychange", handleVisibility);

    if (trakt.loading) {
      [900, 2200].forEach((delay) => {
        const timer = window.setTimeout(() => {
          void syncSeasonTraktState({ force: true });
        }, delay);
        timers.push(timer);
      });
    }

    return () => {
      cancelled = true;
      timers.forEach((timer) => window.clearTimeout(timer));
      window.removeEventListener("focus", syncSeasonTraktState);
      window.removeEventListener("pageshow", handlePageShow);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [
    reloadSeasonTraktState,
    trakt.loading,
    trakt.connected,
    trakt.error,
    watchedBusy,
  ]);

  const toggleSeasonWatched = useCallback(
    async (watchedAt) => {
      if (trakt.loading || watchedBusy || Number(seasonNumber) <= 0) return;

      let connected = !!trakt.connected;
      if (!connected) {
        const latest = await reloadSeasonTraktState();
        connected = !!latest?.connected;
      }

      if (!connected) {
        window.location.href = `/login?next=/details/tv/${showId}/season/${seasonNumber}`;
        return;
      }

      const nextWatched =
        watchedAt !== undefined ? watchedAt !== null : !seasonFullyWatched;
      setWatchedBusy(true);

      try {
        const res = await traktSetSeasonWatched({
          tmdbId: Number(showId),
          season: Number(seasonNumber),
          watched: nextWatched,
          watchedAt: watchedAt || undefined,
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
      } catch (error) {
        const needsReauth = /401|unauthorized/i.test(error?.message || "");
        if (needsReauth) {
          window.location.href = `/login?next=/details/tv/${showId}/season/${seasonNumber}`;
          return;
        }
        await reloadSeasonTraktState({ background: true });
      } finally {
        setWatchedBusy(false);
      }
    },
    [
      trakt.loading,
      trakt.connected,
      trakt.traktId,
      watchedBusy,
      seasonFullyWatched,
      seasonNumber,
      reloadSeasonTraktState,
      showId,
      applyShowWatchedPayload,
    ],
  );

  // Toggle individual episode watched (para el modal)
  const toggleEpisodeWatched = useCallback(
    async (sn, en) => {
      if (!trakt?.connected) return;
      if (episodeBusyKey) return;

      const key = `S${sn}E${en}`;
      setEpisodeBusyKey(key);

      const currentlyWatched = !!watchedBySeasonRef.current?.[sn]?.includes(en);
      const next = !currentlyWatched;

      // Optimistic update
      const optimistic = { ...watchedBySeasonRef.current };
      const episodes = new Set(optimistic?.[sn] || []);
      if (next) episodes.add(en);
      else episodes.delete(en);
      optimistic[sn] = Array.from(episodes).sort((a, b) => a - b);
      setWatchedBySeason(optimistic);

      try {
        const r = await traktSetEpisodeWatched({
          tmdbId: Number(showId),
          season: sn,
          episode: en,
          watched: next,
          watchedAt: null,
          title: showName,
        });
        invalidateTraktGetCache({
          tmdbId: Number(showId),
          traktId: trakt.traktId ?? undefined,
        });

        if (r?.watchedBySeason) {
          setWatchedBySeason(normalizeWatchedBySeason(r.watchedBySeason) || {});
        } else {
          const fresh = await traktGetShowWatched({ tmdbId: Number(showId) });
          setWatchedBySeason(
            normalizeWatchedBySeason(fresh?.watchedBySeason) || {},
          );
        }
      } catch {
        // Rollback
        setWatchedBySeason(watchedBySeasonRef.current);
      } finally {
        setEpisodeBusyKey("");
      }
    },
    [trakt?.connected, trakt.traktId, episodeBusyKey, showId, showName],
  );

  const prefetchEpisodeDetails = useCallback(
    (epNum) => {
      const href = `/details/tv/${showId}/season/${seasonNumber}/episode/${epNum}`;
      router.prefetch(href);
      if (typeof window !== "undefined") {
        fetch(href, { priority: "low" }).catch(() => {});
      }
    },
    [router, showId, seasonNumber],
  );

  return (
    <div className="relative min-h-screen bg-[#101010] text-gray-100 font-sans selection:bg-yellow-500/30">
      {/* Background */}
      <div className="fixed inset-0 z-0 overflow-hidden bg-[#0a0a0a] pointer-events-none">
        {heroBackgroundStyle ? (
          <>
            {/* Capa base: siempre cubre (evita marcos laterales) */}
            <div
              className="absolute inset-0 bg-cover bg-center transition-opacity duration-500"
              style={{
                ...heroBackgroundStyle,
                transform: "scale(1)",
                filter: "brightness(0.75) saturate(1.03)",
              }}
            />
            {/* Capa detalle: posicionamiento superior */}
            <div
              className="absolute inset-0 bg-cover transition-opacity duration-500"
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
        <div className="absolute inset-0 bg-gradient-to-t from-[#101010] via-[#101010]/60 to-black/20" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#101010] via-transparent to-transparent opacity-30" />
      </div>

      {/* Content */}
      <div className="relative z-10 px-4 py-8 lg:py-12 max-w-7xl mx-auto">
        {/* Hero */}
        <motion.div
          // El hero contiene el marcador y el menú de secciones liquid glass.
          // No debe montar primero desplazado y aplicar el cristal al terminar:
          // DetailsClient los muestra completos desde el primer frame.
          initial={false}
          animate={{ y: 0 }}
          transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
          className="flex flex-col lg:flex-row gap-8 lg:gap-12 mb-10 items-start transform-gpu"
        >
          {/* Left poster */}
          <motion.div
            initial={{ opacity: 0, x: -20, scale: 0.985 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            transition={{ duration: 0.48, ease: [0.22, 1, 0.36, 1] }}
            className="w-full max-w-[280px] lg:max-w-[320px] mx-auto lg:mx-0 flex-shrink-0 flex flex-col gap-5 relative z-10"
          >
            <AnimatedPosterFrame
              src={
                posterPath
                  ? `https://image.tmdb.org/t/p/w780${posterPath}`
                  : null
              }
              alt={seasonName}
              aspect="poster"
              overlay={
                <StreamingHoverOverlay
                  provider={seasonPrimaryProvider}
                  watched={trakt.watched}
                  part="visual"
                />
              }
              hitLayer={
                <StreamingHoverOverlay
                  provider={seasonPrimaryProvider}
                  part="hit"
                />
              }
            />

            {/* En la vista normal las plataformas acompañan al póster, como en
                la ficha principal. En móvil se accede a ellas desde el modal
                para conservar el hero compacto. */}
            {seasonPlatformItems.length > 0 ? (
              <StaggerContainer
                className="hidden w-full flex-wrap items-center justify-center gap-3 px-1 py-1 sm:flex"
                staggerDelay={0.05}
              >
                {seasonPlatformItems.map((provider, index) => (
                  <motion.a
                    key={provider.key ?? `${provider.title}-${index}`}
                    href={provider.href}
                    initial={{ opacity: 0, y: 10, scale: 0.96 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{
                      duration: 0.28,
                      delay: 0.03 + index * 0.04,
                      ease: [0.22, 1, 0.36, 1],
                    }}
                    target={provider.target}
                    rel={provider.rel}
                    aria-label={provider.title}
                    className="group/provider relative flex-shrink-0 cursor-pointer transition-transform hover:z-10 hover:scale-110 hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-yellow-400"
                  >
                    <StreamingProviderLogo
                      provider={provider}
                      onError={(event) => {
                        event.currentTarget.style.visibility = "hidden";
                      }}
                    />
                    <span className="pointer-events-none absolute left-1/2 top-full z-[100] mt-2 -translate-x-1/2 scale-95 whitespace-nowrap rounded-lg border border-white/10 bg-black/90 px-2.5 py-1 text-[10px] font-bold text-white opacity-0 shadow-xl transition-all duration-200 ease-out group-hover/provider:scale-100 group-hover/provider:opacity-100 group-hover/provider:delay-[2000ms]">
                      {provider.subtitle || provider.title}
                    </span>
                  </motion.a>
                ))}
              </StaggerContainer>
            ) : null}
          </motion.div>

          {/* Right info + SCOREBOARD + TABS */}
          <div
            // Un fundido aquí haría que el ancestro del marcador tuviese
            // `opacity < 1`, anulando su backdrop-filter hasta que terminase.
            // La entrada vertical del hero ya aporta movimiento sin retrasar el
            // cristal, igual que DetailsClient.
            className="flex-1 flex flex-col min-w-0 w-full"
          >
            <div className="mb-4 px-1 flex flex-col items-center lg:items-start text-center lg:text-left w-full">
              <div className="mb-2 flex items-center justify-center lg:justify-start gap-2 text-xs font-bold uppercase tracking-widest text-zinc-400">
                <Layers className="w-4 h-4" />
                <span>Serie</span>
              </div>

              <h1 className="mb-0 text-4xl font-black leading-[1] tracking-tight text-balance text-white drop-shadow-xl md:text-5xl lg:text-6xl">
                {seasonName}
              </h1>
            </div>

            <div className="mb-6 px-1">
              <SubrouteDetailsActionRow
                onBack={() => router.back()}
                seriesHref={`/details/tv/${showId}`}
                trakt={
                  Number(seasonNumber) > 0
                    ? {
                        connected: trakt.connected,
                        watched: seasonButtonWatched,
                        plays: null,
                        badge: seasonProgressBadge,
                        busy: watchedBusy,
                        loading: trakt.loading && !watchedBySeasonLoaded,
                        onOpen: () => setTraktEpisodesOpen(true),
                      }
                    : null
                }
                rate={{
                  rating: userRating,
                  loading: ratingLoading,
                  connected: traktConnected,
                  onConnect: () =>
                    (window.location.href = `/login?next=/details/tv/${showId}/season/${seasonNumber}`),
                  onRate: handleRate,
                  onClear: () => handleRate(null),
                  min: 1,
                  max: 10,
                  step: 1,
                }}
              />
            </div>

            {/* SCOREBOARD */}
            <DetailsScoreboardPanel
              className="mb-6"
              loading={tScoreboard.loading}
              tmdb={{
                value: seasonVote?.toFixed(1),
                sub: tmdbVotesSeason
                  ? formatCountShort(tmdbVotesSeason)
                  : undefined,
                href: tmdbSeasonUrl,
              }}
              trakt={{
                value: traktDecimal || undefined,
                sub: tScoreboard.votes
                  ? formatCountShort(tScoreboard.votes)
                  : undefined,
                href: buildTraktHref({
                  href: tScoreboard.traktUrl,
                  type: "tv",
                  tmdbId: showId,
                }),
              }}
              imdb={{
                value:
                  imdbData?.rating != null
                    ? Number(imdbData.rating).toFixed(1)
                    : undefined,
                sub: imdbData?.votes
                  ? formatCountShort(imdbData.votes)
                  : undefined,
                href: buildImdbHref({ href: imdbUrl, title: showName }),
              }}
              stats={tScoreboard?.stats}
              showFavoritedStat={false}
              onMorePlatforms={() => setPlatformsOpen(true)}
              share={{
                title: seasonName,
                text: `Echa un vistazo a ${seasonName} de ${showName} en The Show Verse`,
              }}
            />

            <div className="sm:hidden">
              <DetailsInfoTabs
                layoutId="seasonTabInlineMobile"
                enableMobileTabSwipe
                mediaType="tv"
                overview={season?.overview}
                creators={showCreators}
                network={showNetwork}
                productionText={seasonProduction}
                showPlatformsTab={false}
                externalLinks={seasonExternalLinks}
                showExternalLinksTab
                showAwardsTab={false}
                detailCards={seasonDetailCards}
              />
            </div>

            <div className="hidden sm:block">
              <DetailsInfoTabs
                layoutId="seasonTabInline"
                mediaType="tv"
                overview={season?.overview}
                creators={showCreators}
                network={showNetwork}
                productionText={seasonProduction}
                showPlatformsTab={false}
                showAwardsTab={false}
                detailCards={seasonDetailCards}
              />
            </div>
          </div>
        </motion.div>

        {/* Episodes */}
        <AnimatedSection
          className="mb-12 group/section"
          delay={0.04}
          renderImmediately
        >
          {/* Header con toggle (mismo estilo SectionTitle) */}
          <div className="flex items-center justify-between gap-4 mb-8 w-full">
            <div className="flex items-center gap-3 sm:gap-4 flex-1 min-w-0 pr-4 sm:pr-6">
              <div className="relative flex items-center justify-center w-11 h-11 sm:w-12 sm:h-12 rounded-[14px] bg-yellow-500/5 backdrop-blur-2xl shadow-[0_4px_24px_rgba(234,179,8,0.12)] shrink-0 overflow-hidden group-hover/section:bg-yellow-500/10 group-hover/section:shadow-[0_8px_32px_rgba(234,179,8,0.2)] transition-all duration-500">
                <div className="absolute inset-0 bg-gradient-to-br from-yellow-400/20 via-transparent to-transparent opacity-60" />
                <div className="absolute inset-0 shadow-[inset_0_1px_2px_rgba(255,255,255,0.15),inset_0_-1px_2px_rgba(0,0,0,0.2)] rounded-[14px] pointer-events-none" />
                <Layers className="relative z-10 w-5 h-5 sm:w-6 sm:h-6 text-yellow-500 group-hover/section:text-yellow-400 group-hover/section:scale-110 transition-all duration-500 drop-shadow-[0_2px_8px_rgba(234,179,8,0.4)]" />
              </div>
              <h2 className="text-2xl sm:text-[28px] font-black tracking-tight text-white drop-shadow-md shrink-0">
                Episodios
              </h2>
              <div className="ml-2 sm:ml-4 flex-1 h-px bg-gradient-to-r from-white/20 via-white/5 to-transparent relative flex items-center">
                <div className="absolute left-0 w-2 h-2 rounded-full bg-yellow-500 shadow-[0_0_12px_rgba(234,179,8,1)] opacity-40 group-hover/section:opacity-100 group-hover/section:scale-150 transition-all duration-500" />
                <div className="absolute left-0 w-16 sm:w-24 h-[2px] bg-gradient-to-r from-yellow-500 to-transparent opacity-0 group-hover/section:opacity-100 transition-opacity duration-500" />
              </div>
            </div>

            <div className="flex items-center gap-1 rounded-full border border-white/10 bg-white/5 p-1 shrink-0">
              <button
                type="button"
                onClick={() => setEpisodesView("list")}
                className={[
                  "h-9 w-9 rounded-full grid place-items-center transition",
                  episodesView === "list"
                    ? "bg-white/10 text-white"
                    : "text-zinc-400 hover:text-white hover:bg-white/10",
                ].join(" ")}
                title="Vista lista"
                aria-pressed={episodesView === "list"}
              >
                <AlignJustify className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={() => setEpisodesView("grid")}
                className={[
                  "h-9 w-9 rounded-full grid place-items-center transition",
                  episodesView === "grid"
                    ? "bg-white/10 text-white"
                    : "text-zinc-400 hover:text-white hover:bg-white/10",
                ].join(" ")}
                title="Vista grid"
                aria-pressed={episodesView === "grid"}
              >
                <LayoutGrid className="w-4 h-4" />
              </button>
            </div>
          </div>

          {episodes.length === 0 ? (
            <div className="mt-2 text-sm text-zinc-400">
              No hay episodios disponibles para esta temporada.
            </div>
          ) : (
            <>
              {/* ======================= */}
              {/* VISTA LISTA (sin TMDb badge) */}
              {/* ======================= */}
              {episodesView === "list" && (
                <div className="mt-2 space-y-4">
                  {episodes.map((ep) => {
                    const epNum = Number(ep?.episode_number);
                    const epTitle = ep?.name || `Episodio ${epNum}`;
                    const epAir = ep?.air_date
                      ? formatDateEs(ep.air_date)
                      : null;
                    const epRuntime = Number(ep?.runtime || 0) || null;
                    const still = ep?.still_path || null;
                    const href = `/details/tv/${showId}/season/${seasonNumber}/episode/${epNum}`;

                    return (
                      <Link
                        key={`${seasonNumber}-${epNum}`}
                        href={href}
                        onMouseEnter={() => prefetchEpisodeDetails(epNum)}
                        onFocus={() => prefetchEpisodeDetails(epNum)}
                        onTouchStart={() => prefetchEpisodeDetails(epNum)}
                        // MISMO CRISTAL QUE LOS PANELES DE LA FICHA. Antes era
                        // una copia a mano del acabado —`bg-zinc-900/20` con
                        // `backdrop-blur-2xl` (64px), sin saturar ni realzar, y
                        // dos capas propias de degradado y reflejo—, que es la
                        // deriva que las constantes existen para impedir. Con
                        // 64px de desenfoque y ese velo no pasaba color del
                        // fondo: se leía como una placa gris, no como vidrio.
                        //
                        // Se usa `LIQUID_GLASS_CARD` y NO el `LIQUID_GLASS_BAR`
                        // del ScoreboardPanel a propósito: es la variante SIN
                        // SOMBRA, pensada justo para tarjetas en grupo. Los
                        // episodios van apilados y, con la sombra de la barra,
                        // las de cada tarjeta se solapan y forman una banda
                        // oscura detrás de toda la lista (ver liquidGlass.js).
                        className={`group relative isolate block rounded-2xl ${LIQUID_GLASS_CARD} transition-all duration-500 overflow-hidden hover:bg-white/[0.06]`}
                      >
                        {/* Refracción del canto, especular y luz superior: las
                            mismas que pinta el ScoreboardPanel. */}
                        <LiquidGlassOpticalLayers />

                        <div className="relative z-10 flex flex-col sm:flex-row gap-4 p-4">
                          {/* Still */}
                          <div className="relative w-full sm:w-[280px] aspect-video sm:aspect-[16/9] rounded-xl overflow-hidden bg-black/40 shadow-[inset_0_1px_2px_rgba(255,255,255,0.1),inset_0_-1px_2px_rgba(0,0,0,0.3)] shrink-0">
                            {still ? (
                              <OptimizedImage
                                src={`https://image.tmdb.org/t/p/w780${still}`}
                                alt={epTitle}
                                className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                                loading="lazy"
                                decoding="async"
                              />
                            ) : (
                              <div className="absolute inset-0 flex items-center justify-center opacity-60">
                                <ImageOff className="w-7 h-7 text-zinc-500" />
                              </div>
                            )}

                            {/* ❌ eliminado: badge "TMDb X.X" */}
                          </div>

                          {/* Info */}
                          <div className="min-w-0 flex-1">
                            <div className="text-xs font-bold uppercase tracking-widest text-zinc-500">
                              Episodio {epNum}
                            </div>

                            <div className="mt-1 flex items-start justify-between gap-3">
                              <h3 className="text-lg font-extrabold text-white leading-tight line-clamp-1">
                                {epTitle}
                              </h3>
                            </div>

                            <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-zinc-400">
                              {epAir ? (
                                <span className="inline-flex items-center gap-2">
                                  <CalendarIcon className="w-4 h-4" /> {epAir}
                                </span>
                              ) : null}

                              {epRuntime ? (
                                <span className="inline-flex items-center gap-2">
                                  <ClockIcon className="w-4 h-4" /> {epRuntime}{" "}
                                  min
                                </span>
                              ) : null}
                            </div>

                            <p className="mt-3 text-sm leading-relaxed text-zinc-300 line-clamp-2">
                              {ep?.overview?.trim() || "Sin descripción."}
                            </p>
                          </div>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              )}

              {/* ======================= */}
              {/* VISTA GRID (hover overlay) */}
              {/* ======================= */}
              {episodesView === "grid" && (
                <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                  {episodes.map((ep) => {
                    const epNum = Number(ep?.episode_number);
                    const epTitle = ep?.name || `Episodio ${epNum}`;
                    const epAir = ep?.air_date
                      ? formatDateEs(ep.air_date)
                      : null;
                    const epRuntime = Number(ep?.runtime || 0) || null;
                    const still = ep?.still_path || null;
                    const href = `/details/tv/${showId}/season/${seasonNumber}/episode/${epNum}`;

                    return (
                      <Link
                        key={`grid-${seasonNumber}-${epNum}`}
                        href={href}
                        onMouseEnter={() => prefetchEpisodeDetails(epNum)}
                        onFocus={() => prefetchEpisodeDetails(epNum)}
                        onTouchStart={() => prefetchEpisodeDetails(epNum)}
                        className="block group relative bg-zinc-900 rounded-xl overflow-hidden shadow-md lg:hover:shadow-yellow-900/20 transition-all duration-300 after:pointer-events-none after:absolute after:inset-0 after:z-30 after:rounded-[inherit] after:content-[''] after:transition-shadow after:duration-300 hover:after:shadow-[inset_0_0_0_2.5px_rgba(234,179,8,0.95)]"
                        title={epTitle}
                      >
                        <div className="relative aspect-video overflow-hidden">
                          {still ? (
                            <OptimizedImage
                              src={`https://image.tmdb.org/t/p/w780${still}`}
                              alt={epTitle}
                              className="w-full h-full object-cover transition-transform duration-500 ease-out group-hover:scale-110 grayscale-[15%] group-hover:grayscale-0"
                              loading="lazy"
                              decoding="async"
                            />
                          ) : (
                            <div className="w-full h-full bg-neutral-800 flex items-center justify-center text-neutral-500 transition-colors duration-500 group-hover:bg-neutral-700">
                              <ImageOff className="w-7 h-7 text-zinc-500" />
                            </div>
                          )}

                          <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent opacity-80 transition-opacity duration-500 group-hover:opacity-100" />

                          <div className="absolute bottom-0 left-0 right-0 p-3 pb-4 transition-transform duration-500 ease-out translate-y-2 group-hover:translate-y-0">
                            <div className="text-[10px] sm:text-xs font-semibold leading-tight text-zinc-300 group-hover:text-yellow-400 transition-colors duration-300 drop-shadow-sm">
                              Episodio {epNum}
                            </div>

                            <p className="mt-0.5 text-white font-extrabold text-xs sm:text-sm leading-tight line-clamp-1 drop-shadow-sm">
                              {epTitle}
                            </p>

                            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-zinc-300 drop-shadow-sm">
                              {epAir ? (
                                <span className="inline-flex items-center gap-1">
                                  <CalendarIcon className="w-3.5 h-3.5" />{" "}
                                  {epAir}
                                </span>
                              ) : null}

                              {epRuntime ? (
                                <span className="inline-flex items-center gap-1">
                                  <ClockIcon className="w-3.5 h-3.5" />{" "}
                                  {epRuntime} min
                                </span>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </AnimatedSection>
      </div>

      {/* Modal de episodios — solo la temporada actual */}
      <TraktEpisodesWatchedModal
        open={traktEpisodesOpen}
        onClose={() => {
          setTraktEpisodesOpen(false);
          setEpisodeBusyKey("");
          void reloadSeasonTraktState({ background: true });
        }}
        mediaType="tv"
        tmdbId={Number(showId)}
        title={showName}
        connected={!!trakt?.connected}
        seasons={[{ season_number: Number(seasonNumber) }]}
        watchedBySeason={watchedBySeason}
        busyKey={episodeBusyKey}
        onToggleEpisodeWatched={toggleEpisodeWatched}
        onToggleShowWatched={toggleSeasonWatched}
      />

      <ExternalLinksModal
        open={platformsOpen}
        onClose={() => setPlatformsOpen(false)}
        links={seasonPlatformItems}
        mode="platforms"
      />
    </div>
  );
}
