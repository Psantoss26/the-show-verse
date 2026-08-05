// src/app/watchlist/WatchlistClient.jsx
"use client";
import { fetchTmdbImages } from "@/lib/tmdb/imageRequests";

import OptimizedImage from "@/components/OptimizedImage";
import {
  useEffect,
  useLayoutEffect,
  useState,
  useMemo,
  useRef,
  useCallback,
  startTransition,
  memo,
} from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { useAuth } from "@/context/AuthContext";
import { useTranslation } from "@/lib/i18n";
import { getWatchProviders } from "@/lib/api/tmdb";
import { traktGetScoreboard } from "@/lib/api/traktClient";
import {
  Bookmark,
  Film,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  ArrowUpDown,
  Grid2X2,
  LayoutGrid,
  List,
  Search,
  Star,
  X,
  Filter,
  SlidersHorizontal,
  Layers3,
  MoreHorizontal,
  RotateCcw,
  LogOut,
  MonitorPlay,
} from "lucide-react";
import LiquidButton from "@/components/LiquidButton";
import { useHydrationReady } from "@/lib/hooks/useHydrationReady";
import {
  useIsHistoryNavigation,
  useBackNavOrderFreeze,
} from "@/lib/hooks/useIsHistoryNavigation";
import { pickResponsiveColumns, estimateVisibleCards } from "@/lib/ui/entranceFill";
import { LIST_CHANGED_EVENT } from "@/lib/userLists/optimisticListCache";
import { readCachedUserId } from "@/lib/auth/currentUser";
import {
  mergePendingTmdbListItems,
  prunePendingListChanges,
} from "@/lib/userLists/pendingListAdditions";
import {
  resolveUserListInitialSnapshot,
  shouldPreserveAddedOrderSnapshot,
  reconcileAddedOrderSnapshot,
  userListItemKey,
} from "@/lib/userLists/backNavigationSnapshot";
import {
  isServerUnavailable,
  isUnavailableStatus,
} from "@/lib/offline/serverError";
import usePreviewOpen from "@/components/preview/usePreviewOpen";
import useStickyToolbarState from "@/hooks/useStickyToolbarState";
import { titleMatchesQuery } from "@/lib/search/titleMatching";
import { TMDB_IMAGE_LANGS_PARAM } from "@/lib/tmdb/imageLanguages";
import { LIQUID_GLASS_PANEL } from "@/lib/ui/liquidGlass";

// ================== UTILS & CACHE ==================

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.05,
    },
  },
};

const cardVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.3, ease: "easeOut" },
  },
};
const WATCHLIST_VIEW_MODES = new Set(["list", "grid", "compact"]);

function readInitialWatchlistViewMode() {
  if (typeof window === "undefined") return "grid";
  const saved = window.localStorage.getItem("showverse:watchlist:viewMode");
  return WATCHLIST_VIEW_MODES.has(saved) ? saved : "grid";
}

const WATCHLIST_INITIAL_RENDER_LIMIT = 24;
const WATCHLIST_RENDER_CHUNK_SIZE = 36;

// Cambiar de modo de vista rehace el interior de TODAS las tarjetas pintadas.
// Con la lista entera en el DOM eso tarda cientos de milisegundos en aplicarse;
// Historial se siente instantáneo porque pinta pocas. Aquí se aplica el modo
// nuevo solo a lo que se ve y el resto vuelve a entrar por tandas en tiempo
// libre, con el mismo mecanismo de la carga inicial. Esto cuenta cuántas
// tarjetas hay que conservar para que no se abra un hueco ni salte el scroll.
function countWatchlistCardsInView() {
  if (typeof document === "undefined") return null;
  const cards = document.querySelectorAll("[data-watchlist-card]");
  if (!cards.length) return null;
  const bottom = window.innerHeight * 1.5;
  let count = 0;
  for (const card of cards) {
    if (card.getBoundingClientRect().top > bottom) break;
    count += 1;
  }
  return count;
}

function scheduleWatchlistRenderChunk(callback) {
  if (typeof window === "undefined") return null;
  if ("requestIdleCallback" in window) {
    return window.requestIdleCallback(callback, { timeout: 220 });
  }
  return window.setTimeout(callback, 48);
}

function cancelWatchlistRenderChunk(handle) {
  if (typeof window === "undefined" || handle == null) return;
  if ("cancelIdleCallback" in window) {
    window.cancelIdleCallback(handle);
    return;
  }
  window.clearTimeout(handle);
}

// TMDb Genre mappings
const MOVIE_GENRES = {
  28: "Acción",
  12: "Aventura",
  16: "Animación",
  35: "Comedia",
  80: "Crimen",
  99: "Documental",
  18: "Drama",
  10751: "Familiar",
  14: "Fantasía",
  36: "Historia",
  27: "Terror",
  10402: "Música",
  9648: "Misterio",
  10749: "Romance",
  878: "Ciencia ficción",
  10770: "Película de TV",
  53: "Suspense",
  10752: "Bélica",
  37: "Western",
};

const TV_GENRES = {
  10759: "Acción y aventura",
  16: "Animación",
  35: "Comedia",
  80: "Crimen",
  99: "Documental",
  18: "Drama",
  10751: "Familiar",
  10762: "Infantil",
  9648: "Misterio",
  10763: "Noticias",
  10764: "Reality",
  10765: "Ciencia ficción y fantasía",
  10766: "Telenovela",
  10767: "Talk show",
  10768: "Bélica y política",
  37: "Western",
};

const posterChoiceCache = new Map();
const posterInFlight = new Map();

const backdropChoiceCache = new Map();
const backdropInFlight = new Map();

// Persistent score cache: recent titles change faster, older titles can stay cached longer.
const SCORE_CACHE_RECENT_WINDOW_MS = 90 * 24 * 60 * 60 * 1000;
const SCORE_CACHE_ACTIVE_WINDOW_MS = 365 * 24 * 60 * 60 * 1000;
const SCORE_CACHE_RECENT_TTL_MS = 12 * 60 * 60 * 1000;
const SCORE_CACHE_ACTIVE_TTL_MS = 3 * 24 * 60 * 60 * 1000;
const SCORE_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const WATCHLIST_CACHE_KEY = "showverse:watchlist:items:v3";
const WATCHLIST_CACHE_TTL_MS = 10 * 60 * 1000;
const IMAGE_CHOICE_CACHE_KEY = "showverse:watchlist:image-choices:v6";
const IMAGE_CHOICE_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const PROVIDER_CACHE_KEY = "showverse:watch-providers:ES:v3";
const PROVIDER_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const PLEX_LIBRARY_INDEX_CACHE_KEY = "showverse:plex-library-index:v1";
const PLEX_LIBRARY_INDEX_CACHE_TTL_MS = 30 * 60 * 1000;

const TARGET_PROVIDER_ORDER = new Map([
  ["netflix", 1],
  ["prime", 2],
  ["hbo-max", 3],
  ["crunchyroll", 4],
  ["movistar", 5],
  ["disney", 6],
  ["plex", 7],
]);

// Persisted in localStorage (survives across sessions) and served
// stale-while-revalidate: cached watchlist paints instantly on the first visit
// of a new session, then a background refresh updates it. A hard age cap drops
// data that is too old to be useful.
const WATCHLIST_CACHE_HARD_MAX_AGE = 1000 * 60 * 60 * 24 * 7; // 7 días

function readWatchlistCache() {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(WATCHLIST_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed?.items)) return null;
    // La caché es GLOBAL (una sola clave). Solo se usa si pertenece a la cuenta
    // ACTUAL: sin esto, al cambiar de usuario la restauración "atrás" pintaba la
    // lista del usuario anterior. Formato viejo sin `owner` → se descarta (una vez).
    const currentUserId = readCachedUserId();
    const owner = parsed.owner != null ? String(parsed.owner) : null;
    if (!currentUserId || owner !== currentUserId) return null;
    const age = Date.now() - Number(parsed.t || 0);
    if (age > WATCHLIST_CACHE_HARD_MAX_AGE) {
      window.localStorage.removeItem(WATCHLIST_CACHE_KEY);
      return null;
    }
    return {
      items: mergePendingTmdbListItems(parsed.items, "watchlist"),
      fresh: age < WATCHLIST_CACHE_TTL_MS,
    };
  } catch {
    return null;
  }
}

function writeWatchlistCache(items) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      WATCHLIST_CACHE_KEY,
      JSON.stringify({
        t: Date.now(),
        owner: readCachedUserId(),
        items: Array.isArray(items) ? items : [],
      }),
    );
  } catch {}
}

function readProvidersCache() {
  if (typeof window === "undefined") return new Map();
  try {
    const raw = window.localStorage.getItem(PROVIDER_CACHE_KEY);
    if (!raw) return new Map();
    const parsed = JSON.parse(raw);
    const now = Date.now();
    const cache = new Map();

    Object.entries(parsed).forEach(([key, entry]) => {
      if (
        Array.isArray(entry?.providers) &&
        entry.t &&
        now - entry.t < PROVIDER_CACHE_TTL_MS
      ) {
        cache.set(key, entry.providers);
      }
    });

    return cache;
  } catch {
    return new Map();
  }
}

function writeProvidersCache(providersMap) {
  if (typeof window === "undefined") return;
  try {
    const now = Date.now();
    const data = {};
    providersMap.forEach((providers, key) => {
      data[key] = {
        providers: Array.isArray(providers) ? providers : [],
        t: now,
      };
    });
    window.localStorage.setItem(PROVIDER_CACHE_KEY, JSON.stringify(data));
  } catch (e) {
    console.warn("Failed to write provider cache:", e);
  }
}

function getItemReleaseTime(item) {
  const date = item?.release_date || item?.first_air_date;
  const time = date ? Date.parse(date) : NaN;
  return Number.isNaN(time) ? null : time;
}

function getScoreCacheTtlForItem(item, now = Date.now()) {
  const releaseTime = getItemReleaseTime(item);
  if (!releaseTime) return SCORE_CACHE_TTL_MS;
  const age = now - releaseTime;
  if (age < SCORE_CACHE_RECENT_WINDOW_MS) return SCORE_CACHE_RECENT_TTL_MS;
  if (age < SCORE_CACHE_ACTIVE_WINDOW_MS) return SCORE_CACHE_ACTIVE_TTL_MS;
  return SCORE_CACHE_TTL_MS;
}

function getWatchlistItemType(item) {
  return item?.media_type || (item?.title ? "movie" : "tv");
}

function getScoreItemKey(item) {
  return item?.id == null ? "" : `${getWatchlistItemType(item)}:${item.id}`;
}

function readScoreCacheEntries(source) {
  if (typeof window === "undefined") return new Map();
  try {
    const key = `showverse:scores:${source}:v2`;
    const raw = window.localStorage.getItem(key);
    if (!raw) return new Map();

    const parsed = JSON.parse(raw);
    const now = Date.now();
    const cache = new Map();

    Object.entries(parsed).forEach(([id, entry]) => {
      if (entry?.t && now - entry.t < SCORE_CACHE_TTL_MS) {
        cache.set(id, { score: entry.score, t: entry.t });
      }
    });

    return cache;
  } catch {
    return new Map();
  }
}

// Cache management for scores
function readScoreCache(source) {
  const entries = readScoreCacheEntries(source);
  const cache = new Map();
  entries.forEach((entry, id) => {
    cache.set(id, entry.score);
  });
  return cache;
}

function shouldRefreshScore(item, entry, now = Date.now()) {
  if (!entry || typeof entry.score !== "number" || Number.isNaN(entry.score)) {
    return true;
  }
  return now - Number(entry.t || 0) >= getScoreCacheTtlForItem(item, now);
}

function writeScoreCache(source, scoresMap, refreshedIds = null) {
  if (typeof window === "undefined") return;
  try {
    const key = `showverse:scores:${source}:v2`;
    const now = Date.now();
    const raw = window.localStorage.getItem(key);
    const previous = raw ? JSON.parse(raw) : {};
    const data = {};

    Object.entries(previous || {}).forEach(([id, entry]) => {
      if (entry?.t && now - entry.t < SCORE_CACHE_TTL_MS) {
        data[id] = entry;
      }
    });

    if (refreshedIds instanceof Set) {
      refreshedIds.forEach((id) => {
        if (scoresMap.has(id)) data[id] = { score: scoresMap.get(id), t: now };
      });
    } else {
      scoresMap.forEach((score, id) => {
        data[id] = { score, t: now };
      });
    }

    window.localStorage.setItem(key, JSON.stringify(data));
  } catch (e) {
    console.warn("Failed to write score cache:", e);
  }
}

function updateScoreCache(source, id, score) {
  if (typeof window === "undefined") return;
  try {
    const key = `showverse:scores:${source}:v2`;
    const raw = window.localStorage.getItem(key);
    const data = raw ? JSON.parse(raw) : {};

    data[id] = { score, t: Date.now() };

    window.localStorage.setItem(key, JSON.stringify(data));
  } catch (e) {
    console.warn("Failed to update score cache:", e);
  }
}

async function fetchImdbScoresForItems(items) {
  const payloadItems = (Array.isArray(items) ? items : [])
    .map((item) => {
      const key = getScoreItemKey(item);
      if (!key) return null;
      return {
        key,
        id: item.id,
        mediaType: getWatchlistItemType(item),
        imdbId: item.imdb_id || item.imdbId || null,
      };
    })
    .filter(Boolean);

  if (!payloadItems.length) return {};

  const res = await fetch("/api/imdb/ratings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ items: payloadItems }),
    cache: "no-store",
  });
  if (!res.ok) return {};

  const json = await res.json().catch(() => null);
  return json?.items && typeof json.items === "object" ? json.items : {};
}

function buildImg(path, size = "w500") {
  return `https://image.tmdb.org/t/p/${size}${path}`;
}

function clampNumber(v) {
  return typeof v === "number" && !Number.isNaN(v) ? v : null;
}

