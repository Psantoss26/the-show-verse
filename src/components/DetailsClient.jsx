// src/components/DetailsClient.jsx
// ---------------------------------------------------------------------------
// Componente principal de detalle de pelicula/serie.
// Renderiza toda la pagina de detalle: poster, backdrop, metadatos,
// puntuaciones (TMDb, Trakt, IMDb, RT, Metacritic), gestion de listas,
// episodios, temporadas, colecciones, comentarios, cast, recomendaciones,
// integracion con Trakt (watched, rewatch, plays) y Plex.
// ---------------------------------------------------------------------------
"use client";

// -- Hooks de React --
import {
  Children,
  useRef,
  useState,
  useEffect,
  useLayoutEffect,
  useMemo,
  useCallback,
  useTransition,
} from "react";

// -- Navegacion de Next.js --
import { useRouter } from "next/navigation";

// -- Carrusel Swiper --
import { Swiper, SwiperSlide } from "swiper/react";
import "swiper/swiper-bundle.css";

// -- Animaciones con Framer Motion --
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

// -- Componentes internos del proyecto --
import EpisodeRatingsGrid from "@/components/EpisodeRatingsGrid";
import { saveArtworkOverride } from "@/lib/artworkApi";
import Link from "next/link";

// Componentes de animacion reutilizables para secciones con entrada animada
import {
  AnimatedSection,
  FadeIn,
  ScaleIn,
  StaggerContainer,
  StaggerItem,
} from "@/components/details/AnimatedSection";

// -- Iconos de Lucide React usados en todo el componente --
import {
  CalendarIcon,
  ClockIcon,
  FilmIcon,
  StarIcon,
  MessageSquareIcon,
  BadgeDollarSignIcon,
  LinkIcon,
  ImageIcon,
  ImageOff,
  Heart,
  BookmarkPlus,
  BookmarkMinus,
  Loader2,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  MonitorPlay,
  TrendingUp,
  Layers,
  Users,
  Building2,
  MapPin,
  Languages,
  Trophy,
  ListVideo,
  Check,
  X,
  Plus,
  Search,
  RotateCcw,
  Play,
  Music2,
  ExternalLink,
  ThumbsUp,
  ThumbsDown,
  Sparkles,
  Star,
  Eye,
  List,
  LibraryBig,
  MessageSquare,
  MoreHorizontal,
  SlidersHorizontal,
} from "lucide-react";

// Boton con efecto liquido para acciones principales
import LiquidButton from "@/components/LiquidButton";

// -- Autenticacion y APIs de cuenta (TMDb) --
import { useAuth } from "@/context/AuthContext";
import {
  getMediaAccountStates,
  markAsFavorite,
  markInWatchlist,
  getExternalIds,
} from "@/lib/api/tmdb";
import { fetchOmdbByImdb } from "@/lib/api/omdb"; // Datos extra de OMDb (RT, MC, premios)
import { fetchImdbRatingByImdb } from "@/lib/api/imdbRatings";
import { fetchTmdbAwards } from "@/lib/api/tmdbAwards";
import { formatDashboardAwards } from "@/lib/details/awardsText";
import StarRating from "./StarRating"; // Componente de puntuacion con estrellas
import TraktWatchedControl from "@/components/trakt/TraktWatchedControl"; // Boton de marcar visto en Trakt
import TraktWatchedModal from "@/components/trakt/TraktWatchedModal"; // Modal de historial de visionados
import TraktEpisodesWatchedModal from "@/components/trakt/TraktEpisodesWatchedModal"; // Modal de episodios vistos
// -- API client de Trakt: estado, visionados, ratings, comentarios, listas, temporadas --
import {
  traktGetItemStatus,
  traktSetWatched,
  traktAddWatchPlay,
  traktUpdateWatchPlay,
  traktRemoveWatchPlay,
  traktGetShowWatched,
  traktSetEpisodeWatched,
  traktGetComments,
  traktGetSentiments,
  traktGetLists,
  traktGetShowSeasons,
  traktGetScoreboard,
  traktGetStats,
  traktSetRating,
  traktGetShowPlays,
  traktAddShowPlay,
  traktAddEpisodePlay,
  traktRemoveHistoryEntries,
  invalidateTraktGetCache,
} from "@/lib/api/traktClient";

// Menu lateral/sticky de navegacion por secciones
import DetailsSectionMenu from "./DetailsSectionMenu";

// Cache de datos OMDb en localStorage para evitar peticiones repetidas
import {
  readOmdbCache,
  writeOmdbCache,
  extractOmdbExtraScores,
} from "@/lib/details/omdbCache";

// -- Utilidades de imagenes TMDb: seleccion inteligente de poster/backdrop --
import {
  mergeUniqueImages,
  buildOriginalImageUrl,
  preloadTmdb,
  fetchTVImages,
  pickBestImage,
  pickBestNeutralPosterByResVotes,
  pickBestBackdropByLangResVotes,
  pickBestBackdropTVNeutralFirst,
  pickBestBackdropForPreview,
} from "@/lib/details/tmdbImages";

// -- Funciones de formato: numeros, fechas, HTML, conteos --
import {
  formatShortNumber,
  slugifyForSeriesGraph,
  formatDateEs,
  formatVoteCount,
  formatCountShort,
  stripHtml,
  formatDateTimeEs,
  mixedCount,
  sumCount,
} from "@/lib/details/formatters";

// -- Gestion de listas de usuario en TMDb (CRUD) --
import {
  tmdbFetchAllUserLists,
  tmdbListItemStatus,
  tmdbAddMovieToList,
  tmdbCreateList,
} from "@/lib/details/tmdbListsClient";

// -- Utilidades de video: filtrado, ranking, URLs de embed/thumbnail --
import {
  uniqBy,
  isPlayableVideo,
  videoExternalUrl,
  videoEmbedUrl,
  videoThumbUrl,
  rankVideo,
  pickPreferredVideo,
} from "@/lib/details/videos";

// -- Componentes atomicos para la UI de detalle --
import {
  VisualMetaCard,
  MetaItem,
  ScoreBadge,
  StatChip,
  DetailsTabsMenu,
} from "@/components/details/DetailAtoms";
import {
  CompactBadge,
  ExternalLinkButton,
  MiniStat,
  UnifiedRateButton,
  ActionShareButton,
} from "@/components/details/DetailHeaderBits";

// -- Modales del componente --
import AddToListModal from "@/components/details/AddToListModal";
import VideoModal from "@/components/details/VideoModal";
import SoundtrackModal from "@/components/details/SoundtrackModal";
import PosterStack from "@/components/details/PosterStack";
import ExternalLinksModal from "@/components/details/ExternalLinksModal";

function getSoundtrackSourceBadge(source) {
  const key = String(source || "Spotify").toLowerCase();
  if (key === "itunes") {
    return {
      label: "iTunes",
      textClass: "text-fuchsia-300",
      dotClass: "bg-fuchsia-400 shadow-[0_0_6px_rgba(232,121,249,0.8)]",
    };
  }
  if (key === "deezer") {
    return {
      label: "Deezer",
      textClass: "text-orange-300",
      dotClass: "bg-orange-400 shadow-[0_0_6px_rgba(251,146,60,0.8)]",
    };
  }
  return {
    label: "Spotify",
    textClass: "text-emerald-400",
    dotClass: "bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]",
  };
}

function pickBestEnglishPoster(list) {
  if (!Array.isArray(list) || list.length === 0) return null;

  const isEnglishPoster = (img) => {
    const language = String(img?.iso_639_1 || "").toLowerCase();
    return img?.file_path && (language === "en" || language === "en-us");
  };
  const isSpanishPoster = (img) => {
    const language = String(img?.iso_639_1 || "").toLowerCase();
    return language === "es" || language === "es-es";
  };

  const englishPosters = list.filter(isEnglishPoster);
  if (englishPosters.length) return pickBestImage(englishPosters);

  const neutralPosters = list.filter(
    (img) => img?.file_path && !img?.iso_639_1,
  );
  if (neutralPosters.length) return pickBestImage(neutralPosters);

  const nonSpanishPosters = list.filter(
    (img) => img?.file_path && !isSpanishPoster(img),
  );
  return pickBestImage(nonSpanishPosters);
}

// ---------------------------------------------------------------------------
// CONSTANTES GLOBALES
// ---------------------------------------------------------------------------

// Clave de API de TMDb inyectada como variable de entorno publica
const TMDB_API_KEY = process.env.NEXT_PUBLIC_TMDB_API_KEY;
const SOUNDTRACK_ALGORITHM_VERSION = "soundtrack-ranking-v38";

// Cache en memoria para el scoreboard publico (evita refetches durante la sesion)
const PUBLIC_SCORE_CACHE = new Map(); // clave -> { ts, data }
const TTL = 1000 * 60 * 5; // Tiempo de vida del cache: 5 minutos

const isMainDirectorCredit = (credit) =>
  credit?.job === "Director" || credit?.job === "Co-Director";

const getMovieDirectorsFromCrew = (crew) =>
  Array.isArray(crew) ? crew.filter(isMainDirectorCredit) : [];

const formatCreditNames = (list) =>
  Array.isArray(list) && list.length
    ? list
        .map((person) => person?.name)
        .filter(Boolean)
        .join(", ")
    : null;

/**
 * Obtiene el scoreboard publico (puntuaciones agregadas de multiples fuentes).
 * Llama al endpoint /api/scoreboard/public con type, id e imdbId.
 */
async function fetchPublicScoreboard({ type, id, imdbId, signal }) {
  const url = `/api/scoreboard/public?type=${encodeURIComponent(type)}&id=${encodeURIComponent(id)}&imdb=${encodeURIComponent(imdbId || "")}`;
  const r = await fetch(url, { signal });
  if (!r.ok) throw new Error(`scoreboard ${r.status}`);
  return r.json();
}

/**
 * Ejecuta una promesa con timeout. Si se excede el tiempo, rechaza con error de timeout.
 * @param {Promise} promise - Promesa a ejecutar
 * @param {number} timeoutMs - Tiempo máximo en milisegundos
 * @returns {Promise} - Promesa con timeout
 */
function withTimeout(promise, timeoutMs) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Timeout")), timeoutMs),
    ),
  ]);
}

function formatRuntimeMinutes(minutes) {
  const total = Number(minutes);
  if (!Number.isFinite(total) || total <= 0) return null;
  const rounded = Math.round(total);
  const hours = Math.floor(rounded / 60);
  const mins = rounded % 60;
  if (hours <= 0) return `${mins}m`;
  if (mins <= 0) return `${hours}h`;
  return `${hours}h ${mins}m`;
}

function formatEpisodeRuntime(data) {
  const runtimes = Array.isArray(data?.episode_run_time)
    ? data.episode_run_time
        .map((value) => Number(value))
        .filter((value) => Number.isFinite(value) && value > 0)
    : [];

  const uniqueRuntimes = [...new Set(runtimes)].sort((a, b) => a - b);

  if (uniqueRuntimes.length === 1) {
    const value = formatRuntimeMinutes(uniqueRuntimes[0]);
    return value;
  }

  if (uniqueRuntimes.length > 1) {
    const min = formatRuntimeMinutes(uniqueRuntimes[0]);
    const max = formatRuntimeMinutes(uniqueRuntimes[uniqueRuntimes.length - 1]);
    return min && max ? `${min}-${max}` : null;
  }

  const lastEpisodeRuntime = formatRuntimeMinutes(
    data?.last_episode_to_air?.runtime,
  );
  return lastEpisodeRuntime;
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

function normalizeProviderName(name = "") {
  return String(name)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function getProviderFamilyKey(provider) {
  const normalizedName = normalizeProviderName(provider?.provider_name || "");

  if (
    provider?.provider_id === 149 ||
    provider?.provider_id === 2241 ||
    /\bmovistar\b|^m\+/.test(normalizedName)
  ) {
    return "movistar";
  }

  return provider?.provider_id != null
    ? String(provider.provider_id)
    : normalizedName.replace(/[^a-z0-9]+/g, "-");
}

function providerPreferenceScore(provider, familyKey) {
  if (familyKey !== "movistar") return 0;

  const name = normalizeProviderName(provider?.provider_name || "");
  let score = name.length;

  if (
    /\bficcion\b|\btotal\b|\bdeportes\b|\blaliga\b|\bseleccion\b/.test(name)
  ) {
    score += 100;
  }

  return score;
}

function canonicalizeStreamingProvider(provider) {
  if (!provider) return provider;

  if (getProviderFamilyKey(provider) === "movistar") {
    return {
      ...provider,
      provider_id: 2241,
      provider_name: "Movistar +",
      logo_path: "/jse4MOi92Jgetym7nbXFZZBI6LK.jpg",
    };
  }

  return provider;
}

function dedupeStreamingProviders(providers) {
  const deduped = [];
  const indexByFamily = new Map();

  for (const rawProvider of providers) {
    if (!rawProvider) continue;

    const provider = canonicalizeStreamingProvider(rawProvider);
    const familyKey = getProviderFamilyKey(provider);
    const existingIndex = indexByFamily.get(familyKey);

    if (existingIndex == null) {
      indexByFamily.set(familyKey, deduped.length);
      deduped.push(provider);
      continue;
    }

    const existing = deduped[existingIndex];
    if (
      providerPreferenceScore(provider, familyKey) <
      providerPreferenceScore(existing, familyKey)
    ) {
      deduped[existingIndex] = provider;
    }
  }

  return deduped;
}

function hasResolvedTraktBootstrap(value) {
  if (!value || typeof value.connected !== "boolean") return false;
  if (value.connected === false) return true;
  return !value.error;
}

function hasMeaningfulTraktSnapshot(value) {
  if (!value || typeof value !== "object") return false;

  return (
    !!value.found ||
    !!value.watched ||
    Number(value.plays || 0) > 0 ||
    !!value.lastWatchedAt ||
    (Array.isArray(value.history) && value.history.length > 0)
  );
}

function isDegradedTraktPayload(value) {
  if (!value || typeof value !== "object") return false;
  return value.degraded === true || (!!value.error && value.found !== true);
}

function shouldPreservePreviousTraktStatus(nextValue, prevValue) {
  if (!isDegradedTraktPayload(nextValue)) return false;
  if (nextValue.connected === false) return false;
  return hasMeaningfulTraktSnapshot(prevValue);
}

function normalizeTraktHistoryEntries(history = []) {
  const arr = Array.isArray(history) ? history : [];
  return arr
    .map((entry) => {
      const id = entry?.id ?? entry?.historyId ?? entry?.history_id ?? null;
      const watchedAt =
        entry?.watched_at ?? entry?.watchedAt ?? entry?.watchedAtIso ?? null;
      if (!id || !watchedAt) return null;
      return {
        ...entry,
        id,
        watched_at: watchedAt,
        watchedAt,
      };
    })
    .filter(Boolean)
    .sort((a, b) => {
      const ta = new Date(a?.watched_at || 0).getTime();
      const tb = new Date(b?.watched_at || 0).getTime();
      return (Number.isFinite(tb) ? tb : 0) - (Number.isFinite(ta) ? ta : 0);
    });
}

function buildTraktStateFromHistory(value) {
  const history = normalizeTraktHistoryEntries(value?.history);
  const historyCount = history.length;
  const hasHistory = historyCount > 0;
  const basePlays = Math.max(0, Number(value?.plays || 0));
  const nextPlays = hasHistory ? Math.max(basePlays, historyCount) : basePlays;
  const nextLastWatchedAt = hasHistory
    ? history[0]?.watched_at || null
    : nextPlays > 0
      ? value?.lastWatchedAt || null
      : null;
  const nextWatched = hasHistory || nextPlays > 0;

  return {
    ...value,
    history,
    watched: nextWatched,
    plays: nextPlays,
    lastWatchedAt: nextLastWatchedAt,
  };
}

function isPossiblyStaleEmptyMovieTraktStatus(
  nextValue,
  prevValue,
  endpointType,
) {
  if (endpointType !== "movie") return false;
  if (!nextValue || !prevValue) return false;
  if (!nextValue.connected || !nextValue.found) return false;
  if (nextValue.watched || Number(nextValue.plays || 0) > 0) return false;
  if (Array.isArray(nextValue.history) && nextValue.history.length > 0)
    return false;
  if (nextValue.lastWatchedAt) return false;
  return hasMeaningfulTraktSnapshot(prevValue);
}

function awardResultLabel(result) {
  if (result === "winner") return "Ganador";
  if (result === "nominee") return "Nominado";
  return "Reconocimiento";
}

function awardResultClass(result) {
  if (result === "winner") {
    return "text-yellow-400";
  }
  if (result === "nominee") {
    return "text-zinc-300";
  }
  return "text-zinc-400";
}

function flattenAwardItems(details) {
  const groups = Array.isArray(details?.groups) ? details.groups : [];
  let sourceIndex = 0;

  return groups.flatMap((group) =>
    (Array.isArray(group?.items) ? group.items : []).map((item, index) => {
      const flattened = {
        ...item,
        id: `${group?.name || "award"}-${item?.category || "category"}-${item?.year || "year"}-${index}`,
        groupName: group?.name || "Premio",
        groupImageUrl: group?.imageUrl || null,
        sourceIndex,
      };
      sourceIndex += 1;
      return flattened;
    }),
  );
}

function awardResultRank(result) {
  if (result === "winner") return 0;
  if (result === "nominee") return 1;
  return 2;
}

function sortAwardItemsForDisplay(items) {
  return [...items].sort((a, b) => {
    const byResult = awardResultRank(a?.result) - awardResultRank(b?.result);
    if (byResult !== 0) return byResult;
    return (a?.sourceIndex ?? 0) - (b?.sourceIndex ?? 0);
  });
}

function getAwardInitials(name) {
  const words = String(name || "Premio")
    .replace(/\b(awards?|film|prize|academy|guild|of|the|and|de|la)\b/gi, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const initials = words
    .slice(0, 3)
    .map((word) => word[0])
    .join("")
    .toUpperCase();
  return initials || "TSV";
}

function formatAwardGroupName(name) {
  const raw = String(name || "").trim();
  if (!raw) return "Premio";

  const n = raw.toLowerCase();

  if (/academy awards?|oscars?/.test(n)) return "Premios Oscar";
  if (/primetime emmy|emmy/.test(n)) return "Premios Emmy";
  if (/golden\s+globes?/.test(n)) return "Globos de Oro";
  if (/bafta/.test(n)) return "Premios BAFTA";
  if (/goya/.test(n)) return "Premios Goya";
  if (/c[eé]sar/.test(n)) return "Premios César";
  if (/screen\s+actors\s+guild|sag/.test(n)) {
    return "Premios del Sindicato de Actores";
  }
  if (/actor awards?/.test(n)) return "Premios de Interpretación";
  if (/writers?\s+guild|wga/.test(n)) {
    return "Premios del Sindicato de Guionistas";
  }
  if (/directors?\s+guild|dga/.test(n)) {
    return "Premios del Sindicato de Directores";
  }
  if (/producers?\s+guild|pga/.test(n)) {
    return "Premios del Sindicato de Productores";
  }
  if (/japan academy film prize/.test(n)) {
    return "Premios de la Academia Japonesa de Cine";
  }
  if (/mainichi film awards?/.test(n)) return "Premios Mainichi de Cine";
  if (/american film institute|\bafi\b/.test(n)) {
    return "Instituto Americano de Cine";
  }
  if (/critics'? choice/.test(n)) return "Premios de la Crítica";
  if (/independent spirit/.test(n)) return "Premios Independent Spirit";
  if (/saturn awards?/.test(n)) return "Premios Saturn";
  if (/annie awards?/.test(n)) return "Premios Annie";
  if (/hugo awards?/.test(n)) return "Premios Hugo";
  if (/grammy awards?/.test(n)) return "Premios Grammy";
  if (/cannes/.test(n)) return "Festival de Cannes";
  if (/venice/.test(n)) return "Festival de Venecia";
  if (/berlin/.test(n)) return "Festival de Berlín";
  if (/national board of review/.test(n)) return "National Board of Review";
  if (/new york film critics/.test(n)) {
    return "Críticos de Cine de Nueva York";
  }
  if (/los angeles film critics/.test(n)) {
    return "Críticos de Cine de Los Ángeles";
  }
  if (/online film critics/.test(n)) return "Críticos de Cine Online";

  return raw
    .replace(/\bAwards?\b/g, "Premios")
    .replace(/\bFilm\b/g, "Cine")
    .replace(/\bPrize\b/g, "Premio")
    .replace(/\bAcademy\b/g, "Academia")
    .replace(/\bGuild\b/g, "Sindicato");
}

function getAwardVisual(name) {
  const n = String(name || "").toLowerCase();

  if (/\bacademy\b|oscar/.test(n)) {
    return {
      label: "OSCAR",
      background:
        "radial-gradient(circle at 50% 18%, rgba(255,231,138,0.36), transparent 30%), linear-gradient(145deg, #3d2a08 0%, #090807 48%, #000 100%)",
      accent: "text-yellow-200",
      ring: "border-yellow-300/25",
    };
  }

  if (/golden\s+globes?/.test(n)) {
    return {
      label: "GLOBOS",
      background:
        "radial-gradient(circle at 50% 26%, rgba(252,211,77,0.34), transparent 32%), linear-gradient(145deg, #2c1d08 0%, #071716 52%, #010101 100%)",
      accent: "text-amber-200",
      ring: "border-amber-300/25",
    };
  }

  if (/bafta/.test(n)) {
    return {
      label: "BAFTA",
      background:
        "radial-gradient(circle at 50% 22%, rgba(251,191,36,0.28), transparent 33%), linear-gradient(145deg, #301f0c 0%, #16100c 42%, #000 100%)",
      accent: "text-orange-200",
      ring: "border-orange-300/25",
    };
  }

  if (/actor|screen\s+actors|sag/.test(n)) {
    return {
      label: "ACTORES",
      background:
        "radial-gradient(circle at 50% 18%, rgba(125,211,252,0.24), transparent 34%), linear-gradient(145deg, #071b2b 0%, #060b12 52%, #000 100%)",
      accent: "text-sky-200",
      ring: "border-sky-300/25",
    };
  }

  if (/writers?|screenplay|wga|guild/.test(n)) {
    return {
      label: "GUION",
      background:
        "radial-gradient(circle at 50% 18%, rgba(216,180,254,0.22), transparent 34%), linear-gradient(145deg, #241035 0%, #100817 52%, #000 100%)",
      accent: "text-violet-200",
      ring: "border-violet-300/25",
    };
  }

  if (/\bafi\b/.test(n)) {
    return {
      label: "AFI",
      background:
        "radial-gradient(circle at 50% 18%, rgba(248,113,113,0.22), transparent 34%), linear-gradient(145deg, #2f0d0d 0%, #130809 50%, #000 100%)",
      accent: "text-red-200",
      ring: "border-red-300/25",
    };
  }

  if (/japan/.test(n)) {
    return {
      label: "JAPÓN",
      background:
        "radial-gradient(circle at 50% 18%, rgba(244,114,182,0.22), transparent 34%), linear-gradient(145deg, #2a0d1d 0%, #13080f 52%, #000 100%)",
      accent: "text-pink-200",
      ring: "border-pink-300/25",
    };
  }

  if (/czech|lion/.test(n)) {
    return {
      label: "LEÓN",
      background:
        "radial-gradient(circle at 50% 18%, rgba(250,204,21,0.25), transparent 34%), linear-gradient(145deg, #2f2608 0%, #101006 52%, #000 100%)",
      accent: "text-yellow-200",
      ring: "border-yellow-300/25",
    };
  }

  return {
    label: getAwardInitials(name),
    background:
      "radial-gradient(circle at 50% 18%, rgba(250,204,21,0.2), transparent 34%), linear-gradient(145deg, #1f1b12 0%, #0b0b0b 52%, #000 100%)",
    accent: "text-yellow-200",
    ring: "border-yellow-300/20",
  };
}

function awardCategoryContextLabel(category) {
  const c = String(category || "").toLowerCase();
  if (/motion picture.*drama|drama.*motion picture/.test(c)) {
    return "en película dramática";
  }
  if (
    /motion picture.*(musical or comedy|comedy or musical)/.test(c) ||
    /(musical or comedy|comedy or musical).*motion picture/.test(c)
  ) {
    return "en película musical o comedia";
  }
  if (/television series.*drama|drama.*television series/.test(c)) {
    return "en serie dramática";
  }
  if (
    /television series.*(musical or comedy|comedy or musical)/.test(c) ||
    /(musical or comedy|comedy or musical).*television series/.test(c)
  ) {
    return "en serie musical o comedia";
  }
  if (/musical or comedy|comedy or musical/.test(c)) {
    return "en musical o comedia";
  }
  if (/drama series/.test(c)) return "en drama";
  if (/comedy series/.test(c)) return "en comedia";
  if (/limited series|miniseries|television movie|tv movie/.test(c)) {
    return "en miniserie/TV";
  }
  if (/motion picture|feature film|film\b/.test(c)) return "en película";
  if (/series/.test(c)) return "en serie";
  return "";
}

function normalizeAwardCategoryKey(category) {
  return String(category || "")
    .toLowerCase()
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function formatCommonAwardCategory(category) {
  const c = normalizeAwardCategoryKey(category);

  const exact = {
    "best picture": "Mejor película",
    "best film": "Mejor película",
    "best director": "Mejor dirección",
    "best original screenplay": "Mejor guion original",
    "best adapted screenplay": "Mejor guion adaptado",
    "best screenplay based on material from another medium":
      "Mejor guion adaptado",
    "best screenplay based on material previously produced or published":
      "Mejor guion adaptado",
    "best screenplay": "Mejor guion",
    "best original score": "Mejor música original",
    "best original song": "Mejor canción original",
    "best cinematography": "Mejor fotografía",
    "best editing": "Mejor montaje",
    "best film editing": "Mejor montaje",
    "best production design": "Mejor diseño de producción",
    "best art direction": "Mejor dirección artística",
    "best costume design": "Mejor vestuario",
    "best makeup": "Mejor maquillaje",
    "best make-up and hair": "Mejor maquillaje y peluquería",
    "best visual effects": "Mejores efectos visuales",
    "best special effects": "Mejores efectos especiales",
    "best sound": "Mejor sonido",
    "best sound editing": "Mejor edición de sonido",
    "best sound mixing": "Mejor mezcla de sonido",
    "best foreign film": "Mejor película extranjera",
    "best international feature film": "Mejor película internacional",
    "best foreign language film": "Mejor película en lengua extranjera",
    "outstanding foreign language film": "Mejor película en lengua extranjera",
    "afi movies of the year": "Película del año",
  };

  if (exact[c]) return exact[c];

  if (/best motion picture - drama/.test(c)) return "Mejor película dramática";
  if (/best motion picture - musical or comedy/.test(c)) {
    return "Mejor película musical o comedia";
  }
  if (/best television series - drama/.test(c)) {
    return "Mejor serie dramática";
  }
  if (/best television series - musical or comedy/.test(c)) {
    return "Mejor serie musical o comedia";
  }
  if (/best limited series|best television movie/.test(c)) {
    return "Mejor miniserie o película de TV";
  }

  if (/best performance by/.test(c)) {
    const context = awardCategoryContextLabel(category);
    const withContext = (base) => [base, context].filter(Boolean).join(" ");

    if (/ensemble|cast/.test(c)) return withContext("Mejor reparto");
    if (/supporting/.test(c) && /(female actor|actress|actriz)/.test(c)) {
      return withContext("Mejor actriz de reparto");
    }
    if (/supporting/.test(c) && /(male actor|actor)/.test(c)) {
      return withContext("Mejor actor de reparto");
    }
    if (/female actor|actress/.test(c)) return withContext("Mejor actriz");
    if (/male actor|actor/.test(c)) return withContext("Mejor actor");
  }

  if (/best director/.test(c)) return "Mejor dirección";
  if (/best screenplay/.test(c)) return "Mejor guion";
  if (/best original score/.test(c)) return "Mejor música original";
  if (/best original song/.test(c)) return "Mejor canción original";

  if (/best (lead )?actor/.test(c)) {
    const context = awardCategoryContextLabel(category);
    return ["Mejor actor", context].filter(Boolean).join(" ");
  }
  if (/best (lead )?actress/.test(c)) {
    const context = awardCategoryContextLabel(category);
    return ["Mejor actriz", context].filter(Boolean).join(" ");
  }
  if (/best supporting actor/.test(c)) {
    const context = awardCategoryContextLabel(category);
    return ["Mejor actor de reparto", context].filter(Boolean).join(" ");
  }
  if (/best supporting actress/.test(c)) {
    const context = awardCategoryContextLabel(category);
    return ["Mejor actriz de reparto", context].filter(Boolean).join(" ");
  }

  if (/outstanding drama series/.test(c)) return "Mejor serie dramática";
  if (/outstanding comedy series/.test(c)) return "Mejor serie de comedia";
  if (/outstanding limited|outstanding television movie/.test(c)) {
    return "Mejor miniserie o película de TV";
  }
  if (/outstanding directing/.test(c)) {
    const context = awardCategoryContextLabel(category);
    return ["Mejor dirección", context].filter(Boolean).join(" ");
  }
  if (/outstanding writing/.test(c)) {
    const context = awardCategoryContextLabel(category);
    return ["Mejor guion", context].filter(Boolean).join(" ");
  }
  if (/outstanding casting/.test(c)) {
    const context = awardCategoryContextLabel(category);
    return ["Mejor casting", context].filter(Boolean).join(" ");
  }

  return null;
}

function formatAwardCategory(category, groupName) {
  const raw = String(category || "").trim();
  if (!raw) return formatAwardGroupName(groupName);

  const group = String(groupName || "").toLowerCase();
  const c = normalizeAwardCategoryKey(raw);
  const isActorAward = /actor|screen\s+actors|sag/.test(group);

  if (isActorAward || /outstanding performance/.test(c)) {
    const context = awardCategoryContextLabel(raw);
    const withContext = (base) => [base, context].filter(Boolean).join(" ");

    if (/stunt ensemble|action performance/.test(c)) {
      return withContext("Mejor equipo de especialistas");
    }
    if (/ensemble|cast/.test(c)) return withContext("Mejor reparto");
    if (/guest actor/.test(c)) return withContext("Mejor actor invitado");
    if (/female actor|actress/.test(c)) return withContext("Mejor actriz");
    if (/male actor|actor/.test(c)) return withContext("Mejor actor");
  }

  return formatCommonAwardCategory(raw) || raw;
}

function AwardsPanel({ awards }) {
  const formattedAwards = formatDashboardAwards(awards);

  return (
    <div className="relative p-5 sm:p-6 rounded-xl overflow-hidden">
      {/* Capa de fondo estilo ScoreboardBar (cristal más claro, difuminado de 15px) */}
      <div
        className="absolute inset-0 rounded-[inherit] bg-black/10 bg-gradient-to-br from-white/10 via-transparent to-black/20 backdrop-blur-[15px] pointer-events-none overflow-hidden"
        style={{ WebkitMaskImage: "-webkit-radial-gradient(white, black)" }}
      />
      <div className="absolute top-0 right-0 -mt-6 -mr-6 w-32 h-32 bg-yellow-500/10 blur-3xl rounded-full pointer-events-none z-10" />

      <div className="relative z-10">
        <div className="flex items-start gap-4">
          <div className="p-3 rounded-xl bg-yellow-500/10 text-yellow-500 shrink-0">
            <Trophy className="w-8 h-8" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-lg font-bold text-white mb-2">
              Reconocimientos
            </h3>
            {formattedAwards && (
              <p className="text-base leading-relaxed text-zinc-200">
                {formattedAwards}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function normalizeOmdbAwards(value) {
  const text = String(value || "").trim();
  if (!text || text === "N/A") return null;
  return text;
}

function normalizeSentimentKey(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function formatTraktSentimentList(items = [], max = 4) {
  const seen = new Set();
  const out = [];

  for (const item of Array.isArray(items) ? items : []) {
    const text = String(item?.sentiment_es || "").trim();
    const key = normalizeSentimentKey(text);
    if (!text || seen.has(key)) continue;
    seen.add(key);
    out.push(text);
    if (out.length >= max) break;
  }

  return out;
}

function toRatingNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function getSeasonNumber(season) {
  const parsed = Number(
    season?.number ?? season?.season_number ?? season?.seasonNumber,
  );
  return Number.isFinite(parsed) ? parsed : null;
}

function AwardCard({ item }) {
  const people = Array.isArray(item?.people) ? item.people.filter(Boolean) : [];
  const visual = getAwardVisual(item?.groupName);
  const categoryLabel = formatAwardCategory(item?.category, item?.groupName);
  const groupLabel = formatAwardGroupName(item?.groupName);

  return (
    <article className="block group relative rounded-xl overflow-hidden shadow-md border border-transparent hover:border-yellow-500/30 lg:hover:shadow-yellow-900/20 transition-all duration-300">
      <div
        className="aspect-[2/3] overflow-hidden relative flex flex-col"
        style={{ background: visual.background }}
      >
        <div className="absolute inset-0 opacity-[0.18] [background-image:linear-gradient(120deg,transparent_0%,rgba(255,255,255,0.18)_48%,transparent_52%)] pointer-events-none" />
        <div className="absolute inset-x-5 top-12 h-px bg-gradient-to-r from-transparent via-white/25 to-transparent pointer-events-none" />

        <div className="absolute inset-x-0 top-0 z-10 hidden items-start justify-between gap-2 px-3 py-2 sm:flex">
          <span
            className={`inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest transition-all ${awardResultClass(
              item?.result,
            )}`}
          >
            {item?.result === "winner" && (
              <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 shadow-[0_0_6px_rgba(250,204,21,0.8)]" />
            )}
            {item?.result === "nominee" && (
              <span className="w-1.5 h-1.5 rounded-full bg-zinc-400 shadow-[0_0_6px_rgba(212,212,216,0.8)]" />
            )}
            {item?.result !== "winner" && item?.result !== "nominee" && (
              <span className="w-1.5 h-1.5 rounded-full bg-zinc-500" />
            )}
            {awardResultLabel(item?.result)}
          </span>
          {item?.year && (
            <span className="text-[10px] font-black tracking-widest text-zinc-300 transition-all">
              {item.year}
            </span>
          )}
        </div>

        <div className="relative flex flex-1 flex-col items-center justify-center px-2 pb-14 sm:px-4 sm:pb-20 z-10">
          <div
            className={`max-w-[95%] rounded-md border border-white/10 bg-black/20 px-1.5 py-1 text-[9px] font-black uppercase leading-none tracking-[0.16em] drop-shadow-[0_4px_18px_rgba(0,0,0,0.8)] truncate backdrop-blur-sm sm:max-w-[82%] sm:px-2 sm:text-[11px] ${visual.accent}`}
          >
            {visual.label}
          </div>

          {item?.groupImageUrl && (
            <div className="mt-3 flex h-20 w-20 items-center justify-center sm:mt-4 sm:h-24 sm:w-24">
              <img
                src={item.groupImageUrl}
                alt=""
                className="h-full w-full object-contain drop-shadow-[0_8px_20px_rgba(0,0,0,0.6)] rounded-lg"
                loading="lazy"
                decoding="async"
              />
            </div>
          )}
        </div>

        <div className="absolute inset-x-0 bottom-0 flex flex-col justify-end px-2 py-2 sm:px-3 sm:py-3 z-20">
          <div className="sm:hidden">
            <p className="text-center text-[10px] font-extrabold leading-tight text-white line-clamp-2 drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]">
              {categoryLabel}
            </p>
            <p className="mt-1 text-center text-[9px] font-bold leading-tight text-yellow-400 line-clamp-1 drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]">
              {groupLabel}
            </p>
          </div>
          <div className="hidden sm:block">
            <p className="text-white font-extrabold text-sm leading-tight line-clamp-2 drop-shadow-[0_1px_4px_rgba(0,0,0,0.9)]">
              {categoryLabel}
            </p>
            <p className="mt-1 text-yellow-400 text-xs font-bold leading-tight line-clamp-1 drop-shadow-[0_1px_4px_rgba(0,0,0,0.9)]">
              {groupLabel}
            </p>
            {people.length > 0 && (
              <p className="mt-1 text-gray-200 text-xs leading-tight line-clamp-2 drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]">
                {people.join(", ")}
              </p>
            )}
          </div>
        </div>
      </div>
    </article>
  );
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

// =====================================================================
// COMPONENTE PRINCIPAL: DetailsClient
// =====================================================================

/**
 * DetailsClient - Componente principal de la pagina de detalle.
 *
 * Props:
 * @param {string}  type            - Tipo de contenido: "movie" o "tv"
 * @param {string}  id              - ID de TMDb del contenido
 * @param {Object}  data            - Objeto completo de datos de TMDb (titulo, sinopsis, fechas, etc.)
 * @param {Array}   recommendations - Lista de contenido recomendado similar
 * @param {Array}   castData        - Datos del reparto (actores, directores)
 * @param {Object}  providers       - Proveedores de streaming disponibles
 * @param {string}  watchLink       - URL directa para ver el contenido
 * @param {Array}   reviews         - Resenas de usuarios de TMDb
 */
export default function DetailsClient({
  type,
  id,
  data,
  recommendations,
  castData,
  providers,
  watchLink,
  reviews,
  initialScoreboard,
  initialTraktStatus,
  initialShowWatched,
}) {
  const router = useRouter();
  const prefetchSeasonDetails = useCallback(
    (seasonNumber) => {
      const sn = Number(seasonNumber);
      if (!Number.isFinite(sn)) return;
      router.prefetch(`/details/tv/${id}/season/${sn}`);
    },
    [router, id],
  );

  // -- Datos basicos derivados de las props --
  const title = data.title || data.name; // Peliculas usan "title", series usan "name"
  const originalTitle = data.original_title || data.original_name || ""; // Titulo original para mejorar busquedas musicales
  const endpointType = type === "tv" ? "tv" : "movie"; // Tipo normalizado para endpoints de API
  const yearIso = (data.release_date || data.first_air_date || "")?.slice(0, 4); // Año de estreno
  const filmAffinitySearchUrl = `https://www.filmaffinity.com/es/search.php?stext=${encodeURIComponent((title || "").trim())}&stype=title`;

  // URLs de TMDb para enlace externo y pagina de "donde ver"
  const tmdbDetailUrl =
    type && id ? `https://www.themoviedb.org/${type}/${id}` : null;

  const tmdbWatchUrl =
    watchLink ||
    (type && id ? `https://www.themoviedb.org/${type}/${id}/watch` : null);

  // -- Estado general de la UI --
  const [showAdminImages, setShowAdminImages] = useState(false); // Panel admin de imagenes (solo admin)
  const [reviewLimit, setReviewLimit] = useState(2); // Numero de reseñas visibles (expandible)
  const [useBackdrop, setUseBackdrop] = useState(true); // Alternar entre backdrop y poster como fondo

  // -- Autenticacion y permisos --
  const { session, account } = useAuth();
  const isAdmin =
    account?.username === "psantos26" || account?.name === "psantos26";

  // -- Estado de favoritos y watchlist (TMDb) --
  const [favLoading, setFavLoading] = useState(false); // Cargando accion de favorito
  const [wlLoading, setWlLoading] = useState(false); // Cargando accion de watchlist
  const [favorite, setFavorite] = useState(false); // Es favorito del usuario
  const [watchlist, setWatchlist] = useState(false); // Esta en la watchlist del usuario

  // -- Puntuacion del usuario en TMDb --
  const [userRating, setUserRating] = useState(null); // Rating actual (1-10)
  const [ratingLoading, setRatingLoading] = useState(false);
  const [ratingError, setRatingError] = useState("");

  // Indica si se estan cargando los estados de cuenta (favorito, watchlist, rating)
  const [accountStatesLoading, setAccountStatesLoading] = useState(false);

  // Pestana activa en la seccion de metadatos (details/produccion/sinopsis/premios)
  const [activeTab, setActiveTab] = useState("details");

  // ====== CLAVES DE LOCALSTORAGE PARA PREFERENCIAS DE IMAGENES ======
  // Cada clave es unica por tipo de contenido e ID para persistir selecciones del usuario
  const posterStorageKey = `showverse:${endpointType}:${id}:poster`;
  const previewBackdropStorageKey = `showverse:${endpointType}:${id}:backdrop`;
  const backgroundStorageKey = `showverse:${endpointType}:${id}:background`;
  // Modo de vista global (poster o preview) - se comparte entre todos los contenidos
  const globalViewModeStorageKey = "showverse:global:posterViewMode";
  // Claves de rewatch (Trakt) persistentes por show
  const rewatchStorageKey = `showverse:trakt:rewatchStartAt:${id}`;

  // Claves para multiples rewatches (runs) y vista activa del modal de episodios
  const rewatchRunsStorageKey = `showverse:trakt:rewatchRuns:${id}`;
  const episodesViewStorageKey = `showverse:trakt:episodesView:${id}`;
  const traktStatusStorageKey = `showverse:trakt:status:${endpointType}:${id}`;
  const traktShowWatchedStorageKey = `showverse:trakt:showWatched:${id}`;

  // Lista de runs de rewatch: [{ id, startedAt, label }]
  const [rewatchRuns, setRewatchRuns] = useState([]);
  // Vista activa en el modal de episodios: "global" (todos) o el ID de un run especifico
  const [activeEpisodesView, setActiveEpisodesView] = useState("global");

  // Mapa de historial por episodio en rewatch para poder desmarcar: { "S1E2": historyId }
  const [rewatchHistoryByEpisode, setRewatchHistoryByEpisode] = useState({});
  const rewatchRunsRef = useRef([]);
  const activeEpisodesViewRef = useRef("global");
  const rewatchStartAtRef = useRef(null);

  // -- Rutas de imagen seleccionadas por el usuario --
  const [selectedPosterPath, setSelectedPosterPath] = useState(null);
  const [selectedPreviewBackdropPath, setSelectedPreviewBackdropPath] =
    useState(null);

  // El primer render debe ser determinista para evitar hydration mismatch.
  // La preferencia real del usuario se restaura en cliente justo después.
  const [posterViewMode, setPosterViewMode] = useState("poster");

  // Control separado del layout para secuenciar las transiciones de ratio.
  const [posterLayoutMode, setPosterLayoutMode] = useState("poster");
  const [posterModeHydrated, setPosterModeHydrated] = useState(false);

  const [isPosterHovered, setIsPosterHovered] = useState(false);
  // -- Imagen de fondo (background) con transicion suave --
  const [selectedBackgroundPath, setSelectedBackgroundPath] = useState(null);
  const [prevBackgroundPath, setPrevBackgroundPath] = useState(null); // Fondo anterior (para crossfade)
  const [isTransitioning, setIsTransitioning] = useState(false); // Animacion de cambio de fondo activa

  // -- Imagenes base: evitan SSR/primer render con un poster provisional --
  const [basePosterPath, setBasePosterPath] = useState(null);
  const [baseBackdropPath, setBaseBackdropPath] = useState(null);
  const [artworkInitialized, setArtworkInitialized] = useState(false); // Se pone a true tras la carga inicial

  // -- Estados de carga progresiva del poster --
  // Se usan para mostrar primero una version de baja calidad y luego la alta
  const [posterResolved, setPosterResolved] = useState(false); // Ruta del poster determinada
  const [posterLowLoaded, setPosterLowLoaded] = useState(false); // Imagen baja calidad cargada
  const [posterHighLoaded, setPosterHighLoaded] = useState(false); // Imagen alta calidad cargada
  const [posterImgError, setPosterImgError] = useState(false); // Error al cargar poster
  const [posterTransitioning, setPosterTransitioning] = useState(false); // Transicion entre posters
  const [prevPosterPath, setPrevPosterPath] = useState(null); // Poster anterior (para crossfade)

  // -- Estados de carga progresiva del backdrop (misma logica que poster) --
  const [backdropResolved, setBackdropResolved] = useState(false);
  const [backdropLowLoaded, setBackdropLowLoaded] = useState(false);
  const [backdropHighLoaded, setBackdropHighLoaded] = useState(false);
  const [backdropImgError, setBackdropImgError] = useState(false);

  // -- Estado de imagenes disponibles (posters y backdrops) --
  // Se inicializa con la imagen principal de TMDb y se enriquece con fetchs adicionales
  const [imagesState, setImagesState] = useState(() => ({
    posters: data.poster_path
      ? [{ file_path: data.poster_path, from: "main" }]
      : [],
    backdrops: data.backdrop_path
      ? [{ file_path: data.backdrop_path, from: "main" }]
      : [],
  }));
  const [imagesLoading, setImagesLoading] = useState(false);
  const [imagesError, setImagesError] = useState("");
  const [activeImagesTab, setActiveImagesTab] = useState("posters"); // "posters" | "backdrops" | "backgrounds"

  // ====== PROVEEDORES DE STREAMING (JustWatch) ======
  const [streamingProviders, setStreamingProviders] = useState([]); // Lista de servicios disponibles
  const [providersLoading, setProvidersLoading] = useState(true);
  const [justwatchUrl, setJustwatchUrl] = useState(null); // URL directa a JustWatch

  // ====== INTEGRACION CON PLEX ======
  const [plexAvailable, setPlexAvailable] = useState(false); // Contenido disponible en Plex local
  const [plexUrl, setPlexUrl] = useState(null); // URL para abrir en Plex (web/app)
  const [plexLoading, setPlexLoading] = useState(true);

  // -- Refs y estado para scroll horizontal de la galeria de imagenes --
  const imagesScrollRef = useRef(null);
  const contentTopRef = useRef(null);
  const [isHoveredImages, setIsHoveredImages] = useState(false);
  const [canPrevImages, setCanPrevImages] = useState(false); // Hay scroll a la izquierda
  const [canNextImages, setCanNextImages] = useState(false); // Hay scroll a la derecha

  /**
   * Extrae la ruta de TMDb de un valor que puede ser string o { file_path }.
   * Devuelve null si el valor no es valido.
   */
  const asTmdbPath = (v) => {
    if (!v) return null;
    if (typeof v === "string") return v;
    if (typeof v === "object" && typeof v.file_path === "string")
      return v.file_path;
    return null;
  };

  /**
   * Normaliza una URL anadiendo https:// si no tiene protocolo.
   */
  const normalizeUrl = (u) => {
    if (!u) return null;
    const s = String(u).trim();
    if (!s) return null;
    return s.startsWith("http://") || s.startsWith("https://")
      ? s
      : `https://${s}`;
  };

  // =====================================================================
  // LISTAS DE USUARIO (TMDb) - solo disponible para peliculas
  // Permite agregar peliculas a listas personalizadas, crear nuevas listas,
  // y detectar en que listas ya esta presente la pelicula.
  // =====================================================================

  // Las listas de TMDb solo funcionan para peliculas (no series) y requieren API key
  const canUseLists = endpointType === "movie" && !!TMDB_API_KEY;

  // -- Estado del modal de listas --
  const [listModalOpen, setListModalOpen] = useState(false);
  const [listsLoading, setListsLoading] = useState(false);
  const [listsError, setListsError] = useState("");
  const [userLists, setUserLists] = useState([]); // Todas las listas del usuario
  const [listQuery, setListQuery] = useState(""); // Filtro de busqueda en el modal

  // Mapa de pertenencia: { listId: true/false } indica si la pelicula esta en cada lista
  const [membershipMap, setMembershipMap] = useState({});
  const [listsPresenceLoading, setListsPresenceLoading] = useState(false);
  const [busyListId, setBusyListId] = useState(null); // Lista en proceso de modificacion

  // -- Estado para crear nueva lista desde el modal --
  const [createOpen, setCreateOpen] = useState(false);
  const [creatingList, setCreatingList] = useState(false);
  const [newListName, setNewListName] = useState("");
  const [newListDesc, setNewListDesc] = useState("");

  // Ref del wrapper de rating para detectar clicks fuera en movil
  const ratingWrapRef = useRef(null);

  // -- Deteccion de capacidades del dispositivo --
  const [supportsHover, setSupportsHover] = useState(false); // true = desktop con raton
  const [mobileClearOpen, setMobileClearOpen] = useState(false); // Boton de limpiar rating visible en movil

  const [isMobileViewport, setIsMobileViewport] = useState(false); // Viewport <= 640px

  /**
   * Extrae un ID consistente de una lista (puede venir como objeto o como valor directo).
   * Soporta formatos de TMDb y Trakt.
   */
  const getListId = useCallback((lOrId) => {
    if (lOrId == null) return null;
    if (typeof lOrId === "string" || typeof lOrId === "number")
      return String(lOrId);

    const l = lOrId;
    const id = l?.id ?? l?._id ?? l?.ids?.tmdb ?? l?.slug ?? l?.name;
    return id != null ? String(id) : null;
  }, []);

  // Detecta las capacidades del dispositivo: hover (desktop) y viewport movil.
  // Usa matchMedia para reaccionar a cambios en tiempo real (ej. rotar tablet).
  useEffect(() => {
    if (typeof window === "undefined") return;

    // hover + puntero fino => escritorio con raton
    const mqHover = window.matchMedia("(hover: hover) and (pointer: fine)");
    const updateHover = () => setSupportsHover(!!mqHover.matches);
    updateHover();
    if (mqHover.addEventListener)
      mqHover.addEventListener("change", updateHover);
    else mqHover.addListener(updateHover);

    // Viewport movil (breakpoint sm = 640px)
    const mqMobile = window.matchMedia("(max-width: 640px)");
    const updateMobile = () => setIsMobileViewport(!!mqMobile.matches);
    updateMobile();
    if (mqMobile.addEventListener)
      mqMobile.addEventListener("change", updateMobile);
    else mqMobile.addListener(updateMobile);

    return () => {
      if (mqHover.removeEventListener)
        mqHover.removeEventListener("change", updateHover);
      else mqHover.removeListener(updateHover);

      if (mqMobile.removeEventListener)
        mqMobile.removeEventListener("change", updateMobile);
      else mqMobile.removeListener(updateMobile);
    };
  }, []);

  // Si pasamos a desktop, cerramos el boton de limpiar rating movil
  useEffect(() => {
    if (supportsHover) setMobileClearOpen(false);
  }, [supportsHover]);

  // Cierra el boton de limpiar rating al tocar fuera del wrapper en movil
  useEffect(() => {
    if (supportsHover || !mobileClearOpen) return;
    const onDown = (e) => {
      if (!ratingWrapRef.current) return;
      if (!ratingWrapRef.current.contains(e.target)) setMobileClearOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [supportsHover, mobileClearOpen]);

  // ID numerico de la pelicula (necesario para la API de listas de TMDb)
  const movieId = useMemo(() => {
    const n = Number(id);
    return Number.isFinite(n) ? n : null;
  }, [id]);

  // Comprueba si la pelicula esta en alguna lista del usuario
  const inAnyList = useMemo(() => {
    const vals = Object.values(membershipMap || {});
    return vals.some(Boolean);
  }, [membershipMap]);

  // Indicador visual: la pelicula esta en al menos una lista (y ya se cargo la presencia)
  const listActive = !listsPresenceLoading && inAnyList;

  /**
   * Redirige a login si el usuario no esta autenticado.
   * Devuelve true si se redirigió (para abortar la accion en curso).
   */
  const requireLogin = () => {
    if (!session || !account?.id) {
      window.location.href = "/login";
      return true;
    }
    return false;
  };

  /**
   * Carga las listas del usuario desde TMDb si aun no se han cargado.
   * Usa un abortRef para cancelar si el componente se desmonta.
   */
  const loadListsIfNeeded = async ({ abortRef } = {}) => {
    if (!session || !account?.id) return [];
    if (!canUseLists) return [];
    if (Array.isArray(userLists) && userLists.length > 0) return userLists;

    const lists = await tmdbFetchAllUserLists({
      apiKey: TMDB_API_KEY,
      accountId: account.id,
      sessionId: session,
      language: "es-ES",
    });

    if (abortRef?.current) return [];
    setUserLists(lists);
    return lists;
  };

  /**
   * Comprueba en cuales listas esta presente la pelicula actual.
   * Realiza peticiones en paralelo (concurrencia 5) para cada lista del usuario.
   * @param {Object} options
   * @param {Array}  options.lists    - Listas a comprobar (si no se pasa, las carga)
   * @param {boolean} options.silent  - true = no muestra spinner de carga principal
   * @param {Object} options.abortRef - Referencia para cancelar si se desmonta
   */
  const loadPresenceForLists = async ({
    lists,
    silent = false,
    abortRef,
  } = {}) => {
    if (!session || !account?.id || !movieId) return;
    if (!canUseLists) return;

    if (!silent) setListsLoading(true);
    else setListsPresenceLoading(true);

    setListsError("");

    try {
      const base =
        Array.isArray(lists) && lists.length
          ? lists
          : await loadListsIfNeeded({ abortRef });
      if (abortRef?.current) return;

      const ids = base.map(getListId).filter(Boolean);
      const concurrency = 5;
      let idx = 0;
      const nextMap = {};

      const worker = async () => {
        while (!abortRef?.current && idx < ids.length) {
          const listId = ids[idx++];
          try {
            const lid = String(listId);
            const present = await tmdbListItemStatus({
              apiKey: TMDB_API_KEY,
              listId: lid,
              movieId,
              sessionId: session,
            });
            nextMap[lid] = !!present;
          } catch {
            nextMap[listId] = false;
          }
        }
      };

      await Promise.all(
        Array.from({ length: Math.min(concurrency, ids.length) }, () =>
          worker(),
        ),
      );
      if (abortRef?.current) return;
      setMembershipMap(nextMap);
    } catch (e) {
      if (!abortRef?.current)
        setListsError(e?.message || "Error cargando listas");
    } finally {
      if (!abortRef?.current) {
        if (!silent) setListsLoading(false);
        else setListsPresenceLoading(false);
      }
    }
  };

  // Carga la presencia en listas al montar o al cambiar de contenido/sesion.
  // Se ejecuta en modo silencioso (sin spinner principal).
  useEffect(() => {
    const abortRef = { current: false };
    if (!session || !account?.id || !canUseLists || !movieId) {
      setMembershipMap({});
      setListsPresenceLoading(false);
      return;
    }

    loadPresenceForLists({ silent: true, abortRef });
    return () => {
      abortRef.current = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, account?.id, canUseLists, movieId]);

  // Abre el modal de listas: carga listas y presencia
  const openListsModal = async () => {
    if (requireLogin()) return;
    if (!canUseLists || !movieId) return;

    setListModalOpen(true);
    setListsError("");
    setListQuery("");

    const abortRef = { current: false };
    await loadPresenceForLists({ silent: false, abortRef });
  };

  // Cierra el modal y resetea todos los estados temporales
  const closeListsModal = () => {
    setListModalOpen(false);
    setListQuery("");
    setListsError("");
    setCreateOpen(false);
    setNewListName("");
    setNewListDesc("");
  };

  // Agrega la pelicula a una lista especifica con actualizacion optimista del estado
  const handleAddToSpecificList = async (listId) => {
    if (!session || !account?.id || !movieId) return;
    if (!canUseLists) return;

    const lid = getListId(listId);
    if (!lid) return;
    if (membershipMap?.[lid]) return;

    setBusyListId(lid);
    setListsError("");

    try {
      const res = await tmdbAddMovieToList({
        apiKey: TMDB_API_KEY,
        listId: lid,
        movieId,
        sessionId: session,
      });

      // Actualizacion optimista: marca como presente antes de confirmar
      setMembershipMap((prev) => ({ ...(prev || {}), [lid]: true }));
      setUserLists((prev) =>
        (prev || []).map((l) => {
          const id = getListId(l);
          return id === lid
            ? {
                ...l,
                item_count: (l.item_count || 0) + (res?.duplicate ? 0 : 1),
              }
            : l;
        }),
      );
    } catch (e) {
      setListsError(e?.message || "Error añadiendo a la lista");
    } finally {
      setBusyListId(null);
    }
  };

  // Crea una nueva lista en TMDb y agrega la pelicula actual
  const handleCreateListAndAdd = async () => {
    if (!session || !account?.id || !movieId) return;
    if (!canUseLists) return;

    const n = newListName.trim();
    if (!n) return;

    setCreatingList(true);
    setListsError("");

    try {
      const newIdRaw = await tmdbCreateList({
        apiKey: TMDB_API_KEY,
        name: n,
        description: newListDesc.trim(),
        sessionId: session,
        language: "es-ES",
      });

      const newListId = getListId(newIdRaw);
      if (!newListId) throw new Error("No se pudo crear la lista");

      await tmdbAddMovieToList({
        apiKey: TMDB_API_KEY,
        listId: newListId,
        movieId,
        sessionId: session,
      });

      // Refresca todas las listas del usuario para reflejar la nueva lista
      const lists = await tmdbFetchAllUserLists({
        apiKey: TMDB_API_KEY,
        accountId: account.id,
        sessionId: session,
        language: "es-ES",
      });
      setUserLists(lists);

      // Marca la pelicula como presente en la nueva lista
      setMembershipMap((prev) => ({ ...(prev || {}), [newListId]: true }));

      setCreateOpen(false);
      setNewListName("");
      setNewListDesc("");
    } catch (e) {
      setListsError(e?.message || "Error creando lista");
    } finally {
      setCreatingList(false);
    }
  };

  // =====================================================================
  // VIDEOS / TRAILERS
  // Carga videos desde TMDb (en espanol e ingles), los fusiona, ordena
  // por relevancia y permite reproducirlos en un modal.
  // =====================================================================

  const [videos, setVideos] = useState([]); // Lista de videos disponibles
  const [videosLoading, setVideosLoading] = useState(() => !!TMDB_API_KEY);
  const [videosResolved, setVideosResolved] = useState(() => !TMDB_API_KEY);
  const [videosError, setVideosError] = useState("");
  const [videoModalOpen, setVideoModalOpen] = useState(false);
  const [activeVideo, setActiveVideo] = useState(null); // Video seleccionado para el modal
  const [soundtrackModalOpen, setSoundtrackModalOpen] = useState(false);
  const [activeSoundtrackId, setActiveSoundtrackId] = useState(null);
  const [soundtrackTracks, setSoundtrackTracks] = useState([]);
  const [soundtrackLoading, setSoundtrackLoading] = useState(false);
  const [soundtrackResolved, setSoundtrackResolved] = useState(false);
  const [soundtrackError, setSoundtrackError] = useState("");
  const soundtrackAbortRef = useRef(null);
  const soundtrackInFlightRef = useRef(null);
  const soundtrackLoadedKeyRef = useRef("");

  // Selecciona automaticamente el mejor video (trailer oficial preferido)
  const preferredVideo = useMemo(() => pickPreferredVideo(videos), [videos]);
  const soundtrackSearchQuery = useMemo(() => {
    if (!title) return "";
    return [
      title,
      yearIso,
      endpointType === "tv" ? "series soundtrack" : "movie soundtrack",
    ]
      .filter(Boolean)
      .join(" ");
  }, [endpointType, title, yearIso]);
  const soundtrackSpotifySearchUrl = useMemo(() => {
    if (!soundtrackSearchQuery) return "";
    return `https://open.spotify.com/search/${encodeURIComponent(soundtrackSearchQuery)}`;
  }, [soundtrackSearchQuery]);
  const soundtrackRequestKey = useMemo(
    () =>
      [
        SOUNDTRACK_ALGORITHM_VERSION,
        endpointType,
        id,
        title,
        originalTitle,
        yearIso,
      ]
        .filter(Boolean)
        .join("|"),
    [endpointType, id, originalTitle, title, yearIso],
  );

  const loadSoundtrack = useCallback(
    async ({ background = false, force = false } = {}) => {
      if (!soundtrackSearchQuery) {
        setSoundtrackTracks([]);
        setSoundtrackError("");
        setSoundtrackLoading(false);
        setSoundtrackResolved(true);
        return;
      }

      if (
        !force &&
        soundtrackLoadedKeyRef.current === soundtrackRequestKey &&
        soundtrackResolved
      ) {
        return;
      }

      const inFlight = soundtrackInFlightRef.current;
      if (!force && inFlight?.key === soundtrackRequestKey) {
        if (!background) {
          setSoundtrackLoading(true);
          try {
            await inFlight.promise;
          } catch {
            // The original request path owns the visible error state.
          } finally {
            setSoundtrackLoading(false);
          }
        }
        return inFlight.promise.catch(() => undefined);
      }

      if (force) {
        soundtrackAbortRef.current?.abort();
      }

      const controller = new AbortController();
      soundtrackAbortRef.current = controller;

      if (!background) {
        setSoundtrackLoading(true);
      }
      setSoundtrackResolved(false);
      setSoundtrackError("");

      const promise = (async () => {
        const params = new URLSearchParams({
          title,
          type: endpointType,
          country: "ES",
          algorithm: SOUNDTRACK_ALGORITHM_VERSION,
        });
        if (originalTitle && originalTitle !== title) {
          params.set("originalTitle", originalTitle);
        }
        if (yearIso) params.set("year", yearIso);
        if (id) params.set("tmdbId", String(id));

        const response = await fetch(`/api/soundtrack?${params.toString()}`, {
          signal: controller.signal,
          priority: background ? "low" : "high",
        });
        const payload = await response.json();
        if (!response.ok) {
          throw new Error(payload?.error || "No se pudo cargar el soundtrack");
        }
        return payload;
      })();

      soundtrackInFlightRef.current = {
        key: soundtrackRequestKey,
        promise,
      };

      try {
        const payload = await promise;
        const normalized = Array.isArray(payload?.tracks) ? payload.tracks : [];
        const spotifyConfigured = Boolean(payload?.spotifyConfigured);
        const spotifyActive = payload?.spotifyActive !== false;
        const spotifyRateLimited = Boolean(payload?.spotifyRateLimited);
        const retryAfterSecs = Number(payload?.spotifyRetryAfter || 0);

        if (!controller.signal.aborted) {
          soundtrackLoadedKeyRef.current = soundtrackRequestKey;
          setSoundtrackTracks(normalized);
          setSoundtrackError(
            normalized.length
              ? ""
              : !spotifyConfigured
                ? "Spotify no está configurado en el servidor."
                : spotifyRateLimited
                  ? retryAfterSecs > 3600
                    ? `Límite de Spotify alcanzado. Disponible en aprox. ${Math.ceil(retryAfterSecs / 3600)}h.`
                    : retryAfterSecs > 60
                      ? `Límite de Spotify alcanzado. Disponible en aprox. ${Math.ceil(retryAfterSecs / 60)} min.`
                      : "Spotify ha limitado temporalmente las búsquedas. Reinténtalo en breve."
                  : spotifyActive
                    ? "No se encontraron canciones de Spotify para este título."
                    : "Spotify está configurado, pero no se pudo autenticar con la API.",
          );
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          setSoundtrackTracks([]);
          setSoundtrackError(
            error?.message || "No se pudo cargar la música del título.",
          );
        }
      } finally {
        if (soundtrackInFlightRef.current?.promise === promise) {
          soundtrackInFlightRef.current = null;
        }
        if (!controller.signal.aborted) {
          if (!background) {
            setSoundtrackLoading(false);
          }
          setSoundtrackResolved(true);
        }
      }
    },
    [
      endpointType,
      id,
      originalTitle,
      soundtrackRequestKey,
      soundtrackResolved,
      soundtrackSearchQuery,
      title,
      yearIso,
    ],
  );

  const openSoundtrack = useCallback(
    (trackId = null) => {
      setActiveSoundtrackId(trackId);
      setSoundtrackModalOpen(true);
      void loadSoundtrack({ background: false });
    },
    [loadSoundtrack],
  );

  // Abre el modal de video con el video seleccionado
  const openVideo = (v) => {
    if (!v) return;
    setActiveVideo(v);
    setVideoModalOpen(true);
  };

  // Cierra el modal de video
  const closeVideo = () => {
    setVideoModalOpen(false);
    setActiveVideo(null);
  };

  // Resetea el modal de video al cambiar de contenido
  useEffect(() => {
    setVideoModalOpen(false);
    setActiveVideo(null);
    setSoundtrackModalOpen(false);
    setActiveSoundtrackId(null);
    setSoundtrackTracks([]);
    setSoundtrackLoading(false);
    setSoundtrackResolved(false);
    setSoundtrackError("");
    soundtrackLoadedKeyRef.current = "";
    soundtrackInFlightRef.current = null;
    soundtrackAbortRef.current?.abort();
    soundtrackAbortRef.current = null;
  }, [id, endpointType]);

  useEffect(() => {
    if (
      !soundtrackSearchQuery ||
      soundtrackResolved ||
      soundtrackTracks.length
    ) {
      return undefined;
    }

    let idleId = null;
    const timer = window.setTimeout(() => {
      if ("requestIdleCallback" in window) {
        idleId = window.requestIdleCallback(
          () => void loadSoundtrack({ background: true }),
          { timeout: 3500 },
        );
      } else {
        void loadSoundtrack({ background: true });
      }
    }, 1400);

    return () => {
      window.clearTimeout(timer);
      if (idleId !== null && "cancelIdleCallback" in window) {
        window.cancelIdleCallback(idleId);
      }
    };
  }, [
    loadSoundtrack,
    soundtrackResolved,
    soundtrackSearchQuery,
    soundtrackTracks.length,
  ]);

  useLayoutEffect(() => {
    if (!TMDB_API_KEY || !id) {
      setVideos([]);
      setVideosError("");
      setVideosLoading(false);
      setVideosResolved(true);
      return;
    }

    setVideos([]);
    setVideosError("");
    setVideosLoading(true);
    setVideosResolved(false);
  }, [id, endpointType]);

  // Carga los videos de TMDb en espanol e ingles, los fusiona eliminando
  // duplicados, filtra los reproducibles y los ordena por relevancia.
  useEffect(() => {
    let ignore = false;

    // Fetch seguro que devuelve array vacio en caso de error
    const safeFetchVideos = async (language) => {
      if (!TMDB_API_KEY) return [];
      try {
        const url = `https://api.themoviedb.org/3/${endpointType}/${id}/videos?api_key=${TMDB_API_KEY}&language=${language}`;
        const res = await fetch(url);
        const json = await res.json();
        if (!res.ok) return [];
        return Array.isArray(json?.results) ? json.results : [];
      } catch {
        return [];
      }
    };

    const load = async () => {
      if (!TMDB_API_KEY || !id) {
        setVideos([]);
        setVideosError("");
        setVideosLoading(false);
        setVideosResolved(true);
        return;
      }

      setVideosLoading(true);
      setVideosError("");

      try {
        const [es, en] = await Promise.all([
          safeFetchVideos("es-ES"),
          safeFetchVideos("en-US"),
        ]);
        if (ignore) return;

        const merged = uniqBy(
          [...es, ...en],
          (v) => `${v.site}:${v.key}`,
        ).filter(isPlayableVideo);

        merged.sort((a, b) => rankVideo(a) - rankVideo(b));
        setVideos(merged);
      } catch (e) {
        if (!ignore) setVideosError(e?.message || "Error cargando vídeos");
      } finally {
        if (!ignore) {
          setVideosLoading(false);
          setVideosResolved(true);
        }
      }
    };

    load();
    return () => {
      ignore = true;
    };
  }, [id, endpointType]);

  // =====================================================================
  // FILTROS DE PORTADAS Y FONDOS
  // Controla la galeria de imagenes con filtros de resolucion e idioma.
  // =====================================================================

  const [imagesResFilter, setImagesResFilter] = useState("all"); // Filtro de resolucion: all | 720p | 1080p | 2k | 4k
  const [langES, setLangES] = useState(true); // Mostrar imagenes en espanol
  const [langEN, setLangEN] = useState(true); // Mostrar imagenes en ingles
  const [artworkPreloadCount, setArtworkPreloadCount] = useState(4); // Numero de imagenes a precargar antes de mostrar

  // Controla si la fila de artwork esta lista para mostrarse (precarga completada)
  const [artworkRowReady, setArtworkRowReady] = useState(false);

  // Panel movil de filtros (colapsable)
  const [artworkControlsOpen, setArtworkControlsOpen] = useState(false);

  // Ref del wrapper de controles de artwork para detectar click fuera
  const artworkControlsWrapRef = useRef(null);

  // Cierra el panel de filtros de artwork y el menu de resolucion con Escape
  // o al hacer click/touch fuera del wrapper
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") {
        setArtworkControlsOpen(false);
        setResMenuOpen?.(false);
      }
    };

    const onDown = (e) => {
      const wrap = artworkControlsWrapRef.current;
      if (!wrap) return;
      if (!wrap.contains(e.target)) {
        setArtworkControlsOpen(false);
        setResMenuOpen?.(false);
      }
    };

    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown, { passive: true });

    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
    };
  }, []);

  // -- Dropdown de resolucion --
  const [resMenuOpen, setResMenuOpen] = useState(false);
  const resMenuRef = useRef(null);

  // Cierra el menu de resolucion al hacer click fuera
  useEffect(() => {
    if (!resMenuOpen) return;
    const onDown = (e) => {
      if (!resMenuRef.current) return;
      if (!resMenuRef.current.contains(e.target)) setResMenuOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [resMenuOpen]);

  // Cierra el menu de resolucion al cambiar de pestana de imagenes
  useEffect(() => {
    setResMenuOpen(false);
  }, [activeImagesTab]);

  // -- Utilidades de resolucion de imagen --

  // Devuelve el lado mas largo de una imagen (ancho o alto)
  const imgLongSide = (img) =>
    Math.max(Number(img?.width || 0), Number(img?.height || 0));

  // Clasifica la resolucion de una imagen en categorias: 4k, 2k, 1080p, 720p, sd
  const imgResBucket = (img) => {
    const long = imgLongSide(img);
    if (long >= 3840) return "4k";
    if (long >= 2560) return "2k";
    if (long >= 1920) return "1080p";
    if (long >= 1280) return "720p";
    return "sd";
  };

  // Formatea las dimensiones de una imagen como "WxH" para mostrar en la UI
  const imgResLabel = (img) => {
    const w = Number(img?.width || 0);
    const h = Number(img?.height || 0);
    return w > 0 && h > 0 ? `${w}×${h}` : null;
  };

  // Calcula el numero de slides visibles en el carrusel segun el viewport y tipo de imagen
  const getArtworkSlidesPerView = (width, isPoster) => {
    if (isPoster) {
      if (width >= 1280) return 7;
      if (width >= 1024) return 6;
      if (width >= 768) return 5;
      if (width >= 640) return 4;
      if (width >= 500) return 3;
      return 3;
    }
    if (width >= 1280) return 6;
    if (width >= 1024) return 5;
    return 4;
  };

  /**
   * Selecciona el mejor backdrop para el modo preview.
   * Combina todas las fuentes de backdrops disponibles y usa un algoritmo
   * inteligente que prioriza imagenes con idioma ES/EN y buena resolucion.
   * Evita parpadeos: no devuelve fallback generico hasta que la inicializacion termine.
   */
  const previewBackdropFallback = useMemo(() => {
    // 1. Combinar todas las fuentes posibles de backdrops.
    //    Solo usamos data.images si artworkInitialized es true
    //    para evitar mostrar un backdrop que luego sera reemplazado.
    const allBackdrops = [
      ...(imagesState?.backdrops || []),
      ...(artworkInitialized && data?.images?.backdrops
        ? data.images.backdrops
        : []),
    ];

    // 2. Aplicar el filtro inteligente para encontrar el mejor backdrop
    if (allBackdrops.length > 0) {
      const bestPath = pickBestBackdropForPreview(allBackdrops);
      if (bestPath) return bestPath;
    }

    // 3. Si aun estamos inicializando, devolvemos null (se muestra skeleton)
    //    para evitar parpadeo de imagen incorrecta que luego se reemplaza.
    if (!artworkInitialized) return null;

    // 4. Fallback final: si ya terminamos y no hay nada mejor, usamos el generico
    return data?.backdrop_path || null;
  }, [
    imagesState?.backdrops,
    data?.images?.backdrops,
    data?.backdrop_path,
    artworkInitialized,
  ]);

  /**
   * Procesa y filtra la galeria de artwork segun la pestana activa (posters/backdrops/background),
   * filtros de resolucion e idioma. Devuelve la lista ordenada, el aspect ratio,
   * el tamano de imagen y la ruta activa actual.
   */
  const artworkSelection = useMemo(() => {
    const rawList =
      activeImagesTab === "posters"
        ? imagesState?.posters
        : imagesState?.backdrops;

    const isPoster = activeImagesTab === "posters";
    const isBackdropTab = activeImagesTab === "backdrops";
    const isBackgroundTab = activeImagesTab === "background";
    const aspect = isPoster ? "aspect-[2/3]" : "aspect-[16/9]";
    const size = isPoster ? "w342" : "w780";

    const currentPosterActive =
      (selectedPosterPath || basePosterPath || data?.profile_path) ?? null;

    // Backdrop de preview: misma logica de seleccion que MainDashboard
    const previewFallback = previewBackdropFallback;

    const currentPreviewActive = selectedPreviewBackdropPath || previewFallback;

    const currentBackgroundActive =
      (selectedBackgroundPath || baseBackdropPath || data?.backdrop_path) ??
      null;

    const activePath = isPoster
      ? currentPosterActive
      : isBackdropTab
        ? currentPreviewActive
        : currentBackgroundActive;

    const withPath = (rawList || []).filter((img) => !!img?.file_path);

    const normLang = (lang) =>
      String(lang || "")
        .trim()
        .toLowerCase();

    const isLangES = (lang) => lang === "es" || lang === "es-es";
    const isLangEN = (lang) => lang === "en" || lang === "en-us";

    const matchesLang = (img) => {
      const lang = normLang(img?.iso_639_1);
      if (!lang) return false;
      return (langES && isLangES(lang)) || (langEN && isLangEN(lang));
    };

    // Filtrar imagenes por resolucion e idioma, siempre incluyendo la imagen activa
    const filtered = withPath.filter((img) => {
      const fp = img?.file_path;
      if (fp === activePath) return true; // Siempre incluir la imagen activa

      if (imagesResFilter !== "all") {
        const b = imgResBucket(img);
        const target = imagesResFilter === "2k" ? "2k" : imagesResFilter;
        if (b !== target) return false;
      }

      if (isBackgroundTab) {
        return !img?.iso_639_1;
      }

      if (isBackdropTab) {
        // Vista previa: backdrops CON idioma (ES o EN, independiente de filtros)
        const lang = normLang(img?.iso_639_1);
        return isLangES(lang) || isLangEN(lang);
      }

      // Posters: solo ES/EN según filtros activos
      return matchesLang(img);
    });

    // Fallback relajado: si los filtros son demasiado restrictivos, se relajan
    const relaxed = (() => {
      if (!withPath.length) return [];
      if (isBackgroundTab) {
        const neutral = withPath.filter((img) => !img?.iso_639_1);
        return neutral.length ? neutral : withPath;
      }
      if (isBackdropTab) {
        // Vista previa: priorizar backdrops que tienen idioma asignado
        const withLang = withPath.filter((img) => !!img?.iso_639_1);
        return withLang.length ? withLang : withPath;
      }
      if (isPoster) {
        const neutral = withPath.filter((img) => !img?.iso_639_1);
        return neutral.length ? neutral : withPath;
      }
      return withPath;
    })();

    const usable = filtered.length ? filtered : relaxed;

    // Reordenar: en Vista previa, el backdrop activo va primero
    const ordered = (() => {
      if (isBackdropTab && activePath && usable.length > 0) {
        const activeIdx = usable.findIndex((x) => x?.file_path === activePath);
        if (activeIdx > 0) {
          // Mover el activo al principio
          return [
            usable[activeIdx],
            ...usable.slice(0, activeIdx),
            ...usable.slice(activeIdx + 1),
          ];
        }
      }
      return usable;
    })();

    return {
      ordered,
      isPoster,
      isBackdropTab,
      isBackgroundTab,
      aspect,
      size,
      activePath,
    };
  }, [
    activeImagesTab,
    imagesState?.posters,
    imagesState?.backdrops,
    imagesResFilter,
    langES,
    langEN,
    selectedPosterPath,
    basePosterPath,
    data?.profile_path,
    previewBackdropFallback,
    selectedPreviewBackdropPath,
    selectedBackgroundPath,
    baseBackdropPath,
    data?.backdrop_path,
  ]);

  // Precarga las primeras N imagenes de la fila actual.
  // No muestra el carrusel hasta que todas las imagenes visibles esten cargadas
  // para evitar que aparezcan una por una (efecto "pop-in").
  useEffect(() => {
    if (typeof window === "undefined") return;

    // Mientras las imagenes de TMDb estan cargando, ocultamos el carrusel
    if (imagesLoading) {
      setArtworkRowReady(false);
      return;
    }

    const { ordered, size, isPoster } = artworkSelection;
    if (!ordered || ordered.length === 0) {
      setArtworkRowReady(true);
      return;
    }

    const limit = Math.max(1, Math.min(ordered.length, artworkPreloadCount));
    const urls = [];
    for (let i = 0; i < limit; i += 1) {
      const fp = ordered[i]?.file_path;
      if (!fp) continue;
      // Precarga rapida (cache en memoria JS)
      preloadTmdb(fp, size);
      // Tambien esperamos la carga real del navegador
      urls.push(`https://image.tmdb.org/t/p/${size}${fp}`);
    }

    if (!urls.length) {
      setArtworkRowReady(true);
      return;
    }

    // Si las imagenes ya estan en cache del navegador, mostrar inmediatamente
    const isCached = urls.every((url) => {
      const img = new Image();
      img.src = url;
      return img.complete;
    });

    if (isCached) {
      setArtworkRowReady(true);
      return;
    }

    let cancelled = false;
    setArtworkRowReady(false);

    let done = 0;
    const finishOne = () => {
      done += 1;
      if (!cancelled && done >= urls.length) setArtworkRowReady(true);
    };

    for (const url of urls) {
      const img = new Image();
      img.decoding = "async";
      try {
        img.fetchPriority = "high";
      } catch {}
      img.onload = finishOne;
      img.onerror = finishOne; // Si una falla, no bloqueamos toda la fila
      img.src = url;
    }

    return () => {
      cancelled = true;
    };
  }, [imagesLoading, artworkSelection, artworkPreloadCount]);

  // Recalcula cuantas imagenes precargar al cambiar el tamano del viewport
  useEffect(() => {
    if (typeof window === "undefined") return;

    const updateCount = () => {
      const { isPoster } = artworkSelection;
      const count = getArtworkSlidesPerView(window.innerWidth, isPoster);
      setArtworkPreloadCount(count);
    };

    updateCount();
    window.addEventListener("resize", updateCount);
    return () => window.removeEventListener("resize", updateCount);
  }, [artworkSelection]);

  /**
   * useLayoutEffect de inicializacion de artwork.
   * Resetea todos los estados de imagen y carga las preferencias guardadas
   * del usuario desde localStorage (poster, backdrop, background seleccionados).
   * Se ejecuta antes del paint para evitar flashes visuales.
   */
  useLayoutEffect(() => {
    try {
      const savedMode =
        window.localStorage.getItem(globalViewModeStorageKey) || "poster";
      setPosterViewMode(savedMode);
      setPosterLayoutMode(savedMode);
    } catch {
      setPosterViewMode("poster");
      setPosterLayoutMode("poster");
    } finally {
      setPosterModeHydrated(true);
    }
  }, [globalViewModeStorageKey]);

  useLayoutEffect(() => {
    setPosterResolved(false);
    setPosterLowLoaded(false);
    setPosterHighLoaded(false);
    setPosterImgError(false);
    setArtworkInitialized(false);

    const initialPoster =
      (typeof window !== "undefined"
        ? window.localStorage.getItem(posterStorageKey)
        : null) ||
      data?.profile_path ||
      null;

    const initialBackdrop =
      (typeof window !== "undefined"
        ? window.localStorage.getItem(backgroundStorageKey)
        : null) ||
      data?.backdrop_path ||
      null;

    setBaseBackdropPath(initialBackdrop);
    setBasePosterPath(initialPoster);
    // No activar posterResolved hasta que initArtwork termine

    setImagesState({
      posters: data.poster_path
        ? [{ file_path: data.poster_path, from: "main" }]
        : [],
      backdrops: [], // No inicializar con data.backdrop_path - esperar a initArtwork
    });
    setImagesLoading(false);
    setImagesError("");
    setActiveImagesTab("posters");

    setSelectedPosterPath(null);
    setSelectedPreviewBackdropPath(null);
    setSelectedBackgroundPath(null);

    // No resetear posterViewMode/posterLayoutMode - respetar la preferencia global
    // Ya se inicializan desde localStorage en el useState inicial

    setActiveTab("details");
    setActiveSection(null);

    if (typeof window !== "undefined") {
      try {
        const savedPoster = window.localStorage.getItem(posterStorageKey);
        const savedPreviewBackdrop = window.localStorage.getItem(
          previewBackdropStorageKey,
        );
        const savedBackground =
          window.localStorage.getItem(backgroundStorageKey);

        if (savedPoster) setSelectedPosterPath(savedPoster);
        if (savedPreviewBackdrop)
          setSelectedPreviewBackdropPath(savedPreviewBackdrop);
        if (savedBackground) setSelectedBackgroundPath(savedBackground);
      } catch {
        // ignore
      }
    }
    // No activar artworkInitialized aqui - esperar a que initArtwork termine
  }, [
    id,
    endpointType,
    data?.poster_path,
    data?.backdrop_path,
    data?.profile_path,
    posterStorageKey,
    backgroundStorageKey,
    previewBackdropStorageKey,
  ]);

  /**
   * Inicializacion asincrona del artwork.
   * Para series TV: carga imagenes extra de todas las temporadas y selecciona las mejores.
   * Para peliculas sin imagenes SSR: carga imagenes desde la API de TMDb.
   * Precarga las imagenes seleccionadas en el tamano adecuado.
   */
  useEffect(() => {
    let cancelled = false;

    const initArtwork = async () => {
      setArtworkInitialized(false);

      let poster = data.profile_path || null;
      let backdrop = data.backdrop_path || null;

      if (data?.images) {
        const bestPoster = pickBestEnglishPoster(data.images.posters || []);
        if (bestPoster?.file_path) poster = bestPoster.file_path;

        setImagesState((prev) => ({
          posters: mergeUniqueImages(prev.posters, data.images.posters || []),
          backdrops: mergeUniqueImages(
            prev.backdrops,
            data.images.backdrops || [],
          ),
        }));
      }

      if (endpointType === "tv" && TMDB_API_KEY) {
        // Si el servidor ya proporcionó las imágenes (via append_to_response=images),
        // usarlas directamente con los selectores TV-optimizados y omitir el fetch adicional.
        const hasServerImages =
          (data?.images?.posters?.length ?? 0) > 0 ||
          (data?.images?.backdrops?.length ?? 0) > 0;

        const tvPosters = hasServerImages ? data.images.posters || [] : null;
        const tvBackdrops = hasServerImages
          ? data.images.backdrops || []
          : null;

        if (!hasServerImages) {
          try {
            setImagesLoading(true);
            setImagesError("");

            const fetched = await fetchTVImages({
              showId: id,
              apiKey: TMDB_API_KEY,
            });

            if (!cancelled) {
              const bestPoster = pickBestEnglishPoster(fetched.posters);
              const bestBackdropForBackground = pickBestBackdropTVNeutralFirst(
                fetched.backdrops,
              );
              const bestBackdropForPreviewCalc = pickBestBackdropForPreview(
                fetched.backdrops,
              );

              const bestPosterPath = asTmdbPath(bestPoster);
              const bestBackdropPath = asTmdbPath(bestBackdropForBackground);
              const bestPreviewPath = asTmdbPath(bestBackdropForPreviewCalc);

              const savedGlobalMode =
                typeof window !== "undefined"
                  ? window.localStorage.getItem(
                      "showverse:global:posterViewMode",
                    )
                  : null;

              if (savedGlobalMode === "preview" && bestPreviewPath) {
                await preloadTmdb(bestPreviewPath, "w780");
              }
              if (bestPosterPath) await preloadTmdb(bestPosterPath, "w780");

              if (!cancelled) {
                if (bestPosterPath) poster = bestPosterPath;
                if (bestBackdropPath) backdrop = bestBackdropPath;

                setImagesState((prev) => ({
                  posters: mergeUniqueImages(prev.posters, fetched.posters),
                  backdrops: mergeUniqueImages(
                    prev.backdrops,
                    fetched.backdrops,
                  ),
                }));
              }
            }
          } catch (e) {
            if (!cancelled) console.error("Error cargando imagenes TV:", e);
          } finally {
            if (!cancelled) setImagesLoading(false);
          }
        } else {
          // Imágenes del servidor: aplicar selectores TV-optimizados sin fetch adicional
          const bestPoster = pickBestEnglishPoster(tvPosters);
          const bestBackdropForBackground =
            pickBestBackdropTVNeutralFirst(tvBackdrops);
          const bestBackdropForPreviewCalc =
            pickBestBackdropForPreview(tvBackdrops);

          const bestPosterPath = asTmdbPath(bestPoster);
          const bestBackdropPath = asTmdbPath(bestBackdropForBackground);
          const bestPreviewPath = asTmdbPath(bestBackdropForPreviewCalc);

          const savedGlobalMode =
            typeof window !== "undefined"
              ? window.localStorage.getItem("showverse:global:posterViewMode")
              : null;

          if (savedGlobalMode === "preview" && bestPreviewPath) {
            await preloadTmdb(bestPreviewPath, "w780");
          }
          if (bestPosterPath) await preloadTmdb(bestPosterPath, "w780");

          if (!cancelled) {
            if (bestPosterPath) poster = bestPosterPath;
            if (bestBackdropPath) backdrop = bestBackdropPath;
            // Las imágenes ya fueron mergeadas en el bloque data?.images de arriba
          }
        }
      }

      if (endpointType === "movie" && !data?.images && TMDB_API_KEY) {
        try {
          setImagesLoading(true);
          setImagesError("");

          const url = `https://api.themoviedb.org/3/movie/${id}/images?api_key=${TMDB_API_KEY}&include_image_language=en,null,es`;
          const res = await fetch(url);
          const json = await res.json();
          if (!res.ok)
            throw new Error(json?.status_message || "Error al cargar imágenes");

          const posters = json.posters || [];
          const backdrops = json.backdrops || [];

          const bestPoster = pickBestEnglishPoster(posters);
          const bestBackdropForPreviewCalc =
            pickBestBackdropForPreview(backdrops);

          // Precargar backdrop de vista previa primero si estamos en modo preview
          const savedGlobalMode =
            typeof window !== "undefined"
              ? window.localStorage.getItem("showverse:global:posterViewMode")
              : null;

          if (savedGlobalMode === "preview" && bestBackdropForPreviewCalc) {
            await preloadTmdb(bestBackdropForPreviewCalc, "w780");
          }

          if (bestPoster?.file_path) {
            await preloadTmdb(bestPoster.file_path, "w780");
            poster = bestPoster.file_path;
          }

          if (!cancelled) {
            setImagesState((prev) => ({
              posters: mergeUniqueImages(prev.posters, posters),
              backdrops: mergeUniqueImages(prev.backdrops, backdrops),
            }));
          }
        } catch (err) {
          if (!cancelled) setImagesError(err.message);
        } finally {
          if (!cancelled) setImagesLoading(false);
        }
      }

      if (!cancelled) {
        const hasSavedPoster =
          typeof window !== "undefined" &&
          Boolean(window.localStorage.getItem(posterStorageKey));

        // Respetar selecciones manuales, pero permitir sustituir el poster base
        // localizado por el poster ingles calculado.
        if (poster) {
          setBasePosterPath((prev) =>
            hasSavedPoster ? prev || asTmdbPath(poster) : asTmdbPath(poster),
          );
        }
        if (backdrop) {
          setBaseBackdropPath((prev) => prev || asTmdbPath(backdrop));
        }

        setPosterResolved(true);
        setArtworkInitialized(true);
      }
    };

    initArtwork();
    return () => {
      cancelled = true;
    };
  }, [
    id,
    endpointType,
    data?.images,
    data?.poster_path,
    data?.backdrop_path,
    data?.profile_path,
  ]);

  // ---------------------------------------------------------------------------
  // RUTAS DE IMAGEN PARA VISUALIZACION
  // Cadena de prioridad: seleccion del usuario > calculada > datos de TMDb
  // ---------------------------------------------------------------------------

  // Poster a mostrar: seleccion manual > calculado. No usar data.poster_path
  // como fallback inicial porque puede venir localizado en espanol.
  const basePosterDisplayPath =
    asTmdbPath(selectedPosterPath) ||
    asTmdbPath(basePosterPath) ||
    asTmdbPath(data?.profile_path) ||
    null;

  // Backdrop para modo preview: seleccion manual > fallback inteligente
  const previewBackdropPath =
    (artworkInitialized ? asTmdbPath(selectedPreviewBackdropPath) : null) ||
    asTmdbPath(previewBackdropFallback) ||
    null;

  // Imagen principal del poster: en modo preview muestra backdrop, si no el poster
  const displayPosterPath =
    posterViewMode === "preview" ? previewBackdropPath : basePosterDisplayPath;

  // Precarga ambas variantes para que el cambio entre poster y preview sea instantáneo.
  useEffect(() => {
    if (basePosterDisplayPath) {
      void preloadTmdb(basePosterDisplayPath, "w342");
      void preloadTmdb(basePosterDisplayPath, "w780");
    }

    if (previewBackdropPath) {
      void preloadTmdb(previewBackdropPath, "w780");
      void preloadTmdb(previewBackdropPath, "w1280");
    }
  }, [basePosterDisplayPath, previewBackdropPath]);

  // Comprueba si una ruta pertenece a la lista de backdrops (no posters)
  const isBackdropPath = useCallback(
    (path) => {
      if (!path) return false;
      const backdrops = imagesState?.backdrops || [];
      return backdrops.some((b) => b?.file_path === path);
    },
    [imagesState?.backdrops],
  );

  // Detecta si la portada actual se muestra como backdrop (horizontal).
  // Usa posterLayoutMode (no posterViewMode) para redimensionar la tarjeta
  // antes de cambiar la imagen, evitando saltos de layout.
  const isBackdropPoster = useMemo(
    () => posterLayoutMode === "preview" || isBackdropPath(displayPosterPath),
    [posterLayoutMode, displayPosterPath, isBackdropPath],
  );

  // Backdrop de fondo: seleccion manual > calculado > datos originales
  const displayBackdropPath =
    asTmdbPath(selectedBackgroundPath) ||
    asTmdbPath(baseBackdropPath) ||
    asTmdbPath(data?.backdrop_path) ||
    null;

  // Mejor poster neutro (sin texto/idioma) para uso en movil como fondo
  const mobileNeutralPosterPath = useMemo(() => {
    const best =
      pickBestNeutralPosterByResVotes(imagesState?.posters || [])?.file_path ||
      null;
    if (best) return best;
    // Fallback: primera imagen sin idioma si no hay metadata de tamanos/votos
    return (
      (imagesState?.posters || []).find((p) => p?.file_path && !p?.iso_639_1)
        ?.file_path || null
    );
  }, [imagesState?.posters]);

  // Selecciona la imagen de fondo del hero segun el viewport:
  // - Desktop: usa el backdrop horizontal
  // - Movil: usa un poster neutro (sin texto) para mejor visualizacion vertical
  const heroBackgroundPath = (() => {
    if (!useBackdrop || !artworkInitialized) return null;

    // Desktop: usa el backdrop horizontal seleccionado
    const desktop = displayBackdropPath;

    // Movil: prioriza poster sin idioma, pero respeta seleccion manual del usuario
    const mobile =
      selectedBackgroundPath || // Si el usuario eligio un fondo manual, respetarlo
      mobileNeutralPosterPath ||
      basePosterPath ||
      data.profile_path ||
      desktop ||
      null;

    return isMobileViewport ? mobile : desktop;
  })();

  // =====================================================================
  // ESTADOS DE CUENTA (TMDb)
  // Carga el estado de favorito, watchlist y puntuacion del usuario.
  // =====================================================================
  useEffect(() => {
    let cancel = false;

    const load = async () => {
      // Sin sesion activa no hay datos de cuenta que cargar
      if (!session || !account?.id) {
        setAccountStatesLoading(false);
        return;
      }

      setAccountStatesLoading(true);

      try {
        const st = await getMediaAccountStates(type, id, session);
        if (cancel) return;

        setFavorite(!!st.favorite);
        setWatchlist(!!st.watchlist);

        const ratedValue =
          st?.rated && typeof st.rated.value === "number"
            ? st.rated.value
            : null;
        setUserRating(ratedValue);
      } catch {
        // Si falla, al menos dejamos de "cargar" para no bloquear la UI
      } finally {
        if (!cancel) setAccountStatesLoading(false);
      }
    };

    load();
    return () => {
      cancel = true;
    };
  }, [type, id, session, account?.id]);

  // Alterna el estado de favorito con actualizacion optimista (cambio inmediato + rollback si falla)
  const toggleFavorite = async () => {
    if (requireLogin() || favLoading) return;
    try {
      setFavLoading(true);
      const next = !favorite;
      setFavorite(next);
      const result = await markAsFavorite({
        accountId: account.id,
        sessionId: session,
        type,
        mediaId: id,
        favorite: next,
      });
      setTrakt((prev) => {
        if (!prev?.connected) return prev;
        return {
          ...prev,
          favorite: result?.trakt?.synced ? next : !!prev.favorite,
        };
      });
    } catch {
      setFavorite((v) => !v);
    } finally {
      setFavLoading(false);
    }
  };

  // Alterna el estado de watchlist con actualizacion optimista
  const toggleWatchlist = async () => {
    if (requireLogin() || wlLoading) return;
    try {
      setWlLoading(true);
      const next = !watchlist;
      setWatchlist(next);
      const result = await markInWatchlist({
        accountId: account.id,
        sessionId: session,
        type,
        mediaId: id,
        watchlist: next,
      });
      setTrakt((prev) => {
        if (!prev?.connected) return prev;
        return {
          ...prev,
          inWatchlist: result?.trakt?.synced ? next : !!prev.inWatchlist,
        };
      });
    } catch {
      setWatchlist((v) => !v);
    } finally {
      setWlLoading(false);
    }
  };

  /**
   * Envia una puntuacion a TMDb y opcionalmente sincroniza con Trakt.
   * @param {number} value - Valor de la puntuacion (1-10)
   * @param {Object} options
   * @param {boolean} options.skipSync - true para no sincronizar con Trakt (evita bucles)
   */
  const sendTmdbRating = async (value, { skipSync = false } = {}) => {
    if (requireLogin() || ratingLoading || !TMDB_API_KEY) return;
    try {
      setRatingLoading(true);
      setRatingError("");
      setUserRating(value);

      const url = `https://api.themoviedb.org/3/${endpointType}/${id}/rating?api_key=${TMDB_API_KEY}&session_id=${session}`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json;charset=utf-8" },
        body: JSON.stringify({ value }),
      });
      if (!res.ok) throw new Error("Error al guardar puntuación en TMDb");

      // Sincronizacion opcional hacia Trakt conservando el mismo valor que TMDb.
      if (!skipSync && syncTrakt && trakt.connected) {
        await setTraktRatingSafe(value);
      }
    } catch (err) {
      setRatingError(err?.message || "Error");
    } finally {
      setRatingLoading(false);
    }
  };

  // Elimina la puntuacion del usuario en TMDb y opcionalmente sincroniza con Trakt
  const clearTmdbRating = async ({ skipSync = false } = {}) => {
    if (requireLogin() || ratingLoading || userRating == null || !TMDB_API_KEY)
      return;
    try {
      setRatingLoading(true);
      setRatingError("");
      setUserRating(null);

      const url = `https://api.themoviedb.org/3/${endpointType}/${id}/rating?api_key=${TMDB_API_KEY}&session_id=${session}`;
      const res = await fetch(url, {
        method: "DELETE",
        headers: { "Content-Type": "application/json;charset=utf-8" },
      });
      if (!res.ok) throw new Error("Error al borrar puntuación en TMDb");

      if (!skipSync && syncTrakt && trakt.connected) {
        await setTraktRatingSafe(null);
      }
    } catch (err) {
      setRatingError(err?.message || "Error");
    } finally {
      setRatingLoading(false);
    }
  };

  // Envia una puntuacion a Trakt y opcionalmente sincroniza con TMDb
  const sendTraktRating = async (value) => {
    if (!trakt.connected) {
      window.location.href = `/api/trakt/auth/start?next=/details/${type}/${id}`;
      return;
    }
    try {
      await setTraktRatingSafe(value);
    } catch (err) {
      if (err?.code === "TRAKT_REAUTH_REQUIRED" || err?.status === 401) {
        window.location.href = `/api/trakt/auth/start?next=/details/${type}/${id}`;
        return false;
      }
      throw err;
    }

    // Sincronizacion opcional hacia TMDb (skipSync evita bucle infinito)
    if (syncTrakt && session && TMDB_API_KEY) {
      if (value == null) await clearTmdbRating({ skipSync: true });
      else await sendTmdbRating(value, { skipSync: true });
    }
  };

  // Elimina la puntuacion en Trakt
  const clearTraktRating = async () => {
    await sendTraktRating(null);
  };

  // Tipo de contenido para la API de Trakt ("show" para series, "movie" para peliculas)
  const traktType = endpointType === "tv" ? "show" : "movie";

  const hasInitialTraktStatus = useMemo(
    () => hasResolvedTraktBootstrap(initialTraktStatus),
    [initialTraktStatus],
  );

  const initialWatchedBySeason = useMemo(() => {
    if (endpointType !== "tv") return {};
    return initialShowWatched?.watchedBySeason || {};
  }, [endpointType, initialShowWatched]);

  const hasInitialShowWatched = useMemo(
    () =>
      endpointType === "tv" && hasResolvedTraktBootstrap(initialShowWatched),
    [endpointType, initialShowWatched],
  );
  const [hasCachedTraktStatus, setHasCachedTraktStatus] = useState(false);
  const [hasCachedShowWatched, setHasCachedShowWatched] = useState(false);

  const initialAnyEpisodeWatched = useMemo(
    () =>
      Object.values(initialWatchedBySeason).some(
        (episodes) => Array.isArray(episodes) && episodes.length > 0,
      ),
    [initialWatchedBySeason],
  );

  const initialTraktConnected = useMemo(() => {
    const fromStatus =
      typeof initialTraktStatus?.connected === "boolean"
        ? initialTraktStatus.connected
        : false;
    const fromShowWatched =
      endpointType === "tv" &&
      typeof initialShowWatched?.connected === "boolean"
        ? initialShowWatched.connected
        : false;
    return fromStatus || fromShowWatched;
  }, [endpointType, initialTraktStatus, initialShowWatched]);

  const initialTraktFound = useMemo(() => {
    const fromStatus =
      typeof initialTraktStatus?.found === "boolean"
        ? initialTraktStatus.found
        : false;
    const fromShowWatched =
      endpointType === "tv" && typeof initialShowWatched?.found === "boolean"
        ? initialShowWatched.found
        : false;
    return fromStatus || fromShowWatched;
  }, [endpointType, initialTraktStatus, initialShowWatched]);

  const initialTraktId = useMemo(
    () => initialTraktStatus?.traktId ?? initialShowWatched?.traktId ?? null,
    [initialTraktStatus, initialShowWatched],
  );

  const buildInitialTraktState = useCallback(() => {
    const normalizedInitialStatus = buildTraktStateFromHistory({
      watched: !!initialTraktStatus?.watched,
      plays: Number(initialTraktStatus?.plays || 0),
      lastWatchedAt: initialTraktStatus?.lastWatchedAt || null,
      history: Array.isArray(initialTraktStatus?.history)
        ? initialTraktStatus.history
        : [],
    });

    return {
      loading:
        !hasInitialTraktStatus &&
        !(endpointType === "tv" && hasInitialShowWatched),
      connected: initialTraktConnected,
      found: initialTraktFound,
      traktId: initialTraktId,
      traktUrl: initialTraktStatus?.traktUrl || null,
      watched:
        endpointType === "tv" && hasInitialShowWatched
          ? initialAnyEpisodeWatched
          : !!normalizedInitialStatus.watched,
      plays: Number(normalizedInitialStatus.plays || 0),
      lastWatchedAt: normalizedInitialStatus.lastWatchedAt || null,
      rating:
        typeof initialTraktStatus?.rating === "number"
          ? initialTraktStatus.rating
          : null,
      favorite: !!initialTraktStatus?.favorite,
      inWatchlist: !!initialTraktStatus?.inWatchlist,
      progress: initialTraktStatus?.progress || null,
      history: normalizedInitialStatus.history,
      error: initialTraktStatus?.error || "",
    };
  }, [
    endpointType,
    hasInitialShowWatched,
    hasInitialTraktStatus,
    initialAnyEpisodeWatched,
    initialTraktConnected,
    initialTraktFound,
    initialTraktId,
    initialTraktStatus,
  ]);

  // =====================================================================
  // INTEGRACION CON TRAKT
  // Estado completo de la conexion con Trakt: visto, historial, rating,
  // watchlist, progreso de episodios, comentarios, listas y estadisticas.
  // =====================================================================

  // Estado principal de Trakt para este contenido
  const [trakt, setTrakt] = useState(buildInitialTraktState);
  const scoreboardLookupTraktId = trakt?.traktId ?? initialTraktId ?? null;
  const traktBackgroundSyncAtRef = useRef(0);
  const traktResolvedIdRef = useRef(initialTraktId ?? null);
  const traktStatusRequestIdRef = useRef(0);
  const movieWatchedRequestIdRef = useRef(0);

  useEffect(() => {
    traktResolvedIdRef.current = trakt?.traktId ?? initialTraktId ?? null;
  }, [trakt?.traktId, initialTraktId]);

  const [traktBusy, setTraktBusy] = useState(""); // Accion en curso: 'watched' | 'watchlist' | 'history' | ''
  const [traktWatchedOpen, setTraktWatchedOpen] = useState(false); // Modal de historial de visionados abierto
  const [traktEpisodesOpen, setTraktEpisodesOpen] = useState(false); // Modal de episodios vistos abierto
  const traktEpisodesWasOpenRef = useRef(false);

  // -- Episodios vistos por temporada (solo TV) --
  const [watchedBySeason, setWatchedBySeason] = useState(
    initialWatchedBySeason,
  ); // { seasonNumber: [episodeNumber, ...] }
  const [watchedBySeasonLoaded, setWatchedBySeasonLoaded] = useState(
    hasInitialShowWatched,
  ); // true cuando se cargo el estado
  const [episodeBusyKey, setEpisodeBusyKey] = useState(""); // Episodio en proceso: "S1E3"
  const watchedBySeasonRef = useRef(initialWatchedBySeason);
  const watchedBySeasonLoadedRef = useRef(hasInitialShowWatched);
  const watchedBySeasonRequestIdRef = useRef(0);
  const showPlaysRequestIdRef = useRef(0);
  const rewatchViewCacheRef = useRef(new Map());

  useEffect(() => {
    watchedBySeasonRef.current =
      watchedBySeason && typeof watchedBySeason === "object"
        ? watchedBySeason
        : {};
  }, [watchedBySeason]);

  useEffect(() => {
    watchedBySeasonLoadedRef.current = watchedBySeasonLoaded;
  }, [watchedBySeasonLoaded]);

  const normalizeWatchedBySeasonMap = useCallback((value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};

    return Object.entries(value).reduce((acc, [seasonKey, episodes]) => {
      const seasonNumber = Number(seasonKey);
      if (!Number.isFinite(seasonNumber)) return acc;

      const normalizedEpisodes = Array.isArray(episodes)
        ? Array.from(
            new Set(
              episodes
                .map((episode) => Number(episode))
                .filter((episode) => Number.isFinite(episode) && episode > 0),
            ),
          ).sort((a, b) => a - b)
        : [];

      acc[seasonNumber] = normalizedEpisodes;
      return acc;
    }, {});
  }, []);

  const hasAnyWatchedEpisodeInMap = useCallback(
    (value) =>
      Object.values(normalizeWatchedBySeasonMap(value)).some(
        (episodes) => Array.isArray(episodes) && episodes.length > 0,
      ),
    [normalizeWatchedBySeasonMap],
  );

  const applyWatchedBySeasonState = useCallback(
    (nextValue, { loaded = true } = {}) => {
      const normalized = normalizeWatchedBySeasonMap(nextValue);
      setWatchedBySeason(normalized);
      setWatchedBySeasonLoaded(loaded);

      if (endpointType === "tv") {
        const hasAnyWatchedEpisode = hasAnyWatchedEpisodeInMap(normalized);
        setTrakt((prev) =>
          prev?.watched === hasAnyWatchedEpisode
            ? prev
            : { ...prev, watched: hasAnyWatchedEpisode },
        );
      }

      return normalized;
    },
    [endpointType, hasAnyWatchedEpisodeInMap, normalizeWatchedBySeasonMap],
  );

  // -- Historial de completados y rewatch --
  const [showPlays, setShowPlays] = useState([]); // Fechas ISO de cada visionado completo
  const [rewatchStartAt, setRewatchStartAt] = useState(null); // Fecha ISO de inicio del rewatch actual
  const [rewatchWatchedBySeason, setRewatchWatchedBySeason] = useState(null); // Episodios vistos en el rewatch actual

  useEffect(() => {
    rewatchRunsRef.current = Array.isArray(rewatchRuns) ? rewatchRuns : [];
  }, [rewatchRuns]);

  useEffect(() => {
    activeEpisodesViewRef.current = activeEpisodesView || "global";
  }, [activeEpisodesView]);

  useEffect(() => {
    rewatchStartAtRef.current = rewatchStartAt || null;
  }, [rewatchStartAt]);

  const resolveRewatchWindow = useCallback((viewId, runsOverride) => {
    const resolvedViewId = viewId || "global";
    if (resolvedViewId === "global") {
      return { viewId: "global", startAt: null, endBefore: null };
    }

    const baseRuns = Array.isArray(runsOverride)
      ? runsOverride
      : rewatchRunsRef.current;
    const sortedRuns = [...baseRuns]
      .map((run) => {
        const startedAt = String(run?.startedAt || run?.id || "");
        if (!startedAt) return null;
        return {
          id: String(run?.id || startedAt),
          startedAt,
          ts: new Date(startedAt).getTime(),
        };
      })
      .filter((run) => Number.isFinite(run?.ts))
      .sort((a, b) => b.ts - a.ts);

    const exactIdx = sortedRuns.findIndex(
      (run) => run.id === resolvedViewId || run.startedAt === resolvedViewId,
    );

    if (exactIdx >= 0) {
      return {
        viewId: resolvedViewId,
        startAt: sortedRuns[exactIdx].startedAt,
        endBefore: exactIdx > 0 ? sortedRuns[exactIdx - 1].startedAt : null,
      };
    }

    const fallbackStartAt = String(resolvedViewId);
    const fallbackTs = new Date(fallbackStartAt).getTime();
    const newerRun = Number.isFinite(fallbackTs)
      ? sortedRuns
          .filter((run) => run.ts > fallbackTs)
          .sort((a, b) => a.ts - b.ts)[0] || null
      : null;

    return {
      viewId: resolvedViewId,
      startAt: fallbackStartAt,
      endBefore: newerRun?.startedAt || null,
    };
  }, []);

  const buildRewatchViewCacheKey = useCallback(
    (startAtIso = null, endBeforeIso = null) =>
      startAtIso
        ? `${String(startAtIso)}::${String(endBeforeIso || "")}`
        : "global",
    [],
  );

  const cacheRewatchViewState = useCallback(
    ({
      startAtIso = null,
      endBeforeIso = null,
      watchedBySeason: nextWatchedBySeason = {},
      historyIdsByEpisode: nextHistoryIdsByEpisode = {},
    } = {}) => {
      if (!startAtIso) return;
      const cacheKey = buildRewatchViewCacheKey(startAtIso, endBeforeIso);
      rewatchViewCacheRef.current.set(cacheKey, {
        watchedBySeason:
          nextWatchedBySeason && typeof nextWatchedBySeason === "object"
            ? nextWatchedBySeason
            : {},
        historyIdsByEpisode:
          nextHistoryIdsByEpisode && typeof nextHistoryIdsByEpisode === "object"
            ? nextHistoryIdsByEpisode
            : {},
      });
    },
    [buildRewatchViewCacheKey],
  );

  const restoreRewatchViewStateFromCache = useCallback(
    (startAtIso = null, endBeforeIso = null) => {
      if (!startAtIso) return false;
      const cacheKey = buildRewatchViewCacheKey(startAtIso, endBeforeIso);
      const cached = rewatchViewCacheRef.current.get(cacheKey);
      if (!cached) return false;

      setRewatchWatchedBySeason(
        cached?.watchedBySeason && typeof cached.watchedBySeason === "object"
          ? cached.watchedBySeason
          : {},
      );
      setRewatchHistoryByEpisode(
        cached?.historyIdsByEpisode &&
          typeof cached.historyIdsByEpisode === "object"
          ? cached.historyIdsByEpisode
          : {},
      );
      return true;
    },
    [buildRewatchViewCacheKey],
  );

  const mergeRewatchRuns = useCallback((currentRuns, incomingRuns) => {
    const normalizeRun = (run) => {
      const startedAt = String(run?.startedAt || run?.id || "");
      if (!startedAt) return null;
      return {
        id: String(run?.id || startedAt),
        startedAt,
        label: run?.label || `Rewatch · ${startedAt.slice(0, 10)}`,
        completedAt: run?.completedAt || null,
        completed: typeof run?.completed === "boolean" ? run.completed : null,
        progressCount:
          typeof run?.progressCount === "number" ? run.progressCount : null,
      };
    };

    const mergeRunData = (baseRun, overlayRun) => ({
      ...(baseRun || {}),
      ...(overlayRun || {}),
      id: String(baseRun?.id || overlayRun?.id || ""),
      startedAt: String(baseRun?.startedAt || overlayRun?.startedAt || ""),
      label:
        baseRun?.label ||
        overlayRun?.label ||
        `Rewatch · ${String(baseRun?.startedAt || overlayRun?.startedAt || "").slice(0, 10)}`,
      completedAt: overlayRun?.completedAt ?? baseRun?.completedAt ?? null,
      completed:
        typeof overlayRun?.completed === "boolean"
          ? overlayRun.completed
          : (baseRun?.completed ?? null),
      progressCount:
        overlayRun?.progressCount ?? baseRun?.progressCount ?? null,
    });

    const normalizedCurrent = (Array.isArray(currentRuns) ? currentRuns : [])
      .map(normalizeRun)
      .filter(Boolean)
      .sort(
        (a, b) =>
          new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime(),
      );
    const normalizedIncoming = (Array.isArray(incomingRuns) ? incomingRuns : [])
      .map(normalizeRun)
      .filter(Boolean)
      .sort(
        (a, b) =>
          new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime(),
      );

    const mergedById = new Map();

    for (const run of normalizedCurrent) {
      mergedById.set(run.id, run);
    }

    for (const incomingRun of normalizedIncoming) {
      const exact = mergedById.get(incomingRun.id);
      if (exact) {
        mergedById.set(incomingRun.id, mergeRunData(exact, incomingRun));
        continue;
      }

      const incomingTs = new Date(incomingRun.startedAt).getTime();
      const candidateLocal = normalizedCurrent.find((localRun, index) => {
        const localTs = new Date(localRun.startedAt).getTime();
        const newerLocalTs =
          index > 0
            ? new Date(normalizedCurrent[index - 1].startedAt).getTime()
            : Number.NaN;

        if (!Number.isFinite(incomingTs) || !Number.isFinite(localTs)) {
          return false;
        }
        if (incomingTs < localTs) return false;
        if (Number.isFinite(newerLocalTs) && incomingTs >= newerLocalTs) {
          return false;
        }
        return true;
      });

      if (candidateLocal) {
        mergedById.set(
          candidateLocal.id,
          mergeRunData(candidateLocal, incomingRun),
        );
        continue;
      }

      mergedById.set(incomingRun.id, incomingRun);
    }

    return Array.from(mergedById.values()).sort(
      (a, b) =>
        new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime(),
    );
  }, []);

  // Badge de progreso para el boton "visto" en series: calcula el % de episodios vistos
  // (excluyendo especiales, solo temporadas regulares)
  const tvProgressBadge = useMemo(() => {
    if (endpointType !== "tv") return null;
    if (!trakt?.connected) return null;

    // Mientras no se haya cargado el estado de episodios vistos, no mostrar nada
    if (!watchedBySeasonLoaded) return null;

    const seasonsList = Array.isArray(data?.seasons) ? data.seasons : [];
    const usable = seasonsList.filter(
      (s) => typeof s?.season_number === "number" && s.season_number > 0,
    );

    // Si aun no hay temporadas validas, no mostrar nada
    if (usable.length === 0) return null;

    const totalEpisodes = usable.reduce(
      (acc, s) => acc + Math.max(0, Number(s?.episode_count || 0)),
      0,
    );
    if (totalEpisodes <= 0) return null;

    const watchedEpisodes = usable.reduce((acc, s) => {
      const sn = s.season_number;
      const arr = watchedBySeason?.[sn];
      return acc + (Array.isArray(arr) ? arr.length : 0);
    }, 0);

    const pct = Math.round((watchedEpisodes / totalEpisodes) * 100);
    const safePct = Math.min(100, Math.max(0, pct));
    if (safePct <= 0) return null;
    return `${safePct}%`;
  }, [
    endpointType,
    trakt?.connected,
    watchedBySeasonLoaded,
    data?.seasons,
    watchedBySeason,
  ]);

  // Sincroniza trakt.watched con el estado real de episodios vistos.
  // Si hay al menos un episodio visto, trakt.watched debe ser true.
  useEffect(() => {
    if (endpointType !== "tv") return;
    if (!trakt?.connected) return;
    if (!watchedBySeasonLoaded) return;

    // Comprobar si hay algun episodio visto en cualquier temporada
    const hasAnyWatchedEpisode = hasAnyWatchedEpisodeInMap(watchedBySeason);

    // Actualizar el estado de trakt.watched si no coincide con la realidad
    if (hasAnyWatchedEpisode !== trakt.watched) {
      setTrakt((prev) => ({
        ...prev,
        watched: hasAnyWatchedEpisode,
      }));
    }
  }, [
    endpointType,
    trakt?.connected,
    trakt.watched,
    watchedBySeasonLoaded,
    watchedBySeason,
    hasAnyWatchedEpisodeInMap,
  ]);

  // Carga los episodios vistos de una serie desde la API de Trakt
  const loadTraktShowWatched = useCallback(async () => {
    if (type !== "tv") return;
    const requestId = watchedBySeasonRequestIdRef.current + 1;
    watchedBySeasonRequestIdRef.current = requestId;

    if (!trakt?.connected) {
      setWatchedBySeason({});
      setWatchedBySeasonLoaded(false);
      return { ok: false, connected: false };
    }

    try {
      const r = await withTimeout(
        traktGetShowWatched({
          tmdbId: Number(id),
          traktId: traktResolvedIdRef.current ?? undefined,
        }),
        25000,
      );

      if (requestId !== watchedBySeasonRequestIdRef.current) {
        return {
          ok: false,
          connected: !!trakt?.connected,
          found: watchedBySeasonLoadedRef.current,
          watchedBySeason: watchedBySeasonRef.current,
        };
      }

      if (r?.connected === false) {
        setWatchedBySeason({});
        setWatchedBySeasonLoaded(false);
        return {
          ok: false,
          connected: false,
          found: false,
          watchedBySeason: {},
        };
      }

      if (isDegradedTraktPayload(r) && watchedBySeasonLoadedRef.current) {
        return {
          ok: false,
          connected: true,
          found: true,
          watchedBySeason: watchedBySeasonRef.current,
        };
      }

      const nextWatchedBySeason = applyWatchedBySeasonState(
        r?.watchedBySeason || {},
        { loaded: r?.connected !== false },
      );
      return {
        ok: true,
        connected: r?.connected !== false,
        found: !!r?.found,
        watchedBySeason: nextWatchedBySeason,
      };
    } catch {
      // En errores transitorios preservamos el estado previo para no convertir
      // una serie vista en "no vista" por un fallo temporal de Trakt.
      return {
        ok: false,
        connected: !!trakt?.connected,
        found: watchedBySeasonLoadedRef.current,
        watchedBySeason: watchedBySeasonRef.current,
      };
    }
  }, [type, id, trakt?.connected, applyWatchedBySeasonState]);

  // Cierra el modal de episodios al instante y reconcilia el % visto en segundo plano.
  const closeTraktEpisodesModal = useCallback(() => {
    setTraktEpisodesOpen(false);
    setEpisodeBusyKey(""); // Evita que quede bloqueado al reabrir

    if (type !== "tv" || !trakt?.connected) return;

    void loadTraktShowWatched();
  }, [type, trakt?.connected, loadTraktShowWatched]);

  // -- Scoreboard de la comunidad (puntuaciones agregadas de multiples fuentes) --
  // Si hay datos prefetched desde page.jsx, usarlos como estado inicial
  const parseScoreboardData = (r) => {
    if (!r?.found) return null;
    const st = r?.stats || {};
    return {
      loading: false,
      error: "",
      found: true,
      rating:
        typeof r?.community?.rating === "number" ? r.community.rating : null,
      votes: typeof r?.community?.votes === "number" ? r.community.votes : null,
      stats: {
        watchers: typeof st?.watchers === "number" ? st.watchers : null,
        plays: typeof st?.plays === "number" ? st.plays : null,
        collectors: typeof st?.collectors === "number" ? st.collectors : null,
        comments: typeof st?.comments === "number" ? st.comments : null,
        lists: typeof st?.lists === "number" ? st.lists : null,
        favorited: typeof st?.favorited === "number" ? st.favorited : null,
      },
      external: {
        rtAudience: r?.external?.rtAudience ?? null,
        justwatchRank: r?.external?.justwatchRank ?? null,
        justwatchDelta: r?.external?.justwatchDelta ?? null,
        justwatchCountry: r?.external?.justwatchCountry ?? "ES",
      },
    };
  };

  const defaultScoreboard = {
    loading: false,
    error: "",
    found: false,
    rating: null,
    votes: null,
    stats: {
      watchers: null,
      plays: null,
      collectors: null,
      comments: null,
      lists: null,
      favorited: null,
    },
    external: {
      rtAudience: null,
      justwatchRank: null,
      justwatchDelta: null,
      justwatchCountry: "ES",
    },
  };

  const hasNumericScoreboardStats = (stats) =>
    Object.values(stats || {}).some((v) => typeof v === "number");

  const hasScoreboardCommunityData = (scoreboard) =>
    typeof scoreboard?.rating === "number" ||
    typeof scoreboard?.votes === "number";

  const hasScoreboardExternalData = (external) =>
    Object.values(external || {}).some((v) => typeof v === "number");

  const hasUsefulScoreboardData = (scoreboard) =>
    hasNumericScoreboardStats(scoreboard?.stats) ||
    hasScoreboardCommunityData(scoreboard) ||
    hasScoreboardExternalData(scoreboard?.external);

  const mergeScoreboardState = (current, incoming) => {
    if (!incoming) return current || defaultScoreboard;
    if (!current) return incoming;

    const currentHasStats = hasNumericScoreboardStats(current?.stats);
    const incomingHasStats = hasNumericScoreboardStats(incoming?.stats);
    const currentHasCommunity = hasScoreboardCommunityData(current);
    const incomingHasCommunity = hasScoreboardCommunityData(incoming);
    const currentHasExternal = hasScoreboardExternalData(current?.external);
    const incomingHasExternal = hasScoreboardExternalData(incoming?.external);
    const shouldPreserveUsefulData =
      hasUsefulScoreboardData(current) && !hasUsefulScoreboardData(incoming);

    return {
      ...current,
      ...incoming,
      found: incoming?.found || shouldPreserveUsefulData,
      rating: incomingHasCommunity
        ? incoming.rating
        : currentHasCommunity
          ? current.rating
          : incoming.rating,
      votes: incomingHasCommunity
        ? incoming.votes
        : currentHasCommunity
          ? current.votes
          : incoming.votes,
      stats: incomingHasStats
        ? { ...(current?.stats || {}), ...(incoming?.stats || {}) }
        : current.stats,
      external: incomingHasExternal
        ? { ...(current?.external || {}), ...(incoming?.external || {}) }
        : currentHasExternal
          ? current.external
          : incoming.external,
      error: shouldPreserveUsefulData ? "" : incoming?.error || "",
    };
  };

  const initialParsedScoreboard = useMemo(
    () => parseScoreboardData(initialScoreboard),
    [initialScoreboard],
  );
  const initialScoreboardState = useMemo(() => {
    if (!initialParsedScoreboard?.found) return defaultScoreboard;
    return {
      ...initialParsedScoreboard,
      loading: !hasNumericScoreboardStats(initialParsedScoreboard?.stats),
      error: "",
    };
  }, [initialParsedScoreboard]);

  const [tScoreboard, setTScoreboard] = useState(() => initialScoreboardState);
  const [traktDeferredReady, setTraktDeferredReady] = useState(
    () =>
      !!initialParsedScoreboard?.found &&
      hasNumericScoreboardStats(initialParsedScoreboard?.stats),
  );

  // Clave especial para indicar que una accion afecta al show completo (no un episodio)
  const SHOW_BUSY_KEY = "SHOW";

  // =====================================================================
  // TRAKT COMMUNITY: Sentimientos / Comentarios / Temporadas / Listas
  // Datos publicos de la comunidad de Trakt (no requiere autenticacion).
  // =====================================================================

  // -- Analisis de sentimiento: pros y contras extraidos de comentarios --
  const [tSentiment, setTSentiment] = useState({
    loading: false,
    error: "",
    pros: [],
    cons: [],
    sourceCount: 0,
  });

  // -- Comentarios de Trakt con paginacion y pestanas --
  const [tCommentsTab, setTCommentsTab] = useState("recent"); // "likes30" (top 30 dias) | "likesAll" (top historico) | "recent"
  const [tComments, setTComments] = useState({
    loading: false,
    error: "",
    items: [],
    page: 1,
    hasMore: false,
    total: 0,
  });
  const COMMENTS_SECTION_LIMIT = 5;

  // -- Temporadas de Trakt (datos de temporadas para series TV) --
  const [tSeasons, setTSeasons] = useState({
    loading: false,
    error: "",
    items: [],
  });

  // -- Listas de Trakt con paginacion (popular/trending) --
  const [tListsTab, setTListsTab] = useState("popular"); // "popular" | "trending"
  const [tLists, setTLists] = useState({
    loading: false,
    error: "",
    items: [],
    page: 1,
    hasMore: false,
    total: 0,
  });

  useEffect(() => {
    setTScoreboard(initialScoreboardState);

    const hasPrefetchedScoreboard =
      !!initialParsedScoreboard?.found &&
      hasNumericScoreboardStats(initialParsedScoreboard?.stats);

    setTraktDeferredReady(hasPrefetchedScoreboard);
  }, [id, initialParsedScoreboard, initialScoreboardState]);

  useEffect(() => {
    if (traktDeferredReady || tScoreboard.loading) return;

    const timer = window.setTimeout(() => {
      setTraktDeferredReady(true);
    }, 200);

    return () => window.clearTimeout(timer);
  }, [traktDeferredReady, tScoreboard.loading]);

  // Red de seguridad: si el efecto del scoreboard se reinicia a media carga
  // (porque scoreboardLookupTraktId cambia al cargar el estado de Trakt),
  // tScoreboard.loading puede quedar atascado en true indefinidamente.
  // Este efecto garantiza que traktDeferredReady se activa en ≤6s desde que
  // cambia el contenido, para que comentarios/listas/sentimiento siempre carguen.
  useEffect(() => {
    if (traktDeferredReady) return;
    const safetyTimer = window.setTimeout(() => {
      setTraktDeferredReady(true);
    }, 6000);
    return () => window.clearTimeout(safetyTimer);
  }, [id, traktType, traktDeferredReady, data, type, title]);

  // Resetear todos los datos de la comunidad de Trakt al cambiar de contenido
  useEffect(() => {
    setTSentiment({
      loading: false,
      error: "",
      pros: [],
      cons: [],
      sourceCount: 0,
    });
    setTComments({
      loading: false,
      error: "",
      items: [],
      page: 1,
      hasMore: false,
      total: 0,
    });
    setTCommentsTab("recent");
    setTSeasons({ loading: false, error: "", items: [] });
    setTLists({
      loading: false,
      error: "",
      items: [],
      page: 1,
      hasMore: false,
      total: 0,
    });
    setTListsTab("popular");
  }, [id, traktType]);

  // Carga los comentarios de Trakt segun la pestana activa.
  // likes30: top con likes de los ultimos 30 dias. likesAll: top historico. recent: mas recientes.
  useEffect(() => {
    if (!traktDeferredReady) return;

    let ignore = false;

    const load = async () => {
      setTComments((p) => ({ ...p, loading: true, error: "" }));

      try {
        const isLikes30 = tCommentsTab === "likes30";
        const sort = tCommentsTab === "recent" ? "newest" : "likes";

        // Para likes30: pedimos mas y filtramos por fecha (ultimos 30 dias)
        const reqLimit = isLikes30 ? 50 : COMMENTS_SECTION_LIMIT;
        const page = isLikes30 ? 1 : tComments.page;

        // Timeout generoso para comentarios adicionales de Trakt
        const r = await withTimeout(
          traktGetComments({
            type: traktType,
            tmdbId: id,
            sort,
            page,
            limit: reqLimit,
          }),
          20000,
        );

        if (ignore) return;

        let items = Array.isArray(r?.items) ? r.items : [];
        const total = Number(r?.pagination?.itemCount || 0);
        const hasMore = !!(
          r?.pagination?.pageCount &&
          r?.pagination?.page < r?.pagination?.pageCount
        );

        if (isLikes30) {
          const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
          items = items.filter((c) => {
            const t = new Date(c?.created_at || 0).getTime();
            return Number.isFinite(t) && t >= cutoff;
          });
          // Limitar a 20 comentarios para la UI
          items = items.slice(0, 20);
        }

        setTComments((p) => ({
          ...p,
          loading: false,
          error: "",
          items:
            p.page > 1 && !isLikes30 ? [...(p.items || []), ...items] : items,
          hasMore: !isLikes30 ? hasMore : false,
          total,
        }));
      } catch (e) {
        if (!ignore)
          setTComments((p) => ({
            ...p,
            loading: false,
            error: e?.message || "Error",
          }));
      }
    };

    load();
    return () => {
      ignore = true;
    };
  }, [
    id,
    traktType,
    tCommentsTab,
    tComments.page,
    traktDeferredReady,
    COMMENTS_SECTION_LIMIT,
  ]);

  // Carga independiente del análisis de sentimiento para que no dependa
  // de la pestaña activa de comentarios.
  useEffect(() => {
    if (!traktDeferredReady) return;

    let ignore = false;

    const loadSentiment = async () => {
      setTSentiment({
        loading: true,
        error: "",
        pros: [],
        cons: [],
        sourceCount: 0,
      });

      try {
        const r = await withTimeout(
          traktGetSentiments({
            type: traktType,
            tmdbId: id,
          }),
          20000,
        );

        if (ignore) return;

        const pros = formatTraktSentimentList(r?.good, 4);
        const cons = formatTraktSentimentList(r?.bad, 4);

        setTSentiment({
          loading: false,
          error: "",
          pros,
          cons,
          sourceCount: Number(r?.comment_count || 0) || 0,
        });
      } catch (e) {
        if (ignore) return;
        setTSentiment({
          loading: false,
          error: e?.message || "Error",
          pros: [],
          cons: [],
          sourceCount: 0,
        });
      }
    };

    loadSentiment();

    return () => {
      ignore = true;
    };
  }, [id, traktType, traktDeferredReady]);

  // Resetear paginacion de comentarios al cambiar de pestana
  useEffect(() => {
    setTComments((p) => ({
      ...p,
      items: [],
      page: 1,
      hasMore: false,
      total: 0,
    }));
  }, [tCommentsTab]);

  // Carga las temporadas de la serie desde Trakt (con datos extendidos)
  useEffect(() => {
    if (!traktDeferredReady) return;

    let ignore = false;
    const load = async () => {
      if (type !== "tv") return;
      setTSeasons((p) => ({ ...p, loading: true, error: "" }));
      try {
        // Timeout generoso para temporadas de Trakt
        const r = await withTimeout(
          traktGetShowSeasons({ tmdbId: id, extended: "full" }),
          20000,
        );
        if (ignore) return;
        setTSeasons({
          loading: false,
          error: "",
          items: Array.isArray(r?.items) ? r.items : [],
        });
      } catch (e) {
        if (!ignore) {
          // Si es timeout, no mostrar error al usuario
          const isTimeout = e?.message === "Timeout";
          setTSeasons({
            loading: false,
            error: isTimeout ? "" : e?.message || "Error",
            items: [],
          });
        }
      }
    };
    load();
    return () => {
      ignore = true;
    };
  }, [id, type, traktDeferredReady]);

  // Carga las listas de Trakt que contienen este contenido (popular o trending)
  // ⏱️ OPTIMIZACIÓN: Cargar DESPUÉS de scoreboard y stats (menor prioridad)
  useEffect(() => {
    if (!traktDeferredReady) return;

    let ignore = false;
    let timeoutId = null;

    const load = async () => {
      setTLists((p) => ({ ...p, loading: true, error: "" }));
      const retryDelays = [0, 1400];

      for (let attempt = 0; attempt < retryDelays.length; attempt++) {
        if (attempt > 0) {
          await new Promise((resolve) =>
            window.setTimeout(resolve, retryDelays[attempt]),
          );
          if (ignore) return;
        }

        try {
          // Cargar 6 listas con todos sus detalles
          const r = await withTimeout(
            traktGetLists({
              type: traktType,
              tmdbId: id,
              tab: tListsTab,
              page: tLists.page,
              limit: 6,
              countOnly: false, // Siempre cargar listas completas con previews
            }),
            20000,
          );
          if (ignore) return;

          const hasItemsArray = Array.isArray(r?.items);
          const items = hasItemsArray ? r.items : [];
          const total = Number(r?.pagination?.itemCount || 0);
          const hasMore = !!(
            r?.pagination?.pageCount &&
            r?.pagination?.page < r?.pagination?.pageCount
          );
          const isTransient = !!r?.transient;

          if (
            !hasItemsArray &&
            isTransient &&
            attempt < retryDelays.length - 1
          ) {
            continue;
          }

          setTLists((p) => ({
            ...p,
            loading: false,
            error: "",
            items: p.page > 1 ? [...(p.items || []), ...items] : items,
            hasMore,
            total,
          }));
          return;
        } catch (e) {
          if (ignore) return;

          const isTimeout = e?.message === "Timeout";
          const isTransient =
            isTimeout ||
            /aborted|abort|fetch|network|server error/i.test(e?.message || "");

          if (isTransient && attempt < retryDelays.length - 1) {
            continue;
          }

          setTLists((p) => ({
            ...p,
            loading: false,
            error: isTransient ? "" : e?.message || "Error",
          }));
          return;
        }
      }

      if (!ignore) {
        setTLists((p) => ({
          ...p,
          loading: false,
          error: "",
        }));
      }
    };

    // ⏱️ Delay adicional para dejar que scoreboard y stats se asienten primero
    timeoutId = setTimeout(() => {
      load();
    }, 900);

    return () => {
      ignore = true;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [id, traktType, tListsTab, tLists.page, traktDeferredReady]);

  // Resetear paginacion de listas al cambiar de pestana
  useEffect(() => {
    setTLists((p) => ({ ...p, items: [], page: 1, hasMore: false, total: 0 }));
  }, [tListsTab]);

  // -- Sincronizacion TMDb <-> Trakt --
  // Preferencia del usuario: si esta activa, los ratings se sincronizan entre ambas plataformas
  const [syncTrakt, setSyncTrakt] = useState(false);

  // Cargar preferencia de sincronizacion desde localStorage
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const v = window.localStorage.getItem("showverse:trakt:sync") === "1";
      setSyncTrakt(v);
    } catch {}
  }, []);

  // Guardar preferencia de sincronizacion en localStorage
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(
        "showverse:trakt:sync",
        syncTrakt ? "1" : "0",
      );
    } catch {}
  }, [syncTrakt]);

  // Recarga el estado de Trakt (visto, rating, historial, watchlist) para el contenido actual
  const reloadTraktStatus = useCallback(
    async ({ background = false, force = false } = {}) => {
      const requestId = traktStatusRequestIdRef.current + 1;
      traktStatusRequestIdRef.current = requestId;

      if (!background) {
        setTrakt((p) => ({ ...p, loading: true, error: "" }));
      }

      try {
        const json = await withTimeout(
          traktGetItemStatus({
            type: traktType,
            tmdbId: id,
            traktId: traktResolvedIdRef.current ?? undefined,
            force,
          }),
          endpointType === "movie" ? 9000 : 25000,
        );
        const normalizedJson = buildTraktStateFromHistory(json || {});

        let nextState = null;
        setTrakt((prev) => {
          if (requestId !== traktStatusRequestIdRef.current) {
            nextState = prev;
            return prev;
          }

          const preserveTvWatched =
            endpointType === "tv" && watchedBySeasonLoadedRef.current;
          // Si force=true, no preservar estado anterior para obtener datos frescos
          const preservePreviousState =
            !force &&
            (shouldPreservePreviousTraktStatus(normalizedJson, prev) ||
              isPossiblyStaleEmptyMovieTraktStatus(
                normalizedJson,
                prev,
                endpointType,
              ));

          if (preservePreviousState) {
            nextState = {
              ...prev,
              loading: false,
              connected: true,
              traktId: normalizedJson.traktId ?? prev.traktId ?? null,
              traktUrl: normalizedJson.traktUrl || prev.traktUrl || null,
              error: "",
            };
            return nextState;
          }

          nextState = {
            ...prev,
            loading: false,
            connected: !!normalizedJson.connected,
            found: !!normalizedJson.found,
            traktId: normalizedJson.traktId ?? null,
            traktUrl: normalizedJson.traktUrl || prev.traktUrl || null,
            watched: preserveTvWatched
              ? prev.watched
              : !!normalizedJson.watched,
            plays: Number(normalizedJson.plays || 0),
            lastWatchedAt: normalizedJson.lastWatchedAt || null,
            rating:
              typeof normalizedJson.rating === "number"
                ? normalizedJson.rating
                : null,
            favorite: !!normalizedJson.favorite,
            inWatchlist: !!normalizedJson.inWatchlist,
            progress: normalizedJson.progress || null,
            history: normalizedJson.history,
            error: "",
          };
          return nextState;
        });
        return nextState;
      } catch (e) {
        const isTimeout = e?.message === "Timeout";
        const isRateLimit = /rate limit|temporalmente no disponible/i.test(
          e?.message || "",
        );
        const isTransient =
          e?.code === "TRAKT_TRANSIENT" ||
          isTimeout ||
          isRateLimit ||
          // HTTP 5xx from Vercel (gateway timeout, cold-start failures, etc.)
          (typeof e?.status === "number" && e.status >= 500) ||
          /aborted|fetch|network|server error|HTTP 5/i.test(e?.message || "");

        let nextState = null;
        setTrakt((p) => {
          if (requestId !== traktStatusRequestIdRef.current) {
            nextState = p;
            return p;
          }

          nextState = {
            ...p,
            loading: false,
            connected: isTransient ? p.connected : false,
            error: background
              ? p.error
              : isTransient
                ? ""
                : isRateLimit
                  ? "Trakt: límite de peticiones alcanzado"
                  : e?.message || "Error recargando Trakt",
          };
          return nextState;
        });
        return nextState;
      }
    },
    [traktType, id, endpointType, watchedBySeasonLoaded],
  );

  const loadTraktMovieWatched = useCallback(
    async ({ background = false, force = false } = {}) => {
      if (endpointType !== "movie") {
        return reloadTraktStatus({ background, force });
      }

      const requestId = movieWatchedRequestIdRef.current + 1;
      movieWatchedRequestIdRef.current = requestId;

      if (!background) {
        setTrakt((prev) => ({ ...prev, loading: true, error: "" }));
      }

      try {
        const payload = await withTimeout(
          traktGetItemStatus({
            type: traktType,
            tmdbId: Number(id),
            traktId: traktResolvedIdRef.current ?? undefined,
            force,
          }),
          8000,
        );
        const normalizedPayload = buildTraktStateFromHistory(payload || {});

        let nextState = null;
        setTrakt((prev) => {
          if (requestId !== movieWatchedRequestIdRef.current) {
            nextState = prev;
            return prev;
          }

          const preservePreviousState =
            !force &&
            (shouldPreservePreviousTraktStatus(normalizedPayload, prev) ||
              isPossiblyStaleEmptyMovieTraktStatus(
                normalizedPayload,
                prev,
                endpointType,
              ));

          if (preservePreviousState) {
            nextState = {
              ...prev,
              loading: false,
              connected: true,
              traktId: normalizedPayload.traktId ?? prev.traktId ?? null,
              traktUrl: normalizedPayload.traktUrl || prev.traktUrl || null,
              error: "",
            };
            return nextState;
          }

          nextState = {
            ...prev,
            loading: false,
            connected: normalizedPayload?.connected !== false,
            found: !!normalizedPayload?.found,
            traktId: normalizedPayload?.traktId ?? prev.traktId ?? null,
            traktUrl: normalizedPayload?.traktUrl || prev.traktUrl || null,
            watched: !!normalizedPayload?.watched,
            plays: Number(normalizedPayload?.plays || 0),
            lastWatchedAt: normalizedPayload?.lastWatchedAt || null,
            rating:
              typeof normalizedPayload?.rating === "number"
                ? normalizedPayload.rating
                : prev.rating,
            favorite: !!normalizedPayload?.favorite,
            inWatchlist: !!normalizedPayload?.inWatchlist,
            history: Array.isArray(normalizedPayload?.history)
              ? normalizedPayload.history
              : [],
            error: "",
          };
          return nextState;
        });

        return nextState;
      } catch (e) {
        const isTimeout = e?.message === "Timeout";
        const isRateLimit = /rate limit|temporalmente no disponible/i.test(
          e?.message || "",
        );
        const isTransient =
          e?.code === "TRAKT_TRANSIENT" ||
          isTimeout ||
          isRateLimit ||
          (typeof e?.status === "number" && e.status >= 500) ||
          /aborted|fetch|network|server error|HTTP 5/i.test(e?.message || "");

        let nextState = null;
        setTrakt((prev) => {
          if (requestId !== movieWatchedRequestIdRef.current) {
            nextState = prev;
            return prev;
          }

          nextState = {
            ...prev,
            loading: false,
            connected: isTransient ? prev.connected : false,
            error: background
              ? prev.error
              : isTransient
                ? ""
                : isRateLimit
                  ? "Trakt: límite de peticiones alcanzado"
                  : e?.message || "Error recargando Trakt",
          };
          return nextState;
        });
        return nextState;
      }
    },
    [endpointType, id, reloadTraktStatus, traktType],
  );

  const confirmMovieTraktStatus = useCallback(
    async ({
      expectedWatched = null,
      minHistoryEntries = null,
      expectedHistoryEntries = null,
      force = false,
      background = false,
    } = {}) => {
      if (endpointType !== "movie") {
        return reloadTraktStatus({ force });
      }

      const retryDelays = [0, 800, 1800, 3200];
      let latest = null;

      for (let attempt = 0; attempt < retryDelays.length; attempt++) {
        if (retryDelays[attempt] > 0) {
          await new Promise((resolve) =>
            window.setTimeout(resolve, retryDelays[attempt]),
          );
        }

        latest = await loadTraktMovieWatched({
          background: background || attempt > 0,
          force: force && attempt === 0,
        });
        const latestHistory = normalizeTraktHistoryEntries(latest?.history);
        const latestWatched =
          !!latest?.watched ||
          latestHistory.length > 0 ||
          Number(latest?.plays || 0) > 0;
        const hasExpectedHistory =
          expectedHistoryEntries != null
            ? latestHistory.length === expectedHistoryEntries
            : minHistoryEntries == null
              ? true
              : latestHistory.length >= minHistoryEntries;
        const isMeaningfulMovieSnapshot =
          !!latest?.watched ||
          latestHistory.length > 0 ||
          Number(latest?.plays || 0) > 0 ||
          !!latest?.lastWatchedAt ||
          latest?.found === false ||
          latest?.connected === false;

        if (expectedWatched == null) {
          if (hasExpectedHistory && isMeaningfulMovieSnapshot) return latest;
          continue;
        }

        if (expectedWatched === latestWatched && hasExpectedHistory) {
          return latest;
        }
      }

      return latest;
    },
    [endpointType, loadTraktMovieWatched, reloadTraktStatus],
  );

  const confirmMovieTraktStatusInBackground = useCallback(
    (options = {}) => {
      void confirmMovieTraktStatus({ ...options, background: true }).catch(
        (error) => {
          console.warn(
            "[DetailsClient] background Trakt status confirmation failed:",
            error?.message || error,
          );
        },
      );
    },
    [confirmMovieTraktStatus],
  );

  useEffect(() => {
    let ignore = false;

    const refreshOnClose = async () => {
      if (traktEpisodesOpen) {
        traktEpisodesWasOpenRef.current = true;
        return;
      }
      if (!traktEpisodesWasOpenRef.current) return;
      traktEpisodesWasOpenRef.current = false;
      if (type !== "tv") return;
      if (!trakt?.connected) return;

      try {
        await loadTraktShowWatched();
        if (ignore) return;
        await reloadTraktStatus({ background: true });
      } catch {
        // Preservamos el estado actual si el refresco falla.
      }
    };

    refreshOnClose();
    return () => {
      ignore = true;
    };
  }, [
    traktEpisodesOpen,
    type,
    trakt?.connected,
    loadTraktShowWatched,
    reloadTraktStatus,
  ]);

  // Carga el scoreboard de Trakt (rating de la comunidad y estadisticas de uso)
  // La nota/votos se cargan primero; las stats llegan despues sin bloquear el badge.
  useEffect(() => {
    let ignore = false;

    const hasNumericStats = hasNumericScoreboardStats;
    const cacheKey = `tsb_${traktType}_${id}`;

    const persistScoreboardCache = (payload) => {
      if (!payload?.found || !hasUsefulScoreboardData(payload)) return;
      try {
        localStorage.setItem(
          cacheKey,
          JSON.stringify({
            ...payload,
            loading: false,
            error: "",
          }),
        );
      } catch {}
    };

    const load = async () => {
      const prefetched = parseScoreboardData(initialScoreboard);
      let workingScoreboard = prefetched?.found ? prefetched : null;

      if (workingScoreboard) {
        setTScoreboard((prev) => mergeScoreboardState(prev, workingScoreboard));
      }

      // Si ya tenemos datos completos del prefetch, guardar en cache y salir.
      if (
        workingScoreboard?.found &&
        hasNumericStats(workingScoreboard.stats)
      ) {
        setTraktDeferredReady(true);
        persistScoreboardCache(workingScoreboard);
        return;
      }

      // Restaurar cache local aunque solo traiga rating/votos.
      try {
        const cached = localStorage.getItem(cacheKey);
        if (cached) {
          const parsed = JSON.parse(cached);
          if (parsed?.found && hasUsefulScoreboardData(parsed)) {
            const hydrated = {
              ...parsed,
              loading: true,
              error: "",
            };
            workingScoreboard = mergeScoreboardState(
              workingScoreboard || defaultScoreboard,
              hydrated,
            );
            setTScoreboard((prev) => mergeScoreboardState(prev, hydrated));
          } else {
            setTScoreboard((p) => ({ ...p, loading: true, error: "" }));
          }
        } else if (!workingScoreboard) {
          setTScoreboard((p) => ({ ...p, loading: true, error: "" }));
        }
      } catch {
        if (!workingScoreboard) {
          setTScoreboard((p) => ({ ...p, loading: true, error: "" }));
        }
      }

      // 1) Cargar primero la parte rápida: rating + votos.
      const hasCommunityAlready = hasScoreboardCommunityData(workingScoreboard);
      if (!hasCommunityAlready) {
        try {
          const quick = await withTimeout(
            traktGetScoreboard({
              type: traktType,
              tmdbId: id,
              traktId: scoreboardLookupTraktId || undefined,
              includeStats: false,
            }),
            5000,
          );
          if (ignore) return;

          const quickResult = parseScoreboardData(quick) || defaultScoreboard;
          const hydratedQuick = {
            ...quickResult,
            loading: true,
            error: "",
          };

          workingScoreboard = mergeScoreboardState(
            workingScoreboard || defaultScoreboard,
            hydratedQuick,
          );
          setTScoreboard((prev) => mergeScoreboardState(prev, hydratedQuick));
          persistScoreboardCache(workingScoreboard);
        } catch {}
      }

      // 2) Si ya tenemos stats numéricas, no hace falta pedirlas otra vez.
      if (hasNumericStats(workingScoreboard?.stats)) {
        setTraktDeferredReady(true);
        persistScoreboardCache(workingScoreboard);
        setTScoreboard((prev) => ({
          ...mergeScoreboardState(prev, workingScoreboard),
          loading: false,
          error: "",
        }));
        return;
      }

      // 3) Cargar stats después, con un reintento corto para cold starts en Vercel.
      const statDelays = [0, 1200];
      for (let attempt = 0; attempt < statDelays.length; attempt++) {
        if (ignore) return;
        if (attempt > 0) {
          await new Promise((r) => setTimeout(r, statDelays[attempt]));
          if (ignore) return;
        }
        try {
          const statsR = await withTimeout(
            traktGetStats({
              type: traktType,
              tmdbId: id,
              traktId: scoreboardLookupTraktId || undefined,
            }),
            9000,
          );
          if (ignore) return;

          if (statsR?.found && statsR?.stats) {
            const withStats = {
              ...(workingScoreboard || defaultScoreboard),
              found: true,
              stats: statsR.stats,
              loading: false,
              error: "",
            };
            workingScoreboard = withStats;
            setTScoreboard((prev) => mergeScoreboardState(prev, withStats));
            if (hasNumericStats(withStats.stats)) {
              setTraktDeferredReady(true);
              persistScoreboardCache(withStats);
              return;
            }
          }
        } catch {}
      }

      // Si las stats no llegan, al menos dejamos rating/votos sin bloquear el resto.
      if (!ignore) {
        // Desbloquear datos de comunidad (comentarios, listas, sentimiento)
        // aunque las stats no hayan llegado — no deben depender de ellas.
        setTraktDeferredReady(true);
        setTScoreboard((prev) => ({
          ...mergeScoreboardState(
            prev,
            workingScoreboard || { ...defaultScoreboard, found: false },
          ),
          loading: false,
          error: "",
        }));
      }
    };

    load();
    return () => {
      ignore = true;
    };
  }, [id, traktType, scoreboardLookupTraktId, initialScoreboard]);

  // Resetear estados de Trakt al cambiar de contenido e hidratar caché local
  useLayoutEffect(() => {
    const nextTrakt = buildInitialTraktState();
    let nextWatchedBySeason = initialWatchedBySeason;
    let nextWatchedBySeasonLoaded = hasInitialShowWatched;
    let hydratedStatus = false;
    let hydratedShowWatched = false;

    if (typeof window !== "undefined") {
      if (!hasInitialTraktStatus) {
        try {
          const cachedStatusRaw = window.localStorage.getItem(
            traktStatusStorageKey,
          );
          const cachedStatus = cachedStatusRaw
            ? JSON.parse(cachedStatusRaw)
            : null;

          if (cachedStatus && typeof cachedStatus.connected === "boolean") {
            const normalizedCachedStatus = buildTraktStateFromHistory({
              watched: !!cachedStatus.watched,
              plays: Number(cachedStatus.plays || 0),
              lastWatchedAt: cachedStatus.lastWatchedAt || null,
              history: Array.isArray(cachedStatus.history)
                ? cachedStatus.history
                : [],
            });
            nextTrakt.loading = false;
            nextTrakt.connected = !!cachedStatus.connected;
            nextTrakt.found = !!cachedStatus.found;
            nextTrakt.traktId = cachedStatus.traktId ?? null;
            nextTrakt.traktUrl = cachedStatus.traktUrl || null;
            nextTrakt.watched = !!normalizedCachedStatus.watched;
            nextTrakt.plays = Number(normalizedCachedStatus.plays || 0);
            nextTrakt.lastWatchedAt =
              normalizedCachedStatus.lastWatchedAt || null;
            nextTrakt.rating =
              typeof cachedStatus.rating === "number"
                ? cachedStatus.rating
                : null;
            nextTrakt.favorite = !!cachedStatus.favorite;
            nextTrakt.inWatchlist = !!cachedStatus.inWatchlist;
            nextTrakt.progress = cachedStatus.progress || null;
            nextTrakt.history = normalizedCachedStatus.history;
            nextTrakt.error = "";
            hydratedStatus = true;
          }
        } catch {}
      }

      if (endpointType === "tv" && !hasInitialShowWatched) {
        try {
          const cachedWatchedRaw = window.localStorage.getItem(
            traktShowWatchedStorageKey,
          );
          const cachedWatched = cachedWatchedRaw
            ? JSON.parse(cachedWatchedRaw)
            : null;
          const watchedBySeasonCached = cachedWatched?.watchedBySeason;

          if (
            watchedBySeasonCached &&
            typeof watchedBySeasonCached === "object" &&
            !Array.isArray(watchedBySeasonCached)
          ) {
            const cachedConnected =
              typeof cachedWatched?.connected === "boolean"
                ? cachedWatched.connected
                : true;
            const cachedFound =
              typeof cachedWatched?.found === "boolean"
                ? cachedWatched.found
                : true;

            nextWatchedBySeason = watchedBySeasonCached;
            nextWatchedBySeasonLoaded = true;
            hydratedShowWatched = true;
            nextTrakt.loading = false;
            nextTrakt.connected = cachedConnected;
            nextTrakt.found = cachedFound;
            nextTrakt.traktId = cachedWatched?.traktId ?? nextTrakt.traktId;

            const hasAnyWatchedEpisode = Object.values(
              watchedBySeasonCached,
            ).some(
              (episodes) => Array.isArray(episodes) && episodes.length > 0,
            );

            nextTrakt.watched = hasAnyWatchedEpisode;
          }
        } catch {}
      }
    }

    setTrakt(nextTrakt);
    setTraktWatchedOpen(false);
    setTraktEpisodesOpen(false);
    setEpisodeBusyKey("");
    setTraktBusy("");

    setWatchedBySeason(nextWatchedBySeason);
    setWatchedBySeasonLoaded(nextWatchedBySeasonLoaded);
    setHasCachedTraktStatus(hydratedStatus);
    setHasCachedShowWatched(hydratedShowWatched);
  }, [
    id,
    endpointType,
    buildInitialTraktState,
    initialWatchedBySeason,
    hasInitialShowWatched,
    hasInitialTraktStatus,
    traktStatusStorageKey,
    traktShowWatchedStorageKey,
  ]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    try {
      if (trakt?.connected) {
        window.localStorage.setItem(
          traktStatusStorageKey,
          JSON.stringify({
            connected: !!trakt.connected,
            found: !!trakt.found,
            traktId: trakt.traktId ?? null,
            traktUrl: trakt.traktUrl || null,
            updatedAt: Date.now(),
            watched: !!trakt.watched,
            plays: Number(trakt.plays || 0),
            lastWatchedAt: trakt.lastWatchedAt || null,
            rating: typeof trakt.rating === "number" ? trakt.rating : null,
            favorite: !!trakt.favorite,
            inWatchlist: !!trakt.inWatchlist,
            progress: trakt.progress || null,
            history: Array.isArray(trakt.history) ? trakt.history : [],
          }),
        );
      } else if (trakt?.loading === false) {
        window.localStorage.removeItem(traktStatusStorageKey);
      }
    } catch {}
  }, [trakt, traktStatusStorageKey]);

  useEffect(() => {
    if (typeof window === "undefined" || endpointType !== "tv") return;

    try {
      if (watchedBySeasonLoaded && trakt?.connected) {
        window.localStorage.setItem(
          traktShowWatchedStorageKey,
          JSON.stringify({
            connected: !!trakt.connected,
            found: !!trakt.found,
            traktId: trakt.traktId ?? null,
            updatedAt: Date.now(),
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
    endpointType,
    watchedBySeason,
    watchedBySeasonLoaded,
    trakt?.connected,
    traktShowWatchedStorageKey,
  ]);

  // Recargar estado de Trakt al abrir el modal de historial con datos frescos
  useEffect(() => {
    if (!traktWatchedOpen) return;
    if (endpointType === "movie") {
      void loadTraktMovieWatched({ force: true });
      return;
    }
    void reloadTraktStatus({ force: true });
  }, [
    traktWatchedOpen,
    endpointType,
    loadTraktMovieWatched,
    reloadTraktStatus,
  ]);

  // Carga inicial del estado de Trakt para el contenido actual
  // (visto, rating, historial, watchlist, progreso)
  useEffect(() => {
    if (endpointType === "movie") {
      const hasMovieBootstrapData =
        hasInitialTraktStatus || hasCachedTraktStatus;

      traktBackgroundSyncAtRef.current = Date.now();
      void loadTraktMovieWatched({
        background: hasMovieBootstrapData,
        force: false,
      });

      const fallbackTimer = window.setTimeout(() => {
        void loadTraktMovieWatched({
          background: true,
          force: false,
        });
      }, 900);

      const statusTimer = window.setTimeout(() => {
        void reloadTraktStatus({ background: true });
      }, 2800);

      return () => {
        window.clearTimeout(fallbackTimer);
        window.clearTimeout(statusTimer);
      };
    }

    const hasTraktBootstrapData =
      hasInitialTraktStatus ||
      hasCachedTraktStatus ||
      (endpointType === "tv" &&
        (hasInitialShowWatched || hasCachedShowWatched));

    if (hasTraktBootstrapData) {
      const timer = window.setTimeout(() => {
        traktBackgroundSyncAtRef.current = Date.now();
        // force:true para ignorar caché y preservación de estado obsoleto
        void reloadTraktStatus({ background: true, force: true });
      }, 2500);

      return () => window.clearTimeout(timer);
    }

    traktBackgroundSyncAtRef.current = Date.now();
    // force:true para obtener siempre datos frescos de Trakt en la carga inicial
    void reloadTraktStatus({ background: false, force: true });
  }, [
    loadTraktMovieWatched,
    reloadTraktStatus,
    endpointType,
    hasInitialTraktStatus,
    hasCachedTraktStatus,
    hasInitialShowWatched,
    hasCachedShowWatched,
  ]);

  useEffect(() => {
    let cancelled = false;
    const timers = [];
    let ignoreFirstPageShow = true;
    const syncNotBefore =
      Date.now() +
      (hasInitialTraktStatus ||
      hasCachedTraktStatus ||
      (endpointType === "tv" && (hasInitialShowWatched || hasCachedShowWatched))
        ? 2500
        : 0);

    const syncTraktState = async ({ force = false } = {}) => {
      const now = Date.now();
      if (!force && now < syncNotBefore) return;
      if (!force && now - traktBackgroundSyncAtRef.current < 2500) return;
      traktBackgroundSyncAtRef.current = now;

      if (endpointType === "movie") {
        return loadTraktMovieWatched({ background: true, force });
      }

      const latest = await reloadTraktStatus({ background: true, force });
      if (cancelled || !latest?.connected || type !== "tv") return;
      await loadTraktShowWatched();
    };

    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        // Forzar recarga cuando el usuario vuelve a la pestaña
        void syncTraktState({ force: true });
      }
    };
    const handlePageShow = () => {
      if (ignoreFirstPageShow) {
        ignoreFirstPageShow = false;
        return;
      }
      // Forzar recarga cuando el usuario navega de vuelta
      void syncTraktState({ force: true });
    };

    const handleFocus = () => {
      // Forzar recarga cuando el usuario enfoca la ventana
      void syncTraktState({ force: true });
    };

    window.addEventListener("focus", handleFocus);
    window.addEventListener("pageshow", handlePageShow);
    document.addEventListener("visibilitychange", handleVisibility);

    // Si el primer intento llegó antes de que Trakt refrescara la sesión,
    // reintentamos una o dos veces sin exigir recarga manual.
    if (
      endpointType === "tv" &&
      (trakt.loading ||
        (!trakt.connected && !trakt.error) ||
        (trakt.connected && !watchedBySeasonLoaded))
    ) {
      [900, 2200].forEach((delay) => {
        const timer = window.setTimeout(() => {
          void syncTraktState({ force: true });
        }, delay);
        timers.push(timer);
      });
    }

    return () => {
      cancelled = true;
      timers.forEach((timer) => window.clearTimeout(timer));
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("pageshow", handlePageShow);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [
    loadTraktMovieWatched,
    reloadTraktStatus,
    loadTraktShowWatched,
    type,
    endpointType,
    trakt.loading,
    trakt.connected,
    trakt.error,
    watchedBySeasonLoaded,
    trakt.watched,
    trakt.plays,
    trakt.history,
    hasInitialTraktStatus,
    hasCachedTraktStatus,
    hasInitialShowWatched,
    hasCachedShowWatched,
  ]);

  const canOpenMovieTraktModalInstantly = useMemo(() => {
    if (endpointType !== "movie") return false;
    if (!trakt?.connected) return false;
    return (
      hasInitialTraktStatus ||
      hasCachedTraktStatus ||
      hasMeaningfulTraktSnapshot(trakt)
    );
  }, [endpointType, trakt, hasInitialTraktStatus, hasCachedTraktStatus]);

  const handleOpenTraktWatched = useCallback(async () => {
    if (traktBusy) return;
    const canOpenWhileLoading =
      endpointType === "movie" && canOpenMovieTraktModalInstantly;
    if (trakt.loading && !canOpenWhileLoading) return;

    let connected = !!trakt.connected;
    if (!connected) {
      const latest =
        endpointType === "movie"
          ? await loadTraktMovieWatched({ force: true })
          : await reloadTraktStatus({ force: true });
      connected = !!latest?.connected;
    }

    if (!connected) {
      window.location.assign(
        `/api/trakt/auth/start?next=/details/${type}/${id}`,
      );
      return;
    }

    if (endpointType === "movie") {
      setTraktWatchedOpen(true);
      // Forzar recarga completa para obtener datos frescos, evitando preservación de estado antiguo
      void confirmMovieTraktStatus({ force: true });
      return;
    }

    if (endpointType === "tv") {
      if (!watchedBySeasonLoadedRef.current) {
        await loadTraktShowWatched();
      }
      setTraktEpisodesOpen(true);
    } else {
      setTraktWatchedOpen(true);
    }
  }, [
    trakt.loading,
    traktBusy,
    trakt.connected,
    loadTraktMovieWatched,
    reloadTraktStatus,
    confirmMovieTraktStatus,
    canOpenMovieTraktModalInstantly,
    loadTraktShowWatched,
    type,
    id,
    endpointType,
  ]);

  // Trigger para cargar episodios vistos cuando cambian las dependencias
  useEffect(() => {
    if (endpointType !== "tv") return;
    if (!trakt.connected) return;
    if (hasInitialShowWatched || hasCachedShowWatched) return;
    loadTraktShowWatched();
  }, [
    endpointType,
    loadTraktShowWatched,
    trakt.connected,
    hasInitialShowWatched,
    hasCachedShowWatched,
  ]);

  /**
   * Carga los plays (visionados completos) de la serie desde Trakt.
   * Opcionalmente filtra por fecha de inicio (para rewatches).
   * Tambien carga los episodios vistos en el rewatch actual.
   */
  const loadTraktShowPlays = useCallback(
    async (startAtIso = null, endBeforeIso = null) => {
      if (type !== "tv") return;
      const requestId = showPlaysRequestIdRef.current + 1;
      showPlaysRequestIdRef.current = requestId;
      if (!trakt?.connected) {
        setShowPlays([]);
        setRewatchWatchedBySeason(null);
        setRewatchHistoryByEpisode({});
        return;
      }

      try {
        const r = await traktGetShowPlays({
          tmdbId: id,
          startAt: startAtIso || undefined,
          endBefore: endBeforeIso || undefined,
        });

        if (requestId !== showPlaysRequestIdRef.current) {
          return;
        }

        if (Array.isArray(r?.rewatchRuns) && r.rewatchRuns.length > 0) {
          setRewatchRuns((prev) => {
            const mergedRuns = mergeRewatchRuns(prev, r.rewatchRuns);
            try {
              window.localStorage.setItem(
                rewatchRunsStorageKey,
                JSON.stringify(mergedRuns),
              );
            } catch {}
            return mergedRuns;
          });
        }

        setShowPlays(
          Array.isArray(r?.showPlays)
            ? r.showPlays
            : Array.isArray(r?.plays)
              ? r.plays
              : [],
        );

        if (startAtIso) {
          const nextWatchedBySeason =
            r?.watchedBySeasonSince &&
            typeof r.watchedBySeasonSince === "object"
              ? r.watchedBySeasonSince
              : {};
          const nextHistoryIds =
            r?.historyIdsByEpisodeSince &&
            typeof r.historyIdsByEpisodeSince === "object"
              ? r.historyIdsByEpisodeSince
              : {};

          cacheRewatchViewState({
            startAtIso,
            endBeforeIso,
            watchedBySeason: nextWatchedBySeason,
            historyIdsByEpisode: nextHistoryIds,
          });

          setRewatchWatchedBySeason(nextWatchedBySeason);
          // Guardar los historyIds para poder desmarcar episodios en rewatch
          setRewatchHistoryByEpisode(nextHistoryIds);
        } else {
          setRewatchWatchedBySeason(null);
          setRewatchHistoryByEpisode({});
        }
      } catch (e) {
        if (requestId !== showPlaysRequestIdRef.current) return;
        if (startAtIso) {
          const restored = restoreRewatchViewStateFromCache(
            startAtIso,
            endBeforeIso,
          );
          if (!restored) {
            setRewatchWatchedBySeason({});
            setRewatchHistoryByEpisode({});
          }
        }
      }
    },
    [
      id,
      type,
      trakt?.connected,
      mergeRewatchRuns,
      rewatchRunsStorageKey,
      cacheRewatchViewState,
      restoreRewatchViewStateFromCache,
    ],
  );

  // Refrescar episodios vistos y plays al abrir el modal de episodios
  // (evita que se quede desincronizado con el estado real de Trakt)
  useEffect(() => {
    let ignore = false;

    const refreshOnOpen = async () => {
      if (!traktEpisodesOpen) return;
      if (type !== "tv") return;
      if (!trakt?.connected) return;

      try {
        await loadTraktShowWatched();
        if (ignore) return;

        const windowState = resolveRewatchWindow(
          activeEpisodesViewRef.current,
          rewatchRunsRef.current,
        );
        restoreRewatchViewStateFromCache(
          windowState.startAt || null,
          windowState.endBefore || null,
        );
        await loadTraktShowPlays(
          windowState.startAt || null,
          windowState.endBefore || null,
        );
      } catch {
        // no machacamos UI si falla
      }
    };

    refreshOnOpen();
    return () => {
      ignore = true;
    };
  }, [
    traktEpisodesOpen,
    type,
    trakt?.connected,
    loadTraktShowWatched,
    loadTraktShowPlays,
    resolveRewatchWindow,
    restoreRewatchViewStateFromCache,
  ]);

  // Alterna el estado de "visto" del contenido completo en Trakt
  const toggleTraktWatched = async () => {
    if (!trakt.connected || traktBusy) return;
    setTraktBusy("watched");
    try {
      const next = !trakt.watched;
      await traktSetWatched({ type: traktType, tmdbId: id, watched: next });
      invalidateTraktGetCache({
        tmdbId: id,
        traktId: traktResolvedIdRef.current ?? undefined,
      });
      setTrakt((prev) => {
        const optimisticHistory = next
          ? normalizeTraktHistoryEntries([
              {
                id: `temp-${Date.now()}`,
                watched_at: new Date().toISOString(),
              },
              ...(Array.isArray(prev.history) ? prev.history : []),
            ])
          : [];

        return buildTraktStateFromHistory({
          ...prev,
          watched: next,
          lastWatchedAt: next ? new Date().toISOString() : null,
          plays: next ? optimisticHistory.length : 0,
          history: optimisticHistory,
        });
      });
      setTraktBusy("");
      confirmMovieTraktStatusInBackground({
        expectedWatched: next,
        expectedHistoryEntries: next ? 1 : 0,
      });
    } finally {
      setTraktBusy("");
    }
  };

  const pickMutationHistoryId = (payload, fallback = null) => {
    if (payload?.historyId != null) return payload.historyId;
    if (payload?.id != null) return payload.id;
    if (Array.isArray(payload?.ids) && payload.ids[0] != null) {
      return payload.ids[0];
    }
    if (Array.isArray(payload?.result?.ids) && payload.result.ids[0] != null) {
      return payload.result.ids[0];
    }
    return fallback;
  };

  // Agrega un nuevo visionado (play) con fecha especifica al historial de Trakt
  const handleTraktAddPlay = async (yyyyMmDd) => {
    if (!trakt.connected || traktBusy) return;
    setTraktBusy("history");
    try {
      const optimisticIso = `${yyyyMmDd}T12:00:00.000Z`;
      const prevHistoryLength = normalizeTraktHistoryEntries(
        trakt.history,
      ).length;
      const result = await traktAddWatchPlay({
        type: traktType,
        tmdbId: id,
        watchedAt: yyyyMmDd,
      });
      const optimisticId = pickMutationHistoryId(result, `temp-${Date.now()}`);
      invalidateTraktGetCache({
        tmdbId: id,
        traktId: traktResolvedIdRef.current ?? undefined,
      });
      setTrakt((prev) =>
        buildTraktStateFromHistory({
          ...prev,
          watched: true,
          plays: prevHistoryLength + 1,
          lastWatchedAt: optimisticIso,
          history: [
            {
              id: optimisticId,
              watched_at: optimisticIso,
            },
            ...(Array.isArray(prev.history) ? prev.history : []),
          ],
        }),
      );
      setTraktBusy("");
      confirmMovieTraktStatusInBackground({
        expectedWatched: true,
        expectedHistoryEntries: prevHistoryLength + 1,
      });
    } finally {
      setTraktBusy("");
    }
  };

  // Actualiza la fecha de un visionado existente en el historial de Trakt
  const handleTraktUpdatePlay = async (historyId, yyyyMmDd) => {
    if (!trakt.connected || traktBusy) return;
    setTraktBusy("history");
    try {
      const optimisticIso = `${yyyyMmDd}T12:00:00.000Z`;
      const prevHistoryLength = normalizeTraktHistoryEntries(
        trakt.history,
      ).length;
      const result = await traktUpdateWatchPlay({
        type: traktType,
        tmdbId: id,
        historyId,
        watchedAt: yyyyMmDd,
      });
      const nextHistoryId = pickMutationHistoryId(result, historyId);
      invalidateTraktGetCache({
        tmdbId: id,
        traktId: traktResolvedIdRef.current ?? undefined,
      });
      setTrakt((prev) =>
        buildTraktStateFromHistory({
          ...prev,
          plays: prevHistoryLength,
          history: normalizeTraktHistoryEntries(prev.history).map((entry) =>
            String(entry.id) === String(historyId)
              ? {
                  ...entry,
                  id: nextHistoryId,
                  watched_at: optimisticIso,
                  watchedAt: optimisticIso,
                }
              : entry,
          ),
        }),
      );
      setTraktBusy("");
      confirmMovieTraktStatusInBackground({
        expectedWatched: true,
        expectedHistoryEntries: Math.max(1, prevHistoryLength),
      });
    } finally {
      setTraktBusy("");
    }
  };

  // Elimina un visionado del historial de Trakt por su historyId
  const handleTraktRemovePlay = async (historyId) => {
    if (!trakt.connected || traktBusy) return;
    setTraktBusy("history");
    try {
      const prevHistoryLength = normalizeTraktHistoryEntries(
        trakt.history,
      ).length;
      const expectedHistoryLength = Math.max(0, prevHistoryLength - 1);
      await traktRemoveWatchPlay({ historyId });
      invalidateTraktGetCache({
        tmdbId: id,
        traktId: traktResolvedIdRef.current ?? undefined,
      });
      setTrakt((prev) =>
        buildTraktStateFromHistory({
          ...prev,
          plays: expectedHistoryLength,
          history: normalizeTraktHistoryEntries(prev.history).filter(
            (entry) => String(entry.id) !== String(historyId),
          ),
        }),
      );
      setTraktBusy("");
      confirmMovieTraktStatusInBackground({
        expectedWatched: expectedHistoryLength > 0,
        expectedHistoryEntries: expectedHistoryLength,
      });
    } finally {
      setTraktBusy("");
    }
  };

  // Establece o elimina la puntuacion del usuario en Trakt de forma segura
  const setTraktRatingSafe = async (valueOrNull) => {
    if (!trakt.connected || traktBusy) return;
    setTraktBusy("rating");
    try {
      await traktSetRating({
        type: traktType, // 'movie' | 'show'
        ids: {
          tmdb: Number(id),
          ...(trakt.traktId != null ? { trakt: Number(trakt.traktId) } : {}),
        },
        tmdbId: Number(id),
        traktId: trakt.traktId != null ? Number(trakt.traktId) : undefined,
        rating: valueOrNull, // puede ser number o null
      });
      setTrakt((p) => ({
        ...p,
        rating: valueOrNull == null ? null : Number(valueOrNull),
      }));
    } finally {
      setTraktBusy("");
    }
  };

  /**
   * Marca/desmarca un episodio individual como visto en Trakt.
   * Usa actualizacion optimista con rollback en caso de error.
   */
  const toggleEpisodeWatched = async (seasonNumber, episodeNumber) => {
    if (type !== "tv") return;
    if (!trakt?.connected) return;
    if (episodeBusyKey) return;

    const key = `S${seasonNumber}E${episodeNumber}`;
    setEpisodeBusyKey(key);

    const currentlyWatched =
      !!watchedBySeason?.[seasonNumber]?.includes(episodeNumber);
    const next = !currentlyWatched;

    // Actualizacion optimista: cambiar UI antes de confirmar con el servidor
    const optimisticWatchedBySeason = {
      ...normalizeWatchedBySeasonMap(watchedBySeasonRef.current),
    };
    const optimisticEpisodes = new Set(
      optimisticWatchedBySeason?.[seasonNumber] || [],
    );
    if (next) optimisticEpisodes.add(episodeNumber);
    else optimisticEpisodes.delete(episodeNumber);
    optimisticWatchedBySeason[seasonNumber] = Array.from(
      optimisticEpisodes,
    ).sort((a, b) => a - b);
    applyWatchedBySeasonState(optimisticWatchedBySeason, { loaded: true });

    try {
      const r = await traktSetEpisodeWatched({
        tmdbId: id,
        season: seasonNumber,
        episode: episodeNumber,
        watched: next,
        watchedAt: null,
      });
      invalidateTraktGetCache({
        tmdbId: id,
        traktId: traktResolvedIdRef.current ?? undefined,
      });

      // Si el endpoint devuelve el estado actualizado directamente, usarlo
      if (r?.watchedBySeason) {
        applyWatchedBySeasonState(r.watchedBySeason, { loaded: true });
      } else {
        // Fallback: recargar el estado completo desde Trakt
        const fresh = await traktGetShowWatched({ tmdbId: id });
        applyWatchedBySeasonState(fresh?.watchedBySeason || {}, {
          loaded: true,
        });
      }
    } catch {
      // Rollback: revertir cambio optimista si falla la peticion
      const rollbackWatchedBySeason = {
        ...normalizeWatchedBySeasonMap(watchedBySeasonRef.current),
      };
      const rollbackEpisodes = new Set(
        rollbackWatchedBySeason?.[seasonNumber] || [],
      );
      if (!next) rollbackEpisodes.add(episodeNumber);
      else rollbackEpisodes.delete(episodeNumber);
      rollbackWatchedBySeason[seasonNumber] = Array.from(rollbackEpisodes).sort(
        (a, b) => a - b,
      );
      applyWatchedBySeasonState(rollbackWatchedBySeason, { loaded: true });
    } finally {
      setEpisodeBusyKey("");
    }
  };

  /**
   * Marca/desmarca un episodio en el contexto de un rewatch.
   * A diferencia de toggleEpisodeWatched, este agrega un nuevo play con fecha
   * y asocia el historyId para poder desmarcarlo despues.
   */
  const toggleEpisodeRewatch = useCallback(
    async (seasonNumber, episodeNumber, options = {}) => {
      if (type !== "tv") return;
      if (!trakt?.connected) return;
      if (episodeBusyKey) return;

      const targetViewId =
        options && typeof options === "object" && !Array.isArray(options)
          ? options.viewId || activeEpisodesViewRef.current
          : activeEpisodesViewRef.current;
      const windowState = resolveRewatchWindow(
        targetViewId,
        rewatchRunsRef.current,
      );
      const targetStartAt = windowState.startAt || rewatchStartAtRef.current;
      if (!targetStartAt) return;

      const key = `S${seasonNumber}E${episodeNumber}`;
      setEpisodeBusyKey(key);

      const currentlyWatched =
        !!rewatchWatchedBySeason?.[seasonNumber]?.includes(episodeNumber);
      const next = !currentlyWatched;
      const watchedAtOverride =
        options && typeof options === "object" && !Array.isArray(options)
          ? options.watchedAt || null
          : null;

      // Actualizacion optimista del estado de rewatch
      let optimisticWatchedBySeason = null;
      setRewatchWatchedBySeason((prev) => {
        const p = prev && typeof prev === "object" ? prev : {};
        const cur = new Set(p?.[seasonNumber] || []);
        if (next) cur.add(episodeNumber);
        else cur.delete(episodeNumber);
        optimisticWatchedBySeason = {
          ...p,
          [seasonNumber]: Array.from(cur).sort((a, b) => a - b),
        };
        return optimisticWatchedBySeason;
      });
      cacheRewatchViewState({
        startAtIso: targetStartAt,
        endBeforeIso: windowState.endBefore || null,
        watchedBySeason: optimisticWatchedBySeason || {},
        historyIdsByEpisode: rewatchHistoryByEpisode || {},
      });

      try {
        if (next) {
          const watchedAtIso = watchedAtOverride || new Date().toISOString();
          const watchedAtMs = new Date(watchedAtIso).getTime();
          const rewatchStartMs = new Date(targetStartAt).getTime();

          if (
            Number.isFinite(watchedAtMs) &&
            Number.isFinite(rewatchStartMs) &&
            watchedAtMs < rewatchStartMs
          ) {
            throw new Error(
              "La fecha del episodio no puede ser anterior al inicio del rewatch activo.",
            );
          }

          // Agregar play de rewatch: el endpoint devuelve el historyId
          const r = await traktAddEpisodePlay({
            tmdbId: id,
            season: seasonNumber,
            episode: episodeNumber,
            watchedAt: watchedAtIso,
          });
          invalidateTraktGetCache({
            tmdbId: id,
            traktId: traktResolvedIdRef.current ?? undefined,
          });
          const hid = r?.historyId || r?.id || null;
          if (hid)
            setRewatchHistoryByEpisode((p) => ({ ...(p || {}), [key]: hid }));
        } else {
          // Quitar play de rewatch: necesita el historyId guardado
          const hid = rewatchHistoryByEpisode?.[key];
          if (!hid) {
            // Sin historyId no se puede desmarcar de forma fiable
            throw new Error(
              "No hay historyId para desmarcar este episodio en rewatch.",
            );
          }
          await traktRemoveWatchPlay({ historyId: hid });
          invalidateTraktGetCache({
            tmdbId: id,
            traktId: traktResolvedIdRef.current ?? undefined,
          });
          setRewatchHistoryByEpisode((p) => {
            const nextMap = { ...(p || {}) };
            delete nextMap[key];
            return nextMap;
          });
        }

        // Refrescar estado del run activo de rewatch
        await loadTraktShowPlays(targetStartAt, windowState.endBefore || null);

        // Mantener el estado global actualizado tambien
        const fresh = await traktGetShowWatched({ tmdbId: id });
        applyWatchedBySeasonState(fresh?.watchedBySeason || {}, {
          loaded: true,
        });
      } catch (e) {
        // Rollback del estado optimista
        let rollbackWatchedBySeason = null;
        setRewatchWatchedBySeason((prev) => {
          const p = prev && typeof prev === "object" ? prev : {};
          const cur = new Set(p?.[seasonNumber] || []);
          if (!next) cur.add(episodeNumber);
          else cur.delete(episodeNumber);
          rollbackWatchedBySeason = {
            ...p,
            [seasonNumber]: Array.from(cur).sort((a, b) => a - b),
          };
          return rollbackWatchedBySeason;
        });
        cacheRewatchViewState({
          startAtIso: targetStartAt,
          endBeforeIso: windowState.endBefore || null,
          watchedBySeason: rollbackWatchedBySeason || {},
          historyIdsByEpisode: rewatchHistoryByEpisode || {},
        });
      } finally {
        setEpisodeBusyKey("");
      }
    },
    [
      type,
      trakt?.connected,
      episodeBusyKey,
      rewatchWatchedBySeason,
      rewatchHistoryByEpisode,
      id,
      loadTraktShowPlays,
      resolveRewatchWindow,
      cacheRewatchViewState,
    ],
  );

  // Marca/desmarca TODA la serie como vista (todos los episodios de todas las temporadas)
  const onToggleShowWatched = async (watchedAtOrNull) => {
    if (type !== "tv") return;
    if (!trakt?.connected) return;
    if (episodeBusyKey) return;

    const tmdbIdNum = Number(id);
    if (!Number.isFinite(tmdbIdNum)) return;

    const seasonsList = Array.isArray(data?.seasons) ? data.seasons : [];
    const seasonNumbers = seasonsList
      .map((s) => s?.season_number)
      .filter((n) => typeof n === "number" && n > 0);

    if (seasonNumbers.length === 0) {
      console.warn(
        "[DetailsClient] No hay temporadas válidas para marcar la serie completa.",
      );
      return;
    }

    setEpisodeBusyKey(SHOW_BUSY_KEY);

    try {
      const res = await fetch("/api/trakt/history/show", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tmdbId: tmdbIdNum,
          seasonNumbers,
          watchedAt: watchedAtOrNull, // ISO string (marcar) o null (desmarcar)
        }),
      });

      // Primero obtener el texto de la respuesta
      const responseText = await res.text();

      // Intentar parsearlo como JSON
      let json;
      try {
        json = JSON.parse(responseText);
      } catch (parseError) {
        console.error(
          "[DetailsClient] Error parsing response as JSON:",
          parseError,
        );
        console.error(
          "[DetailsClient] Response text:",
          responseText.substring(0, 300),
        );
        console.error("[DetailsClient] Response status:", res.status);
        console.error(
          "[DetailsClient] Response headers:",
          Object.fromEntries(res.headers.entries()),
        );

        throw new Error(
          "El servidor devolvió una respuesta inválida (no JSON). Revisa la consola del servidor y del navegador.",
        );
      }

      if (!res.ok)
        throw new Error(json?.error || "Error marcando serie en Trakt");
      invalidateTraktGetCache({
        tmdbId: tmdbIdNum,
        traktId: traktResolvedIdRef.current ?? undefined,
      });

      // Actualizacion optimista: marcar todos los episodios segun episode_count
      setWatchedBySeason(() => {
        if (!watchedAtOrNull) return {};
        const next = {};
        for (const s of seasonsList) {
          const sn = s?.season_number;
          const total = Number(s?.episode_count || 0);
          if (typeof sn === "number" && sn > 0 && total > 0) {
            next[sn] = Array.from({ length: total }, (_, i) => i + 1);
          }
        }
        return next;
      });

      // Refrescar el estado real desde Trakt (por si difiere del optimista)
      await reloadTraktStatus();
      const fresh = await traktGetShowWatched({ tmdbId: tmdbIdNum });
      applyWatchedBySeasonState(fresh?.watchedBySeason || {}, {
        loaded: true,
      });
    } catch (e) {
      console.error("[DetailsClient] onToggleShowWatched error:", e);
    } finally {
      setEpisodeBusyKey("");
    }
  };

  // Agrega un visionado completo de la serie en Trakt (play de toda la serie)
  const onAddShowPlay = async (watchedAtIsoOrNull) => {
    if (type !== "tv") return;
    if (!trakt?.connected) return;
    if (episodeBusyKey) return;

    setEpisodeBusyKey(SHOW_BUSY_KEY);
    try {
      await traktAddShowPlay({ tmdbId: id, watchedAt: watchedAtIsoOrNull });
      invalidateTraktGetCache({
        tmdbId: id,
        traktId: traktResolvedIdRef.current ?? undefined,
      });
      await reloadTraktStatus();

      const fresh = await traktGetShowWatched({ tmdbId: id });
      applyWatchedBySeasonState(fresh?.watchedBySeason || {}, {
        loaded: true,
      });

      const windowState = resolveRewatchWindow(
        activeEpisodesViewRef.current,
        rewatchRunsRef.current,
      );
      await loadTraktShowPlays(
        windowState.startAt || null,
        windowState.endBefore || null,
      );
    } finally {
      setEpisodeBusyKey("");
    }
  };

  // Inicia un nuevo rewatch de la serie con fecha de inicio
  const onStartShowRewatch = async (startedAtIsoOrNull) => {
    if (type !== "tv") return;
    if (!trakt?.connected) return;

    const startIso = startedAtIsoOrNull || new Date().toISOString();
    setRewatchStartAt(startIso);

    // Persistir fecha de inicio del rewatch en localStorage
    try {
      window.localStorage.setItem(rewatchStorageKey, startIso);
    } catch {}

    const windowState = resolveRewatchWindow(startIso, rewatchRunsRef.current);
    await loadTraktShowPlays(
      windowState.startAt || startIso,
      windowState.endBefore || null,
    );
  };

  // Agrega un play individual de un episodio en un rewatch
  const onAddEpisodePlay = async (season, episode, watchedAtIso) => {
    if (type !== "tv") return;
    if (!trakt?.connected) return;
    if (!rewatchStartAt) return;
    if (episodeBusyKey) return;

    const key = `S${season}E${episode}`;
    setEpisodeBusyKey(key);

    try {
      await traktAddEpisodePlay({
        tmdbId: id,
        season,
        episode,
        watchedAt: watchedAtIso || new Date().toISOString(),
      });
      invalidateTraktGetCache({
        tmdbId: id,
        traktId: traktResolvedIdRef.current ?? undefined,
      });

      // Refrescar progreso del run activo
      const windowState = resolveRewatchWindow(
        activeEpisodesViewRef.current,
        rewatchRunsRef.current,
      );
      await loadTraktShowPlays(
        windowState.startAt || rewatchStartAt,
        windowState.endBefore || null,
      );

      // Mantener watchedBySeason global coherente
      const fresh = await traktGetShowWatched({ tmdbId: id });
      applyWatchedBySeasonState(fresh?.watchedBySeason || {}, {
        loaded: true,
      });
    } finally {
      setEpisodeBusyKey("");
    }
  };

  // =====================================================================
  // COLECCION DE PELICULAS
  // Si la pelicula pertenece a una coleccion (ej. saga), carga sus datos.
  // =====================================================================

  const collectionId =
    typeof data?.belongs_to_collection?.id === "number"
      ? data.belongs_to_collection.id
      : null;

  const [collectionData, setCollectionData] = useState(null);
  const [collectionLoading, setCollectionLoading] = useState(false);

  // Carga los datos de la coleccion si la pelicula pertenece a una
  useEffect(() => {
    if (!collectionId) {
      setCollectionData(null);
      setCollectionLoading(false);
      return;
    }

    let alive = true;
    (async () => {
      try {
        setCollectionLoading(true);
        const res = await fetch(`/api/tmdb/collection?id=${collectionId}`, {
          cache: "no-store",
        });
        const j = await res.json().catch(() => ({}));
        if (!alive) return;
        setCollectionData(res.ok && j?.collection ? j : null);
      } catch {
        if (alive) setCollectionData(null);
      } finally {
        if (alive) setCollectionLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [collectionId]);

  // Carga las runs de rewatch desde localStorage.
  // Incluye migracion del formato legacy (un unico rewatch) al nuevo formato (multiples runs).
  useEffect(() => {
    if (type !== "tv") {
      setRewatchStartAt(null);
      setRewatchWatchedBySeason(null);
      setShowPlays([]);
      setRewatchRuns([]);
      setActiveEpisodesView("global");
      setRewatchHistoryByEpisode({});
      return;
    }

    try {
      // 1. Cargar runs del nuevo formato
      let runs = [];
      const rawRuns = window.localStorage.getItem(rewatchRunsStorageKey);
      if (rawRuns) {
        const parsed = JSON.parse(rawRuns);
        if (Array.isArray(parsed)) runs = parsed;
      }

      // 2. Compatibilidad: migrar formato legacy (un solo rewatch) al nuevo formato
      if (!runs.length) {
        const legacy = window.localStorage.getItem(rewatchStorageKey);
        if (legacy) {
          runs = [
            {
              id: legacy,
              startedAt: legacy,
              label: `Rewatch · ${legacy.slice(0, 10)}`,
            },
          ];
          try {
            window.localStorage.setItem(
              rewatchRunsStorageKey,
              JSON.stringify(runs),
            );
          } catch {}
        }
      }

      setRewatchRuns(runs);

      // 3. Restaurar la vista activa (global o un run especifico)
      const savedView =
        window.localStorage.getItem(episodesViewStorageKey) || "global";
      const validView =
        savedView === "global" || runs.some((r) => r?.id === savedView)
          ? savedView
          : "global";

      setActiveEpisodesView(validView);

      // 4. Ajustar rewatchStartAt segun la vista activa
      if (validView === "global") {
        setRewatchStartAt(null);
      } else {
        const run = runs.find((r) => r.id === validView);
        setRewatchStartAt(run?.startedAt || validView); // fallback
      }
    } catch {
      setRewatchRuns([]);
      setActiveEpisodesView("global");
      setRewatchStartAt(null);
      setRewatchHistoryByEpisode({});
    }
  }, [
    type,
    id,
    rewatchRunsStorageKey,
    rewatchStorageKey,
    episodesViewStorageKey,
  ]);

  // =====================================================================
  // DATOS EXTRA: IMDb, Rotten Tomatoes, Metacritic y premios
  // OMDb aporta ratings externos (IMDb, RT, MC) con cache en localStorage.
  // OMDb aporta tambien el resumen textual de premios que se muestra en la ficha.
  // TMDb aporta premios detallados para la seccion independiente de carrusel.
  // =====================================================================

  const [extras, setExtras] = useState({
    imdbRating: null,
    imdbVotes: null,
    awards: null,
    awardsDetails: null,
    rtScore: null,
    mcScore: null,
  });
  const [awardsLoading, setAwardsLoading] = useState(false);
  // ID de IMDb resuelto (puede venir directo de TMDb o cargarse via getExternalIds)
  const [resolvedImdbId, setResolvedImdbId] = useState(null);

  // Carga datos de OMDb: rating IMDb, votos, RT y Metacritic.
  // Usa cache en localStorage para evitar peticiones repetidas.
  useEffect(() => {
    let abort = false;

    const resolveImdbId = async () => {
      const direct = data?.imdb_id || data?.external_ids?.imdb_id || null;
      if (direct) return direct;

      try {
        const ext = await getExternalIds(endpointType, id);
        return ext?.imdb_id || null;
      } catch {
        return null;
      }
    };

    const run = async () => {
      try {
        // Reset suave al cambiar de contenido
        setExtras((prev) => ({
          ...prev,
          imdbRating: null,
          imdbVotes: null,
          awards: null,
          rtScore: null,
          mcScore: null,
        }));

        // Resetear el imdbId resuelto para este contenido
        setResolvedImdbId(null);

        const imdbId = await resolveImdbId();

        // Si el effect se cancelo (cambio de contenido), salir
        if (abort) return;

        // Guardar el imdbId resuelto para usarlo en enlaces y badges
        setResolvedImdbId(imdbId || null);

        // Sin imdbId no se puede consultar OMDb
        if (!imdbId) return;

        // Intentar cargar datos desde cache de localStorage
        const cached = readOmdbCache(imdbId);
        const hasCachedScores =
          cached?.imdbRating != null ||
          cached?.imdbVotes != null ||
          cached?.rtScore != null ||
          cached?.mcScore != null;
        const hasCachedAwards = !!cached?.awardsFetched;

        if (hasCachedScores || hasCachedAwards) {
          setExtras((prev) => ({
            ...prev,
            imdbRating: cached?.imdbRating ?? null,
            imdbVotes: cached?.imdbVotes ?? null,
            awards: normalizeOmdbAwards(cached?.awards),
            rtScore: cached?.rtScore ?? null,
            mcScore: cached?.mcScore ?? null,
          }));
        }

        // Si el cache esta fresco y completo, no hacer peticion de red
        if (
          cached?.fresh &&
          cached?.imdbRating != null &&
          cached?.imdbVotes != null &&
          cached?.awardsFetched
        )
          return;

        // IMDb carga independiente y con timeout corto: no debe esperar a OMDb/premios.
        const imdbPromise = (async () => {
          const imdbDataset = await fetchImdbRatingByImdb(imdbId, {
            timeoutMs: cached?.imdbRating != null ? 900 : 1400,
          });
          if (abort || !imdbDataset) return;

          const imdbRating =
            typeof imdbDataset?.rating === "number" ? imdbDataset.rating : null;
          const votes =
            typeof imdbDataset?.votes === "number" ? imdbDataset.votes : null;

          if (!Number.isFinite(imdbRating)) return;

          setExtras((prev) => ({
            ...prev,
            imdbRating,
            imdbVotes: Number.isFinite(votes) ? votes : null,
          }));

          writeOmdbCache(imdbId, {
            imdbRating,
            imdbVotes: Number.isFinite(votes) ? votes : null,
          });
        })();

        const omdbPromise = (async () => {
          const omdb = await fetchOmdbByImdb(imdbId);
          if (abort || !omdb) return;

          const { rtScore, mcScore } = extractOmdbExtraScores(omdb);
          const awards = normalizeOmdbAwards(omdb?.Awards);

          setExtras((prev) => ({
            ...prev,
            awards,
            rtScore,
            mcScore,
          }));

          writeOmdbCache(imdbId, {
            awards,
            awardsFetched: true,
            rtScore,
            mcScore,
          });
        })();

        await Promise.allSettled([imdbPromise, omdbPromise]);
      } catch {
        if (!abort) {
          setExtras((prev) => ({
            ...prev,
            imdbRating: null,
            imdbVotes: null,
            awards: null,
            rtScore: null,
            mcScore: null,
          }));

          // Resetear el resolvedImdbId si hay error
          setResolvedImdbId(null);
        }
      }
    };

    run();
    return () => {
      abort = true;
    };
  }, [type, id, data?.imdb_id, data?.external_ids?.imdb_id, endpointType]);

  // Carga premios detallados desde TMDb para la seccion independiente.
  useEffect(() => {
    let abort = false;

    setAwardsLoading(true);
    setExtras((prev) => ({
      ...prev,
      awardsDetails: null,
    }));

    const run = async () => {
      try {
        const awardsData = await fetchTmdbAwards(endpointType, id);
        if (abort) return;

        setExtras((prev) => ({
          ...prev,
          awardsDetails: awardsData || null,
        }));
      } finally {
        if (!abort) setAwardsLoading(false);
      }
    };

    run();

    return () => {
      abort = true;
    };
  }, [endpointType, id]);

  /**
   * Puntuacion unificada: envia la puntuacion a TMDb y Trakt simultaneamente.
   * Si no hay sesion, redirige a login.
   */
  const handleUnifiedRate = async (value) => {
    // Sin sesion activa, redirigir a login
    if (!session) {
      window.location.href = "/login";
      return;
    }

    try {
      setRatingError("");

      // 1. Enviar a TMDb (skipSync para evitar doble sincronizacion)
      if (value === null) {
        await clearTmdbRating({ skipSync: true });
      } else {
        await sendTmdbRating(value, { skipSync: true });
      }

      // 2. Enviar a Trakt si esta conectado (Trakt usa null para borrar)
      if (trakt.connected) {
        const traktOk = await sendTraktRating(value); // sendTraktRating ya maneja null internamente
        if (traktOk === false) return false;
      }

      return true;
    } catch (err) {
      setRatingError(err?.message || "Error al sincronizar puntuacion");
      return false;
    }
  };

  // Persiste las runs de rewatch en localStorage
  const persistRuns = useCallback(
    (nextRuns) => {
      try {
        window.localStorage.setItem(
          rewatchRunsStorageKey,
          JSON.stringify(nextRuns || []),
        );
      } catch {}
    },
    [rewatchRunsStorageKey],
  );

  // Cambia la vista de episodios entre "global" y un run de rewatch especifico
  const changeEpisodesView = useCallback(
    async (viewId) => {
      const v = viewId || "global";
      setActiveEpisodesView(v);
      try {
        window.localStorage.setItem(episodesViewStorageKey, v);
      } catch {}

      if (v === "global") {
        setRewatchStartAt(null);
        await loadTraktShowPlays(null); // Refrescar a vista global
        return;
      }

      const windowState = resolveRewatchWindow(v, rewatchRuns);
      const startAt = windowState.startAt || v;

      setRewatchStartAt(startAt);
      restoreRewatchViewStateFromCache(startAt, windowState.endBefore || null);
      await loadTraktShowPlays(startAt, windowState.endBefore || null); // Refrescar al cambiar de run
    },
    [
      episodesViewStorageKey,
      rewatchRuns,
      loadTraktShowPlays,
      resolveRewatchWindow,
      restoreRewatchViewStateFromCache,
    ],
  );

  // Crea un nuevo run de rewatch con fecha de inicio y lo establece como vista activa
  const createRewatchRun = useCallback(
    async (startedAtIsoOrNull) => {
      const startedAt = startedAtIsoOrNull || new Date().toISOString();
      const run = {
        id: startedAt,
        startedAt,
        label: `Rewatch · ${startedAt.slice(0, 10)}`,
      };
      const nextRuns = [
        run,
        ...(Array.isArray(rewatchRunsRef.current)
          ? rewatchRunsRef.current
          : []
        ).filter((r) => r?.id !== run.id),
      ];

      setRewatchRuns(nextRuns);
      persistRuns(nextRuns);

      setActiveEpisodesView(run.id);
      try {
        window.localStorage.setItem(episodesViewStorageKey, run.id);
      } catch {}
      setRewatchStartAt(run.startedAt);

      const windowState = resolveRewatchWindow(run.id, nextRuns);
      await loadTraktShowPlays(
        windowState.startAt,
        windowState.endBefore || null,
      ); // Cargar datos del run
    },
    [
      episodesViewStorageKey,
      persistRuns,
      loadTraktShowPlays,
      resolveRewatchWindow,
    ],
  );

  // Elimina un run de rewatch y vuelve a vista global si era el activo
  const deleteRewatchRun = useCallback(
    async (runId) => {
      if (!runId) return;

      const baseRuns = Array.isArray(rewatchRuns) ? rewatchRuns : [];
      const sortedRuns = [...baseRuns].sort(
        (a, b) =>
          new Date(b?.startedAt || b?.id || 0).getTime() -
          new Date(a?.startedAt || a?.id || 0).getTime(),
      );
      const targetIdx = sortedRuns.findIndex(
        (r) => (r?.id || r?.startedAt) === runId,
      );
      const targetRun = targetIdx >= 0 ? sortedRuns[targetIdx] : null;
      const startAt = targetRun?.startedAt || String(runId);
      const newerRun = targetIdx > 0 ? sortedRuns[targetIdx - 1] : null;
      const endBefore = newerRun?.startedAt || null;

      // 1) Borrar del historial de Trakt los plays de este run (ventana [startAt, endBefore))
      if (trakt?.connected && type === "tv") {
        const windowData = await traktGetShowPlays({
          tmdbId: Number(id),
          startAt,
          ...(endBefore ? { endBefore } : {}),
        });

        const idsToRemove = Array.isArray(windowData?.historyIdsSince)
          ? windowData.historyIdsSince
          : [];

        if (idsToRemove.length) {
          const CHUNK = 300;
          for (let i = 0; i < idsToRemove.length; i += CHUNK) {
            await traktRemoveHistoryEntries({
              ids: idsToRemove.slice(i, i + CHUNK),
            });
          }
        }
      }

      setRewatchRuns((prev) => {
        const base = Array.isArray(prev) ? prev : [];
        const next = base.filter((r) => r?.id !== runId);
        persistRuns(next);
        return next;
      });

      const wasActive = activeEpisodesView === runId;

      setActiveEpisodesView((prev) => {
        const nextView = prev === runId ? "global" : prev;
        try {
          window.localStorage.setItem(episodesViewStorageKey, nextView);
        } catch {}
        return nextView;
      });

      if (wasActive) {
        setRewatchStartAt(null);
        await loadTraktShowPlays(null); // Volver a vista global
      }

      // 2) Refrescar estado global de episodios vistos tras limpiar historial
      if (trakt?.connected && type === "tv") {
        try {
          const fresh = await traktGetShowWatched({ tmdbId: Number(id) });
          applyWatchedBySeasonState(fresh?.watchedBySeason || {}, {
            loaded: true,
          });
        } catch {}

        try {
          if (wasActive) {
            await loadTraktShowPlays(null);
          } else {
            const windowState = resolveRewatchWindow(
              activeEpisodesViewRef.current,
              rewatchRunsRef.current,
            );
            await loadTraktShowPlays(
              windowState.startAt || null,
              windowState.endBefore || null,
            );
          }
        } catch {}
      }
    },
    [
      activeEpisodesView,
      rewatchRuns,
      trakt?.connected,
      type,
      id,
      rewatchStartAt,
      episodesViewStorageKey,
      persistRuns,
      loadTraktShowPlays,
      resolveRewatchWindow,
    ],
  );

  // Puntuacion unificada del usuario: prioriza TMDb (con decimal) sobre Trakt (redondeado)
  const unifiedUserRating =
    userRating ?? (trakt.connected && trakt.rating ? trakt.rating : null);

  // ====== RATINGS DE EPISODIOS (solo TV) ======
  const [ratings, setRatings] = useState(null); // Ratings por episodio
  const [ratingsError, setRatingsError] = useState(null);
  const [ratingsLoading, setRatingsLoading] = useState(false);
  const [seasonImdbRatings, setSeasonImdbRatings] = useState({});

  // Carga los ratings de episodios desde SeriesGraph para series TV.
  useEffect(() => {
    const RATINGS_CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 días
    const cacheKey = `showverse:tv:${id}:episode-ratings:v4-seriesgraph`;

    const readCache = () => {
      if (typeof window === "undefined") return null;
      try {
        const raw = window.localStorage.getItem(cacheKey);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed?.ts || !parsed?.data) return null;
        if (Date.now() - Number(parsed.ts) > RATINGS_CACHE_TTL_MS) return null;
        return parsed.data;
      } catch {
        return null;
      }
    };

    const writeCache = (data) => {
      if (typeof window === "undefined" || !data) return;
      try {
        window.localStorage.setItem(
          cacheKey,
          JSON.stringify({ ts: Date.now(), data }),
        );
      } catch {}
    };

    let ignore = false;
    async function load() {
      if (type !== "tv") {
        if (!ignore) {
          setRatings(null);
          setRatingsError(null);
          setRatingsLoading(false);
        }
        return;
      }

      if (!ignore) setRatingsError(null);

      const cached = readCache();
      if (cached) {
        if (!ignore) {
          setRatings(cached);
          setRatingsLoading(false);
        }
        return;
      }

      setRatingsLoading(true);
      try {
        const res = await fetch(
          `/api/seriesgraph/episode-ratings?tmdbId=${encodeURIComponent(id)}`,
        );
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error);
        if (!ignore) {
          setRatings(json);
          writeCache(json);
        }
      } catch (e) {
        if (!ignore) setRatingsError(e.message);
      } finally {
        if (!ignore) setRatingsLoading(false);
      }
    }
    load();
    return () => {
      ignore = true;
    };
  }, [id, type]);

  const visibleTraktSeasons = useMemo(() => {
    if (!Array.isArray(tSeasons?.items)) return [];
    return tSeasons.items.filter((season) => {
      const seasonNumber = getSeasonNumber(season);
      return seasonNumber != null && seasonNumber > 0;
    });
  }, [tSeasons?.items]);

  const visibleSeasonNumbers = useMemo(
    () =>
      visibleTraktSeasons
        .map((season) => getSeasonNumber(season))
        .filter((seasonNumber) => seasonNumber != null && seasonNumber > 0),
    [visibleTraktSeasons],
  );

  const visibleSeasonNumbersKey = useMemo(
    () => visibleSeasonNumbers.join(","),
    [visibleSeasonNumbers],
  );

  const seriesGraphSeasonRatings = useMemo(() => {
    const rawSeasons = Array.isArray(ratings?.seasons)
      ? ratings.seasons
      : Array.isArray(ratings)
        ? ratings
        : [];

    const map = new Map();

    rawSeasons.forEach((season) => {
      const seasonNumber = getSeasonNumber(season);
      if (seasonNumber == null || seasonNumber <= 0) return;

      const episodes = Array.isArray(season?.episodes) ? season.episodes : [];
      const values = episodes
        .map((episode) =>
          toRatingNumber(
            episode?.seriesGraphRating ??
              episode?.seriesgraphRating ??
              episode?.series_graph_rating ??
              episode?.rating ??
              episode?.vote_average,
          ),
        )
        .filter((rating) => rating != null);

      if (!values.length) return;

      const average =
        values.reduce((sum, rating) => sum + rating, 0) / values.length;
      map.set(seasonNumber, Number(average.toFixed(1)));
    });

    return map;
  }, [ratings]);

  useEffect(() => {
    if (type !== "tv" || !resolvedImdbId || !visibleSeasonNumbers.length) {
      setSeasonImdbRatings({});
      return;
    }

    let ignore = false;
    const controller = new AbortController();
    const cacheKey = `showverse:tv:${id}:season-imdb-ratings:${resolvedImdbId}`;
    const requested = new Set(visibleSeasonNumbers);

    const readCache = () => {
      if (typeof window === "undefined") return {};
      try {
        const raw = window.sessionStorage.getItem(cacheKey);
        if (!raw) return {};
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === "object" ? parsed : {};
      } catch {
        return {};
      }
    };

    const writeCache = (value) => {
      if (typeof window === "undefined") return;
      try {
        window.sessionStorage.setItem(cacheKey, JSON.stringify(value || {}));
      } catch {}
    };

    const run = async () => {
      const cached = readCache();
      const cachedForVisible = Object.fromEntries(
        Object.entries(cached).filter(([seasonNumber]) =>
          requested.has(Number(seasonNumber)),
        ),
      );

      if (!ignore) setSeasonImdbRatings(cachedForVisible);

      const missing = visibleSeasonNumbers.filter(
        (seasonNumber) =>
          !Object.prototype.hasOwnProperty.call(cached, String(seasonNumber)),
      );
      if (!missing.length) return;

      const next = { ...cached };
      let cursor = 0;
      const workerCount = Math.min(4, missing.length);

      await Promise.all(
        Array.from({ length: workerCount }, async () => {
          while (!ignore && cursor < missing.length) {
            const seasonNumber = missing[cursor++];
            try {
              const params = new URLSearchParams({
                showId: String(id),
                imdbId: resolvedImdbId,
                season: String(seasonNumber),
              });
              const res = await fetch(`/api/ratings/season?${params}`, {
                signal: controller.signal,
                cache: "no-store",
              });
              const data = await res.json().catch(() => ({}));
              const rating = res.ok ? toRatingNumber(data?.rating) : null;
              next[seasonNumber] = rating;
            } catch (error) {
              if (error?.name === "AbortError") return;
              next[seasonNumber] = null;
            }
          }
        }),
      );

      if (ignore) return;
      writeCache(next);
      setSeasonImdbRatings(
        Object.fromEntries(
          Object.entries(next).filter(([seasonNumber]) =>
            requested.has(Number(seasonNumber)),
          ),
        ),
      );
    };

    run();

    return () => {
      ignore = true;
      controller.abort();
    };
  }, [type, id, resolvedImdbId, visibleSeasonNumbersKey, visibleSeasonNumbers]);

  // =====================================================================
  // HANDLERS DE SELECCION DE ARTWORK
  // Permiten al usuario elegir poster, preview backdrop y fondo.
  // Cada seleccion se persiste en localStorage y se guarda en la API.
  // =====================================================================

  const [posterToggleBusy, setPosterToggleBusy] = useState(false); // Transicion de poster en curso

  // Selecciona un poster especifico y lo persiste
  const handleSelectPoster = (filePath) => {
    setPosterViewMode("poster");
    setPosterLayoutMode("poster");
    setSelectedPosterPath(filePath);
    if (typeof window !== "undefined") {
      filePath
        ? window.localStorage.setItem(posterStorageKey, filePath)
        : window.localStorage.removeItem(posterStorageKey);
    }
    saveArtworkOverride({ type: endpointType, id, kind: "poster", filePath });
  };

  // Selecciona un backdrop para el modo preview y lo persiste
  const handleSelectPreviewBackdrop = (filePath) => {
    setSelectedPreviewBackdropPath(filePath);
    if (typeof window !== "undefined") {
      filePath
        ? window.localStorage.setItem(previewBackdropStorageKey, filePath)
        : window.localStorage.removeItem(previewBackdropStorageKey);
    }
    saveArtworkOverride({ type: endpointType, id, kind: "backdrop", filePath });
  };

  // Selecciona una imagen de fondo con transicion crossfade suave
  const handleSelectBackground = (filePath) => {
    // Guardar la imagen anterior para el fade
    setPrevBackgroundPath(
      selectedBackgroundPath || baseBackdropPath || data?.backdrop_path,
    );
    setIsTransitioning(true);

    setSelectedBackgroundPath(filePath);
    if (typeof window !== "undefined") {
      filePath
        ? window.localStorage.setItem(backgroundStorageKey, filePath)
        : window.localStorage.removeItem(backgroundStorageKey);
    }
    saveArtworkOverride({
      type: endpointType,
      id,
      kind: "background",
      filePath,
    });

    // Terminar transicion de crossfade despues de 600ms
    setTimeout(() => {
      setIsTransitioning(false);
      setPrevBackgroundPath(null);
    }, 600);
  };

  // Resetea todas las selecciones de artwork a los valores por defecto
  const handleResetArtwork = () => {
    setSelectedPosterPath(null);
    setSelectedPreviewBackdropPath(null);
    setSelectedBackgroundPath(null);
    setPosterViewMode("poster");
    setPosterLayoutMode("poster");
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(posterStorageKey);
      window.localStorage.removeItem(previewBackdropStorageKey);
      window.localStorage.removeItem(backgroundStorageKey);
    }
    saveArtworkOverride({
      type: endpointType,
      id,
      kind: "poster",
      filePath: null,
    });
    saveArtworkOverride({
      type: endpointType,
      id,
      kind: "backdrop",
      filePath: null,
    });
    saveArtworkOverride({
      type: endpointType,
      id,
      kind: "background",
      filePath: null,
    });
  };

  /**
   * Alterna entre poster y preview sin bloquear la UI.
   * Precarga ambas variantes por adelantado y deja que el crossfade
   * y el cambio de aspect-ratio ocurran a la vez para que el gesto se sienta inmediato.
   */
  const handleCyclePoster = useCallback(() => {
    const posterPath =
      asTmdbPath(selectedPosterPath) ||
      asTmdbPath(basePosterPath) ||
      asTmdbPath(data?.profile_path) ||
      null;

    const previewPath =
      asTmdbPath(selectedPreviewBackdropPath) ||
      asTmdbPath(previewBackdropFallback) ||
      null;

    if (!posterPath || !previewPath) return;

    const currentMode = posterRequestedModeRef.current || posterViewMode;
    const nextMode = currentMode === "preview" ? "poster" : "preview";
    const targetPath = nextMode === "preview" ? previewPath : posterPath;
    const lowSize = nextMode === "preview" ? "w780" : "w342";
    const highSize = nextMode === "preview" ? "w1280" : "w780";

    const seq = (posterToggleSeqRef.current += 1);
    posterRequestedModeRef.current = nextMode;
    setPosterToggleBusy(true);

    void preloadTmdb(targetPath, lowSize);
    void preloadTmdb(targetPath, highSize);

    const applyMode = () => {
      if (
        posterToggleSeqRef.current !== seq ||
        posterRequestedModeRef.current !== nextMode
      ) {
        return;
      }

      setPosterLayoutMode(nextMode);
      setPosterViewMode(nextMode);

      window.setTimeout(() => {
        if (posterToggleSeqRef.current === seq) {
          setPosterToggleBusy(false);
        }
      }, 180);
    };

    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(applyMode);
    } else {
      applyMode();
    }
  }, [
    selectedPosterPath,
    basePosterPath,
    data?.profile_path,
    selectedPreviewBackdropPath,
    previewBackdropFallback,
    posterViewMode,
  ]);

  // Persistir el modo de vista globalmente y sincronizar layoutMode
  useEffect(() => {
    if (typeof window === "undefined" || !posterModeHydrated) return;
    try {
      window.localStorage.setItem(globalViewModeStorageKey, posterViewMode);
      // Sincronizar layoutMode cuando posterViewMode cambie (excepto durante transiciones)
      // Esto asegura que ambos estados estén alineados después de navegaciones
      if (!posterToggleBusy) {
        setPosterLayoutMode(posterViewMode);
      }
    } catch {}
  }, [
    posterViewMode,
    globalViewModeStorageKey,
    posterToggleBusy,
    posterModeHydrated,
  ]);

  // Copia la URL original de una imagen de TMDb al portapapeles
  const handleCopyImageUrl = async (filePath) => {
    const url = buildOriginalImageUrl(filePath);
    try {
      navigator?.clipboard?.writeText
        ? await navigator.clipboard.writeText(url)
        : window.prompt("Copiar URL:", url);
    } catch {
      window.prompt("Copiar URL:", url);
    }
  };

  // -- Navegacion por scroll horizontal de la galeria de imagenes --
  const updateImagesNav = () => {
    const el = imagesScrollRef.current;
    if (!el) return;
    const { scrollLeft, scrollWidth, clientWidth } = el;
    const hasOverflow = scrollWidth > clientWidth + 1;
    setCanPrevImages(hasOverflow && scrollLeft > 0);
    setCanNextImages(hasOverflow && scrollLeft + clientWidth < scrollWidth - 1);
  };
  const handleImagesScroll = () => updateImagesNav();
  const handlePrevImagesClick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    imagesScrollRef.current?.scrollBy({ left: -400, behavior: "smooth" });
  };
  const handleNextImagesClick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    imagesScrollRef.current?.scrollBy({ left: 400, behavior: "smooth" });
  };
  useEffect(() => {
    updateImagesNav();
    window.addEventListener("resize", updateImagesNav);
    return () => window.removeEventListener("resize", updateImagesNav);
  }, [imagesState, activeImagesTab]);

  const showPrevImages = isHoveredImages && canPrevImages;
  const showNextImages = isHoveredImages && canNextImages;

  // =====================================================================
  // ENLACES EXTERNOS
  // URLs a sitios externos: JustWatch, Letterboxd,
  // SeriesGraph, sitio oficial. Se resuelven via API para obtener
  // URLs directas (no de busqueda) cuando es posible.
  // =====================================================================

  const [externalLinksOpen, setExternalLinksOpen] = useState(false); // Modal de enlaces externos abierto

  const isMovie = endpointType === "movie";

  // URL de SeriesGraph (solo para series TV)
  const seriesGraphUrl =
    type === "tv" && data?.id && (data.name || data.original_name)
      ? `https://seriesgraph.com/show/${data.id}-${slugifyForSeriesGraph(
          data.original_name || data.name,
        )}`
      : null;

  const [traktHomepage, setTraktHomepage] = useState(null);

  const tmdbOfficialSiteUrl = useMemo(
    () => normalizeUrl(data?.homepage),
    [data?.homepage],
  );
  const [officialSiteUrl, setOfficialSiteUrl] = useState(tmdbOfficialSiteUrl);

  // reset al cambiar de item (deja el de TMDb como fallback)
  useEffect(() => {
    setOfficialSiteUrl(tmdbOfficialSiteUrl);
  }, [tmdbOfficialSiteUrl, id]);

  const canLoadOfficialSite = endpointType !== "tv" || traktDeferredReady;

  // pedir official site a Trakt (si existe, pisa el de TMDb)
  useEffect(() => {
    if (!id) return;
    if (!canLoadOfficialSite) return;

    const ac = new AbortController();

    (async () => {
      try {
        const r = await fetch(
          `/api/trakt/official-site?type=${endpointType}&tmdbId=${encodeURIComponent(id)}`,
          {
            signal: ac.signal,
            cache: "no-store",
          },
        );
        const j = await r.json().catch(() => ({}));
        if (!r.ok) return;
        const u = normalizeUrl(j?.url);
        if (u) setOfficialSiteUrl(u);
      } catch {
        // ignore
      }
    })();

    return () => ac.abort();
  }, [id, endpointType, canLoadOfficialSite]);

  const justWatchUrl = title
    ? `https://www.justwatch.com/es/buscar?q=${encodeURIComponent(title)}`
    : null;

  const letterboxdUrl =
    isMovie && title
      ? resolvedImdbId
        ? `https://letterboxd.com/imdb/${encodeURIComponent(resolvedImdbId)}/`
        : `https://letterboxd.com/search/${encodeURIComponent(title)}/`
      : null;

  // ====== External links (resolved) ======
  const [extLinks, setExtLinks] = useState({
    justwatch: null,
    letterboxd: null,
    loadingJW: false,
    loadingLB: false,
    errorJW: "",
    errorLB: "",
  });

  async function fetchResolvedLink(url, { signal } = {}) {
    const r = await fetch(url, { signal, cache: "no-store" });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j?.error || `Request failed: ${r.status}`);
    return j?.url || null;
  }

  const jwCacheKey = useMemo(
    () => `showverse:jw:${endpointType}:${id}:${(yearIso || "").trim()}`,
    [endpointType, id, yearIso],
  );

  // 1) Hidratar desde cache para que el icono salga instantaneo en visitas posteriores
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const cached = window.localStorage.getItem(jwCacheKey);
      if (cached) {
        setExtLinks((p) => ({ ...p, justwatch: cached || null }));
      }
    } catch {}
  }, [jwCacheKey]);

  useEffect(() => {
    // Si no hay title, reseteamos estado y cache
    if (!title) {
      setExtLinks((p) => ({
        ...p,
        justwatch: null,
        loadingJW: false,
        errorJW: "",
      }));
      try {
        if (typeof window !== "undefined")
          window.localStorage.removeItem(jwCacheKey);
      } catch {}
      return;
    }

    const ac = new AbortController();

    const run = async () => {
      // Importante: marcamos loading pero NO ponemos justwatch:null (asi no "parpadea")
      setExtLinks((p) => ({ ...p, loadingJW: true, errorJW: "" }));

      try {
        const country = "es";

        const watchnow =
          watchLink &&
          typeof watchLink === "string" &&
          !watchLink.includes("themoviedb.org")
            ? watchLink
            : null;

        const qs = new URLSearchParams();
        qs.set("country", country);
        if (yearIso) qs.set("year", yearIso);

        if (watchnow) qs.set("watchnow", watchnow);
        else qs.set("title", title);

        const resolved = await fetchResolvedLink(
          `/api/links/justwatch?${qs.toString()}`,
          {
            signal: ac.signal,
          },
        );

        if (ac.signal.aborted) return;

        setExtLinks((p) => ({
          ...p,
          justwatch: resolved || null,
          loadingJW: false,
          errorJW: "",
        }));

        // Cache: para que en siguientes visitas salga instantaneo
        try {
          if (typeof window !== "undefined") {
            if (resolved) window.localStorage.setItem(jwCacheKey, resolved);
            else window.localStorage.removeItem(jwCacheKey);
          }
        } catch {}
      } catch (e) {
        if (ac.signal.aborted) return;
        setExtLinks((p) => ({
          ...p,
          loadingJW: false,
          errorJW: e?.message || "Error",
        }));

        // (opcional) si falla, no machacamos cache automáticamente
        // si quieres limpiar cache al fallar:
        // try { if (typeof window !== 'undefined') window.localStorage.removeItem(jwCacheKey) } catch {}
      }
    };

    run();
    return () => ac.abort();
  }, [title, watchLink, yearIso, jwCacheKey]);

  useEffect(() => {
    if (!title && !resolvedImdbId) {
      setExtLinks((p) => ({
        ...p,
        letterboxd: null,
        loadingLB: false,
        errorLB: "",
      }));
      return;
    }

    const ac = new AbortController();

    const run = async () => {
      setExtLinks((p) => ({ ...p, loadingLB: true, errorLB: "" }));

      try {
        const qs = new URLSearchParams();
        if (resolvedImdbId) qs.set("imdb", resolvedImdbId);
        else if (title) qs.set("title", title);

        const resolved = await fetchResolvedLink(
          `/api/links/letterboxd?${qs.toString()}`,
          {
            signal: ac.signal,
          },
        );

        setExtLinks((p) => ({
          ...p,
          letterboxd: resolved || null,
          loadingLB: false,
        }));
      } catch (e) {
        if (ac.signal.aborted) return;
        setExtLinks((p) => ({
          ...p,
          loadingLB: false,
          errorLB: e?.message || "Error",
        }));
      }
    };

    run();
    return () => ac.abort();
  }, [title, resolvedImdbId]);

  const jwHref = justwatchUrl || extLinks.justwatch || null;

  const externalLinks = useMemo(() => {
    const items = [];

    if (officialSiteUrl)
      items.push({
        id: "web",
        label: "Web oficial",
        icon: "/logo-Web.png",
        href: officialSiteUrl,
      });
    if (jwHref)
      items.push({
        id: "jw",
        label: "JustWatch",
        icon: "/logo-JustWatch.png",
        href: jwHref,
      });

    // Letterboxd SOLO movies
    if (isMovie && letterboxdUrl)
      items.push({
        id: "lb",
        label: "Letterboxd",
        icon: "/logo-Letterboxd.png",
        href: letterboxdUrl,
      });

    if (type === "tv" && seriesGraphUrl)
      items.push({
        id: "sg",
        label: "SeriesGraph",
        icon: "/logoseriesgraph.png",
        href: seriesGraphUrl,
      });

    items.push({
      id: "fa",
      label: "FilmAffinity",
      icon: "/logoFilmaffinity.png",
      href: filmAffinitySearchUrl,
    });

    return items;
  }, [
    officialSiteUrl,
    justWatchUrl,
    extLinks.justwatch,
    isMovie,
    letterboxdUrl,
    type,
    seriesGraphUrl,
    filmAffinitySearchUrl,
  ]);

  // ====== Datos meta / características (reorganizadas) ======
  const directorsOrCreators =
    type === "movie"
      ? data.credits?.crew?.filter((c) => c.job === "Director") || []
      : data.created_by || [];

  const directorNames =
    type === "movie" && directorsOrCreators.length
      ? directorsOrCreators.map((d) => d.name).join(", ")
      : null;

  const createdByNames =
    type === "tv" && directorsOrCreators.length
      ? directorsOrCreators.map((d) => d.name).join(", ")
      : null;

  const production =
    data.production_companies
      ?.slice(0, 3)
      .map((c) => c.name)
      .join(", ") || null;

  const hasProduction = !!production;
  const hasAwards = !!extras?.awards;
  const awardItems = useMemo(
    () => sortAwardItemsForDisplay(flattenAwardItems(extras?.awardsDetails)),
    [extras?.awardsDetails],
  );
  const hasAwardItems = awardItems.length > 0;

  const countries = (() => {
    const pc = Array.isArray(data.production_countries)
      ? data.production_countries
      : [];
    if (pc.length)
      return (
        pc
          .map((c) => c.iso_3166_1)
          .filter(Boolean)
          .join(", ") || null
      );
    const oc = Array.isArray(data.origin_country) ? data.origin_country : [];
    return oc.length ? oc.join(", ") : null;
  })();

  const languages =
    data.spoken_languages
      ?.map((l) => l.english_name || l.name)
      .filter(Boolean)
      .join(", ") ||
    (Array.isArray(data.languages) ? data.languages.join(", ") : null);

  const network =
    type === "tv"
      ? data.networks?.[0]?.name || data.networks?.[0]?.original_name || null
      : null;

  const releaseDateLabel = type === "movie" ? "Estreno" : "Primera emisión";

  const releaseDateValue =
    type === "movie"
      ? formatDateEs(data.release_date)
      : formatDateEs(data.first_air_date);

  const lastAirDateValue =
    type === "tv" ? formatDateEs(data.last_air_date) : null;

  const runtimeValue =
    type === "movie" ? formatRuntimeMinutes(data.runtime) : null;

  const episodeRuntimeValue = type === "tv" ? formatEpisodeRuntime(data) : null;

  const displayRuntimeValue = runtimeValue || episodeRuntimeValue;

  const budgetValue =
    type === "movie" && data.budget > 0
      ? `$${(data.budget / 1_000_000).toFixed(1)}M`
      : null;

  const revenueValue =
    type === "movie" && data.revenue > 0
      ? `$${(data.revenue / 1_000_000).toFixed(1)}M`
      : null;

  // Director (movie) - fallback si data no trae credits
  const [movieDirector, setMovieDirector] = useState(() =>
    formatCreditNames(getMovieDirectorsFromCrew(data?.credits?.crew)),
  );
  const [movieDirectorsCrew, setMovieDirectorsCrew] = useState(() =>
    getMovieDirectorsFromCrew(data?.credits?.crew),
  );
  const [movieDirectorLoading, setMovieDirectorLoading] = useState(false);

  useEffect(() => {
    const isMovie = type === "movie";
    if (!isMovie || !id) {
      setMovieDirectorsCrew([]);
      setMovieDirector(null);
      setMovieDirectorLoading(false);
      return;
    }

    // 1) CASO A: Si ya vienen credits en "data" (Server Side)
    const crew = data?.credits?.crew;
    if (Array.isArray(crew) && crew.length) {
      const dirsCrew = getMovieDirectorsFromCrew(crew);

      setMovieDirectorsCrew(dirsCrew);
      // FIX: Actualizamos tambien el string del nombre aqui
      setMovieDirector(formatCreditNames(dirsCrew));
      setMovieDirectorLoading(false);
      return;
    }

    // 2) CASO B: Si no vienen, pide credits a la API (Client Side Fallback)
    const ac = new AbortController();
    let alive = true;
    setMovieDirectorLoading(true);

    (async () => {
      try {
        const res = await fetch(`/api/tmdb/movies/${id}/credits`, {
          signal: ac.signal,
          cache: "no-store",
        });
        const json = await res.json().catch(() => ({}));
        if (!alive) return;
        if (!res.ok) {
          setMovieDirectorsCrew([]);
          setMovieDirector(null);
          setMovieDirectorLoading(false);
          return;
        }

        const dirsCrew = getMovieDirectorsFromCrew(json?.crew);

        setMovieDirectorsCrew(dirsCrew);
        // FIX: Actualizamos tambien el string del nombre tras el fetch
        setMovieDirector(formatCreditNames(dirsCrew));
      } catch (e) {
        if (alive && e?.name !== "AbortError") {
          setMovieDirectorsCrew([]);
          setMovieDirector(null);
        }
      } finally {
        if (alive) setMovieDirectorLoading(false);
      }
    })();

    return () => {
      alive = false;
      ac.abort();
    };
  }, [type, id, data?.credits?.crew]);

  const [tvCreators, setTvCreators] = useState(() =>
    Array.isArray(data?.created_by) ? data.created_by : [],
  );
  const [tvCreatorsLoading, setTvCreatorsLoading] = useState(false);

  useEffect(() => {
    const isTv = type === "tv";
    if (!isTv || !id) {
      setTvCreators([]);
      setTvCreatorsLoading(false);
      return;
    }

    // 1) Si ya viene created_by en "data", úsalo
    const creators = data?.created_by;
    if (Array.isArray(creators) && creators.length) {
      setTvCreators(creators);
      setTvCreatorsLoading(false);
      return;
    }

    // 2) Si no viene, pide details a tu API route (ajusta la ruta si difiere)
    const ac = new AbortController();
    let alive = true;
    setTvCreatorsLoading(true);

    (async () => {
      try {
        const res = await fetch(`/api/tmdb/tv/${id}`, {
          signal: ac.signal,
          cache: "no-store",
        });
        const json = await res.json().catch(() => ({}));
        if (!alive) return;
        if (!res.ok) {
          setTvCreators([]);
          setTvCreatorsLoading(false);
          return;
        }

        setTvCreators(Array.isArray(json?.created_by) ? json.created_by : []);
      } catch (e) {
        if (alive && e?.name !== "AbortError") setTvCreators([]);
      } finally {
        if (alive) setTvCreatorsLoading(false);
      }
    })();

    return () => {
      alive = false;
      ac.abort();
    };
  }, [type, id, data?.created_by]);

  // Menu global (nuevo)

  const [activeSection, setActiveSection] = useState(() => null);

  // Cuando cambie type, fijar una seccion inicial valida
  useEffect(() => {
    setActiveSection(null);
  }, [type, id]);

  // Dentro del componente:
  const postersCount = imagesState?.posters?.length || 0;
  const backdropsCount = imagesState?.backdrops?.length || 0;
  const videosCount = videos?.length || 0;
  const mediaCount = sumCount(postersCount, backdropsCount, videosCount);

  // Trakt comments + TMDb reviews (para el badge tipo "448+4")
  const traktCommentsCount = Number(tComments?.total || 0);
  const reviewsCount = Array.isArray(reviews) ? reviews.length : 0;
  const commentsCount = mixedCount(traktCommentsCount, reviewsCount);

  // Otros counts
  const listsCount = Array.isArray(tLists?.items) ? tLists.items.length : 0;
  const castCount = Array.isArray(castData) ? castData.length : 0;
  const recsCount = Array.isArray(recommendations) ? recommendations.length : 0;

  const [isSwitchingSection, startSectionTransition] = useTransition();

  const handleSectionChange = useCallback((nextId) => {
    startSectionTransition(() => {
      setActiveSection((cur) => (cur === nextId ? null : nextId));
    });
  }, []);

  const traktDecimal = useMemo(() => {
    if (tScoreboard.rating == null) return null;
    const v = Number(tScoreboard.rating); // Trakt ya viene 0..10
    if (!Number.isFinite(v) || v <= 0) return null;
    return v.toFixed(1); // punto
  }, [tScoreboard.rating]);

  // =====================================================
  // CAST: mantener orden TMDb + evitar cast incompleto
  // =====================================================
  const [tmdbCast, setTmdbCast] = useState([]);
  const [tmdbCastLoading, setTmdbCastLoading] = useState(false);
  const [tmdbCastError, setTmdbCastError] = useState("");

  const pickBestRoleName = (roles) => {
    const arr = Array.isArray(roles) ? roles : [];
    if (!arr.length) return "";
    // coge el rol con más episodios (suele ser el “principal”)
    const best = [...arr].sort(
      (a, b) => Number(b?.episode_count || 0) - Number(a?.episode_count || 0),
    )[0];
    return best?.character || "";
  };

  const normalizeCastFromTmdb = (raw = [], { isAggregate = false } = {}) => {
    const list = Array.isArray(raw) ? raw : [];

    // normaliza a tu shape: { id, name, profile_path, character, order }
    const normalized = list
      .filter((p) => p?.id && p?.name)
      .map((p, idx) => {
        const order = Number.isFinite(Number(p?.order))
          ? Number(p.order)
          : Number.isFinite(Number(p?.cast_id))
            ? Number(p.cast_id)
            : idx;

        const character =
          p?.character || (isAggregate ? pickBestRoleName(p?.roles) : "") || "";

        return {
          ...p,
          character,
          order,
        };
      });

    // dedup por id respetando el PRIMER aparecido (que ya viene en orden TMDb)
    const seen = new Set();
    const unique = [];
    for (const item of normalized) {
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      unique.push(item);
    }

    // orden TMDb: por `order` asc
    unique.sort((a, b) => (a.order ?? 1e9) - (b.order ?? 1e9));
    return unique;
  };

  useEffect(() => {
    let ignore = false;
    const ac = new AbortController();

    const fetchJson = async (url) => {
      const r = await fetch(url, { signal: ac.signal, cache: "no-store" });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.status_message || `TMDb ${r.status}`);
      return j;
    };

    const run = async () => {
      // fallback: si no hay apiKey, nos quedamos con castData
      if (
        !TMDB_API_KEY ||
        !id ||
        (endpointType !== "tv" && endpointType !== "movie")
      ) {
        setTmdbCast([]);
        setTmdbCastError("");
        setTmdbCastLoading(false);
        return;
      }

      setTmdbCastLoading(true);
      setTmdbCastError("");

      try {
        if (endpointType === "tv") {
          // 1) aggregate_credits (lo más parecido a lo que ves en TMDb web)
          const aggUrl = `https://api.themoviedb.org/3/tv/${id}/aggregate_credits?api_key=${TMDB_API_KEY}`;
          const agg = await fetchJson(aggUrl);
          const aggCast = normalizeCastFromTmdb(agg?.cast, {
            isAggregate: true,
          });

          // 2) fallback a credits si aggregate viene raro/vacío
          if (!aggCast.length) {
            const url = `https://api.themoviedb.org/3/tv/${id}/credits?api_key=${TMDB_API_KEY}`;
            const j = await fetchJson(url);
            const c = normalizeCastFromTmdb(j?.cast, { isAggregate: false });
            if (!ignore) setTmdbCast(c);
          } else {
            if (!ignore) setTmdbCast(aggCast);
          }
        } else {
          // movie credits
          const url = `https://api.themoviedb.org/3/movie/${id}/credits?api_key=${TMDB_API_KEY}`;
          const j = await fetchJson(url);
          const c = normalizeCastFromTmdb(j?.cast, { isAggregate: false });
          if (!ignore) setTmdbCast(c);
        }
      } catch (e) {
        if (!ignore) {
          setTmdbCast([]);
          setTmdbCastError(e?.message || "Error cargando reparto en TMDb");
        }
      } finally {
        if (!ignore) setTmdbCastLoading(false);
      }
    };

    run();
    return () => {
      ignore = true;
      ac.abort();
    };
  }, [id, endpointType]);

  const creativeCreditsForUI = useMemo(() => {
    const source =
      type === "movie" ? movieDirectorsCrew : type === "tv" ? tvCreators : [];

    const role = type === "movie" ? "Director" : "Creador";

    return (Array.isArray(source) ? source : [])
      .filter((person) => person?.id && person?.name)
      .map((person, idx) => ({
        ...person,
        character: person?.job || role,
        order: -1000 + idx,
      }));
  }, [type, movieDirectorsCrew, tvCreators]);

  const castDataForUI = useMemo(() => {
    // 1) Base cast: preferimos TMDb (más completo); si no, usamos castData tal cual
    const base =
      Array.isArray(tmdbCast) && tmdbCast.length
        ? tmdbCast
        : Array.isArray(castData)
          ? castData
          : [];

    const creativeIds = new Set(
      creativeCreditsForUI.map((person) => person?.id).filter(Boolean),
    );

    // 3) ¿Hay order real en el base? (si viene de TMDb normalmente sí)
    const baseHasOrder = base.some((p) => Number.isFinite(Number(p?.order)));

    // 4) Normalizamos base: filtramos y garantizamos un order numérico
    const normalizedBase = base
      .filter((p) => p?.id && p?.name)
      .filter((p) => !creativeIds.has(p.id))
      .map((p, idx) => ({
        ...p,
        order: Number.isFinite(Number(p?.order))
          ? Number(p.order)
          : baseHasOrder
            ? 1000 + idx
            : idx, // si hay order, los sin order al final
      }));

    // 5) Unimos director/creador primero y reparto después, manteniendo el
    // mismo diseño de tarjeta para toda la fila.
    const seen = new Set();
    const mergedUnique = [];

    for (const item of [...creativeCreditsForUI, ...normalizedBase]) {
      if (!item?.id) continue;
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      mergedUnique.push(item);
    }

    // 6) Si el cast base tiene order, ordenamos por order (extras quedan arriba por order negativo)
    if (baseHasOrder) {
      mergedUnique.sort((a, b) => (a.order ?? 1e9) - (b.order ?? 1e9));
    }

    return mergedUnique;
  }, [tmdbCast, castData, creativeCreditsForUI]);

  const creativeCreditsLoading =
    (type === "movie" && movieDirectorLoading) ||
    (type === "tv" && tvCreatorsLoading);

  const castSectionLoading = creativeCreditsLoading || tmdbCastLoading;

  const sectionItems = useMemo(() => {
    const items = [];

    // Reparto
    items.push({
      id: "cast",
      label: "Reparto",
      icon: Users,
      count: castDataForUI?.length ? castDataForUI.length : undefined,
      loading: castSectionLoading,
    });

    // Recomendaciones
    items.push({
      id: "recs",
      label: "Recomendaciones",
      icon: MonitorPlay,
      count: Array.isArray(recommendations)
        ? recommendations.length
        : undefined,
    });

    // Premios
    if (awardsLoading || hasAwardItems) {
      items.push({
        id: "awards",
        label: "Premios",
        icon: Trophy,
        count: awardItems.length || undefined,
        loading: awardsLoading,
      });
    }

    // Coleccion
    if (collectionId) {
      items.push({
        id: "collection",
        label: "Colección",
        icon: Layers,
        count: collectionData?.items?.length || undefined,
        loading: collectionLoading && !collectionData,
      });
    }

    // Media = Imagenes + Videos (unificado)
    const postersCount = imagesState?.posters?.length || 0;
    const backdropsCount = imagesState?.backdrops?.length || 0;
    const videosCount = Array.isArray(videos) ? videos.length : 0;
    const mediaCount = postersCount + backdropsCount + videosCount;

    items.push({
      id: "media",
      label: "Media",
      icon: ImageIcon,
      count: mediaCount || undefined,
    });

    // Sentimientos
    items.push({
      id: "sentiment",
      label: "Sentimientos",
      icon: Sparkles,
    });

    // TV: Temporadas
    if (type === "tv") {
      items.push({
        id: "seasons",
        label: "Temporadas",
        icon: Layers,
        count: visibleTraktSeasons.length || undefined,
      });
      // TV: Episodios
      items.push({
        id: "episodes",
        label: "Episodios",
        icon: TrendingUp,
        // si no tienes "ratings.length", puedes dejar count undefined
        count: Array.isArray(ratings) ? ratings.length : undefined,
      });
    }

    // Comentarios = Trakt + Criticas (unificado)
    const traktCommentsCount = Number(tComments?.total || 0) || 0;
    const reviewsCount = Array.isArray(reviews) ? reviews.length : 0;
    const commentsCount = traktCommentsCount + reviewsCount;

    items.push({
      id: "comments",
      label: "Comentarios",
      icon: MessageSquareIcon,
      count: commentsCount || undefined,
    });

    // Listas
    items.push({
      id: "lists",
      label: "Listas",
      icon: ListVideo,
      count: Array.isArray(tLists?.items) ? tLists.items.length : undefined,
    });

    return items;
  }, [
    type,
    ratings,
    imagesState?.posters,
    imagesState?.backdrops,
    videos,
    tComments?.total,
    reviews,
    visibleTraktSeasons.length,
    tLists?.items,
    castDataForUI,
    castSectionLoading,
    recommendations,
    awardsLoading,
    hasAwardItems,
    awardItems.length,
    collectionId,
    collectionData,
    collectionLoading,
  ]);

  // Menu global (scroll + sticky + spy)
  const STICKY_TOP = 72; // ajusta si tu navbar mide otra cosa (px)

  const sentinelRef = useRef(null);
  const menuStickyRef = useRef(null);
  const sectionElsRef = useRef({});
  const pendingSectionRef = useRef(null);
  const pendingSectionTimerRef = useRef(null);
  const pendingScrollEndCleanupRef = useRef(null);

  const [menuCompact, setMenuCompact] = useState(false);
  const [menuH, setMenuH] = useState(0);
  const [activeSectionId, setActiveSectionId] = useState(null);

  const priorityCastResolved = !castSectionLoading;
  const priorityRecommendationsResolved = priorityCastResolved;
  const priorityAwardsResolved =
    priorityRecommendationsResolved && !awardsLoading;
  const priorityCollectionResolved =
    priorityAwardsResolved && (!collectionId || !collectionLoading);
  const canRenderRecommendations = priorityCastResolved;
  const canRenderAwards = priorityRecommendationsResolved && !awardsLoading;
  const canRenderCollection = priorityAwardsResolved && !!collectionId;
  const canRenderLowerPrioritySections = priorityCollectionResolved;

  const registerSection = useCallback(
    (sid) => (el) => {
      if (el) sectionElsRef.current[sid] = el;
    },
    [],
  );

  useEffect(() => {
    if (!menuStickyRef.current) return;
    const el = menuStickyRef.current;

    const update = () => setMenuH(el.getBoundingClientRect().height || 0);
    update();

    const ro = new ResizeObserver(() => update());
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!sentinelRef.current) return;

    const io = new IntersectionObserver(
      ([entry]) => {
        // cuando el sentinel deja de verse => el menú ya está “pegado”
        setMenuCompact(!entry.isIntersecting);
      },
      {
        threshold: 0,
        root: null,
        rootMargin: `-${STICKY_TOP}px 0px 0px 0px`,
      },
    );

    io.observe(sentinelRef.current);
    return () => io.disconnect();
  }, []);

  const scrollToSection = useCallback(
    (sid) => {
      const el =
        sectionElsRef.current[sid] || document.getElementById(`section-${sid}`);
      if (!el) return;

      const offset = STICKY_TOP + (menuH || 0) + 10;
      const y = window.scrollY + el.getBoundingClientRect().top - offset;

      if (pendingScrollEndCleanupRef.current) {
        pendingScrollEndCleanupRef.current();
        pendingScrollEndCleanupRef.current = null;
      }
      if (pendingSectionTimerRef.current) {
        window.clearTimeout(pendingSectionTimerRef.current);
        pendingSectionTimerRef.current = null;
      }

      pendingSectionRef.current = sid;
      setActiveSectionId(sid);

      const releasePending = () => {
        if (pendingSectionRef.current === sid) {
          pendingSectionRef.current = null;
          setActiveSectionId((prev) => (prev === sid ? prev : sid));
        }
        if (pendingSectionTimerRef.current) {
          window.clearTimeout(pendingSectionTimerRef.current);
          pendingSectionTimerRef.current = null;
        }
        if (pendingScrollEndCleanupRef.current) {
          pendingScrollEndCleanupRef.current();
          pendingScrollEndCleanupRef.current = null;
        }
      };

      window.addEventListener("scrollend", releasePending, { once: true });
      pendingScrollEndCleanupRef.current = () => {
        window.removeEventListener("scrollend", releasePending);
      };
      pendingSectionTimerRef.current = window.setTimeout(releasePending, 1800);

      window.scrollTo({ top: Math.max(0, y), behavior: "smooth" });
    },
    [menuH],
  );

  // Scroll-spy (qué sección está “activa”)
  useEffect(() => {
    if (typeof window === "undefined") return;
    let raf = 0;

    const getSectionElements = () =>
      (sectionItems || [])
        .map((x) => x?.id)
        .filter(Boolean)
        .map((sid) => ({
          id: sid,
          el:
            sectionElsRef.current[sid] ||
            document.getElementById(`section-${sid}`),
        }))
        .filter((item) => item.el);

    const updateActiveSection = () => {
      raf = 0;
      const sections = getSectionElements();
      if (!sections.length) return;

      const offset = STICKY_TOP + (menuH || 0) + 10;
      const pendingId = pendingSectionRef.current;

      if (pendingId) {
        setActiveSectionId((prev) => (prev === pendingId ? prev : pendingId));
        return;
      }

      const probeY = window.scrollY + offset + 16;
      let next = sections[0].id;

      for (const { id, el } of sections) {
        const top = window.scrollY + el.getBoundingClientRect().top;
        if (top <= probeY) next = id;
        else break;
      }

      setActiveSectionId((prev) => (prev === next ? prev : next));
    };

    const requestUpdate = () => {
      if (raf) return;
      raf = window.requestAnimationFrame(updateActiveSection);
    };

    requestUpdate();
    window.addEventListener("scroll", requestUpdate, { passive: true });
    window.addEventListener("resize", requestUpdate);

    return () => {
      if (raf) window.cancelAnimationFrame(raf);
      window.removeEventListener("scroll", requestUpdate);
      window.removeEventListener("resize", requestUpdate);
      if (pendingSectionTimerRef.current) {
        window.clearTimeout(pendingSectionTimerRef.current);
        pendingSectionTimerRef.current = null;
      }
      if (pendingScrollEndCleanupRef.current) {
        pendingScrollEndCleanupRef.current();
        pendingScrollEndCleanupRef.current = null;
      }
    };
  }, [sectionItems, menuH]);

  useEffect(() => {
    if (!Array.isArray(sectionItems) || sectionItems.length === 0) return;
    if (activeSection == null) return;
    if (!sectionItems.some((it) => it.id === activeSection)) {
      setActiveSection(null);
    }
  }, [sectionItems, activeSection]);

  useLayoutEffect(() => {
    if (typeof window === "undefined") return;

    let raf = 0;
    raf = window.requestAnimationFrame(() => {
      const contentEl = contentTopRef.current;
      if (!contentEl) {
        window.scrollTo({ top: 0, left: 0, behavior: "auto" });
        return;
      }

      const navHeight =
        document.querySelector("nav")?.getBoundingClientRect().height || 64;
      const nextTop =
        window.scrollY + contentEl.getBoundingClientRect().top - navHeight;

      window.scrollTo({
        top: Math.max(0, nextTop),
        left: 0,
        behavior: "auto",
      });
    });

    return () => {
      if (raf) window.cancelAnimationFrame(raf);
    };
  }, [type, id]);

  // =====================================================
  // IMDb para recomendaciones: solo hover (no auto)
  // =====================================================
  const [recImdbRatings, setRecImdbRatings] = useState({});
  const recImdbRatingsRef = useRef({});
  const recImdbInFlightRef = useRef(new Set());
  const recImdbTimersRef = useRef({});
  const recImdbIdCacheRef = useRef({});
  const [recAccountStates, setRecAccountStates] = useState({});

  useEffect(() => {
    recImdbRatingsRef.current = recImdbRatings;
  }, [recImdbRatings]);

  useEffect(() => {
    // reset al cambiar de item
    setRecImdbRatings({});
    recImdbInFlightRef.current = new Set();
    recImdbTimersRef.current = {};
    recImdbIdCacheRef.current = {};
  }, [id, type]);

  useEffect(() => {
    let cancelled = false;

    const loadRecommendationStates = async () => {
      if (!session || !account?.id || !Array.isArray(recommendations)) {
        setRecAccountStates({});
        return;
      }

      const visibleRecs = recommendations.slice(0, 15).filter((rec) => rec?.id);
      if (visibleRecs.length === 0) {
        setRecAccountStates({});
        return;
      }

      try {
        const entries = await Promise.all(
          visibleRecs.map(async (rec) => {
            const mediaType =
              rec.media_type === "movie" || rec.media_type === "tv"
                ? rec.media_type
                : type === "tv"
                  ? "tv"
                  : "movie";
            const key = `${mediaType}:${rec.id}`;
            try {
              const st = await getMediaAccountStates(
                mediaType,
                rec.id,
                session,
              );
              return [
                key,
                {
                  favorite: !!st?.favorite,
                  watchlist: !!st?.watchlist,
                  rating:
                    st?.rated && typeof st.rated.value === "number"
                      ? st.rated.value
                      : null,
                },
              ];
            } catch {
              return [key, { favorite: false, watchlist: false, rating: null }];
            }
          }),
        );

        if (!cancelled) {
          setRecAccountStates(Object.fromEntries(entries));
        }
      } catch {
        if (!cancelled) setRecAccountStates({});
      }
    };

    loadRecommendationStates();
    return () => {
      cancelled = true;
    };
  }, [recommendations, session, account?.id, type]);

  const prefetchRecImdb = useCallback(
    (rec) => {
      if (!rec?.id) return;
      if (typeof window === "undefined") return;
      if (!supportsHover) return;

      const rid = rec.id;
      // si ya está (aunque sea null) no vuelvas a pedir
      if (recImdbRatingsRef.current?.[rid] !== undefined) return;
      if (recImdbInFlightRef.current.has(rid)) return;

      // pequeño delay para evitar peticiones al pasar el ratón rápido
      if (recImdbTimersRef.current[rid]) return;
      recImdbTimersRef.current[rid] = window.setTimeout(async () => {
        recImdbInFlightRef.current.add(rid);

        try {
          const mediaType =
            rec.media_type === "movie" || rec.media_type === "tv"
              ? rec.media_type
              : type === "tv"
                ? "tv"
                : "movie";

          let imdbId = recImdbIdCacheRef.current?.[rid] || null;
          if (!imdbId) {
            const ext = await getExternalIds(mediaType, rid);
            imdbId = ext?.imdb_id || null;
            if (imdbId) recImdbIdCacheRef.current[rid] = imdbId;
          }

          if (!imdbId) {
            setRecImdbRatings((prev) => ({ ...prev, [rid]: null }));
            return;
          }

          // cache
          const cached = readOmdbCache(imdbId);
          if (cached?.imdbRating != null) {
            setRecImdbRatings((prev) => ({
              ...prev,
              [rid]: cached.imdbRating,
            }));
            if (cached?.fresh) return;
          }

          const imdbDataset = await fetchImdbRatingByImdb(imdbId);
          const safe =
            typeof imdbDataset?.rating === "number" ? imdbDataset.rating : null;
          setRecImdbRatings((prev) => ({ ...prev, [rid]: safe }));
          writeOmdbCache(imdbId, {
            imdbRating: safe,
            imdbVotes:
              typeof imdbDataset?.votes === "number" ? imdbDataset.votes : null,
          });
        } catch {
          setRecImdbRatings((prev) => ({ ...prev, [rid]: null }));
        } finally {
          recImdbInFlightRef.current.delete(rid);
          if (recImdbTimersRef.current[rid]) {
            window.clearTimeout(recImdbTimersRef.current[rid]);
            delete recImdbTimersRef.current[rid];
          }
        }
      }, 180);
    },
    [type, supportsHover],
  );

  // Cargar providers desde JustWatch con caché en sessionStorage
  useEffect(() => {
    if (!title || !id) return;

    const cacheKey = `streaming:${endpointType}:${id}`;
    const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 horas

    // Intentar cargar desde caché primero
    const loadFromCache = () => {
      try {
        const cached = sessionStorage.getItem(cacheKey);
        if (cached) {
          const { providers, justwatchUrl, timestamp } = JSON.parse(cached);
          const age = Date.now() - timestamp;

          if (age < CACHE_TTL) {
            setStreamingProviders(providers || []);
            setJustwatchUrl(justwatchUrl || null);
            setProvidersLoading(false);
            return true;
          }
        }
      } catch (error) {
        console.error("Error loading providers from cache:", error);
      }
      return false;
    };

    // Si hay caché válido, usarlo y terminar
    if (loadFromCache()) return;

    // Si no hay caché, hacer la petición
    const fetchProviders = async () => {
      setProvidersLoading(true);
      try {
        const params = new URLSearchParams({
          title: title,
          type: endpointType,
        });

        if (yearIso) {
          params.append("year", yearIso);
        }

        if (data.imdb_id) {
          params.append("imdbId", data.imdb_id);
        }

        params.append("tmdbId", id);

        const response = await fetch(`/api/streaming?${params.toString()}`);

        if (response.ok) {
          const result = await response.json();
          const providers = result.providers || [];
          const justwatchUrl = result.justwatchUrl || null;

          setStreamingProviders(providers);
          setJustwatchUrl(justwatchUrl);

          // Guardar en caché
          try {
            sessionStorage.setItem(
              cacheKey,
              JSON.stringify({
                providers,
                justwatchUrl,
                timestamp: Date.now(),
              }),
            );
          } catch (error) {
            console.error("Error saving providers to cache:", error);
          }
        }
      } catch (error) {
        console.error("Error fetching streaming providers:", error);
      } finally {
        setProvidersLoading(false);
      }
    };

    fetchProviders();
  }, [title, id, endpointType, yearIso, data.imdb_id]);

  // ====== PLEX: Cargar disponibilidad desde servidor local ======
  useEffect(() => {
    if (!title || !id) return;

    // Cambiar clave de caché para forzar recarga con nuevas URLs corregidas
    const cacheKey = `plex-v13:${endpointType}:${id}`;
    const CACHE_TTL = 7 * 24 * 60 * 60 * 1000; // 7 días (1 semana)

    // Intentar cargar desde caché primero
    const loadFromCache = () => {
      try {
        const cached = sessionStorage.getItem(cacheKey);
        if (cached) {
          const { available, plexUrl, timestamp } = JSON.parse(cached);
          const age = Date.now() - timestamp;

          if (age < CACHE_TTL) {
            setPlexAvailable(available || false);
            setPlexUrl(plexUrl || null);
            setPlexLoading(false);
            return true;
          }
        }
      } catch (error) {
        console.error("Error loading Plex from cache:", error);
      }
      return false;
    };

    // Si hay caché válido, usarlo y terminar
    if (loadFromCache()) return;

    // Si no hay caché, hacer la petición
    const fetchPlex = async () => {
      setPlexLoading(true);
      try {
        const params = new URLSearchParams({
          title: title,
          type: endpointType,
          tmdbId: String(id), // <- NUEVO (para slug en Android)
        });

        if (yearIso) params.append("year", yearIso);
        if (data.imdb_id) params.append("imdbId", data.imdb_id);

        const response = await fetch(`/api/plex?${params.toString()}`);

        if (response.ok) {
          const result = await response.json();
          const available = result.available || false;

          const plexWebUrl = result.plexUrl || null;
          const plexMobileUrl = result.plexMobileUrl || null; // preplay legacy
          const plexMobileAltUrl = result.plexMobileAltUrl || null; // preplay alt
          const plexMobileRawUrl = result.plexMobileRawUrl || null; // preplay raw key
          const plexPlayUrl = result.plexPlayUrl || null; // play
          const plexPlayLegacyUrl = result.plexPlayLegacyUrl || null; // play + metadataType
          const plexPlayRawUrl = result.plexPlayRawUrl || null; // play raw key
          const plexAndroidIntentUrl = result.plexAndroidIntentUrl || null; // intent preplay
          const plexAndroidIntentPlayUrl =
            result.plexAndroidIntentPlayUrl || null; // intent play
          const plexUniversalUrl = result.plexUniversalUrl || null; // watch.plex.tv Universal Link
          const plexSlugUrl = result.plexSlugUrl || null; // plex://movie|show/{slug} — ficha detalles
          const plexAndroidSlugIntentUrl =
            result.plexAndroidSlugIntentUrl || null; // intent slug Android

          setPlexAvailable(available);

          setPlexUrl({
            web: plexWebUrl,
            mobile: plexMobileUrl,
            mobileAlt: plexMobileAltUrl,
            mobileRaw: plexMobileRawUrl,
            play: plexPlayUrl,
            playLegacy: plexPlayLegacyUrl,
            playRaw: plexPlayRawUrl,
            androidIntent: plexAndroidIntentUrl,
            androidIntentPlay: plexAndroidIntentPlayUrl,
            universal: plexUniversalUrl,
            slug: plexSlugUrl,
            androidSlugIntent: plexAndroidSlugIntentUrl,
          });

          sessionStorage.setItem(
            cacheKey,
            JSON.stringify({
              available,
              plexUrl: {
                web: plexWebUrl,
                mobile: plexMobileUrl,
                mobileAlt: plexMobileAltUrl,
                mobileRaw: plexMobileRawUrl,
                play: plexPlayUrl,
                playLegacy: plexPlayLegacyUrl,
                playRaw: plexPlayRawUrl,
                androidIntent: plexAndroidIntentUrl,
                androidIntentPlay: plexAndroidIntentPlayUrl,
                universal: plexUniversalUrl,
                slug: plexSlugUrl,
                androidSlugIntent: plexAndroidSlugIntentUrl,
              },
              timestamp: Date.now(),
            }),
          );
        }
      } catch (error) {
        console.error("Error fetching Plex availability:", error);
      } finally {
        setPlexLoading(false);
      }
    };

    fetchPlex();
  }, [title, id, endpointType, yearIso, data.imdb_id]);

  // ====== COMBINAR PROVIDERS: JustWatch + Plex ======
  const limitedProviders = useMemo(() => {
    const providers = Array.isArray(streamingProviders)
      ? [...streamingProviders]
      : [];

    // Si Plex está disponible, agregarlo al final
    if (plexAvailable && plexUrl) {
      providers.push({
        provider_id: "plex",
        provider_name: "Plex",
        logo_path: "/logo-Plex.png",
        url: plexUrl, // Objeto con {web, mobile}
        isPlex: true,
      });
    }

    return dedupeStreamingProviders(providers).slice(0, 6);
  }, [streamingProviders, plexAvailable, plexUrl]);

  // Refs para gestion de carga de poster (los estados estan definidos al inicio)
  const prevDisplayPosterRef = useRef(null);
  const posterLoadTokenRef = useRef(0);
  const posterToggleSeqRef = useRef(0);
  const posterRequestedModeRef = useRef("poster");

  useEffect(() => {
    posterRequestedModeRef.current = posterViewMode;
  }, [posterViewMode]);

  // Activar posterResolved cuando displayPosterPath este disponible
  useEffect(() => {
    // Activar posterResolved inmediatamente si tenemos un path valido (igual que el poster)
    if (displayPosterPath && !posterResolved) {
      setPosterResolved(true);
    }
    // Incluimos artworkInitialized para evitar error de HMR "deps changed size"
  }, [displayPosterPath, posterResolved, artworkInitialized]);

  // Fallback automatico: si backdrop falla, cambiar a poster
  useEffect(() => {
    if (
      posterImgError &&
      posterViewMode === "preview" &&
      basePosterDisplayPath
    ) {
      console.warn("Backdrop failed to load, falling back to poster");
      setPosterViewMode("poster");
      setPosterLayoutMode("poster");
      // Resetear error para que el poster pueda cargar
      setPosterImgError(false);
      setPosterLowLoaded(false);
      setPosterHighLoaded(false);
    }
  }, [posterImgError, posterViewMode, basePosterDisplayPath]);

  // Fallback si no hay backdrop disponible en modo preview
  useEffect(() => {
    if (
      posterViewMode === "preview" &&
      artworkInitialized &&
      !previewBackdropPath &&
      basePosterDisplayPath
    ) {
      console.warn("No backdrop available, falling back to poster");
      setPosterViewMode("poster");
      setPosterLayoutMode("poster");
    }
  }, [
    posterViewMode,
    artworkInitialized,
    previewBackdropPath,
    basePosterDisplayPath,
  ]);

  // Timeout de seguridad: si despues de 3s no hay imagen en modo preview, cambiar a poster
  useEffect(() => {
    if (posterViewMode !== "preview" || posterResolved) return;

    const timeoutId = setTimeout(() => {
      if (!posterResolved && basePosterDisplayPath) {
        console.warn("Backdrop loading timeout, falling back to poster");
        setPosterViewMode("poster");
        setPosterLayoutMode("poster");
      }
    }, 3000); // 3 segundos de timeout

    return () => clearTimeout(timeoutId);
  }, [posterViewMode, posterResolved, basePosterDisplayPath]);

  useEffect(() => {
    const prev = prevDisplayPosterRef.current;
    prevDisplayPosterRef.current = displayPosterPath;
    posterLoadTokenRef.current += 1;

    // Manejar cambio de imagen (incluyendo de null a valor)
    if (prev !== displayPosterPath) {
      // Si hay imagen anterior, guardarla para crossfade
      if (prev) {
        setPrevPosterPath(prev);
      }

      // Verificar si la nueva imagen ya esta precargada
      if (displayPosterPath) {
        const checkIfLoaded = (size) => {
          const testImg = new Image();
          testImg.src = `https://image.tmdb.org/t/p/${size}${displayPosterPath}`;
          return testImg.complete && testImg.naturalWidth > 0;
        };

        const isLowPreloaded = checkIfLoaded("w342");
        const isHighPreloaded = checkIfLoaded("w780");

        // Si esta precargada, marcar como cargada inmediatamente
        if (isLowPreloaded) {
          setPosterLowLoaded(true);
          setPosterHighLoaded(isHighPreloaded); // Tambien verificar HIGH
        } else {
          setPosterLowLoaded(false);
          setPosterHighLoaded(false);
        }

        setPosterTransitioning(!!prev); // Solo transición si había imagen anterior
        setPosterImgError(false);
      } else {
        // Si displayPosterPath es null, resetear estados
        setPosterLowLoaded(false);
        setPosterHighLoaded(false);
        setPosterTransitioning(false);
        setPrevPosterPath(null);
      }
    }
  }, [displayPosterPath]);

  // Resetear estados de carga del backdrop cuando cambia la vista o la imagen
  const prevDisplayBackdropRef = useRef(null);
  const backdropLoadTokenRef = useRef(0);
  const backdropLoadToken = backdropLoadTokenRef.current;

  useEffect(() => {
    const prev = prevDisplayBackdropRef.current;
    prevDisplayBackdropRef.current = previewBackdropPath;
    backdropLoadTokenRef.current += 1;

    if (prev === previewBackdropPath) return;

    if (previewBackdropPath) {
      const checkIfLoaded = (size) => {
        const testImg = new Image();
        testImg.src = `https://image.tmdb.org/t/p/${size}${previewBackdropPath}`;
        return testImg.complete && testImg.naturalWidth > 0;
      };

      const isLowPreloaded = checkIfLoaded("w780");
      const isHighPreloaded = checkIfLoaded("w1280");

      setBackdropLowLoaded(isLowPreloaded);
      setBackdropHighLoaded(isHighPreloaded);
      setBackdropResolved(true);
      setBackdropImgError(false);
      return;
    }

    setBackdropLowLoaded(false);
    setBackdropHighLoaded(false);
    setBackdropImgError(false);
    setBackdropResolved(false);
  }, [previewBackdropPath]);

  const posterAspectIsBackdrop =
    posterTransitioning && prevPosterPath
      ? isBackdropPath(prevPosterPath)
      : isBackdropPoster;

  // URLs basadas en el modo de vista
  const posterLowUrl =
    posterViewMode === "preview" && previewBackdropPath
      ? `https://image.tmdb.org/t/p/w780${previewBackdropPath}`
      : displayPosterPath
        ? `https://image.tmdb.org/t/p/w342${displayPosterPath}`
        : null;

  const posterHighUrl =
    posterViewMode === "preview" && previewBackdropPath
      ? `https://image.tmdb.org/t/p/w1280${previewBackdropPath}`
      : displayPosterPath
        ? `https://image.tmdb.org/t/p/w780${displayPosterPath}`
        : null;
  const posterLoadToken = posterLoadTokenRef.current;

  // Estados unificados: usar backdrop states si estamos en preview, sino poster states
  const currentLowLoaded =
    posterViewMode === "preview" ? backdropLowLoaded : posterLowLoaded;
  const currentHighLoaded =
    posterViewMode === "preview" ? backdropHighLoaded : posterHighLoaded;
  const currentImgError =
    posterViewMode === "preview" ? backdropImgError : posterImgError;
  const currentResolved =
    posterViewMode === "preview" ? backdropResolved : posterResolved;
  const currentImagePath =
    posterViewMode === "preview" ? posterLowUrl : displayPosterPath;
  const currentLoadToken =
    posterViewMode === "preview" ? backdropLoadToken : posterLoadToken;
  const currentLoadTokenRef =
    posterViewMode === "preview" ? backdropLoadTokenRef : posterLoadTokenRef;

  // En la primera entrada no queremos ocultar la portada correcta y revelarla
  // un frame después, porque rompe la animación del hero y produce microparpadeo.
  // Solo mantenemos la nueva imagen oculta cuando hay un swap real con crossfade.
  const shouldRevealCurrentPosterImmediately =
    !!currentImagePath && (!posterTransitioning || !prevPosterPath);

  // Limpiar transicion suavemente solo despues de cargar (evita destellos en internet lento)
  useEffect(() => {
    if (currentLowLoaded && prevPosterPath) {
      const timer = setTimeout(() => {
        setPrevPosterPath(null);
        setPosterTransitioning(false);
      }, 800); // Dar suficiente tiempo para que la animacion de fade termine
      return () => clearTimeout(timer);
    }
  }, [currentLowLoaded, prevPosterPath]);

  // Icono NO IMAGE solo si ya hemos resuelto, NO hay imagen (o falló) y NO estamos esperando carga inicial en modo preview
  const showNoPoster =
    currentResolved &&
    (!currentImagePath || currentImgError) &&
    // Si estamos en preview, esperar a que termine initArtwork antes de declarar "No Image"
    (posterViewMode !== "preview" || artworkInitialized);

  // ====== Poster 3D Tilt / Shine ======
  const posterWrapRef = useRef(null);
  const posterCardRef = useRef(null);
  const posterShineRef = useRef(null);
  const posterRafRef = useRef(0);
  const prefersReducedMotion = useReducedMotion();
  const [poster3dEnabled, setPoster3dEnabled] = useState(false);
  const posterTiltRef = useRef(null); // El recuadro completo que se inclina
  const posterAnimRafRef = useRef(0); // Un solo rAF
  const posterTargetRef = useRef({ rx: 0, ry: 0, s: 1 });
  const posterStateRef = useRef({ rx: 0, ry: 0, s: 1 });
  const posterLastInputRef = useRef(0);

  const POSTER_MAX = 12; // grados
  const POSTER_SCALE = 1.06; // escala al hover
  const POSTER_OVERSCAN = 1.02; // Minimo para no perder nitidez
  const IDLE_DELAY = 220; // ms sin interacción => idle

  // Overscan
  const posterImgOverscan = poster3dEnabled ? 1.12 : 1;

  useEffect(() => {
    if (prefersReducedMotion) {
      setPoster3dEnabled(false);
      return;
    }

    if (typeof window === "undefined") return;

    const media = window.matchMedia("(hover: hover) and (pointer: fine)");
    const update = () => setPoster3dEnabled(media.matches);

    update();
    media.addEventListener?.("change", update);
    return () => media.removeEventListener?.("change", update);
  }, [prefersReducedMotion]);

  const setPosterTargetFromPointer = useCallback(
    (clientX, clientY) => {
      if (!poster3dEnabled) return;

      const wrapper = posterWrapRef.current;
      if (!wrapper) return;

      const rect = wrapper.getBoundingClientRect();
      if (!rect.width || !rect.height) return;

      const x = clientX - rect.left;
      const y = clientY - rect.top;

      const cx = rect.width / 2;
      const cy = rect.height / 2;

      const rx = ((y - cy) / cy) * -POSTER_MAX;
      const ry = ((x - cx) / cx) * POSTER_MAX;

      posterTargetRef.current = { rx, ry, s: POSTER_SCALE };
      posterLastInputRef.current =
        typeof performance !== "undefined" ? performance.now() : Date.now();
    },
    [poster3dEnabled],
  );

  const resetPosterTarget = useCallback(() => {
    posterTargetRef.current = { rx: 0, ry: 0, s: 1 };
    posterLastInputRef.current =
      typeof performance !== "undefined" ? performance.now() : Date.now();
  }, []);

  // Animacion 3D continua: idle automático cuando no hay interacción
  useEffect(() => {
    if (!poster3dEnabled) return;

    const el = posterTiltRef.current;
    if (!el) return;

    let mounted = true;

    const loop = (t) => {
      if (!mounted) return;

      const now =
        t ??
        (typeof performance !== "undefined" ? performance.now() : Date.now());
      const idle = now - posterLastInputRef.current > IDLE_DELAY;

      let target = posterTargetRef.current;

      if (idle) {
        const dt = now / 1000;
        target = {
          rx: Math.sin(dt * 1.05) * 5.5,
          ry: Math.cos(dt * 0.9) * 8.5,
          s: 1.03 + Math.sin(dt * 1.6) * 0.01,
        };
      }

      const cur = posterStateRef.current;
      const k = 0.14;
      cur.rx += (target.rx - cur.rx) * k;
      cur.ry += (target.ry - cur.ry) * k;
      cur.s += (target.s - cur.s) * k;

      el.style.transform =
        `translateZ(0px) rotateX(${cur.rx.toFixed(3)}deg) rotateY(${cur.ry.toFixed(3)}deg) ` +
        `scale3d(${cur.s.toFixed(4)}, ${cur.s.toFixed(4)}, ${cur.s.toFixed(4)})`;

      posterAnimRafRef.current = requestAnimationFrame(loop);
    };

    posterAnimRafRef.current = requestAnimationFrame(loop);

    return () => {
      mounted = false;
      if (posterAnimRafRef.current)
        cancelAnimationFrame(posterAnimRafRef.current);
      posterAnimRafRef.current = 0;
    };
  }, [poster3dEnabled, displayPosterPath]);

  return (
    <div className="relative min-h-screen bg-[#101010] text-gray-100 font-sans selection:bg-yellow-500/30">
      {/* --- BACKGROUND & OVERLAY --- */}
      <div className="fixed inset-0 z-0 overflow-hidden bg-[#0a0a0a] pointer-events-none">
        {useBackdrop && artworkInitialized && heroBackgroundPath ? (
          <>
            {/* Imagen anterior (fade out) */}
            {isTransitioning && prevBackgroundPath && (
              <>
                <div
                  className="absolute inset-0 bg-cover bg-center transition-opacity duration-500"
                  style={{
                    backgroundImage: `url(https://image.tmdb.org/t/p/original${prevBackgroundPath})`,
                    transform: "scale(1)",
                    filter: "brightness(0.75) saturate(1.03)",
                    opacity: 0,
                    willChange: "opacity",
                  }}
                />
                <div
                  className="absolute inset-0 bg-cover transition-opacity duration-500"
                  style={{
                    backgroundImage: `url(https://image.tmdb.org/t/p/original${prevBackgroundPath})`,
                    backgroundPosition: "center top",
                    transform: "scale(1)",
                    transformOrigin: "center top",
                    opacity: 0,
                    willChange: "opacity",
                  }}
                />
              </>
            )}

            {/* Capa base: siempre cubre (evita marcos laterales) */}
            <div
              className="absolute inset-0 bg-cover bg-center transition-opacity duration-500"
              style={{
                backgroundImage: `url(https://image.tmdb.org/t/p/original${heroBackgroundPath})`,
                transform: "scale(1)",
                filter: "brightness(0.75) saturate(1.03)",
                opacity: isTransitioning ? 1 : 1,
                willChange: "opacity",
              }}
            />

            {/* Capa detalle: zoom OUT (scale < 1) */}
            <div
              className="absolute inset-0 bg-cover transition-opacity duration-500"
              style={{
                backgroundImage: `url(https://image.tmdb.org/t/p/original${heroBackgroundPath})`,
                backgroundPosition: "center top",
                transform: "scale(1)",
                transformOrigin: "center top",
                opacity: isTransitioning ? 1 : 1,
                willChange: "opacity",
              }}
            />
          </>
        ) : (
          <div className="absolute inset-0 bg-[#0a0a0a]" />
        )}

        {/* Sombreado superior + laterales (sin "marcos") */}
        <div className="absolute inset-0 pointer-events-none bg-gradient-to-b from-black/60 via-transparent to-transparent" />
        <div className="absolute inset-0 pointer-events-none bg-gradient-to-r from-[#101010]/60 via-transparent to-transparent" />
        <div className="absolute inset-0 pointer-events-none bg-gradient-to-l from-[#101010]/60 via-transparent to-transparent" />

        {/* Tus overlays originales */}
        <div className="absolute inset-0 bg-gradient-to-t from-[#101010] via-[#101010]/60 to-black/20" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#101010] via-transparent to-transparent opacity-30" />
      </div>

      {/* --- CONTENIDO PRINCIPAL --- */}
      <div
        ref={contentTopRef}
        className="relative z-10 px-4 py-8 lg:py-12 max-w-7xl mx-auto"
      >
        {/* =================================================================
            HEADER HERO SECTION (Diseño Final Solicitado)
           ================================================================= */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
          className="flex flex-col lg:flex-row gap-8 lg:gap-12 mb-12 items-start transform-gpu"
        >
          {/* --- COLUMNA IZQUIERDA: POSTER + PROVIDERS + ENLACES (cuando es backdrop) --- */}
          <div
            className={`w-full mx-auto lg:mx-0 flex-shrink-0 flex flex-col gap-5 relative z-10 transition-[max-width] duration-500 ease-out ${
              isBackdropPoster
                ? "max-w-full lg:max-w-[600px]"
                : "max-w-[280px] lg:max-w-[320px]"
            }`}
          >
            {/* Poster Card */}
            <div className="relative">
              {/* Wrapper: solo perspectiva + captura puntero */}
              <div
                ref={posterWrapRef}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleCyclePoster();
                }}
                onPointerMove={(e) =>
                  setPosterTargetFromPointer(e.clientX, e.clientY)
                }
                onPointerLeave={() => {
                  resetPosterTarget();
                  setIsPosterHovered(false);
                }}
                onPointerEnter={() => setIsPosterHovered(true)}
                onPointerDown={(e) => {
                  // mejora tactil (evita pérdidas de tracking)
                  e.currentTarget.setPointerCapture?.(e.pointerId);
                  setPosterTargetFromPointer(e.clientX, e.clientY);
                }}
                className="relative cursor-pointer"
                style={{
                  perspective: poster3dEnabled ? 1100 : undefined,
                  transformStyle: "preserve-3d",
                  touchAction: "none",
                }}
              >
                {/* Este es el recuadro completo que se inclina */}
                <div
                  ref={posterTiltRef}
                  className="relative rounded-2xl overflow-hidden shadow-2xl shadow-black/80 bg-black/40 will-change-transform"
                  style={{
                    transformStyle: "preserve-3d",
                    backfaceVisibility: "hidden",
                    WebkitBackfaceVisibility: "hidden",
                    outline: "1px solid transparent",
                    isolation: "isolate",
                    WebkitMaskImage: "-webkit-radial-gradient(white, black)",
                    // NO transition en transform - manejado por requestAnimationFrame
                  }}
                >
                  {/* Borde premium suavizado en la capa superior para evitar entrecortados */}
                  <div className="pointer-events-none absolute inset-0 rounded-2xl ring-1 ring-white/15 z-30" />

                  <div
                    className={`relative bg-neutral-950 will-change-auto overflow-hidden ${
                      isBackdropPoster ? "aspect-[16/9]" : "aspect-[2/3]"
                    }`}
                    style={{
                      transition:
                        "aspect-ratio 500ms cubic-bezier(0.25, 1, 0.5, 1)",
                      contain: "layout paint",
                    }}
                  >
                    {/* Imagen anterior (permanece visible hasta que la nueva carga) */}
                    <AnimatePresence>
                      {prevPosterPath &&
                        posterTransitioning &&
                        !currentLowLoaded && (
                          <motion.div
                            key="prev-poster"
                            initial={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.45, ease: "easeInOut" }}
                            className="absolute inset-0 z-0"
                          >
                            <img
                              src={`https://image.tmdb.org/t/p/${posterAspectIsBackdrop ? "w1280" : "w780"}${prevPosterPath}`}
                              alt={title}
                              className="absolute inset-0 w-full h-full object-cover"
                              style={{
                                transform: `translateZ(0) scale(${POSTER_OVERSCAN})`,
                              }}
                            />
                          </motion.div>
                        )}
                    </AnimatePresence>

                    {posterLowUrl && !currentImgError && (
                      <div className="absolute inset-0 transform-gpu will-change-[opacity,transform] z-10">
                        {/* LOW */}
                        <img
                          src={posterLowUrl}
                          alt={title}
                          loading="eager"
                          fetchPriority="high"
                          decoding="async"
                          onLoad={() => {
                            if (
                              currentLoadTokenRef.current !== currentLoadToken
                            )
                              return;
                            // Usar el setState correcto segun el modo
                            if (posterViewMode === "preview") {
                              setBackdropLowLoaded(true);
                              setBackdropResolved(true);
                            } else {
                              setPosterLowLoaded(true);
                              setPosterResolved(true);
                            }
                          }}
                          onError={() => {
                            if (
                              currentLoadTokenRef.current !== currentLoadToken
                            )
                              return;
                            // Usar el setState correcto segun el modo
                            if (posterViewMode === "preview") {
                              setBackdropImgError(true);
                              setBackdropResolved(true);
                            } else {
                              setPosterImgError(true);
                              setPosterResolved(true);
                            }
                          }}
                          className={`absolute inset-0 w-full h-full object-cover transform-gpu transition-opacity duration-500 ease-out will-change-[opacity,transform]
${currentHighLoaded ? "opacity-0" : shouldRevealCurrentPosterImmediately || currentLowLoaded ? "opacity-100" : "opacity-0"}`}
                          style={{
                            transform: `translateZ(0) scale(${POSTER_OVERSCAN})`,
                          }}
                        />

                        {/* HIGH */}
                        {currentLowLoaded && posterHighUrl && (
                          <img
                            src={posterHighUrl}
                            alt={title}
                            loading="eager"
                            decoding="async"
                            fetchPriority="high"
                            onLoad={() => {
                              if (
                                currentLoadTokenRef.current !== currentLoadToken
                              )
                                return;
                              // Usar el setState correcto segun el modo
                              if (posterViewMode === "preview") {
                                setBackdropHighLoaded(true);
                              } else {
                                setPosterHighLoaded(true);
                              }
                            }}
                            onError={() => {}}
                            className={`absolute inset-0 w-full h-full object-cover transform-gpu transition-opacity duration-500 ease-out will-change-[opacity,transform]
${currentHighLoaded ? "opacity-100" : "opacity-0"}`}
                            style={{
                              transform: `translateZ(0) scale(${POSTER_OVERSCAN})`,
                            }}
                          />
                        )}
                      </div>
                    )}

                    {showNoPoster && !prevPosterPath && (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <ImageOff className="w-10 h-10 text-neutral-700" />
                      </div>
                    )}

                    {/* Right arrow for poster -> backdrop */}
                    <AnimatePresence>
                      {supportsHover &&
                        isPosterHovered &&
                        posterViewMode === "poster" && (
                          <motion.div
                            initial={{ opacity: 0, x: 10 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: 10 }}
                            transition={{ duration: 0.2, ease: "easeInOut" }}
                            className="absolute inset-y-0 right-0 z-20 flex w-1/3 items-center justify-end bg-gradient-to-l from-black/70 to-transparent pr-4 pointer-events-none"
                          >
                            <ChevronRight className="h-8 w-8 text-white drop-shadow-lg" />
                          </motion.div>
                        )}
                    </AnimatePresence>

                    {/* Left arrow for backdrop -> poster */}
                    <AnimatePresence>
                      {supportsHover &&
                        isPosterHovered &&
                        posterViewMode === "preview" && (
                          <motion.div
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -10 }}
                            transition={{ duration: 0.2, ease: "easeInOut" }}
                            className="absolute inset-y-0 left-0 z-20 flex w-1/3 items-center justify-start bg-gradient-to-r from-black/70 to-transparent pl-4 pointer-events-none"
                          >
                            <ChevronLeft className="h-8 w-8 text-white drop-shadow-lg" />
                          </motion.div>
                        )}
                    </AnimatePresence>
                  </div>
                </div>
              </div>
            </div>

            {/* Providers Grid + Enlaces Externos (cuando es backdrop) */}
            {(limitedProviders && limitedProviders.length > 0) ||
            (isBackdropPoster && externalLinks.length > 0) ? (
              <StaggerContainer
                className="flex flex-row flex-wrap justify-center items-center gap-3 w-full px-1 py-2"
                staggerDelay={0.05}
              >
                {/* Providers - Solo si hay plataformas */}
                {limitedProviders && limitedProviders.length > 0 && (
                  <div className="flex flex-row flex-nowrap items-center gap-2">
                    {limitedProviders.map((p, index) => {
                      const isPlexProvider = p.isPlex === true;

                      // Para Plex: enlazar a /api/plex/open (página de redirección
                      // intermedia que detecta el dispositivo y lanza el deep link
                      // correcto — mucho más fiable que window.location en onClick).
                      let providerLink;
                      let hasValidLink;

                      if (
                        isPlexProvider &&
                        p.url &&
                        typeof p.url === "object"
                      ) {
                        // Extraer el slug limpio de la URL plex://movie/{slug} o plex://show/{slug}
                        // p.url.slug viene de la API como "plex://movie/fight-club" o "plex://show/the-wire"
                        let rawSlug = "";
                        if (p.url.slug) {
                          // Extraer todo lo que hay después del último "/" en plex://type/slug
                          const slugMatch = p.url.slug.match(
                            /plex:\/\/(?:movie|show)\/(.+)$/i,
                          );
                          rawSlug = slugMatch ? slugMatch[1] : p.url.slug;
                        } else if (p.url.universal) {
                          // Fallback: extraer slug de la URL watch.plex.tv
                          const uMatch = p.url.universal.match(
                            /watch\.plex\.tv\/(?:movie|show)\/(.+)$/i,
                          );
                          rawSlug = uMatch ? uMatch[1] : "";
                        }

                        const contentType =
                          endpointType === "movie" ? "movie" : "show";
                        const webUrl = p.url.web || "";

                        if (rawSlug) {
                          const params = new URLSearchParams({
                            slug: rawSlug,
                            type: contentType,
                            webUrl,
                            title: title || "",
                          });
                          providerLink = `/api/plex/open?${params.toString()}`;
                          hasValidLink = true;
                        } else {
                          // Sin slug (muy raro): fallback directo a web de Plex
                          providerLink = webUrl || p.url.universal || "#";
                          hasValidLink = !!providerLink && providerLink !== "#";
                        }
                      } else {
                        providerLink = p.url || justwatchUrl || "#";
                        hasValidLink = p.url || justwatchUrl;
                      }

                      return (
                        <motion.a
                          key={p.provider_id}
                          href={providerLink}
                          initial={{ opacity: 0, y: 10, scale: 0.96 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          transition={{
                            duration: 0.28,
                            delay: 0.03 + index * 0.04,
                            ease: [0.22, 1, 0.36, 1],
                          }}
                          target={
                            // Para Plex: la página /api/plex/open se carga en la
                            // misma pestaña (navegación completa = más fiable para
                            // deep links). Para otros providers: nueva pestaña.
                            isPlexProvider
                              ? "_self"
                              : hasValidLink
                                ? "_blank"
                                : undefined
                          }
                          rel={
                            hasValidLink && !isPlexProvider
                              ? "noreferrer"
                              : undefined
                          }
                          aria-label={p.provider_name}
                          className="group/provider relative flex-shrink-0 transition-transform transform hover:scale-110 hover:brightness-110 hover:z-10 cursor-pointer"
                        >
                          <img
                            src={
                              p.logo_path?.startsWith("http")
                                ? p.logo_path
                                : p.logo_path?.startsWith("/logo-")
                                  ? p.logo_path
                                  : p.logo_path?.startsWith("/")
                                    ? `https://image.tmdb.org/t/p/original${p.logo_path}`
                                    : p.logo_path
                            }
                            alt=""
                            className="w-9 h-9 lg:w-11 lg:h-11 rounded-xl shadow-lg object-contain bg-white/5"
                            onError={(e) => {
                              e.target.style.display = "none";
                            }}
                          />
                          {isPlexProvider && (
                            <div className="absolute -top-1 -right-1 w-3 h-3 bg-green-500 rounded-full ring-2 ring-black" />
                          )}
                          <div className="pointer-events-none absolute top-full mt-2 left-1/2 z-[100] -translate-x-1/2 scale-95 whitespace-nowrap rounded-lg border border-white/10 bg-black/90 px-2.5 py-1 text-[10px] font-bold text-white opacity-0 shadow-xl transition-all duration-200 ease-out group-hover/provider:scale-100 group-hover/provider:opacity-100 group-hover/provider:delay-[2000ms]">
                            {isPlexProvider
                              ? "Disponible en tu servidor local"
                              : p.provider_name}
                          </div>
                        </motion.a>
                      );
                    })}
                  </div>
                )}

                {/* Barra vertical + Enlaces externos (cuando es backdrop) */}
                {isBackdropPoster && externalLinks.length > 0 && (
                  <>
                    {/* Separador solo si hay plataformas */}
                    {limitedProviders && limitedProviders.length > 0 && (
                      <div className="w-px h-8 bg-white/20 flex-shrink-0" />
                    )}
                    <div className="flex flex-row flex-nowrap items-center gap-2">
                      {externalLinks.slice(0, 5).map((link, index) => {
                        // Detectar si es Letterboxd para ajustar escala
                        const isLetterboxdIcon =
                          link.icon?.includes("logo-Letterboxd");

                        return (
                          <motion.a
                            key={link.id}
                            href={link.href}
                            initial={{ opacity: 0, y: 10, scale: 0.96 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            transition={{
                              duration: 0.28,
                              delay: 0.06 + index * 0.04,
                              ease: [0.22, 1, 0.36, 1],
                            }}
                            target="_blank"
                            rel="noreferrer"
                            aria-label={link.label}
                            className="group/extlink relative flex-shrink-0 transition-transform transform hover:scale-110 hover:brightness-110 hover:z-10"
                          >
                            <img
                              src={link.icon}
                              alt=""
                              className={`w-7 h-7 lg:w-8 lg:h-8 rounded-xl shadow-lg object-contain ${isLetterboxdIcon ? "scale-[1.2]" : ""}`}
                              onError={(e) => {
                                e.target.style.display = "none";
                              }}
                            />
                            <div className="pointer-events-none absolute top-full mt-2 left-1/2 z-[100] -translate-x-1/2 scale-95 whitespace-nowrap rounded-lg border border-white/10 bg-black/90 px-2.5 py-1 text-[10px] font-bold text-white opacity-0 shadow-xl transition-all duration-200 ease-out group-hover/extlink:scale-100 group-hover/extlink:opacity-100 group-hover/extlink:delay-[2000ms]">
                              {link.label}
                            </div>
                          </motion.a>
                        );
                      })}
                    </div>
                  </>
                )}
              </StaggerContainer>
            ) : null}
          </div>

          {/* --- COLUMNA DERECHA: INFO (sin tabs cuando es backdrop) --- */}
          <div
            className={`flex-1 flex flex-col min-w-0 w-full ${
              isBackdropPoster ? "" : ""
            }`}
          >
            {/* 1. TÍTULO Y CABECERA */}
            <FadeIn delay={0.06} className="mb-5 px-1">
              <h1 className="text-4xl md:text-5xl lg:text-6xl font-black text-white leading-[1] tracking-tight text-balance drop-shadow-xl mb-3">
                {title}
              </h1>

              <div className="flex flex-wrap items-center gap-3 text-base md:text-lg font-medium text-zinc-300">
                {yearIso && (
                  <span className="text-white font-bold tracking-wide">
                    {yearIso}
                  </span>
                )}

                {yearIso && displayRuntimeValue && (
                  <span className="w-1 h-1 rounded-full bg-white/30" />
                )}

                {displayRuntimeValue && <span>{displayRuntimeValue}</span>}

                {(yearIso || displayRuntimeValue) && data.status && (
                  <span className="w-1 h-1 rounded-full bg-white/30" />
                )}

                {data.status && (
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded-md border text-[10px] font-black uppercase tracking-widest backdrop-blur-md shadow-sm ${
                      data.status === "Ended" || data.status === "Canceled"
                        ? "bg-red-500/10 border-red-500/20 text-red-300"
                        : "bg-emerald-500/10 border-emerald-500/20 text-emerald-300"
                    }`}
                  >
                    {data.status}
                  </span>
                )}

                {(yearIso || displayRuntimeValue || data.status) &&
                  data.genres?.length > 0 && (
                    <span className="w-1 h-1 rounded-full bg-white/30" />
                  )}

                {/* Géneros */}
                {data.genres?.length > 0 && (
                  <div className="flex flex-wrap items-center gap-2">
                    {data.genres.slice(0, 3).map((g) => (
                      <span
                        key={g.id}
                        className="inline-flex items-center px-2 py-0.5 rounded-md border border-white/10 bg-white/5 text-[10px] font-bold uppercase tracking-widest text-zinc-300 backdrop-blur-md shadow-sm"
                      >
                        {g.name}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </FadeIn>

            {/* =================================================================
                BARRA DE ACCIONES PRINCIPALES
               ================================================================= */}
            {/* Sección de botones de acción rápida: reproducir tráiler, marcar como visto,
                puntuar, agregar a favoritos, watchlist y listas, cambiar portada */}
            <FadeIn delay={0.12} className="mb-6 px-1 w-full">
              <div
                className="flex flex-nowrap items-center justify-center sm:justify-start gap-2.5 sm:gap-3 w-full
                [&>*:not(.separator)]:flex-1 [&>*:not(.separator)]:min-w-[36px] [&>*:not(.separator)]:max-w-[60px] sm:[&>*:not(.separator)]:max-w-[52px]
                [&_[data-liquid-button]]:!w-full [&_[data-liquid-button]]:!h-auto [&_[data-liquid-button]]:aspect-square
                [&_[data-liquid-button]_svg]:!w-[22px] [&_[data-liquid-button]_svg]:!h-[22px]
                [&_[data-liquid-button]_.text-xl]:!text-[22px]"
              >
                {/* Botón de reproducción de tráiler - Solo habilitado si hay video disponible */}
                <LiquidButton
                  onClick={() => openVideo(preferredVideo)}
                  disabled={!preferredVideo}
                  active={!!preferredVideo}
                  activeColor="yellow"
                  groupId="details-actions"
                  className={preferredVideo ? "!bg-white !text-black" : ""}
                  title={preferredVideo ? "Ver Tráiler" : "Sin Tráiler"}
                >
                  <Play
                    className={`fill-current ${preferredVideo ? "ml-0.5 sm:ml-1" : ""}`}
                  />
                </LiquidButton>

                {/* Botón de música/soundtrack - Abre canciones encontradas en Spotify */}
                <LiquidButton
                  onClick={() => openSoundtrack()}
                  disabled={!soundtrackSearchQuery}
                  active={!!soundtrackSearchQuery}
                  activeColor="yellow"
                  groupId="details-actions"
                  className={
                    soundtrackSearchQuery ? "!bg-white !text-black" : ""
                  }
                  title={
                    soundtrackSearchQuery
                      ? "Reproducir soundtrack"
                      : "Sin soundtrack"
                  }
                >
                  <Music2 />
                </LiquidButton>

                {/* Separador vertical entre el botón de tráiler y los controles de Trakt */}
                <div className="w-px h-8 bg-white/10 mx-0.5 sm:mx-1 hidden sm:block shrink-0 separator" />

                {/* Control de visto/no visto en Trakt - Muestra estado de visualización y plays */}
                <TraktWatchedControl
                  connected={trakt.connected}
                  watched={trakt.watched}
                  plays={endpointType === "tv" ? 0 : trakt.plays}
                  badge={endpointType === "tv" ? tvProgressBadge : null}
                  busy={!!traktBusy}
                  loading={
                    (endpointType === "movie"
                      ? trakt.loading && !canOpenMovieTraktModalInstantly
                      : trakt.loading) ||
                    (endpointType === "tv" &&
                      !!trakt.connected &&
                      !watchedBySeasonLoaded)
                  }
                  onOpen={handleOpenTraktWatched}
                />

                {/* Componente de puntuación con estrellas - Rating unificado TMDb + Trakt */}
                {/* Permite al usuario puntuar el contenido, sincronizando entre ambas plataformas */}
                <StarRating
                  rating={unifiedUserRating}
                  max={10}
                  loading={accountStatesLoading || ratingLoading || !!traktBusy}
                  onRate={handleUnifiedRate}
                  connected={!!session || trakt.connected}
                  onConnect={() => {
                    window.location.href = "/login";
                  }}
                />

                {/* Botón de Favoritos - Añade o quita el contenido de la lista de favoritos del usuario */}
                <LiquidButton
                  onClick={toggleFavorite}
                  disabled={favLoading}
                  active={favorite}
                  activeColor="red"
                  groupId="details-actions"
                  title={
                    favorite ? "Quitar de favoritos" : "Añadir a favoritos"
                  }
                  aria-label={
                    favorite ? "Quitar de favoritos" : "Añadir a favoritos"
                  }
                >
                  {favLoading ? (
                    <Loader2 className="animate-spin" />
                  ) : (
                    <Heart className={`${favorite ? "fill-current" : ""}`} />
                  )}
                </LiquidButton>

                {/* Botón de Watchlist - Añade o quita el contenido de la lista de pendientes */}
                <LiquidButton
                  onClick={toggleWatchlist}
                  disabled={wlLoading}
                  active={watchlist}
                  activeColor="blue"
                  groupId="details-actions"
                  title={
                    watchlist ? "Quitar de pendientes" : "Añadir a pendientes"
                  }
                  aria-label={
                    watchlist ? "Quitar de pendientes" : "Añadir a pendientes"
                  }
                >
                  {wlLoading ? (
                    <Loader2 className="animate-spin" />
                  ) : (
                    <BookmarkPlus
                      className={`${watchlist ? "fill-current" : ""}`}
                    />
                  )}
                </LiquidButton>

                {/* Botón de añadir a listas personalizadas - Solo visible si el usuario tiene acceso a listas */}
                {canUseLists && (
                  <LiquidButton
                    onClick={openListsModal}
                    disabled={listsPresenceLoading}
                    active={listActive}
                    activeColor="purple"
                    groupId="details-actions"
                    title="Añadir a lista"
                  >
                    {listsPresenceLoading ? (
                      <Loader2 className="animate-spin" />
                    ) : (
                      <ListVideo />
                    )}
                  </LiquidButton>
                )}
              </div>
            </FadeIn>

            {/* =================================================================
                PANEL DE PUNTUACIONES Y ESTADÍSTICAS
               ================================================================= */}
            {/* Tarjeta compacta que muestra los ratings de diferentes plataformas
                (TMDb, Trakt, IMDb, Rotten Tomatoes, Metacritic) y estadísticas
                de visualización (watchers, plays, lists, favorited) */}
            <ScaleIn delay={0.18} className="mb-6">
              <div className="relative isolate w-full overflow-hidden rounded-2xl bg-black/20 bg-gradient-to-br from-white/10 via-transparent to-black/40 backdrop-blur-[50px] shadow-[0_15px_40px_-10px_rgba(0,0,0,0.8)] transform-gpu mb-6">
                <div
                  className="
      py-3
      pl-[calc(1rem+env(safe-area-inset-left))]
      pr-[calc(1.25rem+env(safe-area-inset-right))]
      sm:px-4
      flex items-center gap-3 sm:gap-4
      overflow-x-clip sm:overflow-visible overscroll-none [touch-action:pan-y]
    "
                >
                  {/* ========== A. RATINGS - Puntuaciones de diferentes plataformas ========== */}
                  {/* Sección de badges compactos que muestran las puntuaciones y votos de cada plataforma */}
                  <div className="flex items-center gap-4 sm:gap-5 shrink-0">
                    {/* Indicador de carga mientras se obtienen las puntuaciones de Trakt */}
                    <div className="absolute opacity-0 pointer-events-none w-4 h-4">
                      {tScoreboard.loading ? (
                        <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                      ) : null}
                    </div>

                    {/* Badge de TMDb - Muestra la puntuación promedio y número de votos */}
                    <CompactBadge
                      logo="/logo-TMDb.png"
                      logoClassName="h-5 sm:h-5"
                      value={data.vote_average?.toFixed(1)}
                      sub={formatCountShort(data.vote_count)}
                      href={tmdbDetailUrl}
                      disableHoverLift
                      tooltip={tmdbDetailUrl ? "Ver en TMDb" : "TMDb"}
                    />

                    {/* Badge de Trakt - Muestra puntuación en formato decimal cuando el usuario está conectado */}
                    {/* En móvil sin sufijo, en desktop con % */}
                    {traktDecimal && (
                      <CompactBadge
                        logo="/logo-Trakt.png"
                        value={traktDecimal}
                        sub={
                          tScoreboard.votes
                            ? formatCountShort(tScoreboard.votes)
                            : undefined
                        }
                        href={trakt?.traktUrl}
                        animateOnMount={false}
                        disableHoverLift
                        onClick={
                          !trakt?.connected
                            ? () =>
                                window.location.assign(
                                  `/api/trakt/auth/start?next=/details/${type}/${id}`,
                                )
                            : undefined
                        }
                        tooltip={trakt?.traktUrl ? "Ver en Trakt" : "Trakt"}
                      />
                    )}

                    {/* Badge de Trakt alternativo cuando no hay conexión pero existe score público */}
                    {/* Se muestra solo si el usuario no está conectado a Trakt pero hay datos públicos disponibles */}
                    {!traktDecimal &&
                      !trakt?.connected &&
                      tScoreboard?.rating && (
                        <CompactBadge
                          logo="/logo-Trakt.png"
                          value={Number(tScoreboard.rating).toFixed(1)}
                          sub={
                            tScoreboard.votes
                              ? formatCountShort(tScoreboard.votes)
                              : undefined
                          }
                          animateOnMount={false}
                          disableHoverLift
                          onClick={() =>
                            window.location.assign(
                              `/api/trakt/auth/start?next=/details/${type}/${id}`,
                            )
                          }
                          tooltip="Ver en Trakt"
                        />
                      )}

                    {/* Badge de IMDb - Muestra rating y votos, enlaza al título en IMDb */}
                    {extras.imdbRating && (
                      <CompactBadge
                        logo="/logo-IMDb.svg"
                        logoWrapClassName="min-w-[28px]"
                        logoClassName="!h-5 sm:!h-[22px] !max-h-none !max-w-[34px]"
                        value={Number(extras.imdbRating).toFixed(1)}
                        sub={formatCountShort(extras.imdbVotes)}
                        href={
                          resolvedImdbId
                            ? `https://www.imdb.com/title/${resolvedImdbId}`
                            : undefined
                        }
                        disableHoverLift
                        tooltip={resolvedImdbId ? "Ver en IMDb" : "IMDb"}
                      />
                    )}

                    {/* Badge de Rotten Tomatoes - Solo visible en desktop (>= sm) */}
                    {/* Muestra el porcentaje de audiencia de RT, prioriza datos de Trakt sobre OMDb */}
                    {(tScoreboard?.external?.rtAudience != null ||
                      extras.rtScore != null) && (
                      <div className="hidden sm:block">
                        <CompactBadge
                          logo="/logo-RottenTomatoes.png"
                          value={
                            tScoreboard?.external?.rtAudience != null
                              ? Math.round(tScoreboard.external.rtAudience)
                              : extras.rtScore != null
                                ? Math.round(extras.rtScore)
                                : null
                          }
                          suffix="%"
                          tooltip="Rotten Tomatoes"
                        />
                      </div>
                    )}

                    {/* Badge de Metacritic - Solo visible en desktop (>= sm) */}
                    {/* Muestra la puntuación de Metacritic sobre 100 */}
                    {extras.mcScore != null && (
                      <div className="hidden sm:block">
                        <CompactBadge
                          logo="/logo-Metacritic.png"
                          value={Math.round(extras.mcScore)}
                          suffix="/100"
                          tooltip="Metacritic"
                        />
                      </div>
                    )}
                  </div>

                  {/* ========== Separador vertical 1 ========== */}
                  {/* Solo se muestra cuando NO estamos en modo backdrop */}
                  {!isBackdropPoster && (
                    <div className="w-px h-6 bg-white/10 shrink-0" />
                  )}

                  {/* ========== B. ENLACES EXTERNOS ========== */}
                  {/* Botones para acceder a páginas externas (Web oficial, JustWatch, etc.) */}
                  {/* Solo se muestran aquí cuando NO estamos en modo backdrop (en ese modo se muestran abajo con las plataformas) */}
                  {!isBackdropPoster && (
                    <div className="flex-1 min-w-0 flex items-center justify-end gap-2.5 sm:gap-3">
                      {/* Versión Desktop: iconos normales de enlaces externos */}
                      <div className="hidden sm:flex items-center gap-2.5 sm:gap-3">
                        {/* Sitio web oficial */}
                        <div className="hidden sm:block">
                          <ExternalLinkButton
                            icon="/logo-Web.png"
                            href={officialSiteUrl}
                          />
                        </div>

                        {/* JustWatch - dónde ver el contenido */}
                        <ExternalLinkButton
                          icon="/logo-JustWatch.png"
                          title="JustWatch"
                          href={jwHref}
                          fallbackHref={justWatchUrl}
                        />

                        {/* Letterboxd - solo para películas */}
                        {isMovie && (
                          <ExternalLinkButton
                            icon="/logo-Letterboxd.png"
                            href={letterboxdUrl}
                          />
                        )}

                        {/* SeriesGraph - solo para series */}
                        {type === "tv" && (
                          <ExternalLinkButton
                            icon="/logoseriesgraph.png"
                            href={seriesGraphUrl}
                          />
                        )}

                        {/* FilmAffinity */}
                        <ExternalLinkButton
                          icon="/logoFilmaffinity.png"
                          title="FilmAffinity"
                          href={filmAffinitySearchUrl}
                        />
                      </div>

                      {/* Versión Móvil: botón "..." que abre modal de enlaces */}
                      <button
                        type="button"
                        onClick={() => setExternalLinksOpen(true)}
                        className="sm:hidden flex isolate transform-gpu items-center justify-center w-10 h-10 rounded-full bg-black/20 bg-gradient-to-br from-white/10 via-white/5 to-black/40 backdrop-blur-[50px] shadow-[0_10px_30px_-10px_rgba(0,0,0,0.5)] text-zinc-200 transition-all duration-300 hover:text-white hover:bg-white/10"
                        title="Enlaces"
                        aria-label="Abrir enlaces externos"
                      >
                        <MoreHorizontal className="w-5 h-5" />
                      </button>
                    </div>
                  )}

                  {/* ========== Separador vertical 2 ========== */}
                  {/* Solo visible en desktop (>= md) y cuando NO estamos en modo backdrop */}
                  {!isBackdropPoster && (
                    <div className="hidden md:block w-px h-6 bg-white/10 shrink-0" />
                  )}

                  {/* ========== Botón de Compartir ========== */}
                  {/* Permite compartir el contenido usando la API Web Share o copiando el enlace */}
                  {/* Se mantiene pegado al extremo derecho con ml-auto */}
                  <div className="ml-auto shrink-0 max-sm:[&>button]:!flex max-sm:[&>button]:!isolate max-sm:[&>button]:!transform-gpu max-sm:[&>button]:!overflow-hidden max-sm:[&>button]:!items-center max-sm:[&>button]:!justify-center max-sm:[&>button]:!w-10 max-sm:[&>button]:!h-10 max-sm:[&>button]:!p-0 max-sm:[&>button]:!rounded-full max-sm:[&>button]:!border-0 max-sm:[&>button]:!ring-0 max-sm:[&>button]:!outline-none max-sm:[&>button]:[-webkit-tap-highlight-color:transparent] max-sm:[&>button]:!bg-black/20 max-sm:[&>button]:!bg-gradient-to-br max-sm:[&>button]:!from-white/10 max-sm:[&>button]:!via-white/5 max-sm:[&>button]:!to-black/40 max-sm:[&>button]:!backdrop-blur-[50px] max-sm:[&>button]:!shadow-[0_10px_30px_-10px_rgba(0,0,0,0.5)] max-sm:[&>button]:!text-zinc-200 max-sm:[&>button]:!transition-all max-sm:[&>button]:!duration-300 hover:max-sm:[&>button]:!text-white hover:max-sm:[&>button]:!bg-white/10 hover:max-sm:[&>button]:!-translate-y-0.5 hover:max-sm:[&>button]:!border-0 hover:max-sm:[&>button]:!ring-0 focus:max-sm:[&>button]:!outline-none focus:max-sm:[&>button]:!border-0 focus:max-sm:[&>button]:!ring-0 active:max-sm:[&>button]:!border-0 active:max-sm:[&>button]:!ring-0 max-sm:[&>button>span]:!hidden max-sm:[&>button_svg]:!w-5 max-sm:[&>button_svg]:!h-5">
                    <ActionShareButton
                      title={title}
                      text={`Echa un vistazo a ${title} en The Show Verse`}
                    />
                  </div>
                </div>
                {/* =================================================================
                  FOOTER DE ESTADÍSTICAS (Watchers, Plays, Lists, Favorited)
                 ================================================================= */}
                {/* Muestra estadísticas de Trakt en formato compacto con scroll horizontal */}
                {/* Visible en móvil sin recortes gracias al padding con safe-area */}
                {/* Mostrar cuando hay stats numéricas (incluyendo de cache stale) */}
                {Object.values(tScoreboard?.stats || {}).some(
                  (v) => typeof v === "number",
                ) && (
                  <div className="border-t border-white/5 bg-black/10 rounded-b-2xl">
                    {/* Scroller con padding + safe-area para que no se recorte en bordes */}
                    <div
                      className="
        overflow-x-clip sm:overflow-visible overscroll-none [touch-action:pan-y]
        py-2
        pl-[calc(1rem+env(safe-area-inset-left))]
        pr-[calc(1rem+env(safe-area-inset-right))]
      "
                    >
                      {/* Contenedor interno con min-w-max para evitar que se corten los últimos elementos */}
                      <div className="flex w-full min-w-0 items-center justify-start gap-2 sm:gap-3">
                        {/* Watchers - Usuarios que siguen este contenido */}
                        <div className="shrink-0">
                          <MiniStat
                            icon={Eye}
                            value={formatVoteCount(
                              tScoreboard?.stats?.watchers ?? 0,
                            )}
                            tooltip="Watchers"
                          />
                        </div>

                        {/* Plays - Número de reproducciones totales */}
                        <div className="shrink-0">
                          <MiniStat
                            icon={Play}
                            value={formatVoteCount(
                              tScoreboard?.stats?.plays ?? 0,
                            )}
                            tooltip="Plays"
                          />
                        </div>

                        {/* Lists - Cantidad de listas que incluyen este contenido */}
                        <div className="shrink-0">
                          <MiniStat
                            icon={List}
                            value={formatVoteCount(
                              tScoreboard?.stats?.lists ?? 0,
                            )}
                            tooltip="Lists"
                          />
                        </div>

                        {/* Favorited - Usuarios que lo han marcado como favorito */}
                        <div className="shrink-0">
                          <MiniStat
                            icon={Heart}
                            value={formatVoteCount(
                              tScoreboard?.stats?.favorited ?? 0,
                            )}
                            tooltip="Favorited"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </ScaleIn>

            {/* =================================================================
                CONTENEDOR DE TABS Y CONTENIDO - Información detallada
               ================================================================= */}
            {/* Sistema de tabs para mostrar información adicional: Detalles, Producción, Sinopsis, Premios */}
            {/* Solo visible cuando NO estamos en modo backdrop (en ese modo se muestra más abajo) */}
            {!isBackdropPoster && (
              <FadeIn delay={0.24}>
                <div>
                  {/* ========== MENÚ DE NAVEGACIÓN DE TABS ========== */}
                  {/* Pestañas clicables para cambiar entre diferentes vistas de información */}
                  {/* Incluye: Detalles, Producción, Sinopsis, y Premios (si están disponibles) */}
                  <DetailsTabsMenu
                    tabs={[
                      { id: "details", label: "Detalles" },
                      { id: "production", label: "Producción" },
                      { id: "synopsis", label: "Sinopsis" },
                      ...(extras.awards || hasAwardItems
                        ? [{ id: "awards", label: "Premios" }]
                        : []),
                    ]}
                    activeTab={activeTab}
                    onChangeTab={setActiveTab}
                    layoutId="detailsTabInline"
                  />

                  {/* ========== ÁREA DE CONTENIDO DE TABS ========== */}
                  {/* Muestra el contenido de la tab activa con animaciones de transición */}
                  {/* Usa AnimatePresence de Framer Motion para animar cambios entre tabs */}
                  <div className="relative min-h-[100px]">
                    <AnimatePresence mode="wait">
                      {/* ===== TAB 1: SINOPSIS ===== */}
                      {/* Muestra el tagline (si existe) y la descripción completa del contenido */}
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
                            <div className="relative z-10">
                              {data.tagline && (
                                <div className="text-yellow-500/80 text-lg font-serif italic mb-3">
                                  “{data.tagline}”
                                </div>
                              )}
                              <p className="text-zinc-200 text-base md:text-lg leading-relaxed text-justify whitespace-pre-line">
                                {data.overview ||
                                  "No hay descripción disponible."}
                              </p>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* ===== TAB 2: DETALLES ===== */}
                      {/* Información técnica: título original, formato, fechas, presupuesto, recaudación */}
                      {activeTab === "details" && (
                        <div key="details">
                          <div className="flex flex-col gap-3 lg:flex-row lg:flex-nowrap lg:items-stretch lg:overflow-x-auto lg:pb-2 lg:[scrollbar-width:none]">
                            {/* Tarjeta: Título Original - Nombre del contenido en su idioma original */}
                            <VisualMetaCard
                              icon={type === "movie" ? FilmIcon : MonitorPlay}
                              label="Título Original"
                              value={
                                type === "movie"
                                  ? data.original_title
                                  : data.original_name
                              }
                              expanded={true}
                              className="w-full lg:w-auto lg:flex-auto lg:shrink-0"
                            />

                            {/* Tarjeta: Formato - Solo para series (número de temporadas y episodios) */}
                            {type !== "movie" ? (
                              <VisualMetaCard
                                icon={Layers}
                                label="Formato"
                                value={
                                  data.number_of_seasons
                                    ? `${data.number_of_seasons} Temp. / ${data.number_of_episodes} Caps.`
                                    : "—"
                                }
                                className="w-full lg:w-auto lg:flex-auto lg:shrink-0"
                              />
                            ) : null}

                            {/* Tarjeta: Fecha de Estreno/Inicio - Película: fecha de estreno, Serie: fecha de inicio */}
                            <VisualMetaCard
                              icon={CalendarIcon}
                              label={type === "movie" ? "Estreno" : "Inicio"}
                              value={releaseDateValue || "—"}
                              className="w-full lg:w-auto lg:flex-auto lg:shrink-0"
                            />

                            {/* Tarjeta: Finalización/Última Emisión - Solo para series */}
                            {type !== "movie" && lastAirDateValue && (
                              <VisualMetaCard
                                icon={CalendarIcon}
                                label={
                                  data.status === "Ended"
                                    ? "Finalización"
                                    : "Última emisión"
                                }
                                value={lastAirDateValue || "En emisión"}
                                className="w-full lg:w-auto lg:flex-auto lg:shrink-0"
                              />
                            )}

                            {/* Tarjetas de Presupuesto y Recaudación - Solo para películas */}
                            {type === "movie" && (
                              <>
                                <VisualMetaCard
                                  icon={BadgeDollarSignIcon}
                                  label="Presupuesto"
                                  value={budgetValue || "—"}
                                  className="w-full lg:w-auto lg:flex-auto lg:shrink-0"
                                />
                                <VisualMetaCard
                                  icon={TrendingUp}
                                  label="Recaudación"
                                  value={revenueValue || "—"}
                                  className="w-full lg:w-auto lg:flex-auto lg:shrink-0"
                                />
                              </>
                            )}
                          </div>
                        </div>
                      )}

                      {/* ===== TAB 3: PRODUCCIÓN Y EQUIPO ===== */}
                      {/* Información sobre el equipo creativo: director/creadores, canal, productoras */}
                      {activeTab === "production" && (
                        <div key="production">
                          <div className="flex flex-col gap-3 lg:flex-row lg:flex-nowrap lg:items-stretch lg:overflow-x-auto lg:pb-2 lg:[scrollbar-width:none]">
                            {/* Tarjeta: Director (Cine) / Creadores (TV) - Equipo principal creativo */}
                            <VisualMetaCard
                              icon={Users}
                              label={
                                type === "movie" ? "Director" : "Creadores"
                              }
                              value={
                                type === "movie"
                                  ? movieDirector || "Desconocido"
                                  : createdByNames || "Desconocido"
                              }
                              expanded={true}
                              className="w-full lg:w-auto lg:flex-auto lg:shrink-0"
                            />

                            {/* Canal (solo TV) */}
                            {type !== "movie" ? (
                              <VisualMetaCard
                                icon={MonitorPlay}
                                label="Canal"
                                value={network || "—"}
                                className="w-full lg:w-auto lg:flex-auto lg:shrink-0"
                              />
                            ) : null}

                            {/* Producción (ambos) */}
                            <VisualMetaCard
                              icon={Building2}
                              label="Producción"
                              value={production || "—"}
                              expanded={true}
                              className="w-full lg:w-auto lg:flex-auto lg:shrink-0"
                            />
                          </div>
                        </div>
                      )}

                      {/* 4. PREMIOS */}
                      {activeTab === "awards" &&
                        (extras.awards || hasAwardItems) && (
                          <div key="awards">
                            {extras.awards ? (
                              <AwardsPanel awards={extras.awards} />
                            ) : (
                              <div className="relative p-5 sm:p-6 rounded-xl overflow-hidden">
                                <div
                                  className="absolute inset-0 rounded-[inherit] bg-black/10 bg-gradient-to-br from-white/10 via-transparent to-black/20 backdrop-blur-[15px] pointer-events-none overflow-hidden"
                                  style={{
                                    WebkitMaskImage:
                                      "-webkit-radial-gradient(white, black)",
                                  }}
                                />
                                <div className="absolute top-0 right-0 -mt-6 -mr-6 w-32 h-32 bg-yellow-500/10 blur-3xl rounded-full pointer-events-none z-10" />
                                <div className="relative z-10">
                                  <div className="flex items-start gap-4">
                                    <div className="p-3 rounded-xl bg-yellow-500/10 text-yellow-500 shrink-0">
                                      <Trophy className="w-8 h-8" />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                      <h3 className="text-lg font-bold text-white mb-2">
                                        Premios y nominaciones
                                      </h3>
                                      <p className="text-base leading-relaxed text-zinc-200">
                                        {
                                          awardItems.filter(
                                            (a) => a.result === "winner",
                                          ).length
                                        }{" "}
                                        premios y{" "}
                                        {
                                          awardItems.filter(
                                            (a) => a.result === "nominee",
                                          ).length
                                        }{" "}
                                        nominaciones
                                      </p>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                    </AnimatePresence>
                  </div>
                </div>
              </FadeIn>
            )}
          </div>
        </motion.div>

        {/* Tabs y contenido debajo de la tarjeta (solo cuando es backdrop) */}
        {isBackdropPoster && (
          <FadeIn delay={0.24} className="mt-6 w-full">
            {/* --- MENÚ DE NAVEGACIÓN --- */}
            <DetailsTabsMenu
              tabs={[
                { id: "details", label: "Detalles" },
                { id: "production", label: "Producción" },
                { id: "synopsis", label: "Sinopsis" },
                ...(extras.awards || hasAwardItems
                  ? [{ id: "awards", label: "Premios" }]
                  : []),
              ]}
              activeTab={activeTab}
              onChangeTab={setActiveTab}
              layoutId="detailsTabBackdrop"
            />

            {/* --- ÁREA DE CONTENIDO --- */}
            <div className="relative min-h-[100px]">
              <AnimatePresence mode="wait">
                {/* 1. SINOPSIS */}
                {activeTab === "synopsis" && (
                  <div key="synopsis-backdrop">
                    <div className="relative p-5 sm:p-6 rounded-xl overflow-hidden">
                      {/* Capa de fondo estilo ScoreboardBar (cristal más claro, difuminado de 15px) */}
                      <div
                        className="absolute inset-0 rounded-[inherit] bg-black/10 bg-gradient-to-br from-white/10 via-transparent to-black/20 backdrop-blur-[15px] pointer-events-none overflow-hidden"
                        style={{
                          WebkitMaskImage:
                            "-webkit-radial-gradient(white, black)",
                        }}
                      />
                      <div className="relative z-10">
                        {data.tagline && (
                          <div className="text-yellow-500/80 text-lg font-serif italic mb-3">
                            "{data.tagline}"
                          </div>
                        )}
                        <p className="text-zinc-200 text-base md:text-lg leading-relaxed text-justify whitespace-pre-line">
                          {data.overview || "No hay descripción disponible."}
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* 2. DETALLES */}
                {activeTab === "details" && (
                  <div key="details-backdrop">
                    <div className="flex flex-col gap-3 lg:flex-row lg:flex-nowrap lg:items-stretch lg:overflow-x-auto lg:pb-2 lg:[scrollbar-width:none]">
                      <VisualMetaCard
                        icon={type === "movie" ? FilmIcon : MonitorPlay}
                        label="Título Original"
                        value={
                          type === "movie"
                            ? data.original_title
                            : data.original_name
                        }
                        expanded={true}
                        className="w-full lg:w-auto lg:flex-auto lg:shrink-0"
                      />

                      {type !== "movie" ? (
                        <VisualMetaCard
                          icon={Layers}
                          label="Formato"
                          value={
                            data.number_of_seasons
                              ? `${data.number_of_seasons} Temp. / ${data.number_of_episodes} Caps.`
                              : "—"
                          }
                          className="w-full lg:w-auto lg:flex-auto lg:shrink-0"
                        />
                      ) : null}

                      <VisualMetaCard
                        icon={CalendarIcon}
                        label={type === "movie" ? "Estreno" : "Inicio"}
                        value={releaseDateValue || "—"}
                        className="w-full lg:w-auto lg:flex-auto lg:shrink-0"
                      />

                      {type !== "movie" && lastAirDateValue && (
                        <VisualMetaCard
                          icon={CalendarIcon}
                          label={
                            data.status === "Ended"
                              ? "Finalización"
                              : "Última emisión"
                          }
                          value={lastAirDateValue}
                          className="w-full lg:w-auto lg:flex-auto lg:shrink-0"
                        />
                      )}

                      {type === "movie" && (
                        <>
                          {budgetValue && (
                            <VisualMetaCard
                              icon={BadgeDollarSignIcon}
                              label="Presupuesto"
                              value={budgetValue}
                              className="w-full lg:w-auto lg:flex-auto lg:shrink-0"
                            />
                          )}
                          {revenueValue && (
                            <VisualMetaCard
                              icon={TrendingUp}
                              label="Recaudación"
                              value={revenueValue}
                              className="w-full lg:w-auto lg:flex-auto lg:shrink-0"
                            />
                          )}
                        </>
                      )}
                    </div>
                  </div>
                )}

                {/* 3. PRODUCCIÓN */}
                {activeTab === "production" && (
                  <div key="production-backdrop">
                    <div className="flex flex-col gap-3 lg:flex-row lg:flex-nowrap lg:items-stretch lg:overflow-x-auto lg:pb-2 lg:[scrollbar-width:none]">
                      <VisualMetaCard
                        icon={Users}
                        label={type === "movie" ? "Director" : "Creadores"}
                        value={
                          type === "movie"
                            ? movieDirector || "Desconocido"
                            : createdByNames || "Desconocido"
                        }
                        expanded={true}
                        className="w-full lg:w-auto lg:flex-auto lg:shrink-0"
                      />

                      {type !== "movie" && network && (
                        <VisualMetaCard
                          icon={MonitorPlay}
                          label="Canal"
                          value={network}
                          className="w-full lg:w-auto lg:flex-auto lg:shrink-0"
                        />
                      )}

                      <VisualMetaCard
                        icon={Building2}
                        label="Producción"
                        value={production || "—"}
                        expanded={true}
                        className="w-full lg:w-auto lg:flex-auto lg:shrink-0"
                      />
                    </div>
                  </div>
                )}

                {/* ===== TAB 4: PREMIOS ===== */}
                {activeTab === "awards" && (extras.awards || hasAwardItems) && (
                  <div key="awards-backdrop">
                    {extras.awards ? (
                      <AwardsPanel awards={extras.awards} />
                    ) : (
                      <div className="relative p-5 sm:p-6 rounded-xl overflow-hidden">
                        <div
                          className="absolute inset-0 rounded-[inherit] bg-black/10 bg-gradient-to-br from-white/10 via-transparent to-black/20 backdrop-blur-[15px] pointer-events-none overflow-hidden"
                          style={{
                            WebkitMaskImage:
                              "-webkit-radial-gradient(white, black)",
                          }}
                        />
                        <div className="absolute top-0 right-0 -mt-6 -mr-6 w-32 h-32 bg-yellow-500/10 blur-3xl rounded-full pointer-events-none z-10" />
                        <div className="relative z-10">
                          <div className="flex items-start gap-4">
                            <div className="p-3 rounded-xl bg-yellow-500/10 text-yellow-500 shrink-0">
                              <Trophy className="w-8 h-8" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <h3 className="text-lg font-bold text-white mb-2">
                                Premios y nominaciones
                              </h3>
                              <p className="text-base leading-relaxed text-zinc-200">
                                {
                                  awardItems.filter(
                                    (a) => a.result === "winner",
                                  ).length
                                }{" "}
                                premios y{" "}
                                {
                                  awardItems.filter(
                                    (a) => a.result === "nominee",
                                  ).length
                                }{" "}
                                nominaciones
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </AnimatePresence>
            </div>
          </FadeIn>
        )}

        {/* =================================================================
            MENÚ DE NAVEGACIÓN STICKY Y SECCIONES DE CONTENIDO
           ================================================================= */}
        {/* Sistema de navegación por secciones con detección de scroll */}
        {/* Incluye: Media, Actores, Recomendaciones, Comentarios, etc. */}
        <div className="mt-8 sm:mt-10">
          {/* Elemento centinela para detectar cuándo el menú debe quedar sticky */}
          <div ref={sentinelRef} className="h-px w-full" />

          {/* Menú de navegación sticky que se queda fijo debajo del navbar al hacer scroll */}
          <div
            ref={menuStickyRef}
            className="sticky z-30 py-2"
            style={{
              top: STICKY_TOP,
              willChange: "transform",
              backfaceVisibility: "hidden",
            }}
          >
            <DetailsSectionMenu
              items={sectionItems}
              activeId={activeSectionId}
              onChange={scrollToSection}
            />
          </div>

          {/* =================================================================
              CONTENEDOR DE TODAS LAS SECCIONES
             ================================================================= */}
          {/* Todas las secciones se muestran en orden sin ocultarse */}
          {/* Cada sección se registra para el sistema de detección de scroll */}
          <div className="mt-6 space-y-14">
            <section id="section-cast" ref={registerSection("cast")}>
              <AnimatedSection delay={0.04}>
                {/* === REPARTO PRINCIPAL (Cast) === */}
                {!castSectionLoading &&
                  castDataForUI &&
                  castDataForUI.length > 0 && (
                    <section className="mb-16 group/section">
                      <SectionTitle title="Reparto Principal" icon={Users} />
                      <DetailsArrowCarousel
                        spaceBetween={12}
                        slidesPerView={3}
                        breakpoints={{
                          500: { slidesPerView: 3, spaceBetween: 14 },
                          768: { slidesPerView: 4, spaceBetween: 16 },
                          1024: { slidesPerView: 5, spaceBetween: 18 },
                          1280: { slidesPerView: 6, spaceBetween: 20 },
                        }}
                        className="pb-8 !overflow-visible"
                      >
                        {castDataForUI.slice(0, 20).map((actor) => (
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
                  )}
              </AnimatedSection>
            </section>

            <section id="section-recs" ref={registerSection("recs")}>
              <AnimatedSection delay={0.04}>
                {/* === RECOMENDACIONES === */}
                {canRenderRecommendations &&
                  recommendations &&
                  recommendations.length > 0 && (
                    <section className="mb-16 group/section">
                      <SectionTitle
                        title="Recomendaciones"
                        icon={MonitorPlay}
                      />

                      <DetailsArrowCarousel
                        spaceBetween={12}
                        slidesPerView={3}
                        breakpoints={{
                          500: { slidesPerView: 3, spaceBetween: 14 },
                          768: { slidesPerView: 4, spaceBetween: 16 },
                          1024: { slidesPerView: 5, spaceBetween: 18 },
                          1280: { slidesPerView: 6, spaceBetween: 20 },
                        }}
                        className="pb-8 !overflow-visible"
                      >
                        {recommendations.slice(0, 15).map((rec, index) => {
                          const recTitle = rec.title || rec.name;
                          const recDate =
                            rec.release_date || rec.first_air_date || "";
                          const recYear = recDate ? recDate.slice(0, 4) : "";
                          const isMovie = rec.media_type
                            ? rec.media_type === "movie"
                            : type === "movie";
                          const recType =
                            rec.media_type === "movie" ||
                            rec.media_type === "tv"
                              ? rec.media_type
                              : isMovie
                                ? "movie"
                                : "tv";
                          const recAccountState =
                            recAccountStates[`${recType}:${rec.id}`] || null;
                          const recIsFavorite = !!recAccountState?.favorite;
                          const recIsWatchlist = !!recAccountState?.watchlist;
                          const recUserRating =
                            typeof recAccountState?.rating === "number" &&
                            Number.isFinite(recAccountState.rating) &&
                            recAccountState.rating > 0
                              ? recAccountState.rating
                              : null;
                          const recUserRatingLabel =
                            recUserRating == null
                              ? null
                              : Number.isInteger(recUserRating)
                                ? String(recUserRating)
                                : recUserRating.toFixed(1);
                          const recAccountBadgeColor =
                            recIsFavorite && recIsWatchlist
                              ? "bg-fuchsia-500/15 border-fuchsia-500/30 text-fuchsia-300"
                              : recIsFavorite
                                ? "bg-red-500/15 border-red-500/30 text-red-300"
                                : "bg-blue-500/15 border-blue-500/30 text-blue-300";

                          const tmdbScore =
                            typeof rec.vote_average === "number" &&
                            rec.vote_average > 0
                              ? rec.vote_average
                              : null;

                          const imdbScore =
                            recImdbRatings[rec.id] != null
                              ? recImdbRatings[rec.id]
                              : undefined;

                          // En móvil, deshabilitar hover para mostrar solo las imágenes
                          const enableHover =
                            supportsHover && !isMobileViewport;
                          const showAccountBadge =
                            enableHover && (recIsFavorite || recIsWatchlist);
                          const recCardClass = enableHover
                            ? "block group relative bg-zinc-900 rounded-xl overflow-hidden border border-zinc-800/80 shadow-md lg:hover:shadow-yellow-900/20 hover:border-yellow-500/30 transition-all duration-300"
                            : "block relative bg-zinc-900 rounded-xl overflow-hidden border border-zinc-800/80 shadow-md";
                          const recImageClass = enableHover
                            ? "w-full h-full object-cover transition-transform duration-500 ease-out group-hover:scale-110"
                            : "w-full h-full object-cover";
                          const recOverlayClass = enableHover
                            ? "absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent opacity-0 transition-opacity duration-500 group-hover:opacity-100"
                            : "hidden";
                          const recHeaderInfoClass = enableHover
                            ? "absolute inset-x-0 top-0 z-10 flex items-start justify-between p-2 opacity-0 transition-all duration-500 ease-out -translate-y-2 group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:translate-y-0 group-focus-within:opacity-100"
                            : "hidden";
                          const recFooterInfoClass = enableHover
                            ? "absolute bottom-0 left-0 right-0 p-3 pb-4 opacity-0 transition-all duration-500 ease-out translate-y-2 group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:translate-y-0 group-focus-within:opacity-100"
                            : "hidden";

                          return (
                            <SwiperSlide key={rec.id}>
                              <Link
                                href={`/details/${rec.media_type || type}/${rec.id}`}
                                className={recCardClass}
                                onMouseEnter={
                                  enableHover
                                    ? () => prefetchRecImdb(rec)
                                    : undefined
                                }
                                onFocus={
                                  enableHover
                                    ? () => prefetchRecImdb(rec)
                                    : undefined
                                }
                              >
                                <div className="aspect-[2/3] overflow-hidden relative">
                                  <img
                                    src={
                                      rec.poster_path
                                        ? `https://image.tmdb.org/t/p/w342${rec.poster_path}`
                                        : "/placeholder.png"
                                    }
                                    alt={recTitle}
                                    loading="lazy"
                                    decoding="async"
                                    sizes="(max-width: 640px) 32vw, (max-width: 1024px) 20vw, 180px"
                                    className={recImageClass}
                                  />

                                  {enableHover && (
                                    <div className="pointer-events-none absolute inset-x-0 top-0 z-[9] h-20 bg-gradient-to-b from-black/75 via-black/35 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100 group-focus-within:opacity-100" />
                                  )}

                                  {showAccountBadge && (
                                    <div
                                      className={`hidden lg:flex items-center justify-center gap-1.5 absolute top-0 left-0 z-20 p-2 sm:p-2.5 rounded-br-2xl border-r border-b backdrop-blur-md shadow-sm transition-all duration-300 ease-out transform-gpu origin-top-left lg:scale-0 lg:opacity-0 lg:group-hover:scale-100 lg:group-hover:opacity-100 ${recAccountBadgeColor}`}
                                      aria-hidden="true"
                                    >
                                      {recIsFavorite && (
                                        <Heart className="w-4 h-4 sm:w-[18px] sm:h-[18px] fill-current" />
                                      )}
                                      {recIsWatchlist && (
                                        <BookmarkPlus className="w-4 h-4 sm:w-[18px] sm:h-[18px] fill-current" />
                                      )}
                                    </div>
                                  )}

                                  <div className={recHeaderInfoClass}>
                                    <div />

                                    {(tmdbScore || imdbScore != null) && (
                                      <div className="flex flex-col items-end gap-1">
                                        {tmdbScore && (
                                          <div className="flex items-center gap-1.5 drop-shadow-[0_2px_4px_rgba(0,0,0,1)]">
                                            <span className="text-emerald-400 text-xs font-black font-mono tracking-tight">
                                              {tmdbScore.toFixed(1)}
                                            </span>
                                            <img
                                              src="/logo-TMDb.png"
                                              alt=""
                                              className="w-auto h-2.5 opacity-100"
                                              loading="lazy"
                                              decoding="async"
                                            />
                                          </div>
                                        )}
                                        {imdbScore != null && (
                                          <div className="flex items-center gap-1.5 drop-shadow-[0_2px_4px_rgba(0,0,0,1)]">
                                            <span className="text-yellow-400 text-xs font-black font-mono tracking-tight">
                                              {Number(imdbScore).toFixed(1)}
                                            </span>
                                            <img
                                              src="/logo-IMDb.svg"
                                              alt=""
                                              className="w-auto h-3 opacity-100"
                                              loading="lazy"
                                              decoding="async"
                                            />
                                          </div>
                                        )}
                                      </div>
                                    )}
                                  </div>

                                  <div className={recOverlayClass} />

                                  <div className={recFooterInfoClass}>
                                    <div className="flex items-end justify-between gap-3">
                                      <div className="min-w-0 text-left flex-1">
                                        <p className="text-white font-extrabold text-xs sm:text-sm leading-tight line-clamp-2 drop-shadow-sm">
                                          {recTitle}
                                        </p>
                                        {recYear && (
                                          <p className="mt-0.5 text-zinc-300 group-hover:text-yellow-400 text-[10px] sm:text-xs font-semibold leading-tight line-clamp-1 transition-colors duration-300 drop-shadow-sm">
                                            {recYear}
                                          </p>
                                        )}
                                      </div>
                                      {recUserRatingLabel && (
                                        <span className="text-yellow-400 text-2xl font-black font-mono tracking-tight drop-shadow-[0_2px_4px_rgba(0,0,0,1)] shrink-0">
                                          {recUserRatingLabel}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              </Link>
                            </SwiperSlide>
                          );
                        })}
                      </DetailsArrowCarousel>
                    </section>
                  )}
              </AnimatedSection>
            </section>

            {canRenderAwards && hasAwardItems && (
              <section id="section-awards" ref={registerSection("awards")}>
                <AnimatedSection delay={0.04}>
                  <section className="mb-16 group/section">
                    <SectionTitle title="Premios" icon={Trophy} />

                    <DetailsArrowCarousel
                      spaceBetween={12}
                      slidesPerView={3}
                      breakpoints={{
                        500: { slidesPerView: 3, spaceBetween: 14 },
                        768: { slidesPerView: 4, spaceBetween: 16 },
                        1024: { slidesPerView: 5, spaceBetween: 18 },
                        1280: { slidesPerView: 6, spaceBetween: 20 },
                      }}
                      className="pb-8"
                    >
                      {awardItems.map((award, index) => {
                        const previous = awardItems[index - 1] || null;
                        const startsNominations =
                          award?.result === "nominee" &&
                          previous?.result === "winner";

                        return (
                          <SwiperSlide key={award.id}>
                            <div
                              className={
                                startsNominations
                                  ? "relative before:absolute before:-left-2.5 before:top-3 before:bottom-0 before:w-px before:bg-gradient-to-b before:from-yellow-300/80 before:via-yellow-500/45 before:to-transparent"
                                  : ""
                              }
                            >
                              <AwardCard item={award} />
                            </div>
                          </SwiperSlide>
                        );
                      })}
                    </DetailsArrowCarousel>
                  </section>
                </AnimatedSection>
              </section>
            )}

            {canRenderCollection && (
              <section
                id="section-collection"
                ref={registerSection("collection")}
              >
                <AnimatedSection
                  key={`${id}-collection-${collectionLoading ? "loading" : "ready"}-${collectionData?.items?.length || 0}`}
                  delay={0.04}
                >
                  {/* --- COLECCIÓN --- */}
                  <section className="mb-10 group/section">
                    <SectionTitle title="Colección" icon={Layers} />

                    {collectionLoading ? (
                      <div className="mt-3 sm:mt-4 text-sm text-zinc-400">
                        Cargando colección…
                      </div>
                    ) : collectionData?.items?.length ? (
                      <DetailsArrowCarousel
                        spaceBetween={12}
                        slidesPerView={3}
                        breakpoints={{
                          500: { slidesPerView: 3, spaceBetween: 14 },
                          768: { slidesPerView: 4, spaceBetween: 16 },
                          1024: { slidesPerView: 5, spaceBetween: 18 },
                          1280: { slidesPerView: 6, spaceBetween: 20 },
                        }}
                        className="pb-8"
                      >
                        {collectionData.items.map((m) => {
                          const colYear = m.release_date
                            ? m.release_date.slice(0, 4)
                            : "";
                          const enableHover =
                            supportsHover && !isMobileViewport;
                          const colCardClass = enableHover
                            ? "block group relative bg-zinc-900 rounded-xl overflow-hidden border border-zinc-800/80 shadow-md lg:hover:shadow-yellow-900/20 hover:border-yellow-500/30 transition-all duration-300"
                            : "block relative bg-zinc-900 rounded-xl overflow-hidden border border-zinc-800/80 shadow-md";
                          const colImageClass = enableHover
                            ? "w-full h-full object-cover transition-transform duration-500 ease-out group-hover:scale-110"
                            : "w-full h-full object-cover";
                          const colOverlayClass = enableHover
                            ? "absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent opacity-0 transition-opacity duration-500 group-hover:opacity-100"
                            : "hidden";
                          const colFooterInfoClass = enableHover
                            ? "absolute bottom-0 left-0 right-0 p-3 pb-4 opacity-0 transition-all duration-500 ease-out translate-y-2 group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:translate-y-0 group-focus-within:opacity-100"
                            : "hidden";

                          return (
                            <SwiperSlide key={m.id}>
                              <Link
                                href={`/details/movie/${m.id}`}
                                className={colCardClass}
                                aria-label={m.title}
                              >
                                <div className="aspect-[2/3] overflow-hidden relative">
                                  {m.poster_path ? (
                                    <img
                                      src={`https://image.tmdb.org/t/p/w342${m.poster_path}`}
                                      alt={m.title}
                                      className={colImageClass}
                                      loading="lazy"
                                      decoding="async"
                                    />
                                  ) : (
                                    <div className="w-full h-full bg-neutral-700 flex items-center justify-center text-neutral-500">
                                      <ImageOff className="w-10 h-10 opacity-60" />
                                    </div>
                                  )}

                                  <div className={colOverlayClass} />

                                  <div className={colFooterInfoClass}>
                                    <p className="text-white font-extrabold text-xs sm:text-sm leading-tight line-clamp-2 drop-shadow-sm">
                                      {m.title}
                                    </p>
                                    {colYear && (
                                      <p className="mt-0.5 text-zinc-300 group-hover:text-yellow-400 text-[10px] sm:text-xs font-semibold leading-tight line-clamp-1 transition-colors duration-300 drop-shadow-sm">
                                        {colYear}
                                      </p>
                                    )}
                                  </div>
                                </div>
                              </Link>
                            </SwiperSlide>
                          );
                        })}
                      </DetailsArrowCarousel>
                    ) : (
                      <div className="mt-3 sm:mt-4 text-sm text-zinc-400">
                        No hay datos de colección.
                      </div>
                    )}
                  </section>
                </AnimatedSection>
              </section>
            )}

            {canRenderLowerPrioritySections && (
              <>
                {/* =================================================================
                    SECCIÓN: MEDIA (Portadas y Fondos)
                   ================================================================= */}
                <section id="section-media" ref={registerSection("media")}>
                  <AnimatedSection
                    key={`${id}-artwork-${artworkInitialized ? "ready" : "loading"}`}
                    delay={0.04}
                  >
                    {/* Galería de imágenes: pósters, backdrops y fondos del contenido */}
                    {(type === "movie" || type === "tv") && (
                      <section
                        className="mb-16 group/section"
                        ref={artworkControlsWrapRef}
                      >
                        {/* ========== Header de la Sección de Media ========== */}
                        {/* Incluye título y controles (tabs y filtros) */}
                        <div className="flex items-start justify-between gap-3 w-full">
                          {/* Título de la sección - Alineado a la izquierda */}
                          <SectionTitle
                            title="Portadas y fondos"
                            icon={ImageIcon}
                            className="!w-auto flex-1 min-w-0 pr-4 sm:pr-6"
                          />

                          {/* ========== Controles de Filtrado ========== */}
                          {/* Desktop: Tabs + Filtros en línea | Móvil: Botón que abre modal */}
                          <div className="self-start shrink-0 flex items-center gap-2 sm:gap-3 h-10 md:h-11">
                            {/* VERSIÓN DESKTOP: Tabs y filtros visibles */}
                            <div className="hidden sm:flex items-center gap-3 flex-wrap justify-end h-10 md:h-11">
                              {/* Tabs de tipo de imagen: Portada, Vista previa, Fondo */}
                              <div className="flex isolate transform-gpu items-center rounded-xl p-1 w-fit h-10 md:h-11 bg-black/20 bg-gradient-to-br from-white/10 via-white/5 to-black/40 backdrop-blur-[50px] shadow-[0_10px_30px_-10px_rgba(0,0,0,0.5)]">
                                {["posters", "backdrops", "background"].map(
                                  (tab) => (
                                    <button
                                      key={tab}
                                      type="button"
                                      onClick={() => setActiveImagesTab(tab)}
                                      className={`h-8 md:h-9 px-3 rounded-lg text-xs font-semibold transition-all
              ${
                activeImagesTab === tab
                  ? "bg-white/10 text-white shadow-md"
                  : "text-zinc-400 hover:text-white hover:bg-white/10"
              }`}
                                      style={{
                                        WebkitTapHighlightColor: "transparent",
                                      }}
                                    >
                                      {tab === "posters"
                                        ? "Portada"
                                        : tab === "backdrops"
                                          ? "Vista previa"
                                          : "Fondo"}
                                    </button>
                                  ),
                                )}
                              </div>

                              {/* Resolución (sin label superior) */}
                              <div ref={resMenuRef} className="relative">
                                <button
                                  type="button"
                                  onClick={() => setResMenuOpen((v) => !v)}
                                  className="h-10 md:h-11 inline-flex isolate transform-gpu items-center justify-between gap-2 min-w-[150px]
            px-3 rounded-xl transition-all duration-300
            bg-black/20 bg-gradient-to-br from-white/10 via-white/5 to-black/40 backdrop-blur-[50px] shadow-[0_10px_30px_-10px_rgba(0,0,0,0.5)]
            text-sm text-zinc-200 hover:bg-black/30"
                                  aria-label="Resolución"
                                  style={{
                                    WebkitTapHighlightColor: "transparent",
                                  }}
                                >
                                  <span className="inline-flex items-center gap-2">
                                    <span className="text-[10px] font-extrabold tracking-wider text-zinc-400/90">
                                      RES
                                    </span>
                                    <span className="font-semibold">
                                      {imagesResFilter === "all"
                                        ? "Todas"
                                        : imagesResFilter === "720p"
                                          ? "720p"
                                          : imagesResFilter === "1080p"
                                            ? "1080p"
                                            : imagesResFilter === "2k"
                                              ? "2K"
                                              : "4K"}
                                    </span>
                                  </span>
                                  <ChevronDown
                                    className={`w-4 h-4 transition-transform ${resMenuOpen ? "rotate-180" : ""}`}
                                  />
                                </button>

                                <AnimatePresence>
                                  {resMenuOpen && (
                                    <motion.div
                                      initial={{
                                        opacity: 0,
                                        y: 6,
                                        scale: 0.98,
                                      }}
                                      animate={{ opacity: 1, y: 0, scale: 1 }}
                                      exit={{ opacity: 0, y: 6, scale: 0.98 }}
                                      transition={{
                                        duration: 0.14,
                                        ease: "easeOut",
                                      }}
                                      className="absolute isolate left-0 top-full z-[9999] mt-2 w-full rounded-2xl
                bg-black/20 bg-gradient-to-br from-white/10 via-white/5 to-black/40 backdrop-blur-[50px] shadow-[0_30px_80px_-15px_rgba(0,0,0,0.9)] overflow-hidden"
                                    >
                                      <div className="py-1">
                                        {[
                                          { id: "all", label: "Todas" },
                                          { id: "720p", label: "720p" },
                                          { id: "1080p", label: "1080p" },
                                          { id: "2k", label: "2K" },
                                          { id: "4k", label: "4K" },
                                        ].map((opt) => {
                                          const active =
                                            imagesResFilter === opt.id;
                                          return (
                                            <button
                                              key={opt.id}
                                              type="button"
                                              onClick={() => {
                                                setImagesResFilter(opt.id);
                                                setResMenuOpen(false);
                                              }}
                                              className={`w-full px-3 py-2 text-left text-sm flex items-center justify-between
                        transition ${active ? "bg-white/10 text-white" : "text-zinc-300 hover:bg-white/5"}`}
                                            >
                                              <span className="font-semibold">
                                                {opt.label}
                                              </span>
                                              {active && (
                                                <Check className="w-4 h-4 text-emerald-300" />
                                              )}
                                            </button>
                                          );
                                        })}
                                      </div>
                                    </motion.div>
                                  )}
                                </AnimatePresence>
                              </div>

                              {/* Idioma (sin label) */}
                              {activeImagesTab !== "background" && (
                                <div
                                  className="flex isolate transform-gpu rounded-xl p-1 h-10 md:h-11 items-center bg-black/20 bg-gradient-to-br from-white/10 via-white/5 to-black/40 backdrop-blur-[50px] shadow-[0_10px_30px_-10px_rgba(0,0,0,0.5)]"
                                  aria-label="Idioma"
                                >
                                  <button
                                    type="button"
                                    onClick={() => setLangES((v) => !v)}
                                    className={`h-8 md:h-9 px-3 rounded-lg text-xs font-semibold transition-all
                ${langES ? "bg-white/10 text-white shadow-md" : "text-zinc-400 hover:text-white hover:bg-white/10"}`}
                                    style={{
                                      WebkitTapHighlightColor: "transparent",
                                    }}
                                  >
                                    ES
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setLangEN((v) => !v)}
                                    className={`h-8 md:h-9 px-3 rounded-lg text-xs font-semibold transition-all
                ${langEN ? "bg-white/10 text-white shadow-md" : "text-zinc-400 hover:text-white hover:bg-white/10"}`}
                                    style={{
                                      WebkitTapHighlightColor: "transparent",
                                    }}
                                  >
                                    EN
                                  </button>
                                </div>
                              )}
                            </div>

                            {/* ===================== MÓVIL: botón filtros + reset ===================== */}
                            <button
                              type="button"
                              onClick={() => {
                                setArtworkControlsOpen((v) => !v);
                                setResMenuOpen(false);
                              }}
                              className="sm:hidden inline-flex isolate items-center justify-center w-10 h-10 rounded-xl
        transition-all duration-300 bg-black/20 bg-gradient-to-br from-white/10 via-white/5 to-black/40 backdrop-blur-[50px] shadow-[0_10px_30px_-10px_rgba(0,0,0,0.5)] text-zinc-200
        hover:bg-black/30 transform-gpu hover:-translate-y-0.5"
                              aria-label="Filtros"
                              style={{ WebkitTapHighlightColor: "transparent" }}
                            >
                              <SlidersHorizontal className="w-5 h-5" />
                            </button>

                            <button
                              type="button"
                              onClick={handleResetArtwork}
                              className="inline-flex isolate items-center justify-center w-10 h-10 md:w-11 md:h-11 rounded-xl
        transition-all bg-black/20 bg-gradient-to-br from-white/10 via-white/5 to-black/40 backdrop-blur-[50px] shadow-[0_10px_30px_-10px_rgba(0,0,0,0.5)] transform-gpu
        text-red-400 hover:bg-red-500/20 hover:text-red-300 hover:shadow-[0_0_15px_rgba(239,68,68,0.3)]"
                              aria-label="Restaurar valores por defecto"
                              style={{ WebkitTapHighlightColor: "transparent" }}
                            >
                              <RotateCcw className="w-5 h-5" />
                            </button>
                          </div>
                        </div>

                        {/* Panel movil desplegable en 2 filas maximo */}
                        <AnimatePresence>
                          {artworkControlsOpen && (
                            <motion.div
                              initial={{ opacity: 0, y: -8 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0, y: -8 }}
                              transition={{ duration: 0.16, ease: "easeOut" }}
                              className="sm:hidden mb-4"
                            >
                              <div>
                                {/* Todo en una sola fila con iconos */}
                                <div className="flex items-center gap-2">
                                  {/* Tabs con iconos - compacto */}
                                  <div className="flex isolate transform-gpu rounded-xl p-1 h-10 items-center bg-black/20 bg-gradient-to-br from-white/10 via-white/5 to-black/40 backdrop-blur-[50px] shadow-[0_10px_30px_-10px_rgba(0,0,0,0.5)]">
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setActiveImagesTab("posters")
                                      }
                                      className={`px-3 h-full rounded-lg transition-all flex items-center justify-center ${
                                        activeImagesTab === "posters"
                                          ? "bg-white/10 text-white shadow-md"
                                          : "text-zinc-400 hover:text-white hover:bg-white/10"
                                      }`}
                                      style={{
                                        WebkitTapHighlightColor: "transparent",
                                      }}
                                      aria-label="Portada"
                                    >
                                      <ImageIcon className="w-4 h-4" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setActiveImagesTab("backdrops")
                                      }
                                      className={`px-3 h-full rounded-lg transition-all flex items-center justify-center ${
                                        activeImagesTab === "backdrops"
                                          ? "bg-white/10 text-white shadow-md"
                                          : "text-zinc-400 hover:text-white hover:bg-white/10"
                                      }`}
                                      style={{
                                        WebkitTapHighlightColor: "transparent",
                                      }}
                                      aria-label="Vista previa"
                                    >
                                      <Eye className="w-4 h-4" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setActiveImagesTab("background")
                                      }
                                      className={`px-3 h-full rounded-lg transition-all flex items-center justify-center ${
                                        activeImagesTab === "background"
                                          ? "bg-white/10 text-white shadow-md"
                                          : "text-zinc-400 hover:text-white hover:bg-white/10"
                                      }`}
                                      style={{
                                        WebkitTapHighlightColor: "transparent",
                                      }}
                                      aria-label="Fondo"
                                    >
                                      <Layers className="w-4 h-4" />
                                    </button>
                                  </div>

                                  {/* Resolución móvil - más compacto */}
                                  <div
                                    ref={resMenuRef}
                                    className="relative flex-1"
                                  >
                                    <button
                                      type="button"
                                      onClick={() => setResMenuOpen((v) => !v)}
                                      className="h-10 w-full inline-flex isolate transform-gpu items-center justify-between gap-2
                  px-3 rounded-xl transition text-sm
                  bg-black/20 bg-gradient-to-br from-white/10 via-white/5 to-black/40 backdrop-blur-[50px] shadow-[0_10px_30px_-10px_rgba(0,0,0,0.5)] text-zinc-200 hover:bg-black/30"
                                      aria-label="Resolución"
                                      style={{
                                        WebkitTapHighlightColor: "transparent",
                                      }}
                                    >
                                      <span className="inline-flex items-center gap-2 truncate">
                                        <span className="text-[10px] font-extrabold tracking-wider text-zinc-400/90">
                                          RES
                                        </span>
                                        <span className="font-semibold truncate">
                                          {imagesResFilter === "all"
                                            ? "Todas"
                                            : imagesResFilter === "720p"
                                              ? "720p"
                                              : imagesResFilter === "1080p"
                                                ? "1080p"
                                                : imagesResFilter === "2k"
                                                  ? "2K"
                                                  : "4K"}
                                        </span>
                                      </span>
                                      <ChevronDown
                                        className={`w-4 h-4 shrink-0 transition-transform ${resMenuOpen ? "rotate-180" : ""}`}
                                      />
                                    </button>

                                    <AnimatePresence>
                                      {resMenuOpen && (
                                        <motion.div
                                          initial={{
                                            opacity: 0,
                                            y: 6,
                                            scale: 0.98,
                                          }}
                                          animate={{
                                            opacity: 1,
                                            y: 0,
                                            scale: 1,
                                          }}
                                          exit={{
                                            opacity: 0,
                                            y: 6,
                                            scale: 0.98,
                                          }}
                                          transition={{
                                            duration: 0.14,
                                            ease: "easeOut",
                                          }}
                                          className="absolute isolate left-0 top-full z-[9999] mt-2 w-full rounded-2xl
                      bg-black/20 bg-gradient-to-br from-white/10 via-white/5 to-black/40 backdrop-blur-[50px] shadow-[0_30px_80px_-15px_rgba(0,0,0,0.9)] overflow-hidden"
                                        >
                                          <div className="py-1">
                                            {[
                                              { id: "all", label: "Todas" },
                                              { id: "720p", label: "720p" },
                                              { id: "1080p", label: "1080p" },
                                              { id: "2k", label: "2K" },
                                              { id: "4k", label: "4K" },
                                            ].map((opt) => {
                                              const active =
                                                imagesResFilter === opt.id;
                                              return (
                                                <button
                                                  key={opt.id}
                                                  type="button"
                                                  onClick={() => {
                                                    setImagesResFilter(opt.id);
                                                    setResMenuOpen(false);
                                                  }}
                                                  className={`w-full px-3 py-2 text-left text-sm flex items-center justify-between
                              transition ${active ? "bg-white/10 text-white" : "text-zinc-300 hover:bg-white/5"}`}
                                                >
                                                  <span className="font-semibold">
                                                    {opt.label}
                                                  </span>
                                                  {active && (
                                                    <Check className="w-4 h-4 text-emerald-300" />
                                                  )}
                                                </button>
                                              );
                                            })}
                                          </div>
                                        </motion.div>
                                      )}
                                    </AnimatePresence>
                                  </div>

                                  {/* Idioma móvil - compacto */}
                                  {activeImagesTab !== "background" && (
                                    <div className="flex isolate transform-gpu rounded-xl p-1 h-10 items-center bg-black/20 bg-gradient-to-br from-white/10 via-white/5 to-black/40 backdrop-blur-[50px] shadow-[0_10px_30px_-10px_rgba(0,0,0,0.5)]">
                                      <button
                                        type="button"
                                        onClick={() => setLangES((v) => !v)}
                                        className={`px-3 h-full rounded-lg text-xs font-medium transition-all flex items-center justify-center ${
                                          langES
                                            ? "bg-white/10 text-white shadow-md"
                                            : "text-zinc-400 hover:text-white hover:bg-white/10"
                                        }`}
                                        style={{
                                          WebkitTapHighlightColor:
                                            "transparent",
                                        }}
                                      >
                                        ES
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => setLangEN((v) => !v)}
                                        className={`px-3 h-full rounded-lg text-xs font-medium transition-all flex items-center justify-center ${
                                          langEN
                                            ? "bg-white/10 text-white shadow-md"
                                            : "text-zinc-400 hover:text-white hover:bg-white/10"
                                        }`}
                                        style={{
                                          WebkitTapHighlightColor:
                                            "transparent",
                                        }}
                                      >
                                        EN
                                      </button>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>

                        {!!imagesError && (
                          <div className="text-sm text-red-400 mb-3">
                            {imagesError}
                          </div>
                        )}

                        {(() => {
                          const {
                            ordered,
                            isPoster,
                            isBackdropTab,
                            aspect,
                            size,
                            activePath,
                          } = artworkSelection;

                          // 2 en movil y 4 en desktop para backdrops (vista previa / fondo)
                          const isBackdropLike = activeImagesTab !== "posters";

                          const breakpoints = isPoster
                            ? {
                                500: { slidesPerView: 3, spaceBetween: 14 },
                                640: { slidesPerView: 4, spaceBetween: 14 },
                                768: { slidesPerView: 5, spaceBetween: 16 },
                                1024: { slidesPerView: 6, spaceBetween: 18 },
                                1280: { slidesPerView: 7, spaceBetween: 18 },
                              }
                            : {
                                0: { slidesPerView: 2, spaceBetween: 12 },
                                640: { slidesPerView: 3, spaceBetween: 14 },
                                768: { slidesPerView: 4, spaceBetween: 16 },
                                1024: { slidesPerView: 4, spaceBetween: 18 },
                                1280: { slidesPerView: 4, spaceBetween: 20 },
                              };

                          const loadingCardsCount = Math.max(
                            1,
                            Math.min(
                              ordered?.length || (isPoster ? 7 : 4),
                              isPoster ? 7 : 4,
                            ),
                          );

                          const loadingCarousel = (
                            <Swiper
                              key={`${activeImagesTab}-loading`}
                              spaceBetween={12}
                              slidesPerView={isBackdropLike ? 2 : 3}
                              breakpoints={breakpoints}
                              allowTouchMove={false}
                              className="pt-3 pb-8"
                            >
                              {Array.from({ length: loadingCardsCount }).map(
                                (_, index) => (
                                  <SwiperSlide
                                    key={`${activeImagesTab}-loading-${index}`}
                                    className="h-full pt-1 pb-3"
                                  >
                                    <div
                                      className={`w-full rounded-2xl border-2 border-white/10 bg-white/5 animate-pulse ${aspect}`}
                                      aria-hidden="true"
                                    />
                                  </SwiperSlide>
                                ),
                              )}
                            </Swiper>
                          );

                          if (
                            (!ordered || ordered.length === 0) &&
                            (imagesLoading || !artworkInitialized)
                          ) {
                            return (
                              <div className="relative overflow-x-hidden overflow-y-visible">
                                {loadingCarousel}
                              </div>
                            );
                          }

                          if (!ordered || ordered.length === 0) {
                            return (
                              <div className="text-sm text-zinc-400">
                                No hay imágenes disponibles con los filtros
                                actuales.
                              </div>
                            );
                          }

                          return (
                            <div className="relative overflow-visible">
                              {!artworkRowReady && loadingCarousel}

                              {artworkRowReady && (
                                <DetailsArrowCarousel
                                  key={activeImagesTab}
                                  spaceBetween={12}
                                  slidesPerView={isBackdropLike ? 2 : 3}
                                  breakpoints={breakpoints}
                                  className="pt-3 pb-8"
                                  arrowClassName="top-3 bottom-8"
                                >
                                  {ordered.map((img, index) => {
                                    const filePath = img?.file_path;
                                    if (!filePath) return null;

                                    const isActive = activePath === filePath;
                                    const resText = imgResLabel(img);
                                    const isPriority =
                                      index < artworkPreloadCount;
                                    const imgAlt = isPoster
                                      ? `Portada de ${title}`
                                      : isBackdropTab
                                        ? `Vista previa de ${title}`
                                        : `Fondo de ${title}`;

                                    const imgSrc = `https://image.tmdb.org/t/p/${size}${filePath}`;
                                    const imgSrcSet = isPoster
                                      ? `https://image.tmdb.org/t/p/w185${filePath} 185w, https://image.tmdb.org/t/p/w342${filePath} 342w, https://image.tmdb.org/t/p/w500${filePath} 500w`
                                      : `https://image.tmdb.org/t/p/w300${filePath} 300w, https://image.tmdb.org/t/p/w780${filePath} 780w, https://image.tmdb.org/t/p/w1280${filePath} 1280w`;
                                    const imgSizes = isPoster
                                      ? "(max-width: 640px) 32vw, (max-width: 1024px) 20vw, 140px"
                                      : "(max-width: 640px) 50vw, (max-width: 1024px) 30vw, 240px";

                                    return (
                                      <SwiperSlide
                                        key={filePath}
                                        className="h-full pt-1 pb-3"
                                      >
                                        <div
                                          role="button"
                                          tabIndex={0}
                                          onClick={() => {
                                            if (activeImagesTab === "posters")
                                              handleSelectPoster(filePath);
                                            else if (
                                              activeImagesTab === "backdrops"
                                            )
                                              handleSelectPreviewBackdrop(
                                                filePath,
                                              );
                                            else
                                              handleSelectBackground(filePath);
                                          }}
                                          onKeyDown={(e) => {
                                            if (
                                              e.key === "Enter" ||
                                              e.key === " "
                                            ) {
                                              e.preventDefault();
                                              if (activeImagesTab === "posters")
                                                handleSelectPoster(filePath);
                                              else if (
                                                activeImagesTab === "backdrops"
                                              )
                                                handleSelectPreviewBackdrop(
                                                  filePath,
                                                );
                                              else
                                                handleSelectBackground(
                                                  filePath,
                                                );
                                            }
                                          }}
                                          className={`group relative w-full rounded-2xl overflow-hidden border-2 cursor-pointer
                        transition-all duration-300 transform-gpu hover:-translate-y-1
                        ${
                          isActive
                            ? "border-emerald-400 shadow-[0_0_12px_rgba(16,185,129,0.35)] ring-2 ring-emerald-500/30"
                            : "border-white/10 bg-black/25 hover:bg-black/35 hover:border-yellow-500/40"
                        }`}
                                          aria-label="Seleccionar"
                                          style={{
                                            WebkitTapHighlightColor:
                                              "transparent",
                                          }}
                                        >
                                          <div
                                            className={`relative w-full ${aspect} bg-black/40`}
                                          >
                                            <img
                                              src={imgSrc}
                                              srcSet={imgSrcSet}
                                              sizes={imgSizes}
                                              alt={imgAlt}
                                              loading={
                                                isPriority ? "eager" : "lazy"
                                              }
                                              fetchPriority={
                                                isPriority ? "high" : "auto"
                                              }
                                              decoding="async"
                                              className="w-full h-full object-cover transition-transform duration-700 transform-gpu
                            group-hover:scale-[1.08]"
                                            />
                                            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
                                          </div>

                                          {isActive && (
                                            <div className="absolute top-2 right-2 w-4 h-4 bg-emerald-400 rounded-full shadow-lg shadow-emerald-500/50 ring-2 ring-white/20" />
                                          )}

                                          {resText && (
                                            <div className="absolute bottom-2.5 left-2.5 opacity-0 group-hover:opacity-100 transition-all duration-300 translate-y-1 group-hover:translate-y-0 z-10 pointer-events-none">
                                              <span className="inline-flex items-center gap-1.5 text-[9px] sm:text-[10px] font-black uppercase tracking-widest text-zinc-300">
                                                <span className="w-1.5 h-1.5 rounded-full bg-zinc-400 shadow-[0_0_6px_rgba(255,255,255,0.4)]" />
                                                {resText}
                                              </span>
                                            </div>
                                          )}

                                          <div
                                            role="button"
                                            tabIndex={0}
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              handleCopyImageUrl(filePath);
                                            }}
                                            onKeyDown={(e) => {
                                              if (
                                                e.key === "Enter" ||
                                                e.key === " "
                                              ) {
                                                e.preventDefault();
                                                e.stopPropagation();
                                                handleCopyImageUrl(filePath);
                                              }
                                            }}
                                            className="group/link absolute bottom-0 right-0 z-20 p-2 sm:p-2.5 rounded-tl-2xl border-l border-t backdrop-blur-md shadow-sm transition-all duration-300 ease-out transform-gpu origin-bottom-right scale-0 opacity-0 group-hover:scale-100 group-hover:opacity-100 bg-black/40 border-white/10 text-zinc-300 hover:bg-white/20 hover:text-white"
                                            aria-label="Copiar URL"
                                          >
                                            <LinkIcon className="w-4 h-4 sm:w-[18px] sm:h-[18px]" />
                                            <div className="pointer-events-none absolute bottom-full mb-2 right-0 z-[100] scale-95 whitespace-nowrap rounded-lg border border-white/10 bg-black/90 px-2.5 py-1 text-[10px] font-bold text-white opacity-0 shadow-xl transition-all duration-200 ease-out group-hover/link:scale-100 group-hover/link:opacity-100 group-hover/link:delay-[2000ms]">
                                              Copiar URL
                                            </div>
                                          </div>
                                        </div>
                                      </SwiperSlide>
                                    );
                                  })}
                                </DetailsArrowCarousel>
                              )}
                            </div>
                          );
                        })()}
                      </section>
                    )}
                  </AnimatedSection>

                  <AnimatedSection
                    key={`${id}-videos-${videosResolved ? "ready" : "loading"}-${videos.length}`}
                    delay={0.04}
                  >
                    {/* =================================================================
                    SECCIÓN: TRÁILER Y VÍDEOS
                   ================================================================= */}
                    {/* Carrusel de vídeos (tráilers, teasers, clips, etc.) del contenido */}
                    {/* Solo se muestra si hay una API key de TMDb configurada */}
                    {TMDB_API_KEY && (
                      <section className="mt-6 group/section">
                        <SectionTitle
                          title="Tráiler y vídeos"
                          icon={MonitorPlay}
                        />

                        <div className="rounded-2xl p-0 mb-10">
                          {videosLoading && (
                            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
                              {Array.from({ length: 4 }).map((_, index) => (
                                <div
                                  key={index}
                                  className="relative isolate rounded-2xl overflow-hidden border border-white/5 bg-black/20 bg-gradient-to-br from-white/10 via-transparent to-black/40 backdrop-blur-lg shadow-lg transform-gpu animate-pulse"
                                  aria-hidden="true"
                                >
                                  <div className="relative z-10 aspect-video bg-white/5">
                                    <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent" />
                                    <div className="absolute inset-0 flex items-center justify-center">
                                      <div className="w-14 h-14 rounded-full bg-yellow-400/10 border border-yellow-300/10" />
                                    </div>
                                  </div>

                                  <div className="relative z-10 flex flex-col shrink-0 h-[144px] p-4 w-full">
                                    <div className="h-4 w-3/4 rounded bg-white/10" />
                                    <div className="mt-3 flex gap-2">
                                      <div className="h-5 w-16 rounded-full bg-white/10" />
                                      <div className="h-5 w-14 rounded-full bg-white/10" />
                                      <div className="h-5 w-10 rounded-full bg-white/10" />
                                    </div>
                                    <div className="mt-auto flex items-center gap-2">
                                      <div className="h-3 w-14 rounded bg-white/10" />
                                      <div className="h-3 w-1 rounded-full bg-white/10" />
                                      <div className="h-3 w-20 rounded bg-white/10" />
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}

                          {!!videosError && (
                            <div className="text-sm text-red-400">
                              {videosError}
                            </div>
                          )}

                          {videosResolved &&
                            !videosLoading &&
                            !videosError &&
                            videos.length === 0 && (
                              <div className="text-sm text-zinc-400">
                                No hay tráileres o vídeos disponibles en TMDb
                                para este título.
                              </div>
                            )}

                          {videos.length > 0 && (
                            <DetailsArrowCarousel
                              spaceBetween={12}
                              slidesPerView={2}
                              breakpoints={{
                                640: { slidesPerView: 2, spaceBetween: 16 },
                                768: { slidesPerView: 3, spaceBetween: 16 },
                                1024: { slidesPerView: 4, spaceBetween: 16 },
                                1280: { slidesPerView: 4, spaceBetween: 16 },
                              }}
                              className="pb-2"
                            >
                              {videos.slice(0, 20).map((v) => {
                                const thumb = videoThumbUrl(v);
                                const fallbackPath =
                                  displayBackdropPath || displayPosterPath;
                                const fallback = fallbackPath
                                  ? `https://image.tmdb.org/t/p/w780${fallbackPath}`
                                  : "/placeholder.png";

                                return (
                                  <SwiperSlide
                                    key={`${v.site}:${v.key}`}
                                    className="h-full"
                                  >
                                    <button
                                      type="button"
                                      onClick={() => openVideo(v)}
                                      aria-label={v.name || "Ver vídeo"}
                                      className="relative isolate w-full h-full text-left flex flex-col rounded-2xl overflow-hidden border border-white/5 bg-black/20 bg-gradient-to-br from-white/10 via-transparent to-black/40 backdrop-blur-lg shadow-lg transform-gpu transition-all hover:border-yellow-500/30 group"
                                    >
                                      <div className="relative z-10 aspect-video overflow-hidden">
                                        <img
                                          src={thumb || fallback}
                                          alt={v.name || "Video"}
                                          className="w-full h-full object-cover transform-gpu transition-transform duration-500 hover:scale-[1.05]"
                                        />
                                        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
                                        <div className="absolute inset-0 flex items-center justify-center">
                                          <div className="w-14 h-14 rounded-full bg-yellow-400/15 border border-yellow-300/25 flex items-center justify-center transition-transform hover:scale-105 backdrop-blur-md">
                                            <Play className="w-7 h-7 text-yellow-200 translate-x-[1px]" />
                                          </div>
                                        </div>
                                      </div>

                                      <div className="relative z-10 flex flex-col shrink-0 h-[144px] p-4 items-start w-full">
                                        {/* Titulo arriba (1 linea siempre) */}
                                        <div className="w-full min-h-[22px]">
                                          <div className="font-bold text-white leading-snug text-sm sm:text-[16px] line-clamp-1 truncate">
                                            {v.name || "Vídeo"}
                                          </div>
                                        </div>

                                        {/* Propiedades debajo, alineadas a la izquierda */}
                                        <div className="mt-3 flex items-center gap-3 w-full overflow-hidden">
                                          <div className="flex items-center gap-3 flex-nowrap overflow-x-auto no-scrollbar pb-1">
                                            {/* Label de Oficial */}
                                            {v.official && (
                                              <span className="shrink-0 whitespace-nowrap inline-flex items-center gap-1.5 text-[9px] sm:text-[10px] font-black uppercase tracking-widest text-yellow-400">
                                                <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 shadow-[0_0_6px_rgba(250,204,21,0.8)] animate-pulse" />
                                                OFFICIAL
                                              </span>
                                            )}

                                            {/* Label de Tipo (Trailer, Teaser, etc) */}
                                            {v.type && (
                                              <span
                                                className={`shrink-0 whitespace-nowrap inline-flex items-center gap-1.5 text-[9px] sm:text-[10px] font-black uppercase tracking-widest ${v.type.toLowerCase() === "trailer" ? "text-red-300" : "text-sky-300"}`}
                                              >
                                                <span
                                                  className={`w-1.5 h-1.5 rounded-full ${v.type.toLowerCase() === "trailer" ? "bg-red-400 shadow-[0_0_6px_rgba(248,113,113,0.8)]" : "bg-sky-400 shadow-[0_0_6px_rgba(56,189,248,0.8)]"}`}
                                                />
                                                {v.type}
                                              </span>
                                            )}

                                            {/* Label de Idioma */}
                                            {v.iso_639_1 && (
                                              <span className="shrink-0 whitespace-nowrap inline-flex items-center gap-1.5 text-[9px] sm:text-[10px] font-black uppercase tracking-widest text-zinc-300">
                                                <span className="w-1.5 h-1.5 rounded-full bg-zinc-400 shadow-[0_0_6px_rgba(255,255,255,0.4)]" />
                                                {v.iso_639_1}
                                              </span>
                                            )}
                                          </div>
                                        </div>

                                        {/* Fuente y fecha abajo, mismo margen izquierdo */}
                                        <div className="mt-auto pt-3 text-xs text-zinc-400 flex items-center gap-2">
                                          <span className="font-semibold text-zinc-200">
                                            {v.site || "—"}
                                          </span>
                                          {v.published_at && (
                                            <>
                                              <span className="text-zinc-600">
                                                ·
                                              </span>
                                              <span className="shrink-0">
                                                {new Date(
                                                  v.published_at,
                                                ).toLocaleDateString("es-ES")}
                                              </span>
                                            </>
                                          )}
                                        </div>
                                      </div>
                                    </button>
                                  </SwiperSlide>
                                );
                              })}
                            </DetailsArrowCarousel>
                          )}
                        </div>
                      </section>
                    )}
                  </AnimatedSection>

                  <AnimatedSection
                    key={`${id}-soundtrack-${soundtrackResolved ? "ready" : "loading"}-${soundtrackTracks.length}`}
                    delay={0.06}
                  >
                    {soundtrackSearchQuery &&
                      (soundtrackLoading ||
                        soundtrackResolved ||
                        soundtrackTracks.length > 0) && (
                        <section className="mt-2 mb-10 group/section">
                          <SectionTitle
                            title="Soundtrack y música"
                            icon={Music2}
                          />

                          {soundtrackLoading && (
                            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
                              {Array.from({ length: 5 }).map((_, index) => (
                                <div
                                  key={index}
                                  className="relative isolate rounded-2xl overflow-hidden border border-white/5 bg-black/20 bg-gradient-to-br from-white/10 via-transparent to-black/40 backdrop-blur-lg shadow-lg transform-gpu animate-pulse"
                                  aria-hidden="true"
                                >
                                  <div className="relative z-10 aspect-square bg-white/5">
                                    <div className="absolute inset-0 flex items-center justify-center">
                                      <div className="w-14 h-14 rounded-full bg-yellow-400/10 border border-yellow-300/10" />
                                    </div>
                                  </div>
                                  <div className="relative z-10 flex flex-col shrink-0 h-[164px] p-4 w-full">
                                    <div className="h-4 w-3/4 rounded bg-white/10" />
                                    <div className="mt-2 h-3 w-1/2 rounded bg-white/10" />
                                    <div className="mt-3 h-3 w-1/3 rounded bg-white/10" />
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}

                          {!soundtrackLoading &&
                            soundtrackResolved &&
                            soundtrackTracks.length === 0 && (
                              <div className="relative isolate overflow-hidden rounded-2xl border border-white/5 bg-black/20 bg-gradient-to-br from-white/10 via-transparent to-black/40 backdrop-blur-lg shadow-lg transform-gpu p-5 text-sm text-zinc-400">
                                <div className="relative z-10">
                                  {soundtrackError ||
                                    "No se encontraron canciones de Spotify para este título."}
                                  {soundtrackSpotifySearchUrl && (
                                    <a
                                      href={soundtrackSpotifySearchUrl}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="ml-2 font-bold text-yellow-300 hover:text-yellow-200"
                                    >
                                      Buscar en Spotify
                                    </a>
                                  )}
                                </div>
                              </div>
                            )}

                          {soundtrackTracks.length > 0 && (
                            <DetailsArrowCarousel
                              spaceBetween={12}
                              slidesPerView={2}
                              breakpoints={{
                                640: { slidesPerView: 2, spaceBetween: 16 },
                                768: { slidesPerView: 3, spaceBetween: 16 },
                                1024: { slidesPerView: 4, spaceBetween: 16 },
                                1280: { slidesPerView: 5, spaceBetween: 16 },
                              }}
                              className="pb-2"
                            >
                              {soundtrackTracks.map((track) => {
                                const sourceBadge = getSoundtrackSourceBadge(
                                  track.source,
                                );

                                return (
                                  <SwiperSlide
                                    key={track.id}
                                    className="h-full"
                                  >
                                    <button
                                      type="button"
                                      onClick={() => openSoundtrack(track.id)}
                                      aria-label={
                                        track.trackName || "Reproducir música"
                                      }
                                      className="relative isolate w-full h-full text-left flex flex-col rounded-2xl overflow-hidden border border-white/5 bg-black/20 bg-gradient-to-br from-white/10 via-transparent to-black/40 backdrop-blur-lg shadow-lg transform-gpu transition-all hover:border-yellow-500/30 group"
                                    >
                                      <div className="relative z-10 aspect-square overflow-hidden bg-black/40">
                                        {/* Fondo desenfocado para rellenar los bordes de la portada cuadrada */}
                                        <img
                                          src={
                                            track.artworkUrl ||
                                            "/placeholder.png"
                                          }
                                          alt=""
                                          loading="lazy"
                                          decoding="async"
                                          fetchPriority="low"
                                          className="absolute inset-0 w-full h-full object-cover opacity-30 blur-xl transform-gpu scale-110"
                                          aria-hidden="true"
                                        />
                                        {/* Portada completa sin recortes */}
                                        <img
                                          src={
                                            track.artworkUrl ||
                                            "/placeholder.png"
                                          }
                                          alt=""
                                          loading="lazy"
                                          decoding="async"
                                          fetchPriority="low"
                                          className="absolute inset-0 w-full h-full object-contain transform-gpu transition-transform duration-500 group-hover:scale-[1.05] drop-shadow-2xl"
                                        />
                                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/35 to-transparent pointer-events-none" />
                                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                          <div className="w-14 h-14 rounded-full bg-yellow-400/15 border border-yellow-300/25 flex items-center justify-center transition-transform group-hover:scale-105 backdrop-blur-md">
                                            <Music2 className="w-7 h-7 text-yellow-200" />
                                          </div>
                                        </div>
                                      </div>

                                      <div className="relative z-10 flex flex-col shrink-0 h-[164px] p-4 items-start w-full overflow-hidden">
                                        <div className="w-full h-[40px] sm:h-[44px] mb-1.5">
                                          <div
                                            className="font-bold text-white leading-snug text-sm sm:text-[16px] line-clamp-2"
                                            title={track.trackName}
                                          >
                                            {track.trackName}
                                          </div>
                                        </div>

                                        <div className="w-full">
                                          <div
                                            className="truncate text-xs font-medium text-zinc-400"
                                            title={track.artistName}
                                          >
                                            {track.artistName}
                                          </div>
                                        </div>

                                        <div className="mt-3 flex items-center gap-3 w-full overflow-hidden pb-1">
                                          <span
                                            className={`shrink-0 whitespace-nowrap inline-flex items-center gap-1.5 text-[9px] sm:text-[10px] font-black uppercase tracking-widest ${sourceBadge.textClass}`}
                                          >
                                            <span
                                              className={`w-1.5 h-1.5 rounded-full ${sourceBadge.dotClass}`}
                                            />
                                            {sourceBadge.label}
                                          </span>
                                        </div>

                                        <div className="mt-auto pt-3 text-xs text-zinc-400 flex items-center gap-2 w-full overflow-hidden">
                                          <span
                                            className="font-semibold text-zinc-200 truncate"
                                            title={
                                              track.collectionName ||
                                              "Soundtrack"
                                            }
                                          >
                                            {track.collectionName ||
                                              "Soundtrack"}
                                          </span>
                                        </div>
                                      </div>
                                    </button>
                                  </SwiperSlide>
                                );
                              })}
                            </DetailsArrowCarousel>
                          )}
                        </section>
                      )}
                  </AnimatedSection>
                </section>

                <section
                  id="section-sentiment"
                  ref={registerSection("sentiment")}
                >
                  <AnimatedSection delay={0.04}>
                    {/* ===================================================== */}
                    {/* Trakt: sentimientos - Solo mostrar si no hay error */}
                    {!tSentiment.error && (
                      <section className="mb-12 group/section">
                        <SectionTitle
                          title="Análisis de sentimientos"
                          icon={Sparkles}
                        />

                        <div className="mt-3 sm:mt-4 relative isolate overflow-hidden rounded-2xl border border-transparent bg-black/20 bg-gradient-to-br from-white/10 via-transparent to-transparent backdrop-blur-lg shadow-lg transform-gpu">
                          {/* Header del bloque */}
                          <div className="relative z-10 flex items-center justify-between border-b border-transparent bg-white/5 px-6 py-4">
                            <div className="flex items-center gap-4">
                              <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-xl border border-white/10 shadow-inner">
                                <img
                                  src="/logo-Trakt.png"
                                  alt="Trakt"
                                  className="h-full w-full object-cover"
                                />
                              </div>
                              <div>
                                <h3 className="text-base font-bold leading-tight text-white">
                                  Opiniones de la comunidad de Trakt
                                </h3>
                                <p className="text-xs font-medium text-zinc-400">
                                  Resumen oficial de sentimientos de Trakt sobre{" "}
                                  <span className="text-zinc-200">{title}</span>
                                </p>
                              </div>
                            </div>
                            {tSentiment.loading && (
                              <Loader2 className="h-5 w-5 animate-spin text-zinc-400" />
                            )}
                          </div>

                          <div className="relative z-10 p-6">
                            {/* Sin mostrar error, directamente el contenido */}
                            <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                              {/* Columna Positiva */}
                              <div className="relative isolate overflow-hidden rounded-2xl border border-emerald-500/5 bg-gradient-to-br from-emerald-500/10 via-transparent to-transparent backdrop-blur-md shadow-sm transform-gpu p-5">
                                <div className="mb-4 flex items-center gap-3">
                                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500 text-white shadow-lg shadow-emerald-500/20">
                                    <ThumbsUp className="h-4 w-4" />
                                  </div>
                                  <span className="font-bold tracking-wide text-emerald-100">
                                    Positivo
                                  </span>
                                </div>

                                {tSentiment.pros?.length ? (
                                  <ul className="space-y-3">
                                    {tSentiment.pros.map((s, i) => (
                                      <li
                                        key={i}
                                        className="flex items-start gap-3 text-sm leading-relaxed text-zinc-300"
                                      >
                                        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]" />
                                        <span>{s}</span>
                                      </li>
                                    ))}
                                  </ul>
                                ) : (
                                  <div className="text-sm italic text-zinc-500">
                                    No hay suficientes datos positivos.
                                  </div>
                                )}
                              </div>

                              {/* Columna Negativa */}
                              <div className="relative isolate overflow-hidden rounded-2xl border border-rose-500/5 bg-gradient-to-br from-rose-500/10 via-transparent to-transparent backdrop-blur-md shadow-sm transform-gpu p-5">
                                <div className="mb-4 flex items-center gap-3">
                                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-rose-500 text-white shadow-lg shadow-rose-500/20">
                                    <ThumbsDown className="h-4 w-4" />
                                  </div>
                                  <span className="font-bold tracking-wide text-rose-100">
                                    Negativo
                                  </span>
                                </div>

                                {tSentiment.cons?.length ? (
                                  <ul className="space-y-3">
                                    {tSentiment.cons.map((s, i) => (
                                      <li
                                        key={i}
                                        className="flex items-start gap-3 text-sm leading-relaxed text-zinc-300"
                                      >
                                        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-rose-400 shadow-[0_0_8px_rgba(251,113,133,0.6)]" />
                                        <span>{s}</span>
                                      </li>
                                    ))}
                                  </ul>
                                ) : (
                                  <div className="text-sm italic text-zinc-500">
                                    No hay suficientes datos negativos.
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      </section>
                    )}
                  </AnimatedSection>
                </section>

                {/* =================================================================
                SECCIÓN: TEMPORADAS (solo para series)
               ================================================================= */}
                {/* Muestra las temporadas disponibles de la serie con información resumida */}
                {type === "tv" && (
                  <section
                    id="section-seasons"
                    ref={registerSection("seasons")}
                  >
                    <AnimatedSection delay={0.04}>
                      <section className="mb-12 group/section">
                        <SectionTitle title="Temporadas" icon={Layers} />

                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                          {tSeasons.loading && (
                            <div className="col-span-full py-10 flex justify-center">
                              <Loader2 className="animate-spin text-white/50" />
                            </div>
                          )}

                          {!tSeasons.loading &&
                            visibleTraktSeasons.map((s) => {
                              const sn = getSeasonNumber(s);
                              const titleSeason = `Temporada ${sn}`;
                              const imdbRating = toRatingNumber(
                                seasonImdbRatings?.[sn],
                              );
                              const seriesGraphRating =
                                seriesGraphSeasonRatings.get(sn) ?? null;
                              const rating = imdbRating ?? seriesGraphRating;
                              const imdbSeasonUrl = resolvedImdbId
                                ? `https://www.imdb.com/title/${resolvedImdbId}/episodes/?season=${sn}`
                                : null;

                              // Lógica de progreso (usa TMDb para saber total)
                              const tmdbSeason = (data?.seasons || []).find(
                                (x) => Number(x?.season_number) === sn,
                              );
                              const totalEp =
                                Number(tmdbSeason?.episode_count || 0) || null;
                              const watchedEp = Array.isArray(
                                watchedBySeason?.[sn],
                              )
                                ? watchedBySeason[sn].length
                                : 0;
                              const percentage = totalEp
                                ? Math.round((watchedEp / totalEp) * 100)
                                : 0;

                              const isComplete = percentage === 100;
                              const barColor = isComplete
                                ? "bg-emerald-500"
                                : "bg-yellow-500";

                              return (
                                <button
                                  key={sn}
                                  type="button"
                                  onClick={() =>
                                    router.push(
                                      `/details/tv/${id}/season/${sn}`,
                                    )
                                  }
                                  onMouseEnter={() => prefetchSeasonDetails(sn)}
                                  onFocus={() => prefetchSeasonDetails(sn)}
                                  onTouchStart={() => prefetchSeasonDetails(sn)}
                                  className="group relative isolate overflow-hidden rounded-2xl border border-white/5 bg-black/20 bg-gradient-to-br from-white/10 via-transparent to-transparent backdrop-blur-lg shadow-lg transform-gpu transition-all hover:-translate-y-1 hover:border-yellow-500/30 hover:bg-white/5 hover:shadow-2xl text-left w-full"
                                  aria-label={`Ver ${titleSeason}`}
                                >
                                  {/* Fondo decorativo del número de temporada */}
                                  <div className="absolute -right-4 -top-6 text-[100px] font-black text-white/5 select-none transition group-hover:text-white/10 z-0">
                                    {sn}
                                  </div>

                                  <div className="relative z-10 p-5">
                                    <div className="flex items-start justify-between">
                                      <div>
                                        <h4 className="text-lg font-extrabold text-white">
                                          {titleSeason}
                                        </h4>

                                        <div className="mt-1 flex items-center gap-2 text-xs font-medium text-zinc-400">
                                          {rating != null && (
                                            <span className="flex items-center gap-1 text-yellow-400">
                                              <Star className="h-3 w-3 fill-yellow-400" />{" "}
                                              {rating.toFixed(1)}
                                            </span>
                                          )}
                                          {totalEp != null && (
                                            <span>• {totalEp} episodios</span>
                                          )}
                                        </div>
                                      </div>

                                      {/* Botón externo a IMDb (NO navega a la season page interna) */}
                                      {imdbSeasonUrl && (
                                        <a
                                          href={imdbSeasonUrl}
                                          target="_blank"
                                          rel="noreferrer"
                                          onClick={(e) => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            window.open(
                                              imdbSeasonUrl,
                                              "_blank",
                                              "noopener,noreferrer",
                                            );
                                          }}
                                          className="flex h-8 w-8 items-center justify-center rounded-full bg-black/20 text-zinc-400 transition hover:bg-white hover:text-black"
                                          aria-label="Ver temporada en IMDb"
                                        >
                                          <ExternalLink className="h-4 w-4" />
                                        </a>
                                      )}
                                    </div>

                                    {/* Barra de Progreso */}
                                    {totalEp != null && (
                                      <div className="mt-6">
                                        <div className="mb-1.5 flex items-end justify-between text-xs font-bold">
                                          <span
                                            className={
                                              percentage > 0
                                                ? "text-white"
                                                : "text-zinc-500"
                                            }
                                          >
                                            {watchedEp}{" "}
                                            <span className="text-zinc-500 font-normal">
                                              vistos
                                            </span>
                                          </span>
                                          <span className="text-zinc-500">
                                            {percentage}%
                                          </span>
                                        </div>

                                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                                          <div
                                            className={`h-full rounded-full transition-all duration-500 ${barColor}`}
                                            style={{ width: `${percentage}%` }}
                                          />
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                </button>
                              );
                            })}
                        </div>
                      </section>
                    </AnimatedSection>
                  </section>
                )}

                {/* =================================================================
                SECCIÓN: VALORACIÓN DE EPISODIOS (solo para series)
               ================================================================= */}
                {/* Gráfico de valoraciones por episodio mostrando la evolución de ratings */}
                {type === "tv" && (
                  <section
                    id="section-episodes"
                    ref={registerSection("episodes")}
                  >
                    <AnimatedSection delay={0.04}>
                      {/* Subsección: Episodios y sus valoraciones */}
                      {type === "tv" ? (
                        <section className="mb-10 group/section">
                          <SectionTitle
                            title="Valoración de Episodios"
                            icon={TrendingUp}
                          />
                          <div className="p-0">
                            {ratingsError && (
                              <p className="text-sm text-red-400 mb-2">
                                {ratingsError}
                              </p>
                            )}
                            {!ratingsLoading && !ratingsError && !ratings && (
                              <p className="text-sm text-zinc-400 mb-2">
                                No hay datos de episodios disponibles.
                              </p>
                            )}
                            {!!ratings && !ratingsError && (
                              <EpisodeRatingsGrid
                                ratings={ratings}
                                showId={Number(id)}
                                tmdbSeasons={data?.seasons || []}
                                density="compact"
                              />
                            )}
                          </div>
                        </section>
                      ) : (
                        <div className="text-sm text-zinc-400">
                          Esta sección solo aplica a series.
                        </div>
                      )}
                    </AnimatedSection>
                  </section>
                )}

                <section
                  id="section-comments"
                  ref={registerSection("comments")}
                >
                  <AnimatedSection delay={0.04}>
                    {/* CRÍTICAS */}
                    {reviews && reviews.length > 0 && (
                      <section className="mb-10 group/section">
                        <div className="flex items-start justify-between gap-3">
                          <SectionTitle
                            title="Críticas de Usuarios"
                            icon={MessageSquareIcon}
                          />
                          {reviewLimit < reviews.length && (
                            <button
                              onClick={() => setReviewLimit((prev) => prev + 2)}
                              className="mt-2 text-sm text-yellow-500 hover:text-yellow-400 font-semibold uppercase tracking-wide"
                            >
                              Ver más
                            </button>
                          )}
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          {reviews.slice(0, reviewLimit).map((r) => {
                            const avatar = r.author_details?.avatar_path
                              ? r.author_details.avatar_path.startsWith(
                                  "/https",
                                )
                                ? r.author_details.avatar_path.slice(1)
                                : `https://image.tmdb.org/t/p/w185${r.author_details.avatar_path}`
                              : `https://ui-avatars.com/api/?name=${r.author}&background=random`;

                            return (
                              <div
                                key={r.id}
                                className="relative isolate flex flex-col p-6 overflow-hidden rounded-2xl border border-transparent bg-black/20 bg-gradient-to-br from-white/10 via-transparent to-transparent backdrop-blur-lg shadow-lg transform-gpu transition-all hover:border-white/5 gap-4"
                              >
                                <div className="relative z-10 flex items-center gap-4">
                                  <img
                                    src={avatar}
                                    alt={r.author}
                                    className="w-12 h-12 rounded-full object-cover shadow-lg"
                                  />
                                  <div>
                                    <h4 className="font-bold text-white">
                                      {r.author}
                                    </h4>
                                    <div className="flex items-center gap-2 text-xs text-gray-400">
                                      <span>
                                        {new Date(
                                          r.created_at,
                                        ).toLocaleDateString()}
                                      </span>
                                      {r.author_details?.rating && (
                                        <span className="text-yellow-500 bg-yellow-500/10 px-2 rounded font-bold">
                                          ★ {r.author_details.rating}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                </div>

                                <div className="relative z-10 text-gray-300 text-sm leading-relaxed line-clamp-4 italic">
                                  "{r.content.replace(/<[^>]*>?/gm, "")}"
                                </div>

                                <a
                                  href={r.url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="relative z-10 text-blue-400 text-xs font-semibold hover:underline mt-auto self-start"
                                >
                                  Leer review completa en TMDb &rarr;
                                </a>
                              </div>
                            );
                          })}
                        </div>
                      </section>
                    )}
                  </AnimatedSection>

                  <AnimatedSection delay={0.04}>
                    {/* ===================================================== */}
                    {/* Trakt: comentarios */}
                    <section className="mb-10 group/section">
                      <SectionTitle
                        title="Comentarios"
                        icon={MessageSquareIcon}
                      />

                      <div className="relative isolate overflow-hidden rounded-2xl border border-transparent bg-black/20 bg-gradient-to-br from-white/10 via-transparent to-transparent backdrop-blur-lg shadow-lg transform-gpu">
                        {/* Filtros estilo Tabs Modernos */}
                        <div className="relative z-10 flex items-center justify-between border-b border-transparent bg-white/5 px-4 py-3">
                          <div className="flex items-center gap-2">
                            {[
                              { id: "likes30", label: "Top 30 Días" },
                              { id: "likesAll", label: "Top Histórico" },
                              { id: "recent", label: "Recientes" },
                            ].map((t) => (
                              <button
                                key={t.id}
                                type="button"
                                onClick={() => setTCommentsTab(t.id)}
                                className={`relative isolate transform-gpu rounded-xl px-4 py-1.5 text-xs font-bold transition-all flex items-center justify-center border ${
                                  tCommentsTab === t.id
                                    ? "border-transparent bg-black/20 bg-gradient-to-br from-white/10 via-transparent to-transparent backdrop-blur-lg shadow-sm text-white"
                                    : "border-transparent bg-transparent text-zinc-400 hover:bg-white/5 hover:text-white"
                                }`}
                              >
                                {t.label}
                              </button>
                            ))}
                          </div>
                          {tComments.loading && (
                            <Loader2 className="h-4 w-4 animate-spin text-zinc-500" />
                          )}
                        </div>

                        <div className="relative z-10 space-y-4 p-4 sm:p-6">
                          {!tComments.loading &&
                            (tComments.items || []).length === 0 && (
                              <div className="flex flex-col items-center justify-center py-10 text-zinc-500">
                                <MessageSquareIcon className="mb-2 h-8 w-8 opacity-20" />
                                <p className="text-sm">
                                  Sé el primero en comentar.
                                </p>
                              </div>
                            )}

                          {(tComments.items || [])
                            .slice(0, COMMENTS_SECTION_LIMIT)
                            .map((c) => {
                              const user = c?.user || {};
                              const avatar =
                                user?.images?.avatar?.full ||
                                user?.images?.avatar?.medium ||
                                `https://ui-avatars.com/api/?name=${encodeURIComponent(user?.name || user?.username || "User")}`;
                              const text = stripHtml(
                                c?.comment?.comment ?? c?.comment ?? "",
                              );
                              const created = c?.created_at
                                ? formatDateTimeEs(c.created_at)
                                : "";
                              const likes = Number(c?.likes || 0);

                              return (
                                <div
                                  key={String(
                                    c?.id || `${user?.username}-${created}`,
                                  )}
                                  className="group relative flex gap-4 rounded-2xl border border-transparent bg-white/5 p-5 transition-all hover:bg-white/10 hover:border-white/5 shadow-sm"
                                >
                                  {/* Avatar */}
                                  <div className="shrink-0">
                                    <img
                                      src={avatar}
                                      alt={user?.username}
                                      className="h-12 w-12 rounded-full object-cover shadow-lg ring-2 ring-white/10 transition group-hover:ring-white/20"
                                    />
                                  </div>

                                  {/* Content */}
                                  <div className="min-w-0 flex-1">
                                    <div className="mb-1 flex items-baseline justify-between gap-2">
                                      <div className="flex items-center gap-2">
                                        <span className="font-bold text-white group-hover:text-yellow-400 transition-colors cursor-pointer">
                                          {user?.name ||
                                            user?.username ||
                                            "Usuario"}
                                        </span>
                                        {user?.vip && (
                                          <span className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-yellow-400 drop-shadow-[0_0_8px_rgba(250,204,21,0.6)]">
                                            <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 shadow-[0_0_6px_rgba(250,204,21,0.8)]" />
                                            VIP
                                          </span>
                                        )}
                                      </div>
                                      <span className="text-xs text-zinc-500">
                                        {created}
                                      </span>
                                    </div>

                                    <div className="relative text-sm leading-relaxed text-zinc-300">
                                      {/* Icono de comillas decorativo */}
                                      <span className="absolute -left-3 -top-1 font-serif text-4xl text-white/5">
                                        “
                                      </span>
                                      <p className="whitespace-pre-line">
                                        {text}
                                      </p>
                                    </div>

                                    {/* Actions Footer */}
                                    <div className="mt-3 flex items-center gap-4 border-t border-white/5 pt-3">
                                      <div className="flex items-center gap-1.5 rounded-full bg-white/5 px-2 py-1 text-xs font-medium text-emerald-400">
                                        <ThumbsUp className="h-3 w-3" /> {likes}
                                      </div>
                                      <a
                                        href={
                                          trakt?.traktUrl
                                            ? `${trakt.traktUrl}/comments`
                                            : undefined
                                        }
                                        target="_blank"
                                        rel="noreferrer"
                                        className="ml-auto text-xs font-semibold text-zinc-500 hover:text-white transition-colors"
                                      >
                                        Responder en Trakt →
                                      </a>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                        </div>
                      </div>
                    </section>
                  </AnimatedSection>
                </section>

                <section id="section-lists" ref={registerSection("lists")}>
                  <AnimatedSection delay={0.04}>
                    {/* ===================================================== */}
                    {/* Trakt: listas - Solo mostrar si no hay error */}
                    {!tLists.error && (
                      <section className="mb-12 group/section">
                        <SectionTitle title="Listas" icon={ListVideo} />

                        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-3">
                          {tLists.loading ? (
                            <div className="col-span-full py-20 flex flex-col items-center justify-center text-zinc-500 gap-3">
                              <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
                              <span className="text-sm font-medium animate-pulse">
                                Buscando listas y portadas...
                              </span>
                            </div>
                          ) : (
                            (tLists.items || []).map((row) => {
                              const list = row?.list || row || {};
                              const user = row?.user || list?.user || {};
                              const previews = row?.previewPosters || [];

                              const name = list?.name || "Lista";
                              const itemCount = Number(
                                list?.item_count || list?.items || 0,
                              );
                              const likes = Number(list?.likes || 0);
                              const username =
                                user?.username || user?.name || null;
                              const slug = list?.ids?.slug || null;
                              const traktId = list?.ids?.trakt || null;

                              // Ruta interna (slug si existe; si no, traktId)
                              const internalUrl =
                                username && (slug || traktId)
                                  ? `/lists/trakt/${encodeURIComponent(username)}/${encodeURIComponent(String(slug || traktId))}`
                                  : null;

                              // (opcional) enlace externo a Trakt, pero ya NO es el click principal
                              const traktUrl =
                                username && (slug || traktId)
                                  ? `https://trakt.tv/users/${username}/lists/${slug || traktId}`
                                  : null;

                              const avatar =
                                user?.images?.avatar?.full ||
                                `https://ui-avatars.com/api/?name=${encodeURIComponent(username || "user")}&background=random`;

                              const disabled = !internalUrl;

                              return (
                                <Link
                                  key={String(
                                    traktId || `${username}-${slug}` || name,
                                  )}
                                  href={internalUrl || "#"}
                                  aria-disabled={disabled}
                                  className={[
                                    "group relative isolate flex flex-col overflow-hidden rounded-3xl border border-white/5 bg-black/20 bg-gradient-to-br from-white/10 via-transparent to-transparent backdrop-blur-lg shadow-lg transform-gpu transition-all duration-500",
                                    "hover:border-indigo-500/30 hover:bg-white/5",
                                    disabled
                                      ? "pointer-events-none opacity-60"
                                      : "",
                                  ].join(" ")}
                                >
                                  {/* 1. SECCIÓN VISUAL (PORTADAS APILADAS) */}
                                  <div className="relative z-10 h-52 w-full bg-gradient-to-b from-white/5 to-transparent p-6 overflow-visible">
                                    {previews.length > 0 ? (
                                      <div className="h-full w-full flex items-center justify-center overflow-visible">
                                        <PosterStack posters={previews} />
                                      </div>
                                    ) : (
                                      <div className="flex h-full items-center justify-center opacity-10">
                                        <ListVideo className="h-20 w-20" />
                                      </div>
                                    )}

                                    {/* Botón externo (opcional) sin romper el Link */}
                                    {traktUrl && (
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.preventDefault();
                                          e.stopPropagation();
                                          window.open(
                                            traktUrl,
                                            "_blank",
                                            "noopener,noreferrer",
                                          );
                                        }}
                                        className="absolute right-4 top-4 rounded-full bg-black/60 px-3 py-1 text-[11px] font-bold text-zinc-200 border border-white/10 hover:border-indigo-400/30 hover:text-white"
                                        title="Ver en Trakt"
                                      >
                                        Trakt
                                      </button>
                                    )}
                                  </div>

                                  {/* 2. CONTENIDO DE TEXTO */}
                                  <div className="relative z-10 flex flex-1 flex-col justify-between bg-black/20 p-5 backdrop-blur-md">
                                    <div>
                                      <h4 className="line-clamp-1 text-lg font-bold text-white transition-colors group-hover:text-indigo-400">
                                        {name}
                                      </h4>

                                      {list?.description && (
                                        <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-zinc-400">
                                          {stripHtml(list.description)}
                                        </p>
                                      )}
                                    </div>

                                    {/* Footer */}
                                    <div className="mt-4 flex items-center justify-between border-t border-white/5 pt-4">
                                      <div className="flex items-center gap-2 min-w-0">
                                        <img
                                          src={avatar}
                                          alt={username || "user"}
                                          className="h-6 w-6 rounded-full ring-1 ring-white/20"
                                        />
                                        <span className="text-xs font-medium text-zinc-300 group-hover:text-white truncate max-w-[120px]">
                                          {username || "—"}
                                        </span>
                                      </div>

                                      <div className="flex items-center gap-3 text-xs font-bold text-zinc-500">
                                        <span className="flex items-center gap-1 rounded bg-white/5 px-1.5 py-0.5 text-zinc-300">
                                          {itemCount} items
                                        </span>
                                        <span className="flex items-center gap-1 transition-colors group-hover:text-pink-500">
                                          <ThumbsUp className="h-3 w-3" />{" "}
                                          {likes}
                                        </span>
                                      </div>
                                    </div>
                                  </div>
                                </Link>
                              );
                            })
                          )}
                        </div>

                        {tLists.hasMore && (
                          <div className="mt-8 flex justify-center">
                            <button
                              onClick={() =>
                                setTLists((p) => ({
                                  ...p,
                                  page: (p.page || 1) + 1,
                                }))
                              }
                              className="group relative inline-flex items-center justify-center overflow-hidden rounded-full p-0.5 font-bold focus:outline-none"
                            >
                              <span className="absolute h-full w-full bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 opacity-0 transition-opacity duration-300 group-hover:opacity-100"></span>
                              <span className="relative flex items-center gap-2 rounded-full bg-black px-6 py-2.5 transition-all duration-300 group-hover:bg-opacity-0">
                                <span className="bg-gradient-to-r from-indigo-200 to-white bg-clip-text text-transparent group-hover:text-white">
                                  Cargar más listas
                                </span>
                                <ChevronDown className="h-4 w-4 text-indigo-300 group-hover:text-white" />
                              </span>
                            </button>
                          </div>
                        )}
                      </section>
                    )}
                  </AnimatedSection>
                </section>
              </>
            )}
          </div>
        </div>
      </div>

      {/* =================================================================
          MODALES Y DIÁLOGOS
         ================================================================= */}

      {/* Modal de reproducción de vídeos y tráilers */}
      <VideoModal
        open={videoModalOpen}
        onClose={closeVideo}
        video={activeVideo}
        videos={videos}
        onVideoChange={setActiveVideo}
      />

      <SoundtrackModal
        open={soundtrackModalOpen}
        onClose={() => setSoundtrackModalOpen(false)}
        title={title}
        tracks={soundtrackTracks}
        loading={soundtrackLoading}
        error={soundtrackError}
        initialTrackId={activeSoundtrackId}
        searchUrl={soundtrackSpotifySearchUrl}
      />

      {/* Modal de enlaces externos - Muestra todos los enlaces a páginas externas */}
      {/* Solo visible en móvil, en desktop se muestran inline */}
      <ExternalLinksModal
        open={externalLinksOpen}
        onClose={() => setExternalLinksOpen(false)}
        links={externalLinks}
      />

      {/* Modal de control de visto en Trakt - Para marcar películas como vistas */}
      <TraktWatchedModal
        open={traktWatchedOpen}
        onClose={() => {
          setTraktWatchedOpen(false);
          setTraktBusy("");
        }}
        title={title}
        connected={trakt.connected}
        found={trakt.found}
        traktUrl={trakt.traktUrl}
        watched={trakt.watched}
        plays={trakt.plays}
        lastWatchedAt={trakt.lastWatchedAt}
        history={trakt.history}
        busyKey={traktBusy}
        onToggleWatched={toggleTraktWatched}
        onAddPlay={handleTraktAddPlay}
        onUpdatePlay={handleTraktUpdatePlay}
        onRemovePlay={handleTraktRemovePlay}
      />

      {/* Modal de episodios de Trakt - Para marcar episodios de series como vistos */}
      {/* Incluye gestión de runs de rewatch y visualización por temporadas */}
      <TraktEpisodesWatchedModal
        key={`${id}-episodes-${traktEpisodesOpen ? "open" : "closed"}`}
        open={traktEpisodesOpen}
        onClose={closeTraktEpisodesModal}
        mediaType={type}
        tmdbId={Number(id)}
        title={title}
        connected={!!trakt?.connected}
        seasons={Array.isArray(data?.seasons) ? data.seasons : []}
        watchedBySeason={watchedBySeason}
        busyKey={episodeBusyKey}
        episodeBusyKey={episodeBusyKey}
        onToggleEpisodeWatched={toggleEpisodeWatched}
        // serie completa + plays
        onToggleShowWatched={onToggleShowWatched}
        showPlays={showPlays}
        showReleaseDate={data?.first_air_date || data?.release_date || null}
        onAddShowPlay={onAddShowPlay}
        // rewatch runs + vista activa
        rewatchRuns={rewatchRuns}
        activeView={activeEpisodesView}
        activeEpisodesView={activeEpisodesView}
        onChangeView={changeEpisodesView}
        onChangeEpisodesView={changeEpisodesView}
        onCreateRewatchRun={createRewatchRun}
        onDeleteRewatchRun={deleteRewatchRun}
        rewatchStartAt={rewatchStartAt}
        watchedBySeasonRewatch={rewatchWatchedBySeason}
        rewatchWatchedBySeason={rewatchWatchedBySeason}
        onToggleEpisodeRewatch={toggleEpisodeRewatch}
      />

      {/* Modal de añadir a lista - Permite agregar el contenido a listas personalizadas del usuario */}
      {/* Incluye funcionalidad para crear nuevas listas directamente desde el modal */}
      <AddToListModal
        open={listModalOpen}
        onClose={closeListsModal}
        lists={userLists}
        loading={listsLoading}
        error={listsError}
        query={listQuery}
        setQuery={setListQuery}
        membershipMap={membershipMap}
        busyListId={busyListId}
        onAddToList={handleAddToSpecificList}
        creating={creatingList}
        createOpen={createOpen}
        setCreateOpen={setCreateOpen}
        newName={newListName}
        setNewName={setNewListName}
        newDesc={newListDesc}
        setNewDesc={setNewListDesc}
        onCreateList={handleCreateListAndAdd}
      />
    </div>
  );
}

// =============================================================================
// Componente auxiliar: UsersIconComponent
// =============================================================================
/**
 * Componente de icono SVG personalizado para representar el reparto/usuarios
 *
 * Este icono se utiliza en la interfaz para mostrar secciones relacionadas
 * con el elenco y equipo del contenido.
 *
 * @param {Object} props - Propiedades del componente
 * @param {number} [props.size=24] - Tamaño del icono en píxeles
 * @param {string} [props.className] - Clases CSS adicionales para estilizar el icono
 * @returns {JSX.Element} Elemento SVG del icono de usuarios
 */
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