function formatAvg(v) {
  if (typeof v !== "number" || Number.isNaN(v)) return "—";
  const r = Math.round(v * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
}

function normText(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function resolveItemType(item) {
  return item?.media_type || (item?.title ? "movie" : "tv");
}

function getProviderMediaKey(item) {
  return `${resolveItemType(item)}:${item?.id}`;
}

function providerGroupKey(provider) {
  return `provider-${provider?.platform_key ?? normText(provider?.provider_name)}`;
}

const WATCHLIST_GROUP_OPTIONS = [
  { key: "none", label: "Sin agrupar", itemLabel: "Sin agrupar" },
  { key: "year", label: "Año", itemLabel: "Por año" },
  { key: "decade", label: "Década", itemLabel: "Por década" },
  { key: "genre", label: "Género", itemLabel: "Por género" },
  { key: "provider", label: "Plataformas", itemLabel: "Por plataforma" },
  { key: "tmdb_rating", label: "TMDb", itemLabel: "Puntuación TMDb" },
  { key: "imdb_rating", label: "IMDb", itemLabel: "Puntuación IMDb" },
  { key: "trakt_rating", label: "Trakt", itemLabel: "Puntuación Trakt" },
];

function getGroupOptionLabel(key) {
  return (
    WATCHLIST_GROUP_OPTIONS.find((option) => option.key === key)?.label ||
    "Sin agrupar"
  );
}

function getGroupingValueLabel(groupBy, subGroupBy) {
  if (groupBy === "none") return "Sin agrupar";
  const groupLabel = getGroupOptionLabel(groupBy);
  if (!subGroupBy || subGroupBy === "none") return groupLabel;
  return `${groupLabel} / ${getGroupOptionLabel(subGroupBy)}`;
}

function getCompactGroupOptionLabel(key) {
  const labels = {
    none: "Sin",
    year: "Año",
    decade: "Déc",
    genre: "Gén",
    provider: "Plat",
    tmdb_rating: "TMDb",
    imdb_rating: "IMDb",
    trakt_rating: "Trakt",
  };
  return labels[key] || getGroupOptionLabel(key);
}

function getCompactGroupingValueLabel(groupBy, subGroupBy) {
  if (groupBy === "none") return "Sin agr.";
  const groupLabel = getCompactGroupOptionLabel(groupBy);
  if (!subGroupBy || subGroupBy === "none") return groupLabel;
  return `${groupLabel}/${getCompactGroupOptionLabel(subGroupBy)}`;
}

function formatRatingBucketLabel(bucket) {
  return Number.isInteger(bucket) ? `${bucket}` : bucket.toFixed(1);
}

function ratingRangeMeta(rating, emptyKey, emptyLabel, step = 0.5, offset = 0) {
  const numericRating = Number(rating);
  if ((!Number.isFinite(numericRating) || numericRating <= 0) && emptyKey) {
    return { key: emptyKey, label: emptyLabel };
  }
  const normalized = Math.max(0, Math.min(10, numericRating || 0));
  const maxBucket = Math.max(0, 10 - step + offset);
  const rawBucket =
    Math.floor((normalized - offset + Number.EPSILON) / step) * step + offset;
  const bucket =
    Math.round(Math.max(0, Math.min(maxBucket, rawBucket)) * 10) / 10;
  const next = Math.min(10, bucket + step);
  return {
    key: bucket.toString(),
    label: `${formatRatingBucketLabel(bucket)} - ${formatRatingBucketLabel(next)}`,
  };
}

function buildWatchlistGroupMetas(
  item,
  groupBy,
  {
    imdbScores,
    traktScores,
    providersByItem,
    ratingStep = 0.5,
    ratingOffset = 0,
  },
) {
  if (groupBy === "none") return [];

  if (groupBy === "genre") {
    const type = item.media_type || (item.title ? "movie" : "tv");
    const genreMap = type === "movie" ? MOVIE_GENRES : TV_GENRES;
    const genreIds = item.genre_ids || [];
    if (genreIds.length === 0)
      return [{ key: "no_genre", label: "Sin género" }];
    return genreIds.map((genreId) => ({
      key: String(genreId),
      label: genreMap[genreId] || `Género ${genreId}`,
    }));
  }

  if (groupBy === "provider") {
    const providers = providersByItem.get(getProviderMediaKey(item));
    if (!providers)
      return [{ key: "loading_providers", label: "Cargando plataformas..." }];
    if (providers.length === 0)
      return [{ key: "no_provider", label: "Sin plataforma disponible" }];
    return providers.map((provider) => ({
      key: providerGroupKey(provider),
      label: provider.provider_name,
    }));
  }

  if (groupBy === "year") {
    const year = (item.release_date || item.first_air_date || "").slice(0, 4);
    return [{ key: year || "Sin año", label: year || "Sin año" }];
  }

  if (groupBy === "decade") {
    const year = (item.release_date || item.first_air_date || "").slice(0, 4);
    if (!year) return [{ key: "Sin década", label: "Sin década" }];
    const decade = Math.floor(parseInt(year) / 10) * 10;
    return [{ key: decade.toString(), label: `${decade}s` }];
  }

  if (groupBy === "tmdb_rating") {
    return [
      ratingRangeMeta(
        item.vote_average,
        "no_tmdb",
        "Sin puntuación TMDb",
        ratingStep,
        ratingOffset,
      ),
    ];
  }

  if (groupBy === "imdb_rating") {
    return [
      ratingRangeMeta(
        imdbScores.get(getScoreItemKey(item)),
        "no_imdb",
        "Sin puntuación IMDb",
        ratingStep,
        ratingOffset,
      ),
    ];
  }

  if (groupBy === "trakt_rating") {
    return [
      ratingRangeMeta(
        traktScores.get(getScoreItemKey(item)),
        "no_trakt",
        "Sin puntuación Trakt",
        ratingStep,
        ratingOffset,
      ),
    ];
  }

  return [];
}

function isRatingGroupKey(groupBy) {
  return (
    groupBy === "tmdb_rating" ||
    groupBy === "imdb_rating" ||
    groupBy === "trakt_rating"
  );
}

function createWatchlistGroupStats() {
  return {
    tmdb: { sum: 0, count: 0, avg: 0 },
    imdb: { sum: 0, count: 0, avg: 0 },
    trakt: { sum: 0, count: 0, avg: 0 },
  };
}

function addWatchlistGroupStats(stats, item, imdbScores, traktScores) {
  if (item.vote_average) {
    stats.tmdb.sum += item.vote_average;
    stats.tmdb.count++;
  }
  const imdbRating = imdbScores.get(getScoreItemKey(item));
  if (imdbRating) {
    stats.imdb.sum += imdbRating;
    stats.imdb.count++;
  }
  const traktRating = traktScores.get(getScoreItemKey(item));
  if (traktRating) {
    stats.trakt.sum += traktRating;
    stats.trakt.count++;
  }
}

function finalizeWatchlistGroupStats(stats) {
  for (const stat of Object.values(stats)) {
    if (stat.count > 0) stat.avg = stat.sum / stat.count;
  }
}

function sortWatchlistGroups(groupsArray, groupBy) {
  if (groupBy === "year" || groupBy === "decade") {
    groupsArray.sort((a, b) => {
      if (a.key === "Sin año" || a.key === "Sin década") return 1;
      if (b.key === "Sin año" || b.key === "Sin década") return -1;
      return parseInt(b.key) - parseInt(a.key);
    });
  } else if (groupBy.includes("rating")) {
    groupsArray.sort((a, b) => {
      const aNoRating = ["no_tmdb", "no_imdb", "no_trakt"].includes(a.key);
      const bNoRating = ["no_tmdb", "no_imdb", "no_trakt"].includes(b.key);
      if (aNoRating && !bNoRating) return 1;
      if (!aNoRating && bNoRating) return -1;
      if (aNoRating && bNoRating) return 0;
      return parseFloat(b.key) - parseFloat(a.key);
    });
  } else if (groupBy === "genre") {
    groupsArray.sort((a, b) => {
      if (a.key === "no_genre") return 1;
      if (b.key === "no_genre") return -1;
      return a.label.localeCompare(b.label);
    });
  } else if (groupBy === "provider") {
    groupsArray.sort((a, b) => {
      const aSpecial = ["loading_providers", "no_provider"].includes(a.key);
      const bSpecial = ["loading_providers", "no_provider"].includes(b.key);
      if (aSpecial && !bSpecial) return 1;
      if (!aSpecial && bSpecial) return -1;
      return a.label.localeCompare(b.label);
    });
  }
  return groupsArray;
}

function buildSmartWatchlistRatingSubgroups(items, subGroupBy, groupContext) {
  const subgroups = new Map();
  const context = { ...groupContext, ratingStep: 1, ratingOffset: 0 };

  for (const item of items) {
    const [meta] = buildWatchlistGroupMetas(item, subGroupBy, context);
    if (!meta) continue;
    if (!subgroups.has(meta.key)) {
      subgroups.set(meta.key, {
        key: meta.key,
        label: meta.label,
        items: [],
      });
    }
    subgroups.get(meta.key).items.push(item);
  }

  return sortWatchlistGroups(Array.from(subgroups.values()), subGroupBy);
}

function canonicalPlatformFromProvider(provider) {
  const id = Number(provider?.provider_id);
  const name = normText(provider?.provider_name);

  if (id === 8 || name.includes("netflix")) {
    return {
      platform_key: "netflix",
      provider_id: 8,
      provider_name: "Netflix",
      logo_path: provider?.logo_path || "/t2yyOv40HZeVlLjYsCsPHnWLk4W.jpg",
    };
  }

  if (
    id === 119 ||
    name.includes("amazon prime video") ||
    name === "prime video"
  ) {
    return {
      platform_key: "prime",
      provider_id: 119,
      provider_name: "Amazon Prime Video",
      logo_path: provider?.logo_path || "/pvske1MyAoymrs5bguRfVqYiM9a.jpg",
    };
  }

  if (id === 384 || id === 1899 || name === "max" || name.includes("hbo max")) {
    return {
      platform_key: "hbo-max",
      provider_id: 1899,
      provider_name: "HBO Max",
      logo_path: provider?.logo_path || "/jbe4gVSfRlbPTdESXhEKpornsfu.jpg",
    };
  }

  if (id === 283 || name.includes("crunchyroll")) {
    return {
      platform_key: "crunchyroll",
      provider_id: 283,
      provider_name: "Crunchyroll",
      logo_path: provider?.logo_path || "/8Gt1iClBlzTeQs8WQm8UrCoIxnQ.jpg",
    };
  }

  if (id === 149 || id === 2241 || name.includes("movistar")) {
    return {
      platform_key: "movistar",
      provider_id: 2241,
      provider_name: "Movistar +",
      logo_path: provider?.logo_path || "/jse4MOi92Jgetym7nbXFZZBI6LK.jpg",
    };
  }

  if (id === 337 || name.includes("disney")) {
    return {
      platform_key: "disney",
      provider_id: 337,
      provider_name: "Disney +",
      logo_path: provider?.logo_path || "/7rwgEs15tFwyR9NPQ5vpzxTj19Q.jpg",
    };
  }

  return null;
}

function getCanonicalProviders(providers = [], plexAvailable = false) {
  const byPlatform = new Map();

  for (const provider of Array.isArray(providers) ? providers : []) {
    const canonical = canonicalPlatformFromProvider(provider);
    if (!canonical || byPlatform.has(canonical.platform_key)) continue;
    byPlatform.set(canonical.platform_key, {
      ...canonical,
      display_priority:
        TARGET_PROVIDER_ORDER.get(canonical.platform_key) ?? 9999,
    });
  }

  if (plexAvailable) {
    byPlatform.set("plex", {
      platform_key: "plex",
      provider_id: "plex",
      provider_name: "Servidor Plex",
      logo_path: "/logo-Plex.png",
      display_priority: TARGET_PROVIDER_ORDER.get("plex") ?? 9999,
      isPlex: true,
    });
  }

  return Array.from(byPlatform.values()).sort(
    (a, b) => (a.display_priority ?? 9999) - (b.display_priority ?? 9999),
  );
}

function readPlexLibraryIndexCache() {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(PLEX_LIBRARY_INDEX_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      !Array.isArray(parsed?.keys) ||
      !parsed.t ||
      Date.now() - parsed.t > PLEX_LIBRARY_INDEX_CACHE_TTL_MS
    ) {
      return null;
    }
    return new Set(parsed.keys);
  } catch {
    return null;
  }
}

function writePlexLibraryIndexCache(index) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      PLEX_LIBRARY_INDEX_CACHE_KEY,
      JSON.stringify({ t: Date.now(), keys: Array.from(index || []) }),
    );
  } catch {}
}

async function fetchPlexLibraryIndex() {
  const cached = readPlexLibraryIndexCache();
  if (cached) return cached;

  try {
    const response = await fetch("/api/plex/library?limit=10000", {
      cache: "force-cache",
    });
    const data = await response.json().catch(() => null);
    if (!response.ok || !data?.available || !Array.isArray(data.items)) {
      return new Set();
    }

    const index = new Set();
    for (const item of data.items) {
      const tmdbId = Number(item?.tmdbId || 0);
      const tmdbType =
        item?.tmdbType || (item?.type === "movie" ? "movie" : "tv");
      if (Number.isFinite(tmdbId) && tmdbId > 0 && tmdbType) {
        index.add(`${tmdbType}:${tmdbId}`);
      }
    }

    writePlexLibraryIndexCache(index);
    return index;
  } catch {
    return new Set();
  }
}

function preloadImage(src) {
  return new Promise((resolve) => {
    if (!src) return resolve(false);
    const img = new Image();
    img.onload = () => resolve(true);
    img.onerror = () => resolve(false);
    img.src = src;
  });
}

function pickBestPosterEN(posters) {
  if (!Array.isArray(posters) || posters.length === 0) return null;

  const norm = (v) => (v ? String(v).toLowerCase().split("-")[0] : null);
  const englishPosters = posters.filter((p) => norm(p?.iso_639_1) === "en");
  if (!englishPosters.length) return null;

  const maxVotes = englishPosters.reduce(
    (max, p) => ((p.vote_count || 0) > max ? p.vote_count || 0 : max),
    0,
  );
  const withMaxVotes = englishPosters.filter(
    (p) => (p.vote_count || 0) === maxVotes,
  );
  if (!withMaxVotes.length) return null;

  return (
    [...withMaxVotes].sort((a, b) => {
      const va = (b.vote_average || 0) - (a.vote_average || 0);
      if (va !== 0) return va;
      return (b.width || 0) - (a.width || 0);
    })[0] || null
  );
}

function pickBestBackdropByLangResVotes(list, opts = {}) {
  const { preferLangs = ["en", "en-US"], minWidth = 1200 } = opts;
  if (!Array.isArray(list) || list.length === 0) return null;

  const norm = (v) => (v ? String(v).toLowerCase().split("-")[0] : null);
  const preferSet = new Set((preferLangs || []).map(norm).filter(Boolean));
  const isPreferredLang = (img) => {
    // Excluir explícitamente imágenes sin idioma
    if (img?.iso_639_1 === null || img?.iso_639_1 === undefined) return false;
    return preferSet.has(norm(img?.iso_639_1));
  };

  const englishPool = list.filter(isPreferredLang);
  if (!englishPool.length) return null;

  const pool0 =
    minWidth > 0
      ? englishPool.filter((b) => (b?.width || 0) >= minWidth)
      : englishPool;
  const pool = pool0.length ? pool0 : englishPool;

  const top3en = [];
  for (const b of pool) {
    top3en.push(b);
    if (top3en.length === 3) break;
  }

  const isRes = (b, w, h) => (b?.width || 0) === w && (b?.height || 0) === h;

  const b1080 = top3en.find((b) => isRes(b, 1920, 1080));
  if (b1080) return b1080;

  const b1440 = top3en.find((b) => isRes(b, 2560, 1440));
  if (b1440) return b1440;

  const b4k = top3en.find((b) => isRes(b, 3840, 2160));
  if (b4k) return b4k;

  const b720 = top3en.find((b) => isRes(b, 1280, 720));
  if (b720) return b720;

  return top3en[0];
}

async function fetchBestBackdropEN(type, id) {
  const apiKey = process.env.NEXT_PUBLIC_TMDB_API_KEY;
  if (!apiKey || !type || !id) return null;
  try {
    // Pasa por la cola compartida: limita concurrencia y reintenta los 429.
    // Antes cada tarjeta pedía por su cuenta y una lista larga provocaba
    // 429 en ~13% de las tarjetas, que acababan en el backdrop crudo.
    const j = await fetchTmdbImages(type, id);
    if (!j) return null;
    const best = pickBestBackdropByLangResVotes(j?.backdrops, {
      preferLangs: ["en", "en-US"],
      minWidth: 1200,
    });
    return best?.file_path || null;
  } catch {
    return null;
  }
}

async function getBestBackdropCached(type, id) {
  const key = `${type}:${id}`;
  if (backdropChoiceCache.has(key)) return backdropChoiceCache.get(key);
  if (backdropInFlight.has(key)) return backdropInFlight.get(key);

  const p = (async () => {
    const chosen = await fetchBestBackdropEN(type, id);
    backdropChoiceCache.set(key, chosen || null);
    backdropInFlight.delete(key);
    return chosen || null;
  })();

  backdropInFlight.set(key, p);
  return p;
}

async function fetchBestPosterEN(type, id) {
  const apiKey = process.env.NEXT_PUBLIC_TMDB_API_KEY;
  if (!apiKey || !type || !id) return null;
  try {
    // Pasa por la cola compartida: limita concurrencia y reintenta los 429.
    // Antes cada tarjeta pedía por su cuenta y una lista larga provocaba
    // 429 en ~13% de las tarjetas, que acababan en el backdrop crudo.
    const j = await fetchTmdbImages(type, id);
    if (!j) return null;
    return pickBestPosterEN(j?.posters)?.file_path || null;
  } catch {
    return null;
  }
}

async function getBestPosterCached(type, id) {
  const key = `${type}:${id}`;
  if (posterChoiceCache.has(key)) return posterChoiceCache.get(key);
  if (posterInFlight.has(key)) return posterInFlight.get(key);

  const p = (async () => {
    const chosen = await fetchBestPosterEN(type, id);
    posterChoiceCache.set(key, chosen || null);
    posterInFlight.delete(key);
    return chosen || null;
  })();

  posterInFlight.set(key, p);
  return p;
}

// Purga las versiones ANTERIORES de la caché de elecciones.
//
// Subir la versión de la clave es como invalidamos elecciones ya guardadas
// (p. ej. al arreglar la persistencia, o para descartar backdrops sin idioma
// elegidos por una versión antigua del selector). El efecto secundario es que la
// clave vieja se queda huérfana en localStorage PARA SIEMPRE, y estos blobs
// crecen con cada título visitado. Al ir ya por la tercera versión, esto limpia
// cualquier `…:image-choices:vN` que no sea la actual.
function pruneOldImageChoiceCaches() {
  if (typeof window === "undefined") return;
  try {
    const prefix = IMAGE_CHOICE_CACHE_KEY.replace(/:v\d+$/, ":v");
    for (let i = window.localStorage.length - 1; i >= 0; i -= 1) {
      const key = window.localStorage.key(i);
      if (!key || key === IMAGE_CHOICE_CACHE_KEY) continue;
      if (key.startsWith(prefix)) window.localStorage.removeItem(key);
    }
  } catch {
    // localStorage no disponible
  }
}

function readImageChoiceCache() {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(IMAGE_CHOICE_CACHE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    return parsed;
  } catch {
    return {};
  }
}

function getStoredImageChoice(kind, key) {
  const cache = readImageChoiceCache();
  const entry = cache[`${kind}:${key}`];
  if (!entry?.path) return null;
  if (Date.now() - Number(entry.t || 0) > IMAGE_CHOICE_CACHE_TTL_MS) return null;
  return entry.path;
}

function writeImageChoice(kind, key, path) {
  if (typeof window === "undefined" || !path) return;
  try {
    const cache = readImageChoiceCache();
    cache[`${kind}:${key}`] = { path, t: Date.now() };
    window.localStorage.setItem(IMAGE_CHOICE_CACHE_KEY, JSON.stringify(cache));
  } catch {}
}

function getCachedSmartPosterUrl(item, mode = "poster") {
  const type = item.media_type || (item.title ? "movie" : "tv");
  const id = item.id;
  const key = `${type}:${id}`;

  if (mode === "backdrop") {
    const cachedBackdrop = backdropChoiceCache.has(key)
      ? backdropChoiceCache.get(key)
      : null;
    const storedBackdrop = getStoredImageChoice("backdrop", key);
    const path = cachedBackdrop || storedBackdrop || null;
    return path ? buildImg(path, "w1280") : null;
  }

  const cachedPoster = posterChoiceCache.has(key)
    ? posterChoiceCache.get(key)
    : null;
  const storedPoster = getStoredImageChoice("poster", key);
  const path = cachedPoster || storedPoster || null;
  return path ? buildImg(path, "w500") : null;
}

function SmartPoster({ item, title, mode = "poster" }) {
  const type = item.media_type || (item.title ? "movie" : "tv");
  const id = item.id;
  const imageKey = `${type}:${id}`;
  const fallbackKey = `${mode}:${type}:${id}`;
  const fallbackPathRef = useRef(null);
  if (fallbackPathRef.current?.key !== fallbackKey) {
    fallbackPathRef.current = {
      key: fallbackKey,
      path:
        mode === "backdrop"
          ? item.backdrop_path || item.poster_path || null
          : item.poster_path || item.backdrop_path || null,
    };
  }
  const initialSrc = getCachedSmartPosterUrl(item, mode);

  const [src, setSrc] = useState(initialSrc);
  const [ready, setReady] = useState(Boolean(initialSrc));

  useEffect(() => {
    let abort = false;

    const cachedUrl = getCachedSmartPosterUrl(item, mode);
    if (cachedUrl) {
      setSrc(cachedUrl);
      setReady(true);
      return () => {
        abort = true;
      };
    }

    setSrc(null);
    setReady(false);

    const load = async () => {
      if (mode === "backdrop") {
        const bestBackdrop = await getBestBackdropCached(type, id);
        const finalPath = bestBackdrop || fallbackPathRef.current?.path || null;
        const url = finalPath ? buildImg(finalPath, "w1280") : null;
        if (url) await preloadImage(url);
        if (!abort) {
          // Persistimos SOLO la elección real del selector, nunca el fallback.
          // `finalPath` puede ser `item.backdrop_path`, el backdrop por defecto
          // de TMDb (normalmente textless): si el selector fallaba una vez, ese
          // textless quedaba grabado 7 días y el efecto de arriba corta antes de
          // reintentar, así que la tarjeta se quedaba sin idioma de forma
          // permanente. Pasando `bestBackdrop` (null si falló) no se graba nada
          // y la siguiente visita vuelve a intentarlo.
          writeImageChoice("backdrop", imageKey, bestBackdrop);
          setSrc(url);
          setReady(!!url);
        }
        return;
      }

      const best = await getBestPosterCached(type, id);
      const finalPath = best || fallbackPathRef.current?.path || null;
      const url = finalPath ? buildImg(finalPath, "w500") : null;
      if (url) await preloadImage(url);
      if (!abort) {
        writeImageChoice("poster", imageKey, best);
        setSrc(url);
        setReady(!!url);
      }
    };

    load();
    return () => {
      abort = true;
    };
  }, [mode, type, id, imageKey]);

  return (
    <div className="relative w-full h-full">
      <div
        className={`absolute inset-0 flex flex-col items-center justify-center bg-neutral-900 transition-opacity duration-300 ${
          ready && src ? "opacity-0" : "opacity-100"
        }`}
      >
        <Film className="w-8 h-8 text-neutral-700" />
      </div>

      {src ? (
        <OptimizedImage
          src={src}
          alt={title}
          loading="lazy"
          decoding="async"
          className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-300 ${
            ready ? "opacity-100" : "opacity-0"
          }`}
        />
      ) : null}
    </div>
  );
}

function StatBox({
  label,
  value,
  icon: Icon,
  imgSrc,
  colorClass,
  horizontal = false,
}) {
  return (
    <div
      className={`flex min-w-0 transition-all duration-300 ${horizontal ? "flex-row items-center gap-1.5 sm:gap-2" : "flex-col items-start"}`}
    >
      <div
        className={`flex items-center gap-1.5 opacity-75 min-w-0 ${horizontal ? "" : "mb-1"}`}
      >
        {imgSrc ? (
          <OptimizedImage
            src={imgSrc}
            alt={label}
            className={`w-auto object-contain opacity-85 shrink-0 transition-all duration-300 ${horizontal ? "h-3.5 sm:h-4" : "h-3 sm:h-3.5"}`}
          />
        ) : Icon ? (
          <Icon
            className={`shrink-0 transition-all duration-300 ${colorClass} ${horizontal ? "w-3.5 h-3.5 sm:w-4 sm:h-4" : "w-3 h-3 sm:w-3.5 sm:h-3.5"}`}
          />
        ) : null}

        {!horizontal && (
          <span className="text-[9px] sm:text-[10px] font-bold uppercase tracking-wider text-zinc-400 truncate">
            {label}
          </span>
        )}
      </div>

      <div className="flex items-baseline gap-1.5 min-w-0">
        <span
          className={`font-black text-white tabular-nums tracking-tight leading-none truncate transition-all duration-300 ${horizontal ? "text-sm sm:text-base" : "text-lg sm:text-xl"}`}
        >
          {value}
        </span>
      </div>
    </div>
  );
}

function GroupDivider({
  title,
  stats,
  count,
  total,
  groupBy,
  mobileFiltersOpen,
  forceSticky = false,
  disableStickyAnimation = false,
  hasPreviousGroup = false,
  hasNextGroup = false,
  onPreviousGroup,
  onNextGroup,
}) {
  // El divisor es sticky y entra animándose: al retroceder eso recoloca la
  // lista. Se consulta aquí porque este componente vive FUERA del cliente
  // principal y no recibe `isBackNav` por props.
  const isBackNav = useIsHistoryNavigation();
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  const [isSticky, setIsSticky] = useState(false);
  const ref = useRef(null);
  const [transitioningThreshold, setTransitioningThreshold] = useState(108);

  useEffect(() => {
    if (mobileFiltersOpen) {
      setTransitioningThreshold(216);
    } else {
      const timer = setTimeout(() => {
        setTransitioningThreshold(108);
      }, 200);
      return () => clearTimeout(timer);
    }
  }, [mobileFiltersOpen]);

  // En una vuelta del historial el scroll ya se restaura antes del primer
  // paint. Medir en un layout effect evita que el divisor se vea expandido
  // antes de recuperar su estado sticky compacto.
  useLayoutEffect(() => {
    const handleScroll = () => {
      if (!ref.current) return;
      const top = ref.current.getBoundingClientRect().top;
      const isLg = window.innerWidth >= 1024;
      const threshold = isLg ? 136 : transitioningThreshold;
      setIsSticky((prev) => {
        const next = prev ? top <= threshold + 12 : top <= threshold + 1;
        return prev === next ? prev : next;
      });
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener(
      "showverse:scroll-restoration-complete",
      handleScroll,
    );
    handleScroll();
    return () => {
      window.removeEventListener("scroll", handleScroll);
      window.removeEventListener(
        "showverse:scroll-restoration-complete",
        handleScroll,
      );
    };
  }, [transitioningThreshold]);

  const renderSticky = isSticky || forceSticky;
  const stickyTransitionClass = disableStickyAnimation || isBackNav
    ? "transition-none"
    : "transition-all duration-300";

  return (
    <motion.div
      ref={ref}
      data-group-divider
      // Fijada bajo el navbar: sus superficies pasan al cristal del
      // navbar (regla `[data-menu-pinned]` en globals.css).
      data-menu-pinned={renderSticky}
      className={`sticky z-[60] ${hasPreviousGroup ? "my-4" : mobileFiltersOpen ? "mt-0 mb-4" : "mt-2 mb-4"} sm:my-6 -mx-2 px-2 sm:mx-0 sm:px-0 ${isBackNav ? "transition-none" : "transition-[top] duration-[180ms] ease-[cubic-bezier(0.16,1,0.3,1)]"} lg:top-[136px] ${
        mobileFiltersOpen ? "top-[216px]" : "top-[108px]"
      }`}
      // `initial={false}` al retroceder. Es un elemento STICKY que entraba
      // desde 20px abajo: al volver de una ficha se recolocaba tras cargar, y
      // al ser sticky el movimiento se arrastra por toda la lista. Cualquier
      // animación de entrada rompe el requisito de "estático al retroceder".
      initial={isBackNav ? false : { opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={
        isBackNav ? { duration: 0 } : { duration: 0.4, ease: "easeOut" }
      }
    >
      <div className="flex min-w-0 items-center gap-3 lg:gap-4">
        <div
          className={`relative min-w-0 flex-1 overflow-hidden rounded-2xl bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-lg ${stickyTransitionClass} ${renderSticky ? "shadow-md" : "shadow-xl"}`}
        >
          <div
            className={`relative z-10 px-3 sm:px-6 flex items-center justify-between gap-3 sm:gap-6 ${stickyTransitionClass} ${renderSticky ? "py-2 sm:py-2.5" : "py-2.5 sm:py-5"}`}
          >
            <div className="flex items-center gap-2 sm:gap-4 min-w-0 flex-1">
              <div
                className={`bg-gradient-to-b from-blue-500 to-cyan-600 shadow-[0_0_15px_rgba(59,130,246,0.4)] shrink-0 ${stickyTransitionClass} ${renderSticky ? "w-2 h-2 rounded-full" : "w-1 sm:w-1.5 h-8 sm:h-12 rounded-full"}`}
              />

              <div
                className={`min-w-0 flex-1 ${stickyTransitionClass} ${renderSticky ? "flex flex-wrap items-center gap-x-3 gap-y-1" : ""}`}
              >
                <h2
                  className={`font-black tracking-tight text-white leading-tight line-clamp-1 drop-shadow-md ${stickyTransitionClass} ${renderSticky ? "text-base sm:text-lg" : "text-base sm:text-2xl"}`}
                >
                  {title}
                </h2>

                <div
                  className={`text-zinc-500 font-medium flex items-center gap-x-1.5 sm:gap-x-2 ${stickyTransitionClass} ${renderSticky ? "mt-0 text-[10px] sm:text-xs" : "mt-0.5 sm:mt-1 text-[10px] sm:text-sm"}`}
                >
                  <span className="text-zinc-300 font-bold">{count}</span>
                  <span>items</span>
                  <span className="w-0.5 h-0.5 sm:w-1 sm:h-1 rounded-full bg-zinc-700" />
                  <span className="opacity-90">{pct}%</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 sm:gap-4 shrink-0">
              {stats?.imdb?.avg != null &&
                typeof stats.imdb.avg === "number" &&
                !Number.isNaN(stats.imdb.avg) &&
                stats.imdb.avg > 0 && (
                  <StatBox
                    label="IMDb"
                    value={formatAvg(stats.imdb.avg)}
                    imgSrc="/logo-IMDb.svg"
                    horizontal={renderSticky}
                  />
                )}
              {stats?.trakt?.avg != null &&
                typeof stats.trakt.avg === "number" &&
                !Number.isNaN(stats.trakt.avg) &&
                stats.trakt.avg > 0 && (
                  <StatBox
                    label="Trakt"
                    value={formatAvg(stats.trakt.avg)}
                    imgSrc="/logo-Trakt.png"
                    horizontal={renderSticky}
                  />
                )}
              {stats?.tmdb?.avg != null &&
                typeof stats.tmdb.avg === "number" &&
                !Number.isNaN(stats.tmdb.avg) &&
                stats.tmdb.avg > 0 && (
                  <StatBox
                    label="TMDb"
                    value={formatAvg(stats.tmdb.avg)}
                    imgSrc="/logo-TMDb.png"
                    horizontal={renderSticky}
                  />
                )}
            </div>
          </div>
        </div>
        <div
          className={`hidden shrink-0 lg:flex overflow-hidden rounded-2xl bg-gradient-to-br from-white/10 to-white/5 p-1 backdrop-blur-lg ${stickyTransitionClass} ${renderSticky ? "shadow-md" : "shadow-xl"} ${
            renderSticky ? "flex-row gap-1" : "flex-col gap-1"
          }`}
        >
          <button
            type="button"
            onClick={onPreviousGroup}
            disabled={!hasPreviousGroup}
            aria-label="Ir a la agrupación anterior"
            className="inline-flex h-9 w-9 items-center justify-center rounded-full text-zinc-200 transition-all duration-200 hover:bg-blue-500/15 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-400 disabled:pointer-events-none disabled:opacity-35"
          >
            <ChevronUp className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={onNextGroup}
            disabled={!hasNextGroup}
            aria-label="Ir a la siguiente agrupación"
            className="inline-flex h-9 w-9 items-center justify-center rounded-full text-zinc-200 transition-all duration-200 hover:bg-blue-500/15 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-400 disabled:pointer-events-none disabled:opacity-35"
          >
            <ChevronDown className="h-5 w-5" />
          </button>
        </div>
      </div>
    </motion.div>
  );
}

// ================== UI COMPONENTS ==================
function InlineDropdown({
  label,
  valueLabel,
  mobileValueLabel,
  compactMobile = false,
  icon: Icon,
  children,
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const buttonRef = useRef(null);
  const menuRef = useRef(null);
  const [menuStyle, setMenuStyle] = useState(null);

  const updateMenuPosition = useCallback(() => {
    if (!buttonRef.current || typeof window === "undefined") return;
    const rect = buttonRef.current.getBoundingClientRect();
    const menuWidth = Math.min(rect.width, window.innerWidth - 24);
    const left = Math.min(
      Math.max(12, rect.left),
      Math.max(12, window.innerWidth - menuWidth - 12),
    );

    const availableBelow = window.innerHeight - rect.bottom - 12;
    const menuMaxHeight = Math.max(64, Math.min(448, availableBelow));

    setMenuStyle({
      position: "fixed",
      top: rect.bottom + 8,
      left,
      width: menuWidth,
      maxHeight: menuMaxHeight,
      zIndex: 1000,
    });
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      const target = e.target;
      if (ref.current?.contains(target) || menuRef.current?.contains(target)) {
        return;
      }
      setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => {
      document.removeEventListener("pointerdown", onDown);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    updateMenuPosition();
    const frame = window.requestAnimationFrame(updateMenuPosition);
    window.addEventListener("resize", updateMenuPosition);
    window.addEventListener("scroll", updateMenuPosition, true);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", updateMenuPosition);
      window.removeEventListener("scroll", updateMenuPosition, true);
    };
  }, [open, updateMenuPosition]);

  return (
    <div ref={ref} className="relative min-w-0 w-full lg:w-auto lg:shrink">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="h-11 min-w-0 w-full inline-flex items-center justify-between gap-3 px-4 rounded-2xl transition text-sm lg:min-w-[140px] lg:w-auto lg:max-w-none bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-lg shadow-lg text-zinc-200 hover:from-white/15 hover:to-white/10"
      >
        <div className="flex min-w-0 items-center gap-2">
          {Icon && <Icon className="w-4 h-4 text-blue-500" />}
          <span
            className={`text-zinc-500 font-bold text-xs uppercase tracking-wider ${
              compactMobile ? "hidden sm:inline" : ""
            }`}
          >
            {label}:
          </span>
          <span className="hidden min-w-0 truncate font-semibold text-white sm:inline lg:overflow-visible lg:whitespace-nowrap">
            {valueLabel}
          </span>
          <span className="min-w-0 truncate font-semibold text-white sm:hidden">
            {mobileValueLabel || valueLabel}
          </span>
        </div>
        <ChevronDown
          className={`w-3.5 h-3.5 shrink-0 text-zinc-500 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {typeof document !== "undefined" &&
        createPortal(
          <AnimatePresence>
            {open && menuStyle && (
              <motion.div
                ref={menuRef}
                initial={{ opacity: 0, y: 8, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.98 }}
                transition={{ duration: 0.16, ease: "easeOut" }}
                className="overflow-y-auto overflow-x-hidden rounded-2xl bg-black/40 bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-2xl p-2 shadow-2xl [scrollbar-color:#3f3f46_transparent]"
                style={{
                  ...menuStyle,
                  scrollbarWidth: "thin",
                  scrollbarGutter: "stable",
                  overscrollBehavior: "contain",
                }}
              >
                {children({ close: () => setOpen(false) })}
              </motion.div>
            )}
          </AnimatePresence>,
          document.body,
        )}
    </div>
  );
}

function DropdownItem({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full px-3 py-2 rounded-xl text-left text-sm transition flex items-center justify-between
        ${active ? "bg-white/10 text-white font-bold" : "text-zinc-300 hover:bg-white/5 hover:text-white"}`}
    >
      <span className="font-medium">{children}</span>
      {active && <CheckCircle2 className="w-4 h-4 text-blue-500" />}
    </button>
  );
}

function GroupingDropdownContent({
  groupBy,
  subGroupBy,
  onGroupChange,
  onSubGroupChange,
  close,
}) {
  const subgroupOptions = WATCHLIST_GROUP_OPTIONS.filter(
    (option) => option.key !== "none" && option.key !== groupBy,
  );

  return (
    <>
      <div className="px-3 pb-1 pt-2 text-[10px] font-black uppercase tracking-[0.18em] text-zinc-500">
        Agrupación
      </div>
      {WATCHLIST_GROUP_OPTIONS.map((option) => (
        <DropdownItem
          key={option.key}
          active={groupBy === option.key}
          onClick={() => {
            onGroupChange(option.key);
            if (option.key === "none") close();
          }}
        >
          {option.itemLabel}
        </DropdownItem>
      ))}

      {groupBy !== "none" && (
        <>
          <div className="mx-2 my-2 h-px bg-white/10" />
          <div className="px-3 pb-1 text-[10px] font-black uppercase tracking-[0.18em] text-zinc-500">
            Subagrupación
          </div>
          <DropdownItem
            active={!subGroupBy || subGroupBy === "none"}
            onClick={() => {
              onSubGroupChange("none");
              close();
            }}
          >
            Sin subagrupación
          </DropdownItem>
          {subgroupOptions.map((option) => (
            <DropdownItem
              key={option.key}
              active={subGroupBy === option.key}
              onClick={() => {
                onSubGroupChange(option.key);
                close();
              }}
            >
              {option.itemLabel}
            </DropdownItem>
          ))}
        </>
      )}
    </>
  );
}

function SubGroupDivider({ title, count }) {
  return (
    <div className="flex items-center gap-3 py-1.5 sm:py-2">
      <div className="h-px flex-1 bg-gradient-to-r from-transparent via-blue-500/40 to-blue-500/15" />
      <div className="relative overflow-hidden inline-flex max-w-[70%] items-center gap-2 rounded-xl bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-lg shadow-lg px-3 py-1 text-xs sm:text-sm">
        <span className="relative z-10 truncate font-black uppercase tracking-wide text-blue-100 drop-shadow-sm">
          {title}
        </span>
        <span className="relative z-10 shrink-0 text-[10px] font-bold text-blue-300/80">
          {count}
        </span>
      </div>
      <div className="h-px flex-1 bg-gradient-to-l from-transparent via-blue-500/40 to-blue-500/15" />
    </div>
  );
}

function TvGlyph({ className = "" }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="2" y="7" width="20" height="15" rx="2" />
      <path d="m17 2-5 5-5-5" />
    </svg>
  );
}

// ================== CARD COMPONENTS ==================
function WatchlistHoverIndicator({
  type,
  tmdbScore,
  imdbScore,
  compact = false,
}) {
  const normalizedTmdbScore = Number(tmdbScore);
  const normalizedImdbScore = Number(imdbScore);
  const hasTmdbScore = Number.isFinite(normalizedTmdbScore) && normalizedTmdbScore > 0;
  const hasImdbScore = Number.isFinite(normalizedImdbScore) && normalizedImdbScore > 0;
  const itemClassName = compact ? "h-7 w-8" : "h-9 w-10";
  const iconClassName = compact ? "h-4 w-4" : "h-5 w-5";
  const scoreClassName = compact ? "h-7 w-8 text-base" : "h-9 w-10 text-xl";

  return (
    <div
      className={`pointer-events-none absolute ${compact ? "bottom-1.5 px-1" : "bottom-2 px-1.5"} left-1/2 z-20 hidden -translate-x-1/2 translate-y-3 scale-95 opacity-0 items-center overflow-hidden rounded-full ${LIQUID_GLASS_PANEL} text-white shadow-xl transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none lg:flex lg:group-hover:translate-y-0 lg:group-hover:scale-100 lg:group-hover:opacity-100 will-change-transform transform-gpu`}
      aria-hidden="true"
    >
      <span className={`flex ${itemClassName} shrink-0 items-center justify-center ${type === "movie" ? "text-sky-400" : "text-violet-400"}`}>
        {type === "movie" ? <Film className={iconClassName} /> : <MonitorPlay className={iconClassName} />}
      </span>
      {hasTmdbScore ? (
        <span className={`flex ${scoreClassName} shrink-0 items-center justify-center font-black leading-none tabular-nums text-sky-400`}>
          {normalizedTmdbScore.toFixed(1)}
        </span>
      ) : null}
      {hasImdbScore ? (
        <span className={`flex ${scoreClassName} shrink-0 items-center justify-center font-black leading-none tabular-nums text-amber-300`}>
          {normalizedImdbScore.toFixed(1)}
        </span>
      ) : null}
    </div>
  );
}

const WatchlistCard = memo(function WatchlistCard({
  item,
  index = 0,
  totalItems = 0,
  animateWithin = 24,
  viewMode = "grid",
  imageMode = "poster",
  imdbScore: initialImdbScore,
}) {
  const type = item.media_type || (item.title ? "movie" : "tv");
  const title = item.title || item.name || "Sin título";
  const year =
    item.release_date?.slice(0, 4) || item.first_air_date?.slice(0, 4) || "";
  const rating = item.vote_average ? item.vote_average.toFixed(1) : null;
  const [imdbScore, setImdbScore] = useState(initialImdbScore);
  const [loadingScores, setLoadingScores] = useState(false);

  // Sync scores from parent when they arrive progressively
  useEffect(() => {
    if (initialImdbScore !== undefined && initialImdbScore !== null) {
      setImdbScore(initialImdbScore);
    }
  }, [initialImdbScore]);

  const href =
    type === "movie" ? `/details/movie/${item.id}` : `/details/tv/${item.id}`;

  // Al pulsar la tarjeta se abre la ficha rápida (drawer desde la derecha) en vez
  // de navegar. Sin provider, el <Link> navega con normalidad.
  const previewClick = usePreviewOpen();
  const onPreviewClick = previewClick(item, { mediaType: type });

  // Determine which image mode to use based on viewMode and imageMode preference
  const effectiveImageMode = viewMode === "list" ? "backdrop" : imageMode;

  // Dynamic aspect ratio based on image mode
  const aspectRatio =
    effectiveImageMode === "backdrop" ? "aspect-[16/9]" : "aspect-[2/3]";

  // Load scores on hover if not in cache
  const handleHover = useCallback(async () => {
    if (loadingScores || imdbScore) return;

    setLoadingScores(true);

    try {
      const itemId = getScoreItemKey(item);

      // Load IMDb score if not available
      if (!imdbScore) {
        const cachedImdb = readScoreCache("imdb");
        if (cachedImdb.has(itemId)) {
          setImdbScore(cachedImdb.get(itemId));
        } else {
          try {
            const batchScores = await fetchImdbScoresForItems([item]);
            const imdbRating = batchScores[itemId]?.rating;

            if (imdbRating) {
              const numRating = Number(imdbRating);
              if (Number.isFinite(numRating) && numRating > 0) {
                setImdbScore(numRating);
                updateScoreCache("imdb", itemId, numRating);
              }
            }
          } catch (err) {
            console.warn(`Failed to fetch IMDb score for ${item.id}:`, err);
          }
        }
      }

    } finally {
      setLoadingScores(false);
    }
  }, [imdbScore, loadingScores, item]);

  // En navegación de historial (atrás/adelante) NO se anima la entrada: la página
  // debe verse estática, tal cual estaba antes de salir.
  const isBackNav = useIsHistoryNavigation();
  const animDelay =
    totalItems > 30 ? Math.min(index * 0.015, 0.25) : index * 0.03;
  // Se anima todo lo que cabe en pantalla en la vista actual (no un tope fijo).
  const shouldAnimate = !isBackNav && index < Math.max(1, animateWithin);
  const shellClassName =
    "relative z-0 overflow-visible focus-within:z-[40] hover:z-[50]";

  if (viewMode === "list") {
    return (
      <motion.div
        initial={shouldAnimate ? { opacity: 0, y: 10, scale: 0.95 } : false}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -10, scale: 0.95 }}
        transition={{
          duration: 0.25,
          delay: shouldAnimate ? animDelay : 0,
          ease: [0.25, 0.1, 0.25, 1],
        }}
        layout={!isBackNav}
        data-watchlist-card=""
      >
        <Link
          href={href}
          prefetch={false}
          onClick={onPreviewClick}
          className="relative block bg-zinc-900/40 rounded-xl hover:bg-zinc-900/65 transition-colors duration-300 group overflow-hidden after:pointer-events-none after:absolute after:inset-0 after:z-30 after:rounded-[inherit] after:content-[''] after:transition-shadow after:duration-300 hover:after:shadow-[inset_0_0_0_2.5px_rgba(59,130,246,0.95)]"
        >
          <div className="relative flex items-center gap-2 sm:gap-6 p-1.5 sm:p-4">
            <div className="w-[180px] sm:w-[280px] aspect-video rounded-lg overflow-hidden relative shadow-md bg-zinc-900 shrink-0">
              <SmartPoster
                item={item}
                title={title}
                mode={effectiveImageMode}
              />
            </div>
            <div className="flex-1 min-w-0 flex flex-col justify-center gap-1">
              <div className="flex items-center gap-2">
                <h4 className="text-white font-bold text-base leading-tight truncate">
                  {title}
                </h4>
              </div>
              <div className="flex items-center gap-2 text-xs text-zinc-500 -ml-0.5">
                {year && <span>{year}</span>}
                {rating && (
                  <>
                    {year && <span>•</span>}
                    <span className="flex items-center gap-1">
                      <Star className="w-3 h-3 text-amber-400 fill-amber-400" />
                      {rating}
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>
        </Link>
      </motion.div>
    );
  }

  if (viewMode === "compact") {
    return (
      <motion.div
        className={shellClassName}
        initial={shouldAnimate ? { opacity: 0, y: 10, scale: 0.95 } : false}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -10, scale: 0.95 }}
        transition={{
          duration: 0.25,
          delay: shouldAnimate ? animDelay : 0,
          ease: [0.25, 0.1, 0.25, 1],
        }}
        layout={!isBackNav}
        data-watchlist-card=""
      >
        <Link href={href} prefetch={false} onClick={onPreviewClick} className="block">
          <motion.div
            className={`relative ${aspectRatio} group overflow-hidden rounded-lg bg-zinc-900 shadow-md transition-shadow duration-300`}
            whileHover={{
              scale: 1.15,
              zIndex: 100,
              boxShadow:
                "0 20px 25px -5px rgb(0 0 0 / 0.5), 0 8px 10px -6px rgb(0 0 0 / 0.5)",
            }}
            transition={{ type: "spring", stiffness: 300, damping: 20 }}
            style={{
              transformOrigin: "center center",
            }}
            onMouseEnter={handleHover}
          >
            <SmartPoster item={item} title={title} mode={effectiveImageMode} />
            <WatchlistHoverIndicator
              type={type}
              tmdbScore={item.vote_average}
              imdbScore={imdbScore}
              compact
            />
          </motion.div>
        </Link>
      </motion.div>
    );
  }

  // Grid mode
  return (
    <motion.div
      initial={shouldAnimate ? { opacity: 0, scale: 0.95 } : false}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.2, delay: shouldAnimate ? animDelay : 0 }}
      data-watchlist-card=""
    >
      <Link href={href} prefetch={false} onClick={onPreviewClick} className="block">
        <div
          className={`relative ${aspectRatio} group rounded-xl overflow-hidden bg-zinc-900 shadow-md lg:hover:shadow-blue-900/20 transition-shadow duration-300 after:pointer-events-none after:absolute after:inset-0 after:z-30 after:rounded-[inherit] after:content-[''] after:transition-shadow after:duration-300 hover:after:shadow-[inset_0_0_0_2.5px_rgba(59,130,246,0.95)]`}
          onMouseEnter={handleHover}
        >
          <SmartPoster item={item} title={title} mode={effectiveImageMode} />
          <WatchlistHoverIndicator
            type={type}
            tmdbScore={item.vote_average}
            imdbScore={imdbScore}
          />
        </div>
      </Link>
    </motion.div>
  );
});

// ================== MAIN COMPONENT ==================
export default function WatchlistClient() {
  const { session, account, hydrated, logout, updatePreference, authenticated } = useAuth();
  const { t } = useTranslation();
  const isBackNav = useIsHistoryNavigation();
  // Read each persistent cache only once on mount. These JSON.parse and build
  // Maps from localStorage; calling them several times (watchlist x2,
  // providers x2) blocked the first render and added a perceptible delay to the
  // route transition into this page.
  const [initialCache] = useState(() => ({
    watchlist: readWatchlistCache(),
    providers: readProvidersCache(),
  }));
  const { hasBackNavigationSnapshot, shouldRestoreSnapshot } =
    resolveUserListInitialSnapshot(initialCache.watchlist, isBackNav);
  // El SERVIDOR no ve sessionStorage/localStorage, así que nunca detecta la
  // vuelta atrás ni la caché: siempre pinta el hueco negro de más abajo. Si el
  // CLIENTE sí las detecta en su primer render, los dos árboles no coinciden y
  // React descarta el HTML recibido y reconstruye la página entera (error de
  // hidratación). Durante ese primer render se pinta lo mismo que el servidor y
  // la instantánea entra en el siguiente, que React programa de inmediato.
  const hydrationReady = useHydrationReady();
  const paintsBackNavigationSnapshot =
    hasBackNavigationSnapshot && hydrationReady;
  // En una entrada normal solo pintamos caché RECIENTE (`fresh`, < TTL). Al
  // retroceder restauramos también una instantánea válida más antigua: es la vista
  // que el usuario acaba de dejar y permite recuperar contenido + scroll antes de
  // que terminen la hidratación de sesión y la revalidación habitual.
  const [loading, setLoading] = useState(() => !shouldRestoreSnapshot);
  const [logoutLoading, setLogoutLoading] = useState(false);
  const [items, setItems] = useState(() =>
    shouldRestoreSnapshot ? initialCache.watchlist.items : [],
  );
  const [imdbScores, setImdbScores] = useState(() => readScoreCache("imdb"));
  const [traktScores, setTraktScores] = useState(() => readScoreCache("trakt"));
  const layoutImdbScores = imdbScores;
  const layoutTraktScores = traktScores;
  const [providersByItem, setProvidersByItem] = useState(
    () => initialCache.providers,
  );
  // El agrupado debe reaccionar a cada lote de plataformas. Mantener una copia
  // inicial congelada hacía que la primera visita se quedara en “Cargando
  // plataformas…” hasta recargar y leer la caché ya persistida.
  const layoutProvidersByItem = providersByItem;
  const [loadingImdb, setLoadingImdb] = useState(false);
  const [loadingTrakt, setLoadingTrakt] = useState(false);
  const [loadingProviders, setLoadingProviders] = useState(false);

  // Render the cards in chunks: only the first batch mounts on the initial
  // render, so navigating into the page commits cheaply (instant redirect) while
  // those first cards animate in immediately — same fluid entrance as the other
  // pages. The remaining cards fill in during idle time. Starts small on every
  // mount, so the entrance feels consistent every visit.
  // Al VOLVER (atrás/adelante) se renderiza todo de golpe (sin trocear) para que
  // la altura sea correcta al instante y el scroll se restaure sin saltos.
  const [renderLimit, setRenderLimit] = useState(
    isBackNav ? Number.MAX_SAFE_INTEGER : WATCHLIST_INITIAL_RENDER_LIMIT,
  );

  // Filter states with localStorage persistence
  const [viewMode, setViewModeState] = useState(readInitialWatchlistViewMode);

  // Al cambiar de modo, encoge la ventana de render a lo que se ve, para que el
  // modo nuevo se aplique al instante (decenas de tarjetas en vez de cientos).
  const shrinkRenderWindowToView = useCallback(() => {
    const inView = countWatchlistCardsInView();
    if (inView == null) return;
    setRenderLimit((prev) =>
      Math.max(
        WATCHLIST_INITIAL_RENDER_LIMIT,
        Math.min(prev, inView + WATCHLIST_RENDER_CHUNK_SIZE),
      ),
    );
  }, []);

  const setViewMode = useCallback((mode) => {
    shrinkRenderWindowToView();
    setViewModeState(mode);
    if (typeof window !== "undefined") {
      window.localStorage.setItem("showverse:watchlist:viewMode", mode);
    }
    if (authenticated) {
      updatePreference({ defaultView: mode });
    }
  }, [authenticated, updatePreference, shrinkRenderWindowToView]);

  const [typeFilter, setTypeFilter] = useState(() => {
    if (typeof window === "undefined") return "all";
    const saved = window.localStorage.getItem("showverse:watchlist:typeFilter");
    return saved || "all";
  });

  const [sortBy, setSortBy] = useState(() => {
    if (typeof window === "undefined") return "title-asc";
    const saved = window.localStorage.getItem("showverse:watchlist:sortBy");
    return saved || "title-asc";
  });

  const [imageMode, setImageModeState] = useState(() => {
    if (typeof window === "undefined") return "poster";
    const saved = window.localStorage.getItem("showverse:watchlist:imageMode");
    return saved === "backdrop" ? "backdrop" : "poster";
  });

  const setImageMode = useCallback((mode) => {
    shrinkRenderWindowToView();
    setImageModeState(mode);
  }, [shrinkRenderWindowToView]);

  const [groupBy, setGroupBy] = useState(() => {
    if (typeof window === "undefined") return "none";
    const saved = window.localStorage.getItem("showverse:watchlist:groupBy");
    return saved || "none";
  });

  const [subGroupBy, setSubGroupBy] = useState(() => {
    if (typeof window === "undefined") return "none";
    const saved = window.localStorage.getItem("showverse:watchlist:subGroupBy");
    return saved || "none";
  });

  const [q, setQ] = useState("");
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const filtersRef = useRef(null);
  const { isSticky: filtersSticky, isPinned: filtersPinned } =
    useStickyToolbarState(filtersRef);
  const tmdbLogoutInFlightRef = useRef(false);

  // Limpieza única al montar: descarta las versiones antiguas de la caché de
  // elecciones, que quedarían huérfanas en localStorage tras subir la clave.
  useEffect(() => {
    pruneOldImageChoiceCaches();
  }, []);

  const needsImdbScores =
    groupBy === "imdb_rating" ||
    subGroupBy === "imdb_rating" ||
    sortBy === "rating-asc" ||
    sortBy === "rating-desc";
  const needsTraktScores =
    groupBy === "trakt_rating" ||
    subGroupBy === "trakt_rating" ||
    sortBy === "rating-asc" ||
    sortBy === "rating-desc";

  // Al VOLVER (atrás/adelante) el orden se mantiene CONGELADO —tal cual lo dejó el
  // usuario— hasta que cambie la ordenación: se saltan los refrescos asíncronos de
  // puntuaciones que reordenarían el listado.
  const freezeOrder = useBackNavOrderFreeze(
    `${sortBy}|${groupBy}|${subGroupBy}`,
  );
  const [preserveAddedOrderSnapshot] = useState(() =>
    shouldPreserveAddedOrderSnapshot({
      hasBackNavigationSnapshot,
      sortBy,
    }),
  );

  // Persist filter states
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("showverse:watchlist:typeFilter", typeFilter);
  }, [typeFilter]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("showverse:watchlist:sortBy", sortBy);
  }, [sortBy]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("showverse:watchlist:imageMode", imageMode);
  }, [imageMode]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("showverse:watchlist:groupBy", groupBy);
  }, [groupBy]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("showverse:watchlist:subGroupBy", subGroupBy);
  }, [subGroupBy]);

  const handleGroupChange = useCallback(
    (nextGroupBy) => {
      setGroupBy(nextGroupBy);
      if (nextGroupBy === "none" || nextGroupBy === subGroupBy) {
        setSubGroupBy("none");
      }
    },
    [subGroupBy],
  );

  const handleSubGroupChange = useCallback(
    (nextSubGroupBy) => {
      setSubGroupBy(nextSubGroupBy === groupBy ? "none" : nextSubGroupBy);
    },
    [groupBy],
  );

  const handleTmdbLogout = useCallback(async () => {
    if (logoutLoading) return;
    tmdbLogoutInFlightRef.current = true;
    setLogoutLoading(true);
    try {
      const res = await fetch("/auth/tmdb/logout", {
        method: "POST",
        cache: "no-store",
      });
      if (!res.ok) throw new Error("No se pudo cerrar la sesión de TMDb");
      setItems([]);
      setLoading(false);
      logout();
    } catch (error) {
      tmdbLogoutInFlightRef.current = false;
      console.error("Error cerrando sesión TMDb:", error);
      setLogoutLoading(false);
      alert("No se pudo cerrar la sesión de TMDb. Inténtalo de nuevo.");
    }
  }, [logout, logoutLoading]);

  // Load watchlist
  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    const shouldIgnoreExpectedLogoutError = () =>
      cancelled ||
      controller.signal.aborted ||
      tmdbLogoutInFlightRef.current;

    const loadWatchlist = async () => {
      if (!session || !account?.id) {
        setLoading(false);
        return;
      }

      try {
        setLoading(items.length === 0);
        const response = await fetch("/api/tmdb/account/watchlist", {
          signal: controller.signal,
        });

        if (shouldIgnoreExpectedLogoutError()) return;

        if (!response.ok) {
          if (
            shouldIgnoreExpectedLogoutError() ||
            response.status === 401 ||
            !session ||
            !account?.id
          ) {
            setItems([]);
            return;
          }
          // SERVIDOR CAÍDO (5xx/429, túnel con el NAS apagado): NO vaciar.
          // Conservamos/recuperamos la caché —aunque sea vieja— para seguir usando
          // la app offline.
          if (isUnavailableStatus(response.status)) {
            const cached = readWatchlistCache();
            if (cached?.items?.length) {
              setItems((prev) => (prev.length ? prev : cached.items));
            }
            return;
          }
          console.error("API error:", response.status, response.statusText);
          setItems([]);
          return;
        }

        const text = await response.text();
        if (shouldIgnoreExpectedLogoutError()) return;
        if (!text) {
          console.error("Empty response from API");
          setItems([]);
          return;
        }

        const data = JSON.parse(text);
        const watchlist = data?.watchlist || [];

        // Add index for sorting by added date (most recent first from API)
        const freshWatchlistWithIndex = watchlist.map((item, index) => ({
          ...item,
          _addedIndex: index,
        }));
        prunePendingListChanges(
          "watchlist",
          new Set(freshWatchlistWithIndex.map(userListItemKey)),
        );
        const watchlistWithIndex = mergePendingTmdbListItems(
          freshWatchlistWithIndex,
          "watchlist",
        );

        // Load namespaced cached scores before rendering grouped views.
        // Missing IMDb/Trakt scores stay in their explicit "Sin puntuación"
        // bucket until the real provider score arrives.
        const cachedImdb = readScoreCache("imdb");
        if (cachedImdb.size > 0) setImdbScores(cachedImdb);
        const cachedTrakt = readScoreCache("trakt");
        if (cachedTrakt.size > 0) setTraktScores(cachedTrakt);

        // Conserva el orden ya visible durante la vuelta, pero reconcilia las
        // altas/bajas ocurridas desde una ficha: sin esto, los pendientes
        // añadidos (que van al principio en added-desc) o quitados quedaban
        // invisibles hasta recargar. La reconciliación mantiene la posición de
        // los que siguen y coloca los nuevos en el extremo reciente.
        if (preserveAddedOrderSnapshot) {
          setItems((prev) =>
            reconcileAddedOrderSnapshot(
              prev,
              watchlistWithIndex,
              userListItemKey,
            ),
          );
        } else {
          setItems(watchlistWithIndex);
        }
        writeWatchlistCache(watchlistWithIndex);
      } catch (error) {
        if (shouldIgnoreExpectedLogoutError() || error?.name === "AbortError") {
          return;
        }
        console.error("Error loading watchlist:", error);
        // Error de RED (servidor apagado): conservamos/recuperamos la caché en vez
        // de vaciar, para seguir mostrando la lista offline.
        if (isServerUnavailable(error)) {
          const cached = readWatchlistCache();
          if (cached?.items?.length) {
            setItems((prev) => (prev.length ? prev : cached.items));
          }
        } else {
          setItems([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadWatchlist();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [session, account, preserveAddedOrderSnapshot]);

  // Cambios en vivo desde una ficha / DetailModal (p. ej. quitar de Pendientes
  // desde el drawer abierto sobre esta misma página): se refleja al instante.
  useEffect(() => {
    const onChange = (event) => {
      const detail = event?.detail;
      if (!detail || !Array.isArray(detail.listTypes) || !detail.listTypes.includes("watchlist")) return;
      const tmdbId = Number(detail.tmdbId);
      if (!Number.isFinite(tmdbId)) return;
      const matches = (it) => {
        const raw = it?.media_type || (it?.title ? "movie" : "tv");
        const mt = raw === "tv" || raw === "show" ? "tv" : "movie";
        return Number(it?.id) === tmdbId && mt === detail.mediaType;
      };
      setItems((prev) => {
        const exists = prev.some(matches);
        if (!detail.added) return exists ? prev.filter((it) => !matches(it)) : prev;
        if (exists || !detail.item) return prev;
        return [detail.item, ...prev];
      });
    };
    window.addEventListener(LIST_CHANGED_EVENT, onChange);
    return () => window.removeEventListener(LIST_CHANGED_EVENT, onChange);
  }, []);

  // Prefetch IMDb scores in background (non-blocking)
  useEffect(() => {
    if (items.length === 0) return;
    if (!needsImdbScores) return;
    // Al volver (atrás) con el orden congelado: no refrescar puntuaciones para no
    // reordenar. El orden permanece exactamente como lo dejó el usuario.
    if (freezeOrder) return;

    let cancelled = false;

    const loadImdbScores = async () => {
      const cachedEntries = readScoreCacheEntries("imdb");
      const scores = new Map();
      cachedEntries.forEach((entry, id) => {
        scores.set(id, entry.score);
      });

      if (scores.size > 0) {
        startTransition(() => setImdbScores(new Map(scores)));
      }

      const now = Date.now();
      const itemsToFetch = items.filter((item) =>
        shouldRefreshScore(item, cachedEntries.get(getScoreItemKey(item)), now),
      );

      if (itemsToFetch.length === 0) {
        setLoadingImdb(false);
        return;
      }

      setLoadingImdb(true);

      try {
        const refreshedIds = new Set();
        const batchSize = 80;

        for (let i = 0; i < itemsToFetch.length; i += batchSize) {
          if (cancelled) break;

          const batch = itemsToFetch.slice(i, i + batchSize);
          const batchScores = await fetchImdbScoresForItems(batch);
          let hasBatchUpdates = false;

          batch.forEach((item) => {
            const scoreKey = getScoreItemKey(item);
            const rating = Number(batchScores[scoreKey]?.rating);
            if (!Number.isFinite(rating) || rating <= 0) return;
            scores.set(scoreKey, rating);
            refreshedIds.add(scoreKey);
            hasBatchUpdates = true;
          });

          if (hasBatchUpdates && !cancelled) {
            startTransition(() => setImdbScores(new Map(scores)));
            await new Promise((resolve) => setTimeout(resolve, 0));
          }
        }

        if (!cancelled && refreshedIds.size > 0) {
          writeScoreCache("imdb", scores, refreshedIds);
        }
      } catch (error) {
        console.error("Error loading IMDb scores:", error);
      } finally {
        if (!cancelled) {
          setLoadingImdb(false);
        }
      }
    };

    loadImdbScores();
    return () => {
      cancelled = true;
    };
  }, [items, needsImdbScores, freezeOrder]);

  // Prefetch Trakt scores in background (non-blocking)
  useEffect(() => {
    if (items.length === 0) return;
    if (!needsTraktScores) return;
    // Al volver (atrás) con el orden congelado: no refrescar puntuaciones (ver arriba).
    if (freezeOrder) return;

    let cancelled = false;

    const loadTraktScores = async () => {
      const cachedEntries = readScoreCacheEntries("trakt");
      const scores = new Map();
      cachedEntries.forEach((entry, id) => {
        scores.set(id, entry.score);
      });

      if (scores.size > 0) {
        startTransition(() => setTraktScores(new Map(scores)));
      }

      const now = Date.now();
      const itemsToFetch = items.filter((item) =>
        shouldRefreshScore(item, cachedEntries.get(getScoreItemKey(item)), now),
      );

      if (itemsToFetch.length === 0) {
        setLoadingTrakt(false);
        return;
      }

      setLoadingTrakt(true);

      try {
        let fetchedCount = 0;
        const refreshedIds = new Set();
        const batchSize = 4;

        const processItem = async (item) => {
          const type = item.media_type || (item.title ? "movie" : "tv");

          try {
            const traktData = await traktGetScoreboard({
              type,
              tmdbId: item.id,
            });
            const rating = traktData?.community?.rating;
            if (!rating || typeof rating !== "number" || isNaN(rating)) {
              return false;
            }

            const scoreKey = getScoreItemKey(item);
            scores.set(scoreKey, rating);
            refreshedIds.add(scoreKey);
            fetchedCount++;
            return true;
          } catch (err) {
            console.warn(`[Trakt] Failed to fetch score for ${item.id}:`, err);
            return false;
          }
        };

        for (let i = 0; i < itemsToFetch.length; i += batchSize) {
          if (cancelled) break;

          const batch = itemsToFetch.slice(i, i + batchSize);
          const results = await Promise.all(batch.map(processItem));
          const hasBatchUpdates = results.some(Boolean);

          if (hasBatchUpdates && !cancelled) {
            startTransition(() => setTraktScores(new Map(scores)));
            await new Promise((resolve) => setTimeout(resolve, 0));
          }
        }

        if (!cancelled && fetchedCount > 0) {
          writeScoreCache("trakt", scores, refreshedIds);
        }
      } catch (error) {
        console.error("Error loading Trakt scores:", error);
      } finally {
        if (!cancelled) {
          setLoadingTrakt(false);
        }
      }
    };

    loadTraktScores();
    return () => {
      cancelled = true;
    };
  }, [items, needsTraktScores, freezeOrder]);

  // Filter and sort
  const filtered = useMemo(() => {
    const needle = normText(q);
    return items.filter((item) => {
      const type = item.media_type || (item.title ? "movie" : "tv");
      if (typeFilter === "movies" && type !== "movie") return false;
      if (typeFilter === "shows" && type !== "tv") return false;
      if (needle) {
        if (!titleMatchesQuery(item, needle)) return false;
      }
      return true;
    });
  }, [items, q, typeFilter]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    if (sortBy === "title-asc") {
      return arr.sort((a, b) => {
        const titleA = (a.title || a.name || "").toLowerCase();
        const titleB = (b.title || b.name || "").toLowerCase();
        return titleA.localeCompare(titleB);
      });
    }
    if (sortBy === "title-desc") {
      return arr.sort((a, b) => {
        const titleA = (a.title || a.name || "").toLowerCase();
        const titleB = (b.title || b.name || "").toLowerCase();
        return titleB.localeCompare(titleA);
      });
    }
    if (sortBy === "rating-desc" || sortBy === "rating-asc") {
      const getRating = (item) => {
        if (groupBy === "imdb_rating")
          return layoutImdbScores.get(getScoreItemKey(item)) || 0;
        if (groupBy === "tmdb_rating") return item.vote_average || 0;
        if (groupBy === "trakt_rating")
          return layoutTraktScores.get(getScoreItemKey(item)) || 0;
        // Default: average of available ratings (IMDb, TMDb, Trakt)
        const tmdb = item.vote_average || 0;
        const imdb = layoutImdbScores.get(getScoreItemKey(item)) || 0;
        const trakt = layoutTraktScores.get(getScoreItemKey(item)) || 0;
        let sum = 0,
          count = 0;
        if (tmdb > 0) {
          sum += tmdb;
          count++;
        }
        if (imdb > 0) {
          sum += imdb;
          count++;
        }
        if (trakt > 0) {
          sum += trakt;
          count++;
        }
        return count > 0 ? sum / count : 0;
      };
      const dir = sortBy === "rating-desc" ? -1 : 1;
      return arr.sort((a, b) => dir * (getRating(a) - getRating(b)));
    }
    if (sortBy === "added-desc") {
      // Most recent added first (lower index = more recent)
      return arr.sort((a, b) => (a._addedIndex || 0) - (b._addedIndex || 0));
    }
    if (sortBy === "added-asc") {
      // Oldest added first (higher index = older)
      return arr.sort((a, b) => (b._addedIndex || 0) - (a._addedIndex || 0));
    }
    return arr;
  }, [filtered, sortBy, groupBy, layoutImdbScores, layoutTraktScores]);

  useEffect(() => {
    if (
      (groupBy !== "provider" && subGroupBy !== "provider") ||
      sorted.length === 0
    )
      return;

    let cancelled = false;

    const loadProviders = async () => {
      const cachedProviders = readProvidersCache();
      const providerMap = new Map(cachedProviders);

      const itemsToFetch = sorted.filter(
        (item) => !providerMap.has(getProviderMediaKey(item)),
      );

      if (cachedProviders.size > 0) {
        startTransition(() => setProvidersByItem(new Map(providerMap)));
      }

      if (itemsToFetch.length === 0) {
        setLoadingProviders(false);
        return;
      }

      setLoadingProviders(true);

      try {
        const plexIndexPromise = fetchPlexLibraryIndex();
        const batchSize = 12;

        for (let i = 0; i < itemsToFetch.length; i += batchSize) {
          if (cancelled) break;

          const batch = itemsToFetch.slice(i, i + batchSize);
          const providerResultsPromise = Promise.all(
            batch.map(async (item) => {
              const type = resolveItemType(item);
              const key = getProviderMediaKey(item);

              try {
                const data = await getWatchProviders(type, item.id, "ES");
                return { key, data };
              } catch (err) {
                console.warn(`Failed to fetch providers for ${key}:`, err);
                return { key, data: null };
              }
            }),
          );
          const [providerResults, plexIndex] = await Promise.all([
            providerResultsPromise,
            plexIndexPromise,
          ]);
          const results = providerResults.map(({ key, data }) => ({
            key,
            providers: getCanonicalProviders(
              data?.providers || [],
              plexIndex.has(key),
            ),
          }));

          results.forEach(({ key, providers }) => {
            providerMap.set(key, providers);
          });

          if (!cancelled) {
            startTransition(() => setProvidersByItem(new Map(providerMap)));
            writeProvidersCache(providerMap);
            await new Promise((resolve) => setTimeout(resolve, 0));
          }
        }
      } finally {
        if (!cancelled) setLoadingProviders(false);
      }
    };

    loadProviders();

    return () => {
      cancelled = true;
    };
  }, [groupBy, subGroupBy, sorted]);

  const stats = useMemo(() => {
    let movies = 0;
    let shows = 0;
    for (const item of filtered) {
      const type = item.media_type || (item.title ? "movie" : "tv");
      if (type === "movie") movies++;
      else shows++;
    }
    return { total: filtered.length, movies, shows };
  }, [filtered]);

  // Grouping logic (sin user_rating)
  const grouped = useMemo(() => {
    if (groupBy === "none") return null;

    const groups = new Map();
    const groupContext = {
      imdbScores: layoutImdbScores,
      traktScores: layoutTraktScores,
      providersByItem: layoutProvidersByItem,
    };

    for (const item of sorted) {
      const metas = buildWatchlistGroupMetas(item, groupBy, groupContext);
      for (const meta of metas) {
        if (!groups.has(meta.key)) {
          groups.set(meta.key, {
            key: meta.key,
            label: meta.label,
            items: [],
            stats: createWatchlistGroupStats(),
            subgroups: null,
          });
        }

        const group = groups.get(meta.key);
        group.items.push(item);
        addWatchlistGroupStats(
          group.stats,
          item,
          layoutImdbScores,
          layoutTraktScores,
        );
      }
    }

    for (const group of groups.values()) {
      finalizeWatchlistGroupStats(group.stats);

      if (subGroupBy && subGroupBy !== "none") {
        if (isRatingGroupKey(subGroupBy)) {
          group.subgroups = buildSmartWatchlistRatingSubgroups(
            group.items,
            subGroupBy,
            groupContext,
          );
        } else {
          const subgroups = new Map();

          for (const item of group.items) {
            const [meta] = buildWatchlistGroupMetas(
              item,
              subGroupBy,
              groupContext,
            );
            if (!meta) continue;
            if (!subgroups.has(meta.key)) {
              subgroups.set(meta.key, {
                key: meta.key,
                label: meta.label,
                items: [],
              });
            }
            subgroups.get(meta.key).items.push(item);
          }

          group.subgroups = sortWatchlistGroups(
            Array.from(subgroups.values()),
            subGroupBy,
          );
        }
      }
    }

    return sortWatchlistGroups(Array.from(groups.values()), groupBy);
  }, [
    sorted,
    groupBy,
    subGroupBy,
    layoutImdbScores,
    layoutTraktScores,
    layoutProvidersByItem,
    loadingProviders,
  ]);

  const renderedSorted = useMemo(
    () => sorted.slice(0, renderLimit),
    [sorted, renderLimit],
  );

  // Un título puede pertenecer a varias plataformas (o géneros/subgrupos). El
  // límite incremental ha de contar cada tarjeta que se va a pintar, no solo
  // los títulos únicos, para que los grupos situados al final no queden vacíos.
  const renderableItemCount = useMemo(() => {
    if (!grouped) return sorted.length;
    return grouped.reduce((total, group) => {
      if (!group.subgroups?.length) return total + group.items.length;
      return (
        total +
        group.subgroups.reduce(
          (subgroupTotal, subgroup) => subgroupTotal + subgroup.items.length,
          0,
        )
      );
    }, 0);
  }, [grouped, sorted.length]);

  // Only start expanding the render window AFTER the entrance animation of the
  // first batch has finished, so growing the list never interrupts (and janks)
  // that animation or the navbar selector transition. Until then the page just
  // shows the first cards animating in, exactly like History / In-Progress.
  const [canExpandRender, setCanExpandRender] = useState(false);
  useEffect(() => {
    const t = window.setTimeout(() => setCanExpandRender(true), 450);
    return () => window.clearTimeout(t);
  }, []);

  // Grow the render window up to the full list during idle time, so the rest of
  // the cards appear shortly after the (cheap, fast) first paint.
  useEffect(() => {
    if (!canExpandRender || renderLimit >= renderableItemCount) return;
    const handle = scheduleWatchlistRenderChunk(() => {
      setRenderLimit((prev) =>
        Math.min(prev + WATCHLIST_RENDER_CHUNK_SIZE, renderableItemCount),
      );
    });
    return () => cancelWatchlistRenderChunk(handle);
  }, [canExpandRender, renderLimit, renderableItemCount]);

  const groupSectionRefs = useRef(new Map());
  const forcedStickyTimerRef = useRef(null);
  const [forcedStickyGroupKey, setForcedStickyGroupKey] = useState(null);

  useEffect(() => {
    return () => {
      if (forcedStickyTimerRef.current) {
        window.clearTimeout(forcedStickyTimerRef.current);
      }
    };
  }, []);

  const setGroupSectionRef = useCallback((key, node) => {
    if (!key) return;
    if (node) groupSectionRefs.current.set(key, node);
    else groupSectionRefs.current.delete(key);
  }, []);

  const scrollGroupIntoStickyPosition = useCallback((groupKey) => {
    if (typeof window === "undefined" || window.innerWidth < 1024) return;

    const target = groupSectionRefs.current.get(groupKey);
    if (!target) return;

    const divider = target.querySelector("[data-group-divider]");
    const targetRect = target.getBoundingClientRect();
    const targetTop = window.scrollY + targetRect.top;
    const dividerMarginTop = divider
      ? Number.parseFloat(window.getComputedStyle(divider).marginTop) || 0
      : 0;
    const stickyTop = window.innerWidth >= 1024 ? 136 : 108;
    const activationBias = 4;

    setForcedStickyGroupKey(groupKey);
    if (forcedStickyTimerRef.current) {
      window.clearTimeout(forcedStickyTimerRef.current);
    }
    forcedStickyTimerRef.current = window.setTimeout(() => {
      setForcedStickyGroupKey((currentKey) =>
        currentKey === groupKey ? null : currentKey,
      );
      forcedStickyTimerRef.current = null;
    }, 900);

    window.scrollTo({
      top: Math.max(
        0,
        targetTop + dividerMarginTop - stickyTop + activationBias,
      ),
      behavior: "smooth",
    });
  }, []);

  const scrollToNextGroup = useCallback(
    (currentKey) => {
      if (typeof window === "undefined" || window.innerWidth < 1024) return;
      if (!grouped?.length) return;

      const currentIndex = grouped.findIndex(
        (group) => group.key === currentKey,
      );
      const nextGroup = grouped[currentIndex + 1];
      if (!nextGroup) return;

      scrollGroupIntoStickyPosition(nextGroup.key);
    },
    [grouped, scrollGroupIntoStickyPosition],
  );

  const scrollToPreviousGroup = useCallback(
    (currentKey) => {
      if (typeof window === "undefined" || window.innerWidth < 1024) return;
      if (!grouped?.length) return;

      const currentIndex = grouped.findIndex(
        (group) => group.key === currentKey,
      );
      const previousGroup = grouped[currentIndex - 1];
      if (!previousGroup) return;

      scrollGroupIntoStickyPosition(previousGroup.key);
    },
    [grouped, scrollGroupIntoStickyPosition],
  );

  const scoreLoadingLabel =
    loadingImdb && loadingTrakt
      ? "Actualizando puntuaciones de IMDb y Trakt..."
      : loadingImdb
        ? "Actualizando puntuaciones de IMDb..."
        : "Actualizando puntuaciones de Trakt...";

  const resolveItemType = (item) =>
    item?.media_type || (item?.title ? "movie" : "tv");
  const getMediaKey = (item) => `${resolveItemType(item)}-${item.id}`;
  const getItemsGridClass = (withTopMargin = false) => {
    const hoverBleedSpace = withTopMargin
      ? " -mx-3 overflow-visible px-3 pb-6 lg:-mx-5 lg:px-5 lg:pb-8"
      : "";
    if (viewMode === "list") {
      return `grid grid-cols-1 xl:grid-cols-2 gap-4${withTopMargin ? " mt-3" : ""}${hoverBleedSpace}`;
    }
    if (viewMode === "compact") {
      const compactCols =
        imageMode === "backdrop"
          ? "grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4 xl:grid-cols-4"
          : "grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-7 xl:grid-cols-8";
      return `grid gap-2 ${compactCols}${withTopMargin ? " mt-3" : ""}${hoverBleedSpace}`;
    }
    const gridCols =
      imageMode === "backdrop"
        ? "grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-3"
        : "grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-6";
    return `grid gap-3 ${gridCols}${withTopMargin ? " mt-3" : ""}${hoverBleedSpace}`;
  };

  // Nº de tarjetas a animar a la entrada = las que caben en pantalla en la vista
  // actual (mismas columnas que la rejilla). Sustituye al tope fijo de 24.
  const entranceVisibleCount = estimateVisibleCards({
    columns: pickResponsiveColumns(
      viewMode === "list"
        ? { base: 1, xl: 2 }
        : viewMode === "compact"
          ? imageMode === "backdrop"
            ? { base: 2, sm: 3, md: 4, lg: 4, xl: 4 }
            : { base: 4, sm: 5, md: 6, lg: 7, xl: 8 }
          : imageMode === "backdrop"
            ? { base: 2, sm: 2, md: 3, lg: 3, xl: 3 }
            : { base: 3, sm: 4, md: 5, lg: 6, xl: 6 },
    ),
    aspect:
      viewMode === "list" || imageMode === "backdrop"
        ? 0.5625
        : 1.5,
  });

  if (!hydrated && !paintsBackNavigationSnapshot) {
    return <div className="min-h-screen bg-black" />;
  }

  if (
    (!session || !account) &&
    !(paintsBackNavigationSnapshot && !hydrated)
  ) {
    return (
      <div className="min-h-screen bg-black text-zinc-100 font-sans selection:bg-blue-500/30 pb-20">
        <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
          {/* Manchas abstractas azules y negras */}
          <div className="absolute -top-[10%] -left-[5%] w-[60vw] max-w-[800px] aspect-square rounded-full bg-blue-600/15 blur-[120px] sm:blur-[150px]" />
          <div className="absolute top-[15%] -right-[5%] w-[55vw] max-w-[700px] aspect-square rounded-full bg-blue-700/20 blur-[120px] sm:blur-[150px]" />
          <div className="absolute -bottom-[10%] left-[15%] w-[65vw] max-w-[800px] aspect-square rounded-full bg-blue-800/25 blur-[120px] sm:blur-[150px]" />
        </div>

        <div className="relative z-10 max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-8 lg:py-12">
          <motion.header
            className="mb-8"
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
          >
            <div className="flex items-center gap-3 mb-2">
              <div className="h-px w-12 bg-blue-500" />
              <span className="text-blue-400 font-bold uppercase tracking-widest text-xs">
                POR VER
              </span>
            </div>
            <h1 className="text-4xl md:text-6xl font-black tracking-tighter text-white">
              Pendientes<span className="text-blue-500">.</span>
            </h1>
            <p className="mt-2 text-zinc-400 max-w-lg text-lg hidden md:block">
              Títulos guardados para ver más tarde.
            </p>
          </motion.header>

          <div className="flex items-center justify-center py-12 lg:py-24">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="max-w-[380px] w-full flex flex-col items-center justify-center px-6 py-10 bg-zinc-950/40 border border-white/10 rounded-[2.5rem] text-center shadow-[0_30px_80px_rgba(0,0,0,0.8),inset_0_1px_1px_rgba(255,255,255,0.15)] backdrop-blur-3xl"
            >
              <div className="relative mb-4 flex h-24 w-48 items-center justify-center mx-auto">
                <img
                  src="/logo-TSV-sinFondo.png"
                  alt="The Show Verse"
                  className="h-full w-auto object-contain scale-[1.6]"
                />
              </div>
              <h2 className="text-2xl font-black text-white tracking-tight drop-shadow-md mb-2">
                Inicia sesión
              </h2>
              <p className="text-zinc-400 text-xs font-medium max-w-sm mb-6 leading-relaxed">
                Inicia sesión para ver y gestionar tu lista de títulos pendientes.
              </p>
              <Link
                href="/login?next=/watchlist"
                className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-sky-500 via-indigo-500 to-emerald-500 hover:from-sky-400 hover:via-indigo-400 hover:to-emerald-400 text-white font-extrabold uppercase tracking-widest text-xs transition-all active:scale-[0.98] shadow-[0_4px_20px_rgba(99,102,241,0.25)] hover:shadow-[0_4px_25px_rgba(99,102,241,0.45)] cursor-pointer"
              >
                Iniciar sesión
              </Link>
            </motion.div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-zinc-100 font-sans selection:bg-blue-500/30">
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        {/* Manchas abstractas azules y negras */}
        <div className="absolute -top-[10%] -left-[5%] w-[60vw] max-w-[800px] aspect-square rounded-full bg-blue-600/15 blur-[120px] sm:blur-[150px]" />
        <div className="absolute top-[15%] -right-[5%] w-[55vw] max-w-[700px] aspect-square rounded-full bg-blue-700/20 blur-[120px] sm:blur-[150px]" />
        <div className="absolute -bottom-[10%] left-[15%] w-[65vw] max-w-[800px] aspect-square rounded-full bg-blue-800/25 blur-[120px] sm:blur-[150px]" />
      </div>

      <div className="relative z-10 max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-8 lg:py-12">
        {/* Header */}
        <motion.header
          className="mb-6 sm:mb-10"
          initial={isBackNav ? false : { opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={isBackNav ? { duration: 0 } : { duration: 0.5, ease: "easeOut" }}
        >
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <div className="h-px w-12 bg-blue-500" />
                <span className="text-blue-400 font-bold uppercase tracking-widest text-xs">
                  POR VER
                </span>
              </div>
              <div className="flex items-center gap-6">
                <h1 className="text-4xl md:text-6xl font-black tracking-tighter text-white">
                  Pendientes<span className="text-blue-500">.</span>
                </h1>

                {/* Action buttons next to title */}
                <div className="flex items-center gap-2">
                  <motion.div
                    initial={isBackNav ? false : { opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={isBackNav ? { duration: 0 } : { duration: 0.4, delay: 0.3 }}
                  >
                    <LiquidButton
                      onClick={() => window.location.reload()}
                      disabled={loading}
                      loading={loading}
                      activeColor="blue"
                      groupId="watchlist-header-actions"
                      title="Sincronizar lista"
                      className="!bg-white/5 !bg-gradient-to-br !from-white/20 !via-white/5 !to-transparent !border-0 shadow-lg backdrop-blur-md hover:!bg-white/15"
                    >
                      <RotateCcw
                        className={`w-5 h-5 ${loading ? "animate-spin" : ""}`}
                      />
                    </LiquidButton>
                  </motion.div>

                  <motion.div
                    initial={isBackNav ? false : { opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={isBackNav ? { duration: 0 } : { duration: 0.4, delay: 0.4 }}
                  >
                    <LiquidButton
                      onClick={handleTmdbLogout}
                      disabled={loading || logoutLoading}
                      loading={loading || logoutLoading}
                      activeColor="red"
                      groupId="watchlist-header-actions"
                      title="Desconectar cuenta TMDb"
                      className="!text-red-400 hover:!text-red-300 !bg-white/5 !bg-gradient-to-br !from-white/20 !via-white/5 !to-transparent !border-0 shadow-lg backdrop-blur-md hover:!bg-white/15"
                    >
                      <LogOut className="w-5 h-5" />
                    </LiquidButton>
                  </motion.div>
                </div>
              </div>
              <p className="mt-2 text-zinc-400 max-w-lg text-lg hidden md:block">
                Títulos guardados para ver más tarde.
              </p>
            </div>

            {!loading && (
              <motion.div
                className="flex gap-3 md:gap-4 w-full lg:w-auto justify-center lg:justify-end"
                initial={isBackNav ? false : { opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={isBackNav ? { duration: 0 } : { duration: 0.5, delay: 0.3 }}
              >
                <div className="relative overflow-hidden flex-1 lg:flex-none lg:min-w-[120px] rounded-[2rem] bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-lg shadow-lg px-4 py-3 md:px-5 md:py-4 flex flex-col items-center justify-center gap-1">
                  <div className="relative z-10 mb-1 text-blue-400">
                    <Bookmark className="w-6 h-6 md:w-7 md:h-7 fill-blue-400" />
                  </div>
                  <div className="relative z-10 text-xl md:text-2xl lg:text-3xl font-black text-white tracking-tight drop-shadow-md">
                    {stats.total}
                  </div>
                  <div className="relative z-10 text-[9px] md:text-[10px] uppercase font-bold text-zinc-300 tracking-wider text-center leading-tight">
                    Total
                  </div>
                </div>
                <div className="relative overflow-hidden flex-1 lg:flex-none lg:min-w-[120px] rounded-[2rem] bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-lg shadow-lg px-4 py-3 md:px-5 md:py-4 flex flex-col items-center justify-center gap-1">
                  <div className="relative z-10 mb-1 text-sky-400">
                    <Film className="w-6 h-6 md:w-7 md:h-7" />
                  </div>
                  <div className="relative z-10 text-xl md:text-2xl lg:text-3xl font-black text-white tracking-tight drop-shadow-md">
                    {stats.movies}
                  </div>
                  <div className="relative z-10 text-[9px] md:text-[10px] uppercase font-bold text-zinc-300 tracking-wider text-center leading-tight">
                    Películas
                  </div>
                </div>
                <div className="relative overflow-hidden flex-1 lg:flex-none lg:min-w-[120px] rounded-[2rem] bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-lg shadow-lg px-4 py-3 md:px-5 md:py-4 flex flex-col items-center justify-center gap-1">
                  <div className="relative z-10 mb-1 text-purple-400">
                    <TvGlyph className="w-6 h-6 md:w-7 md:h-7 text-purple-400" />
                  </div>
                  <div className="relative z-10 text-xl md:text-2xl lg:text-3xl font-black text-white tracking-tight drop-shadow-md">
                    {stats.shows}
                  </div>
                  <div className="relative z-10 text-[9px] md:text-[10px] uppercase font-bold text-zinc-300 tracking-wider text-center leading-tight">
                    Series
                  </div>
                </div>
              </motion.div>
            )}
          </div>
        </motion.header>

        {/* Filters */}
        <motion.div
          ref={filtersRef}
          data-menu-pinned={filtersPinned}
          className={`sticky top-14 z-[70] space-y-1 ${isBackNav ? "transition-none" : "transition-all duration-300"} sm:top-20 sm:mb-5 lg:mb-6 ${
            groupBy === "none" ? "mb-6" : "mb-2"
          }`}
          initial={isBackNav ? false : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={
            isBackNav ? { duration: 0 } : { duration: 0.4, delay: 0.5 }
          }
        >
          {/* Mobile: search + toggle */}
          <div className="relative z-10 flex gap-2 lg:hidden">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-500 z-10 pointer-events-none" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Buscar..."
                className="w-full h-11 rounded-2xl pl-10 pr-10 py-2.5 text-sm transition-all focus:outline-none focus:ring-2 focus:ring-blue-500/50 placeholder:text-zinc-400 bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-lg shadow-lg text-white"
              />
              {q && (
                <button
                  onClick={() => setQ("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 hover:bg-white/10 rounded-md transition-colors"
                >
                  <X className="w-3.5 h-3.5 text-zinc-400 hover:text-white" />
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={() => setMobileFiltersOpen((v) => !v)}
              className={`h-11 w-11 shrink-0 flex items-center justify-center rounded-2xl transition-all bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-lg shadow-lg ${
                mobileFiltersOpen
                  ? "text-blue-400 shadow-[0_0_15px_rgba(59,130,246,0.3)]"
                  : "text-zinc-200 hover:bg-black/30"
              }`}
            >
              <SlidersHorizontal className="w-4 h-4" />
            </button>
          </div>

          {/* Antes de fijarse, el panel forma parte del flujo. Al alcanzar el
              sticky se convierte en overlay para no desplazar el contenido. */}
          <AnimatePresence>
            {mobileFiltersOpen && (
              <motion.div
                initial={{ height: 0 }}
                animate={{ height: "auto" }}
                exit={{ height: 0 }}
                transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
                className={`z-[80] mt-2 origin-top space-y-2 overflow-hidden lg:hidden ${
                  filtersSticky
                    ? "absolute left-0 right-0 top-full"
                    : "relative"
                }`}
              >
                <div className="flex gap-2">
                  <div className="flex-1">
                    <InlineDropdown
                      label="Tipo"
                      valueLabel={
                        typeFilter === "all"
                          ? "Todo"
                          : typeFilter === "movies"
                            ? "Películas"
                            : "Series"
                      }
                      icon={Filter}
                    >
                      {({ close }) => (
                        <>
                          <DropdownItem
                            active={typeFilter === "all"}
                            onClick={() => {
                              setTypeFilter("all");
                              close();
                            }}
                          >
                            Todo
                          </DropdownItem>
                          <DropdownItem
                            active={typeFilter === "movies"}
                            onClick={() => {
                              setTypeFilter("movies");
                              close();
                            }}
                          >
                            Películas
                          </DropdownItem>
                          <DropdownItem
                            active={typeFilter === "shows"}
                            onClick={() => {
                              setTypeFilter("shows");
                              close();
                            }}
                          >
                            Series
                          </DropdownItem>
                        </>
                      )}
                    </InlineDropdown>
                  </div>
                  <div className="flex-1">
                    <InlineDropdown
                      label="Agrupar"
                      valueLabel={getGroupingValueLabel(groupBy, subGroupBy)}
                      mobileValueLabel={getCompactGroupingValueLabel(
                        groupBy,
                        subGroupBy,
                      )}
                      compactMobile
                      icon={Layers3}
                    >
                      {({ close }) => (
                        <GroupingDropdownContent
                          groupBy={groupBy}
                          subGroupBy={subGroupBy}
                          onGroupChange={handleGroupChange}
                          onSubGroupChange={handleSubGroupChange}
                          close={close}
                        />
                      )}
                    </InlineDropdown>
                  </div>
                </div>

                <div className="flex gap-2">
                  <div className="flex-1">
                    <InlineDropdown
                      label="Orden"
                      valueLabel={
                        sortBy === "title-asc"
                          ? "A-Z"
                          : sortBy === "title-desc"
                            ? "Z-A"
                            : sortBy === "rating-desc"
                              ? "Mejor"
                              : sortBy === "rating-asc"
                                ? "Peor"
                                : sortBy === "added-desc"
                                  ? "Reciente"
                                  : sortBy === "added-asc"
                                    ? "Antiguo"
                                    : "A-Z"
                      }
                      icon={ArrowUpDown}
                    >
                      {({ close }) => (
                        <>
                          <DropdownItem
                            active={sortBy === "title-asc"}
                            onClick={() => {
                              setSortBy("title-asc");
                              close();
                            }}
                          >
                            Título A-Z
                          </DropdownItem>
                          <DropdownItem
                            active={sortBy === "title-desc"}
                            onClick={() => {
                              setSortBy("title-desc");
                              close();
                            }}
                          >
                            Título Z-A
                          </DropdownItem>
                          <DropdownItem
                            active={sortBy === "rating-desc"}
                            onClick={() => {
                              setSortBy("rating-desc");
                              close();
                            }}
                          >
                            Valoración ↓
                          </DropdownItem>
                          <DropdownItem
                            active={sortBy === "rating-asc"}
                            onClick={() => {
                              setSortBy("rating-asc");
                              close();
                            }}
                          >
                            Valoración ↑
                          </DropdownItem>
                          <DropdownItem
                            active={sortBy === "added-desc"}
                            onClick={() => {
                              setSortBy("added-desc");
                              close();
                            }}
                          >
                            Añadido reciente
                          </DropdownItem>
                          <DropdownItem
                            active={sortBy === "added-asc"}
                            onClick={() => {
                              setSortBy("added-asc");
                              close();
                            }}
                          >
                            Añadido antiguo
                          </DropdownItem>
                        </>
                      )}
                    </InlineDropdown>
                  </div>
                  <div className="flex-1 flex gap-2">
                    <div className="flex rounded-2xl p-1 h-11 items-center flex-1 bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-lg shadow-lg">
                      <button
                        onClick={() => setViewMode("list")}
                        className={`flex-1 h-full px-2.5 rounded-lg text-sm font-bold transition-all flex items-center justify-center ${
                          viewMode === "list"
                            ? "bg-gradient-to-br from-blue-500 to-blue-600 text-white shadow-lg shadow-blue-500/20"
                            : "text-zinc-400 hover:text-white hover:bg-white/10"
                        }`}
                      >
                        <List className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setViewMode("compact")}
                        className={`flex-1 h-full px-2.5 rounded-lg text-sm font-bold transition-all flex items-center justify-center ${
                          viewMode === "compact"
                            ? "bg-gradient-to-br from-blue-500 to-blue-600 text-white shadow-lg shadow-blue-500/20"
                            : "text-zinc-400 hover:text-white hover:bg-white/10"
                        }`}
                      >
                        <Grid2X2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setViewMode("grid")}
                        className={`flex-1 h-full px-2.5 rounded-lg text-sm font-bold transition-all flex items-center justify-center ${
                          viewMode === "grid"
                            ? "bg-gradient-to-br from-blue-500 to-blue-600 text-white shadow-lg shadow-blue-500/20"
                            : "text-zinc-400 hover:text-white hover:bg-white/10"
                        }`}
                      >
                        <LayoutGrid className="w-4 h-4" />
                      </button>
                    </div>
                    <button
                      onClick={() =>
                        setImageMode(
                          imageMode === "poster" ? "backdrop" : "poster",
                        )
                      }
                      className={`h-11 w-11 shrink-0 flex items-center justify-center rounded-2xl transition-all bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-lg shadow-lg ${
                        imageMode === "backdrop"
                          ? "text-blue-400 shadow-[0_0_15px_rgba(59,130,246,0.3)]"
                          : "text-zinc-200 hover:bg-black/30"
                      }`}
                    >
                      {imageMode === "poster" ? (
                        <Film className="w-4 h-4" />
                      ) : (
                        <MonitorPlay className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Desktop: Single row */}
          <div className="relative z-10 hidden lg:flex gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-500 z-10 pointer-events-none" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Buscar por título..."
                className="w-full h-11 rounded-2xl pl-10 pr-10 py-2.5 text-sm transition-all focus:outline-none focus:ring-2 focus:ring-blue-500/50 placeholder:text-zinc-400 bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-lg shadow-lg text-white"
              />
              {q && (
                <button
                  onClick={() => setQ("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 hover:bg-white/10 rounded-md transition-colors"
                >
                  <X className="w-3.5 h-3.5 text-zinc-400 hover:text-white" />
                </button>
              )}
            </div>

            <InlineDropdown
              label="Tipo"
              valueLabel={
                typeFilter === "all"
                  ? "Todo"
                  : typeFilter === "movies"
                    ? "Películas"
                    : "Series"
              }
              icon={Filter}
            >
              {({ close }) => (
                <>
                  <DropdownItem
                    active={typeFilter === "all"}
                    onClick={() => {
                      setTypeFilter("all");
                      close();
                    }}
                  >
                    Todo
                  </DropdownItem>
                  <DropdownItem
                    active={typeFilter === "movies"}
                    onClick={() => {
                      setTypeFilter("movies");
                      close();
                    }}
                  >
                    Películas
                  </DropdownItem>
                  <DropdownItem
                    active={typeFilter === "shows"}
                    onClick={() => {
                      setTypeFilter("shows");
                      close();
                    }}
                  >
                    Series
                  </DropdownItem>
                </>
              )}
            </InlineDropdown>

            <InlineDropdown
              label="Ordenar"
              valueLabel={
                sortBy === "title-asc"
                  ? "A-Z"
                  : sortBy === "title-desc"
                    ? "Z-A"
                    : sortBy === "rating-desc"
                      ? "Mejor valorado"
                      : sortBy === "rating-asc"
                        ? "Peor valorado"
                        : sortBy === "added-desc"
                          ? "Añadido reciente"
                          : sortBy === "added-asc"
                            ? "Añadido antiguo"
                            : "A-Z"
              }
              icon={ArrowUpDown}
            >
              {({ close }) => (
                <>
                  <DropdownItem
                    active={sortBy === "title-asc"}
                    onClick={() => {
                      setSortBy("title-asc");
                      close();
                    }}
                  >
                    Título A-Z
                  </DropdownItem>
                  <DropdownItem
                    active={sortBy === "title-desc"}
                    onClick={() => {
                      setSortBy("title-desc");
                      close();
                    }}
                  >
                    Título Z-A
                  </DropdownItem>
                  <DropdownItem
                    active={sortBy === "rating-desc"}
                    onClick={() => {
                      setSortBy("rating-desc");
                      close();
                    }}
                  >
                    Valoración más alta
                  </DropdownItem>
                  <DropdownItem
                    active={sortBy === "rating-asc"}
                    onClick={() => {
                      setSortBy("rating-asc");
                      close();
                    }}
                  >
                    Valoración más baja
                  </DropdownItem>
                  <DropdownItem
                    active={sortBy === "added-desc"}
                    onClick={() => {
                      setSortBy("added-desc");
                      close();
                    }}
                  >
                    Añadido reciente
                  </DropdownItem>
                  <DropdownItem
                    active={sortBy === "added-asc"}
                    onClick={() => {
                      setSortBy("added-asc");
                      close();
                    }}
                  >
                    Añadido antiguo
                  </DropdownItem>
                </>
              )}
            </InlineDropdown>

            <InlineDropdown
              label="Agrupar"
              valueLabel={getGroupingValueLabel(groupBy, subGroupBy)}
              mobileValueLabel={getCompactGroupingValueLabel(
                groupBy,
                subGroupBy,
              )}
              compactMobile
              icon={Layers3}
            >
              {({ close }) => (
                <GroupingDropdownContent
                  groupBy={groupBy}
                  subGroupBy={subGroupBy}
                  onGroupChange={handleGroupChange}
                  onSubGroupChange={handleSubGroupChange}
                  close={close}
                />
              )}
            </InlineDropdown>

            <div className="flex rounded-2xl p-1 h-11 items-center shrink-0 bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-lg shadow-lg">
              <button
                onClick={() => setViewMode("list")}
                className={`px-3 h-full rounded-lg text-sm font-bold transition-all flex items-center gap-2 ${
                  viewMode === "list"
                    ? "bg-gradient-to-br from-blue-500 to-blue-600 text-white shadow-lg shadow-blue-500/20"
                    : "text-zinc-400 hover:text-white hover:bg-white/10"
                }`}
              >
                <List className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewMode("compact")}
                className={`px-3 h-full rounded-lg text-sm font-bold transition-all flex items-center gap-2 ${
                  viewMode === "compact"
                    ? "bg-gradient-to-br from-blue-500 to-blue-600 text-white shadow-lg shadow-blue-500/20"
                    : "text-zinc-400 hover:text-white hover:bg-white/10"
                }`}
              >
                <Grid2X2 className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewMode("grid")}
                className={`px-3 h-full rounded-lg text-sm font-bold transition-all flex items-center gap-2 ${
                  viewMode === "grid"
                    ? "bg-gradient-to-br from-blue-500 to-blue-600 text-white shadow-lg shadow-blue-500/20"
                    : "text-zinc-400 hover:text-white hover:bg-white/10"
                }`}
              >
                <LayoutGrid className="w-4 h-4" />
              </button>
            </div>

            <div className="flex rounded-2xl p-1 h-11 items-center shrink-0 bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-lg shadow-lg">
              <button
                onClick={() => setImageMode("poster")}
                className={`px-3 h-full rounded-lg text-sm font-bold transition-all flex items-center gap-2 ${
                  imageMode === "poster"
                    ? "bg-gradient-to-br from-blue-500 to-blue-600 text-white shadow-lg shadow-blue-500/20"
                    : "text-zinc-400 hover:text-white hover:bg-white/10"
                }`}
              >
                <Film className="w-4 h-4" />
              </button>
              <button
                onClick={() => setImageMode("backdrop")}
                className={`px-3 h-full rounded-lg text-sm font-bold transition-all flex items-center gap-2 ${
                  imageMode === "backdrop"
                    ? "bg-gradient-to-br from-blue-500 to-blue-600 text-white shadow-lg shadow-blue-500/20"
                    : "text-zinc-400 hover:text-white hover:bg-white/10"
                }`}
              >
                <MonitorPlay className="w-4 h-4" />
              </button>
            </div>
          </div>
        </motion.div>

        {/* Scores load silently in background - no loading indicator */}

        {/* Content */}
        {loading ? null : sorted.length === 0 ? (
          <motion.div
            className="py-24 text-center border border-dashed border-zinc-800 rounded-3xl bg-zinc-900/20"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4 }}
          >
            <Bookmark className="w-16 h-16 text-zinc-800 mx-auto mb-4" />
            <p className="text-zinc-500 font-medium">
              No se encontraron títulos.
            </p>
            {q && (
              <button
                onClick={() => setQ("")}
                className="mt-4 text-blue-500 text-sm font-bold hover:underline"
              >
                Limpiar búsqueda
              </button>
            )}
          </motion.div>
        ) : grouped ? (
          // Grouped view
          <div className="space-y-8">
            {(() => {
              let globalCardIndex = 0;
              return grouped.map((group, groupIndex) => (
                <motion.div
                  key={group.key}
                  ref={(node) => setGroupSectionRef(group.key, node)}
                  className="overflow-visible scroll-mt-[148px]"
                  // `initial={false}` al retroceder: sin esto cada grupo volvía a
                  // entrar desde 20px abajo, y con `delay` escalonado por grupo,
                  // así que al volver de una ficha la lista se recolocaba sola
                  // tras cargar en lugar de aparecer tal y como estaba.
                  // Favoritos ya lo hacía así; aquí faltaba.
                  initial={isBackNav ? false : { opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: groupIndex * 0.1 }}
                >
                  <GroupDivider
                    title={group.label}
                    count={group.items.length}
                    total={sorted.length}
                    stats={group.stats}
                    groupBy={groupBy}
                    mobileFiltersOpen={mobileFiltersOpen}
                    forceSticky={forcedStickyGroupKey === group.key}
                    disableStickyAnimation={forcedStickyGroupKey === group.key}
                    hasPreviousGroup={groupIndex > 0}
                    hasNextGroup={groupIndex < grouped.length - 1}
                    onPreviousGroup={() => scrollToPreviousGroup(group.key)}
                    onNextGroup={() => scrollToNextGroup(group.key)}
                  />
                  {group.subgroups?.length ? (
                    <div className="">
                      {group.subgroups.map((subgroup) => (
                        <div
                          key={`${group.key}-${subgroup.key}`}
                          className="space-y-1 overflow-visible"
                        >
                          <SubGroupDivider
                            title={subgroup.label}
                            count={subgroup.items.length}
                          />
                          <div
                            key={`subgroup-grid-${group.key}-${subgroup.key}-${viewMode}-${imageMode}`}
                            className={getItemsGridClass(true)}
                          >
                            {subgroup.items.map((item, idx) => {
                              const currentGlobalIdx = globalCardIndex++;
                              if (currentGlobalIdx >= renderLimit) return null;
                              return (
                                <WatchlistCard
                                  key={getMediaKey(item)}
                                  item={item}
                                  index={currentGlobalIdx}
                                  totalItems={sorted.length}
                                  animateWithin={entranceVisibleCount}
                                  viewMode={viewMode}
                                  imageMode={imageMode}
                                  imdbScore={imdbScores.get(getScoreItemKey(item))}
                                />
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div
                      key={`group-grid-${group.key}-${viewMode}-${imageMode}`}
                      className={getItemsGridClass(true)}
                    >
                      {group.items.map((item, idx) => {
                        const currentGlobalIdx = globalCardIndex++;
                        if (currentGlobalIdx >= renderLimit) return null;
                        return (
                          <WatchlistCard
                            key={getMediaKey(item)}
                            item={item}
                            index={currentGlobalIdx}
                            totalItems={sorted.length}
                            animateWithin={entranceVisibleCount}
                            viewMode={viewMode}
                            imageMode={imageMode}
                            imdbScore={imdbScores.get(getScoreItemKey(item))}
                          />
                        );
                      })}
                    </div>
                  )}
                </motion.div>
              ));
            })()}
          </div>
        ) : (
          <div
            key={`flat-grid-${viewMode}-${imageMode}`}
            className={getItemsGridClass(false)}
          >
            {renderedSorted.map((item, idx) => (
              <WatchlistCard
                key={getMediaKey(item)}
                item={item}
                index={idx}
                totalItems={sorted.length}
                animateWithin={entranceVisibleCount}
                viewMode={viewMode}
                imageMode={imageMode}
                imdbScore={imdbScores.get(getScoreItemKey(item))}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
