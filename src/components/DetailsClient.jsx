// src/components/DetailsClient.jsx
// ---------------------------------------------------------------------------
// Componente principal de detalle de pelicula/serie.
// Renderiza toda la pagina de detalle: poster, backdrop, metadatos,
// puntuaciones (TMDb, Trakt, IMDb, RT, Metacritic), gestion de listas,
// episodios, temporadas, colecciones, comentarios, cast, recomendaciones,
// integracion con Trakt (watched, rewatch, plays) y Plex.
// ---------------------------------------------------------------------------
"use client";

import OptimizedImage from "@/components/OptimizedImage";
// -- Hooks de React --
import {
  useRef,
  useState,
  useEffect,
  useLayoutEffect,
  useMemo,
  useCallback,
  useTransition,
} from "react";
import { createPortal } from "react-dom";

// -- Navegacion de Next.js --
import { useRouter } from "next/navigation";

// -- Carrusel Swiper --
import { Swiper, SwiperSlide } from "swiper/react";
import "swiper/swiper-bundle.css";
// Carrusel con flechas COMPARTIDO (mismo componente que usa DetailModal).
import DetailsArrowCarousel from "@/components/details/DetailsArrowCarousel";

// -- Animaciones con Framer Motion --
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

// -- Componentes internos del proyecto --
import EpisodeRatingsGrid from "@/components/EpisodeRatingsGrid";
import EpisodeRatingsModal from "@/components/details/EpisodeRatingsModal";
import {
  fetchArtworkOverride,
  readArtworkPreference,
  resolveCachedArtworkOverride,
  saveArtworkOverride,
  saveArtworkOverrides,
  writeArtworkPreference,
} from "@/lib/artworkApi";
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
  Award,
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
  LibraryBig,
  MessageSquare,
  SlidersHorizontal,
  BarChart3,
  Trophy,
} from "lucide-react";

// Boton con efecto liquido para acciones principales
import LiquidButton from "@/components/LiquidButton";

// -- Autenticacion y APIs de cuenta (TMDb) --
import { useAuth } from "@/context/AuthContext";
import {
  titleStateKey,
  useViewerTitleStates,
} from "@/components/social/useViewerTitleStates";
import { isOwnedComment } from "@/lib/community/commentOwnership";
import { LIQUID_GLASS_PANEL } from "@/lib/ui/liquidGlass";
import { getLocalInProgress } from "@/lib/api/progressClient";
import {
  getImages,
  getVideos,
  getMediaAccountStates,
  markAsFavorite,
  markInWatchlist,
  getExternalIds,
} from "@/lib/api/tmdb";
import { fetchOmdbByImdb } from "@/lib/api/omdb"; // Datos extra de OMDb (RT, MC, premios)
import { cacheAddRating, cacheRemoveRating } from "@/lib/userLists/optimisticListCache";
import { fetchImdbRatingByImdb } from "@/lib/api/imdbRatings";
import { fetchTmdbAwards } from "@/lib/api/tmdbAwards";
import { formatDashboardAwards } from "@/lib/details/awardsText";
import StarRating from "./StarRating"; // Componente de puntuacion con estrellas
import TraktWatchedControl from "@/components/trakt/TraktWatchedControl"; // Boton de marcar visto en Trakt
import TraktWatchedModal from "@/components/trakt/TraktWatchedModal"; // Modal de historial de visionados
import TraktEpisodesWatchedModal from "@/components/trakt/TraktEpisodesWatchedModal"; // Modal de episodios vistos
import { useTraktEpisodesWatched } from "@/lib/hooks/useTraktEpisodesWatched";
// -- API client de Trakt: estado, visionados, ratings, comentarios, listas, temporadas --
import {
  traktGetItemStatus,
  traktSetWatched,
  traktAddWatchPlay,
  traktUpdateWatchPlay,
  traktRemoveWatchPlay,
  traktGetComments,
  traktAddComment,
  traktUpdateComment,
  traktDeleteComment,
  traktGetSentiments,
  traktGetLists,
  traktGetShowSeasons,
  traktGetScoreboard,
  traktGetStats,
  traktSetRating,
  invalidateTraktGetCache,
} from "@/lib/api/traktClient";

// Menu lateral/sticky de navegacion por secciones
import DetailsSectionMenu from "./DetailsSectionMenu";

// Cache de datos OMDb en localStorage para evitar peticiones repetidas
import {
  readOmdbCache,
  writeOmdbCache,
  extractOmdbExtraScores,
  extractOmdbImdbScore,
} from "@/lib/details/omdbCache";
import {
  buildCastDataForUI,
  buildCreativeCreditsForCast,
  formatCreditNames,
  getMovieDirectorsFromCrew,
  normalizeCastFromTmdb,
} from "@/lib/details/cast";

// -- Utilidades de imagenes TMDb: seleccion inteligente de poster/backdrop --
import {
  mergeUniqueImages,
  buildOriginalImageUrl,
  preloadTmdb,
  pickBestEnglishPoster,
  pickBestNeutralPosterByResVotes,
  isLanguageNeutralImage,
  resolveNeutralBackdropPath,
  pickBestBackdropByLangResVotes,
  pickBestBackdropTVNeutralFirst,
  pickBestBackdropForPreview,
} from "@/lib/details/tmdbImages";
import {
  getTitleLogos,
  pickBestBackdropNoLang,
} from "@/lib/dashboard/media";

// -- Funciones de formato: numeros, fechas, HTML, conteos --
import {
  slugifyForSeriesGraph,
  formatDateEs,
  formatVoteCount,
  formatCountShort,
  stripHtml,
  formatDateTimeEs,
  mixedCount,
  sumCount,
  translateGenre,
} from "@/lib/details/formatters";

// -- Gestion de listas de usuario en el backend propio (CRUD) --
// Migrado desde TMDb v3: "Mis Listas" ahora vive en nuestro backend/BBDD, igual
// que la página /lists. La auth va por cookie de sesión del backend (no TMDb),
// por eso ya no se pasan apiKey/sessionId.
import {
  fetchUserLists as backendFetchUserLists,
  createUserList as backendCreateUserList,
  addMovieToList as backendAddMovieToList,
  getListDetails as backendGetListDetails,
} from "@/lib/api/backendLists";

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
import { getSeriesGraphSeasonAverages } from "@/lib/details/seriesGraphRatings";
import { seasonStructuresAlign } from "@/lib/details/episodeRatingsStructure";

// -- Componentes atomicos para la UI de detalle --
import {
  VisualMetaCard,
  MetaItem,
  ScoreBadge,
  StatChip,
  DetailsTabsMenu,
} from "@/components/details/DetailAtoms";
// Sección de pestañas (Detalles/Producción/Sinopsis/Premios) compartida con la
// ficha rápida del dashboard (DetailModal) para que rendericen las MISMAS tarjetas.
import DetailsInfoTabs from "@/components/details/DetailsInfoTabs";
import {
  ExternalLinkButton,
  UnifiedRateButton,
} from "@/components/details/DetailHeaderBits";
// `ToolbarSeparator`: la MISMA línea vertical que usa el scoreboard, reutilizada
// para separar plataformas de enlaces externos en el modo de portada backdrop.
import DetailsScoreboardPanel, {
  ToolbarSeparator,
} from "@/components/details/DetailsScoreboardPanel";
import {
  buildTmdbHref,
  buildTraktHref,
  buildImdbHref,
} from "@/lib/details/ratingLinks";
// Fila de botones de acción principal (tráiler, favorito, pendiente, puntuar,
// listas, reseñas, soundtrack…): componente PRESENTACIONAL compartido con la
// ficha rápida del dashboard (DetailModal) para que la fila sea IDÉNTICA.
import DetailActionsRow from "@/components/details/DetailActionsRow";

// -- Modales del componente --
import AddToListModal from "@/components/details/AddToListModal";
import VideoModal from "@/components/details/VideoModal";
import SoundtrackModal from "@/components/details/SoundtrackModal";
import TraktCommentModal from "@/components/details/TraktCommentModal";
import PosterStack from "@/components/details/PosterStack";
import ExternalLinksModal from "@/components/details/ExternalLinksModal";
import StreamingHoverOverlay from "@/components/details/StreamingHoverOverlay";
import DetailsMetaGenresRow, {
  getStatusLabel,
  getStatusBadgeClass,
} from "@/components/details/DetailsMetaGenresRow";
import { pickPrimaryProvider } from "@/lib/streaming/platformWordmark";
import {
  createPlatformItem,
  dedupeStreamingProviders,
} from "@/lib/streaming/providers";

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

// ---------------------------------------------------------------------------
// CONSTANTES GLOBALES
// ---------------------------------------------------------------------------

// Clave de API de TMDb inyectada como variable de entorno publica
const TMDB_API_KEY = process.env.NEXT_PUBLIC_TMDB_API_KEY;
const SOUNDTRACK_ALGORITHM_VERSION = "soundtrack-ranking-v47";
const DETAILS_ROUTE_TRANSITION_KEY = "showverse:details-route-transition";

// Cache en memoria para el scoreboard publico (evita refetches durante la sesion)
const PUBLIC_SCORE_CACHE = new Map(); // clave -> { ts, data }
const TTL = 1000 * 60 * 5; // Tiempo de vida del cache: 5 minutos

// Revelado por posición del bloque secundario en móvil (marcador + pestañas).
//
// Mismo lenguaje de movimiento que la barra inferior de navegación: una ÚNICA
// curva y duración para todo lo que se mueve, de modo que opacidad y
// desplazamiento empiezan y terminan a la vez, y la transición es SIMÉTRICA (se
// oculta exactamente igual que aparece). Solo se animan `opacity` y `transform`,
// las dos propiedades que el compositor puede resolver sin recalcular layout:
// por eso resulta fluida en todo momento aunque el usuario siga desplazándose.
//
// Se hace con transición CSS y no con Framer Motion a propósito: el estado
// oculto tiene que estar garantizado ya en el primer pintado (antes de que
// `isMobileViewport` se resuelva) y eso se expresaba con una clase `!important`
// que PISABA el estilo inline de Framer -- el resultado era que aparecía animado
// pero se ocultaba de golpe. Con clases, el mismo selector que garantiza el
// estado oculto es el que se transiciona, así que no hay dos sistemas peleando.
// `translate` va en la lista de propiedades a propósito: Tailwind v4 no compone
// `translate-y-*` dentro de `transform`, sino en la propiedad INDEPENDIENTE
// `translate`. Si solo se transiciona `transform`, la opacidad atenúa suave pero
// el desplazamiento salta de golpe. (`transition-transform` de Tailwind sí las
// cubre todas; aquí hay que enumerarlas porque el valor es arbitrario.)
const MOBILE_REVEAL_BASE =
  "origin-top transform-gpu transition-[opacity,transform,translate,scale,rotate] duration-[450ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none";
const MOBILE_REVEAL_HIDDEN =
  "max-sm:opacity-0 max-sm:translate-y-3 max-sm:pointer-events-none";

function normalizePlayableVideos(rawVideos) {
  const source = Array.isArray(rawVideos?.results)
    ? rawVideos.results
    : Array.isArray(rawVideos)
      ? rawVideos
      : [];

  const merged = uniqBy(source, (v) => `${v?.site}:${v?.key}`).filter(
    isPlayableVideo,
  );
  merged.sort((a, b) => rankVideo(a) - rankVideo(b));
  return merged;
}

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

function getEpisodeRuntimeValues(data) {
  const episodeRuntimes = Array.isArray(data?.episode_run_time)
    ? data.episode_run_time
        .map((value) => Number(value))
        .filter((value) => Number.isFinite(value) && value > 0)
    : [];

  return [...new Set(episodeRuntimes)].sort((a, b) => a - b);
}

function formatEpisodeRuntime(data) {
  const uniqueRuntimes = getEpisodeRuntimeValues(data);

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

function formatEpisodeRuntimePerEpisode(data) {
  const uniqueRuntimes = getEpisodeRuntimeValues(data);
  const formatMinutes = (value) => {
    const total = Number(value);
    return Number.isFinite(total) && total > 0
      ? `${Math.round(total)} min`
      : null;
  };

  if (uniqueRuntimes.length === 1) {
    const value = formatMinutes(uniqueRuntimes[0]);
    return value;
  }

  if (uniqueRuntimes.length > 1) {
    const min = formatMinutes(uniqueRuntimes[0]);
    const max = formatMinutes(uniqueRuntimes[uniqueRuntimes.length - 1]);
    return min && max ? `${min}-${max}` : null;
  }

  const lastEpisodeRuntime = formatMinutes(
    data?.last_episode_to_air?.runtime,
  );
  return lastEpisodeRuntime;
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

// AwardsPanel se extrajo a `@/components/details/AwardsPanel` y ahora se renderiza
// dentro de <DetailsInfoTabs> (sección de pestañas compartida con DetailModal).

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

// Tarjeta de un premio (usada por la sección "Premios", tras Colección).
function AwardCard({ item }) {
  const people = Array.isArray(item?.people) ? item.people.filter(Boolean) : [];
  const visual = getAwardVisual(item?.groupName);
  const categoryLabel = formatAwardCategory(item?.category, item?.groupName);
  const groupLabel = formatAwardGroupName(item?.groupName);

  return (
    <article className="block group relative bg-zinc-900 rounded-xl overflow-hidden shadow-md lg:hover:shadow-yellow-900/20 transition-all duration-300 after:pointer-events-none after:absolute after:inset-0 after:z-30 after:rounded-[inherit] after:content-[''] after:transition-shadow after:duration-300 hover:after:shadow-[inset_0_0_0_2.5px_rgba(234,179,8,0.95)]">
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
              <OptimizedImage
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

// Mismo criterio visual del hero: PNG primero (suele mantener el color original),
// después inglés, sin idioma y español; por último, votos de TMDb.
function pickDefaultHeroLogo(logos) {
  if (!Array.isArray(logos) || logos.length === 0) return null;
  const languageOrder = ["en", null, "es"];
  const score = (logo) => {
    const lang = logo?.iso_639_1 ?? null;
    const languageIndex = languageOrder.indexOf(lang);
    const languageScore =
      languageIndex === -1 ? 0 : (languageOrder.length - languageIndex) * 1000;
    const pngScore = /\.png$/i.test(logo?.file_path || "") ? 1_000_000 : 0;
    return pngScore + languageScore + (logo?.vote_count || 0);
  };

  return [...logos].sort((a, b) => score(b) - score(a))[0]?.file_path || null;
}

// Muestra primero una variante ligera del logo y conserva la calidad original
// como estado final. La original se descarga después de que w500 ya sea
// visible y se intercambia solo cuando está cargada y decodificada, así una
// conexión móvil nunca deja el hueco del logo vacío por esperar un PNG grande.
function ProgressiveHeroLogo({ path, title }) {
  const [previewPathLoaded, setPreviewPathLoaded] = useState(null);
  const [originalPathReady, setOriginalPathReady] = useState(null);
  const previewLoaded = previewPathLoaded === path;
  const useOriginal = originalPathReady === path;

  useEffect(() => {
    if (!path || !previewLoaded || useOriginal) return undefined;

    let cancelled = false;
    const image = new Image();
    image.decoding = "async";
    image.onload = async () => {
      try {
        await image.decode?.();
      } catch {
        // La imagen cargada sigue siendo válida aunque decode() no esté disponible.
      }
      if (!cancelled) setOriginalPathReady(path);
    };
    image.src = `https://image.tmdb.org/t/p/original${path}`;

    return () => {
      cancelled = true;
    };
  }, [path, previewLoaded, useOriginal]);

  if (!path) return null;

  return (
    <OptimizedImage
      src={`https://image.tmdb.org/t/p/${useOriginal ? "original" : "w500"}${path}`}
      alt={title}
      priority
      unoptimized
      decoding="async"
      fetchPriority="high"
      onLoad={() => {
        if (!useOriginal) setPreviewPathLoaded(path);
      }}
      onError={() => {
        // Mantiene el fallback que existía: si TMDb no sirve w500, se prueba la
        // ruta original directamente.
        if (!useOriginal) setOriginalPathReady(path);
      }}
      className="relative z-10 h-auto max-h-24 w-auto max-w-[85%] object-contain drop-shadow-[0_3px_14px_rgba(0,0,0,0.85)]"
    />
  );
}

// Componente de badge de estadística con diseño premium optimizado y ultra-compacto (sin tarjeta/fondo)
// =====================================================================
// COMPONENTE PRINCIPAL: DetailsClient
// =====================================================================

function RecommendationHoverIndicator({
  favorite = false,
  watchlist = false,
  userRating = null,
  tmdbRating = null,
  imdbRating = null,
}) {
  // Favorito tiene prioridad si, por una importación antigua, el título
  // aparece también en Pendientes. El resto de recomendaciones conservan sus
  // puntuaciones públicas aunque no pertenezcan a ninguna lista.
  const isFavorite = Boolean(favorite);
  const isWatchlist = !isFavorite && Boolean(watchlist);
  const normalizedUserRating = Number(userRating);
  const normalizedTmdbRating = Number(tmdbRating);
  const normalizedImdbRating = Number(imdbRating);
  const hasUserRating = Number.isFinite(normalizedUserRating) && normalizedUserRating > 0;
  const hasTmdbRating = Number.isFinite(normalizedTmdbRating) && normalizedTmdbRating > 0;
  const hasImdbRating = Number.isFinite(normalizedImdbRating) && normalizedImdbRating > 0;
  const scoreClassName = "flex h-9 w-10 shrink-0 items-center justify-center text-xl font-black leading-none tabular-nums";

  if (!isFavorite && !isWatchlist && !hasTmdbRating && !hasImdbRating) return null;

  return (
    <div
      className={`pointer-events-none absolute bottom-2 left-1/2 z-20 hidden -translate-x-1/2 translate-y-3 scale-95 items-center overflow-hidden rounded-full px-1.5 opacity-0 ${LIQUID_GLASS_PANEL} text-white shadow-xl transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none lg:flex lg:group-hover:translate-y-0 lg:group-hover:scale-100 lg:group-hover:opacity-100 will-change-transform transform-gpu`}
      aria-hidden="true"
    >
      {(isFavorite || isWatchlist) && (
        <span className={`flex h-9 w-10 shrink-0 items-center justify-center ${isFavorite ? "text-red-400" : "text-sky-400"}`}>
          {isFavorite ? (
            <Heart className="h-5 w-5 fill-current" />
          ) : (
            <BookmarkPlus className="h-5 w-5 fill-current" />
          )}
        </span>
      )}
      {isFavorite && hasUserRating && (
        <span className={`${scoreClassName} text-amber-300`}>
          {Number.isInteger(normalizedUserRating) ? normalizedUserRating : normalizedUserRating.toFixed(1)}
        </span>
      )}
      {!isFavorite && hasTmdbRating && (
        <span className={`${scoreClassName} text-sky-400`}>
          {normalizedTmdbRating.toFixed(1)}
        </span>
      )}
      {!isFavorite && hasImdbRating && (
        <span className={`${scoreClassName} text-amber-300`}>
          {normalizedImdbRating.toFixed(1)}
        </span>
      )}
    </div>
  );
}

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
  initialSentiment,
  initialComments,
  initialLists,
}) {
  const router = useRouter();
  const prefetchSeasonDetails = useCallback(
    (seasonNumber) => {
      const sn = Number(seasonNumber);
      if (!Number.isFinite(sn)) return;
      const href = `/details/tv/${id}/season/${sn}`;
      router.prefetch(href);
      if (typeof window !== "undefined") {
        fetch(href, { priority: "low" }).catch(() => {});
      }
    },
    [router, id],
  );

  // -- Datos basicos derivados de las props --
  const title = data.title || data.name; // Peliculas usan "title", series usan "name"
  const originalTitle = data.original_title || data.original_name || ""; // Titulo original para mejorar busquedas musicales
  const endpointType = type === "tv" ? "tv" : "movie"; // Tipo normalizado para endpoints de API
  const yearIso = (data.release_date || data.first_air_date || "")?.slice(0, 4); // Año de estreno
  const filmAffinitySearchUrl = `https://www.filmaffinity.com/es/search.php?stext=${encodeURIComponent((title || "").trim())}&stype=title`;
  const initialVideos = useMemo(
    () => normalizePlayableVideos(data?.videos?.results),
    [data?.videos?.results],
  );

  // URLs de TMDb para enlace externo y pagina de "donde ver"
  const tmdbDetailUrl =
    type && id ? `https://www.themoviedb.org/${type}/${id}` : null;

  const tmdbWatchUrl =
    watchLink ||
    (type && id ? `https://www.themoviedb.org/${type}/${id}/watch` : null);

  // -- Estado general de la UI --
  const [showAdminImages, setShowAdminImages] = useState(false); // Panel admin de imagenes (solo admin)
  const [useBackdrop, setUseBackdrop] = useState(true); // Alternar entre backdrop y poster como fondo

  // -- Autenticacion y permisos --
  const {
    session,
    account,
    authenticated = false,
    hydrated: authHydrated = true,
    preferences,
    preferencesCached = false,
    cacheArtworkOverrides,
  } = useAuth();
  const isAdmin =
    account?.username === "psantos26" || account?.name === "psantos26";

  // -- Estado de favoritos y watchlist (TMDb) --
  const [favLoading, setFavLoading] = useState(false); // Cargando accion de favorito
  const [wlLoading, setWlLoading] = useState(false); // Cargando accion de watchlist
  const [favorite, setFavorite] = useState(false); // Es favorito del usuario
  const [watchlist, setWatchlist] = useState(false); // Esta en la watchlist del usuario
  const [hasBackendSession, setHasBackendSession] = useState(() => {
    if (typeof window === "undefined") return false;
    const cookie = document.cookie || "";
    return cookie.includes("showverse_access_token=") ||
           cookie.includes("backend_access_token=") ||
           cookie.includes("access_token=");
  });
  const recommendationViewerItems = useMemo(
    () =>
      (Array.isArray(recommendations) ? recommendations : []).map((rec) => ({
        tmdbId: rec?.id,
        mediaType:
          rec?.media_type === "movie" || rec?.media_type === "tv"
            ? rec.media_type
            : type === "tv"
              ? "tv"
              : "movie",
      })),
    [recommendations, type],
  );
  const recommendationViewerStates = useViewerTitleStates(
    recommendationViewerItems,
    authenticated || hasBackendSession,
  );

  // -- Puntuacion del usuario en TMDb --
  const [userRating, setUserRating] = useState(null); // Rating actual (1-10)
  const [ratingLoading, setRatingLoading] = useState(false);
  const [ratingError, setRatingError] = useState("");

  // Indica si se estan cargando los estados de cuenta (favorito, watchlist, rating)
  const [accountStatesLoading, setAccountStatesLoading] = useState(
    !authHydrated || (!!session && session !== "showverse"),
  );

  // Pestana activa en la seccion de metadatos (details/produccion/sinopsis/premios)
  const [activeTab, setActiveTab] = useState("details");

  // ====== CLAVES DE LOCALSTORAGE PARA PREFERENCIAS DE IMAGENES ======
  // Cada clave es unica por tipo de contenido e ID para persistir selecciones del usuario
  const posterStorageKey = `showverse:${endpointType}:${id}:poster`;
  const mobilePosterStorageKey = `showverse:${endpointType}:${id}:mobilePoster`;
  const logoStorageKey = `showverse:${endpointType}:${id}:logo`;
  const previewBackdropStorageKey = `showverse:${endpointType}:${id}:backdrop`;
  const backgroundStorageKey = `showverse:${endpointType}:${id}:background`;
  // Modo de vista global (poster o preview) - se comparte entre todos los contenidos
  const globalViewModeStorageKey = "showverse:global:posterViewMode";
  const traktStatusStorageKey = `showverse:trakt:status:${endpointType}:${id}`;
  const traktShowWatchedStorageKey = `showverse:trakt:showWatched:${id}`;
  const artworkPreferenceRevisionRef = useRef(0);

  const persistArtworkPreference = (storageKey, filePath) => {
    artworkPreferenceRevisionRef.current += 1;
    writeArtworkPreference(storageKey, filePath);
  };

  // -- Rutas de imagen seleccionadas por el usuario --
  const [selectedPosterPath, setSelectedPosterPath] = useState(null);
  const [selectedMobilePosterPath, setSelectedMobilePosterPath] =
    useState(null);
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
  // Un usuario autenticado puede tener poster/backdrop/preview/logo personalizados
  // guardados en el servidor (sección "Portadas y fondos"). En una sesión nueva
  // (sin caché local todavía) no hay forma de saberlo hasta que responda
  // GET /api/user/preferences. Mientras esa comprobación está en curso, las
  // imágenes "por defecto" (calculadas o de TMDb) se mantienen ocultas: sin
  // esto, se pintaban de inmediato y luego el override llegaba y las
  // sustituía, provocando el parpadeo "por defecto -> seleccionada". Empieza
  // en `false` siempre (SSR/primer render) y pasa a `true` en cuanto se sabe
  // que no hace falta esperar (usuario no autenticado) o en cuanto responde
  // la comprobación remota (autenticado).
  const [remoteArtworkChecked, setRemoteArtworkChecked] = useState(false);

  // -- Estados de carga progresiva del poster --
  // Se usan para mostrar primero una version de baja calidad y luego la alta
  const [posterResolved, setPosterResolved] = useState(false); // Ruta del poster determinada
  const [posterLowLoaded, setPosterLowLoaded] = useState(false); // Imagen baja calidad cargada
  const [posterHighLoaded, setPosterHighLoaded] = useState(false); // Imagen alta calidad cargada
  // Ref (no state, para poder leerla desde `initArtwork` sin closures obsoletas):
  // true cuando la portada actual YA terminó su fundido de entrada. Cuando no
  // hay `images` en el SSR (portada aun no cacheada en el servidor) hace falta
  // un fetch cliente a `/images` para elegir el mejor póster en inglés; si ese
  // fetch tarda más que el fundido, el póster inicial (`data.poster_path`) ya
  // se ve estable cuando llega el "mejor" póster, y sustituirlo en ese momento
  // provoca un parpadeo (la portada cambia de golpe). Con esta ref, una vez
  // estabilizada la portada visible ya NO se sustituye por una "mejor".
  const posterSettledRef = useRef(false);
  const [posterImgError, setPosterImgError] = useState(false); // Error al cargar poster
  const [posterTransitioning, setPosterTransitioning] = useState(false); // Transicion entre posters
  const [prevPosterPath, setPrevPosterPath] = useState(null); // Poster anterior (para crossfade)

  // -- Progreso de reproduccion local ("Continuar viendo") de ESTE titulo --
  // Si hay una fila en watch_progress (mismo tmdbId y tipo), guardamos su % para
  // pintar una barra de progreso sobre el poster. null = no esta en curso.
  // Solo aplica a PELICULAS: el progreso de una serie es por episodio (se
  // muestra en EpisodeDetails), no tiene sentido a nivel de ficha de serie.
  const [inProgressPct, setInProgressPct] = useState(null);
  // Se resuelve con un fetch real (`/api/progress`), así que no está listo en
  // el primer render. Mientras no lo está, la fila de acciones móvil se
  // mantiene con `max-sm:invisible` (ver el render): invisible pero SIN salir
  // del flujo, para que `mobileActionRowRef`/ResizeObserver sigan midiendo su
  // alto real y no descoloquen el póster. Así no aparece primero en la
  // posición "sin progreso" para saltar en cuanto se resuelve la barra.
  // Arranca SIEMPRE en `false`: `authenticated` también tarda en hidratarse
  // (useAuth cachea en localStorage, pero eso ocurre en un efecto del
  // AuthProvider que se ejecuta DESPUÉS del primer efecto de este componente,
  // así que en el primer render `authenticated` todavía es `false` aunque el
  // usuario esté loggeado). Usar `authenticated` para decidir el valor inicial
  // aquí mostraría la fila igualmente y la ocultaría/rebotaría un instante
  // después al confirmarse la sesión — el mismo salto que se quiere evitar.
  const [inProgressChecked, setInProgressChecked] = useState(false);

  useEffect(() => {
    // Sin confirmar aún si hay sesión: no sabemos si hará falta el fetch de
    // progreso, así que tampoco se puede dar por comprobado.
    if (!authHydrated) return;
    if (!authenticated || !id || endpointType !== "movie") {
      setInProgressPct(null);
      setInProgressChecked(true);
      return;
    }
    // Nuevo id/título (o sesión recién confirmada): oculta de nuevo la fila de
    // acciones móvil hasta que este fetch resuelva.
    setInProgressChecked(false);
    let abort = false;
    (async () => {
      const rows = await getLocalInProgress();
      if (abort) return;
      const match = (Array.isArray(rows) ? rows : []).find(
        (r) => Number(r.tmdbId) === Number(id) && r.mediaType === endpointType,
      );
      const pct =
        match && typeof match.percent === "number"
          ? Math.round(Math.min(1, Math.max(0, match.percent)) * 100)
          : 0;
      setInProgressPct(pct >= 1 && pct < 100 ? pct : null);
      setInProgressChecked(true);
    })();
    return () => {
      abort = true;
    };
  }, [authHydrated, authenticated, id, endpointType]);

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
  // En móvil el alto real de los botones cambia con el ancho disponible y con
  // las acciones que tenga cada título. Se mide para que el hero termine justo
  // antes del navbar inferior, sin dejar metadatos entre ambos.
  const mobileActionRowRef = useRef(null);
  const mobileSecondaryTriggerRef = useRef(null);
  const [mobileActionRowHeight, setMobileActionRowHeight] = useState(60);
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

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const transitionKey = `${endpointType}:${id}`;
    let shouldFocus = false;

    try {
      shouldFocus =
        window.sessionStorage.getItem(DETAILS_ROUTE_TRANSITION_KEY) ===
        transitionKey;
      if (shouldFocus) {
        window.sessionStorage.removeItem(DETAILS_ROUTE_TRANSITION_KEY);
      }
    } catch {
      shouldFocus = false;
    }

    if (!shouldFocus) return undefined;

    const focusTimer = window.setTimeout(() => {
      contentTopRef.current?.focus({ preventScroll: true });
    }, 0);

    return () => window.clearTimeout(focusTimer);
  }, [endpointType, id]);

  // =====================================================================
  // LISTAS PROPIAS DEL USUARIO — persistidas en nuestro backend. Permiten
  // guardar tanto películas como series; TMDb solo aporta sus metadatos.
  // =====================================================================

  const canUseLists = authenticated || hasBackendSession;

  // -- Estado del modal de listas --
  const [listModalOpen, setListModalOpen] = useState(false);
  const [listsLoading, setListsLoading] = useState(false);
  const [listsError, setListsError] = useState("");
  const [userLists, setUserLists] = useState([]); // Todas las listas del usuario
  const [listQuery, setListQuery] = useState(""); // Filtro de busqueda en el modal

  // Mapa de pertenencia: { listId: true/false } indica si el título está en cada lista.
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
  const [mobileSecondaryVisible, setMobileSecondaryVisible] =
    useState(false);

  // Con barra de progreso ("Viendo XX%") la fila de acciones NO entra junto a la
  // portada: la barra ya ocupa esa zona y encadenar las dos cosas amontonaba
  // información nada más abrir. Espera al primer scroll y aparece con el mismo
  // revelado que el marcador y las pestañas.
  const mobileActionsWaitForScroll = inProgressPct != null;

  // Logo del título (arte, textless) para la cabecera MÓVIL (sobre la portada),
  // igual que DetailModal. Best-effort; si no hay logo, cae al título de texto.
  const [heroLogoPath, setHeroLogoPath] = useState(null);
  const [selectedLogoPath, setSelectedLogoPath] = useState(null);
  const [titleLogos, setTitleLogos] = useState([]);
  // ¿Ya terminó el fetch del logo? El título de TEXTO solo se muestra cuando el
  // logo se ha resuelto y NO existe; durante la carga no se muestra nada (el
  // 99% de los títulos tienen logo, así que evitamos el parpadeo texto→logo).
  const [heroLogoResolved, setHeroLogoResolved] = useState(false);

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

  // El alto de la fila puede ser 60px en pantallas anchas o menor cuando los
  // botones se adaptan al ancho. ResizeObserver evita depender de una cifra
  // estimada. OJO: esta medida NO debe incluir la barra de "Continuar viendo"
  // -- el póster/logo tienen que quedar fijos siempre; si hay progreso, la
  // fila de acciones simplemente se desplaza hacia abajo, quedando detrás del
  // navbar inferior (ver el bloque `inProgressPct` en el render móvil).
  useLayoutEffect(() => {
    const updateHeroMobileGeometry = () => {
      const nextActionHeight = Math.max(
        1,
        Math.ceil(mobileActionRowRef.current?.getBoundingClientRect().height || 60),
      );

      setMobileActionRowHeight((current) =>
        current === nextActionHeight ? current : nextActionHeight,
      );
    };

    updateHeroMobileGeometry();
    window.addEventListener("resize", updateHeroMobileGeometry, { passive: true });

    if (typeof ResizeObserver === "undefined") {
      return () => window.removeEventListener("resize", updateHeroMobileGeometry);
    }

    const observer = new ResizeObserver(updateHeroMobileGeometry);
    if (mobileActionRowRef.current) observer.observe(mobileActionRowRef.current);

    return () => {
      window.removeEventListener("resize", updateHeroMobileGeometry);
      observer.disconnect();
    };
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

  // MÓVIL: progreso de scroll `--sv-hero-scroll` (0→1) que dirige la transición del
  // póster de portada a fondo (difuminado + escala + máscara, en globals.css). Se
  // escribe en el <html> con un listener pasivo + rAF (sin re-render de React). La
  // distancia (~55% de la ventana) es AJUSTABLE. En desktop se limpia y no se usa.
  useEffect(() => {
    const root = document.documentElement;
    if (!isMobileViewport) {
      root.style.removeProperty("--sv-hero-scroll");
      return undefined;
    }
    let raf = 0;
    const apply = () => {
      raf = 0;
      const dist = Math.max(1, window.innerHeight * 0.55);
      const p = Math.min(1, Math.max(0, window.scrollY / dist));
      root.style.setProperty("--sv-hero-scroll", p.toFixed(4));
    };
    const onScroll = () => {
      if (!raf) raf = window.requestAnimationFrame(apply);
    };
    apply();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    return () => {
      if (raf) window.cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      root.style.removeProperty("--sv-hero-scroll");
    };
  }, [isMobileViewport]);

  // MÓVIL: el bloque secundario (marcador de puntuaciones + pestañas de
  // información) no compite con la portada al entrar. Se revela al cruzar por
  // primera vez el navbar inferior y se oculta al volver al inicio de la ficha.
  // Ambos comparten esta señal para aparecer y desaparecer como una sola pieza.
  useEffect(() => {
    if (!isMobileViewport) {
      setMobileSecondaryVisible(false);
      return undefined;
    }

    setMobileSecondaryVisible(false);
    const trigger = mobileSecondaryTriggerRef.current;
    if (!trigger) return undefined;

    const hideAtTop = () => {
      if (window.scrollY <= 4) setMobileSecondaryVisible(false);
    };

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && window.scrollY > 4) {
          setMobileSecondaryVisible(true);
        }
      },
      {
        root: null,
        // Reserva el espacio cubierto por la navegación inferior flotante.
        rootMargin: "0px 0px -88px 0px",
        threshold: 0,
      },
    );

    observer.observe(trigger);
    hideAtTop();
    window.addEventListener("scroll", hideAtTop, { passive: true });

    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", hideAtTop);
    };
  }, [id, isMobileViewport]);

  // Logos disponibles para la cabecera y la galería móvil. Se cargan una vez y
  // la selección manual se aplica por encima del logo recomendado.
  useEffect(() => {
    const showId = data?.id;
    if (!showId) return undefined;
    let alive = true;
    const embeddedLogos = Array.isArray(data?.images?.logos)
      ? data.images.logos
      : [];
    setHeroLogoPath(pickDefaultHeroLogo(embeddedLogos));
    setTitleLogos(embeddedLogos);
    // `getDetails(... append_to_response=images)` ya trae los logos preferidos.
    // Si hay alguno, puede pintarse sin esperar otra petición desde el móvil.
    setHeroLogoResolved(embeddedLogos.length > 0);
    getTitleLogos(showId, endpointType, { priority: "high" })
      .then((logos) => {
        if (!alive) return;
        const availableLogos = mergeUniqueImages(
          embeddedLogos,
          Array.isArray(logos) ? logos : [],
        );
        setTitleLogos(availableLogos);
        setHeroLogoPath(pickDefaultHeroLogo(availableLogos));
        setHeroLogoResolved(true);
      })
      .catch(() => {
        if (alive) setHeroLogoResolved(true);
      });
    return () => {
      alive = false;
    };
  }, [data?.id, data?.images?.logos, endpointType]);

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

  // ID numérico del título guardado en la BBDD propia.
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
    if (authenticated || hasBackendSession) {
      return false;
    }
    if (!session || !account?.id) {
      window.location.href = `/login?next=${encodeURIComponent(
        window.location.pathname + window.location.search,
      )}`;
      return true;
    }
    return false;
  };

  /**
   * Carga las listas del usuario desde el backend propio si aun no se han cargado.
   * Usa un abortRef para cancelar si el componente se desmonta.
   */
  const loadListsIfNeeded = async ({ abortRef } = {}) => {
    if (!canUseLists) return [];
    if (Array.isArray(userLists) && userLists.length > 0) return userLists;

    const json = await backendFetchUserLists();
    const lists = Array.isArray(json?.results) ? json.results : [];

    if (abortRef?.current) return [];
    setUserLists(lists);
    return lists;
  };

  /**
   * Comprueba en cuáles listas está presente el título actual.
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
    if (!canUseLists || !movieId) return;

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

      // Presencia por lista: pedimos los items de cada lista y comprobamos el
      // identificador y tipo de contenido guardados en nuestra BBDD.
      const worker = async () => {
        while (!abortRef?.current && idx < ids.length) {
          const listId = ids[idx++];
          const lid = String(listId);
          try {
            const details = await backendGetListDetails({ listId: lid });
            const items = Array.isArray(details?.items) ? details.items : [];
            const present = items.some(
              (it) =>
                String(it?.id) === String(movieId) &&
                (it?.media_type || "movie") === endpointType,
            );
            nextMap[lid] = !!present;
          } catch {
            nextMap[lid] = false;
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
    if (!canUseLists || !movieId) {
      setMembershipMap({});
      setListsPresenceLoading(false);
      return;
    }

    loadPresenceForLists({ silent: true, abortRef });
    return () => {
      abortRef.current = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canUseLists, movieId, endpointType]);

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

  // Agrega el título actual a una lista específica con actualización optimista.
  const handleAddToSpecificList = async (listId) => {
    if (!canUseLists || !movieId) return;

    const lid = getListId(listId);
    if (!lid) return;
    if (membershipMap?.[lid]) return;

    setBusyListId(lid);
    setListsError("");

    try {
      await backendAddMovieToList({
        listId: lid,
        movieId,
        mediaType: endpointType,
        title: title || undefined,
        posterPath: data?.poster_path || undefined,
      });

      // Actualizacion optimista: marca como presente antes de confirmar. Solo se
      // llega aquí cuando NO estaba presente (guard arriba), así que +1 item.
      setMembershipMap((prev) => ({ ...(prev || {}), [lid]: true }));
      setUserLists((prev) =>
        (prev || []).map((l) => {
          const id = getListId(l);
          return id === lid
            ? { ...l, item_count: (l.item_count || 0) + 1 }
            : l;
        }),
      );
    } catch (e) {
      setListsError(e?.message || "Error añadiendo a la lista");
    } finally {
      setBusyListId(null);
    }
  };

  // Crea una nueva lista propia en el backend y agrega el título actual.
  const handleCreateListAndAdd = async () => {
    if (!canUseLists || !movieId) return;

    const n = newListName.trim();
    if (!n) return;

    setCreatingList(true);
    setListsError("");

    try {
      const created = await backendCreateUserList({
        name: n,
        description: newListDesc.trim(),
      });

      const newListId = getListId(created?.list_id);
      if (!newListId) throw new Error("No se pudo crear la lista");

      await backendAddMovieToList({
        listId: newListId,
        movieId,
        mediaType: endpointType,
        title: title || undefined,
        posterPath: data?.poster_path || undefined,
      });

      // Refresca todas las listas del usuario para reflejar la nueva lista
      const json = await backendFetchUserLists();
      const lists = Array.isArray(json?.results) ? json.results : [];
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

  const [videos, setVideos] = useState(initialVideos); // Lista de videos disponibles
  const [videosLoading, setVideosLoading] = useState(
    () => !!TMDB_API_KEY && initialVideos.length === 0,
  );
  const [videosResolved, setVideosResolved] = useState(
    () => !TMDB_API_KEY || initialVideos.length > 0,
  );
  const [videosError, setVideosError] = useState("");
  const [videoModalOpen, setVideoModalOpen] = useState(false);
  const [activeVideo, setActiveVideo] = useState(null); // Video seleccionado para el modal
  const [soundtrackModalOpen, setSoundtrackModalOpen] = useState(false);
  const [commentModalOpen, setCommentModalOpen] = useState(false);
  const [episodeRatingsModalOpen, setEpisodeRatingsModalOpen] = useState(false);
  const [modalHostReady, setModalHostReady] = useState(false);
  const [activeSoundtrackId, setActiveSoundtrackId] = useState(null);
  const [soundtrackTracks, setSoundtrackTracks] = useState([]);
  const [soundtrackLoading, setSoundtrackLoading] = useState(false);
  const [soundtrackResolved, setSoundtrackResolved] = useState(false);
  const [soundtrackError, setSoundtrackError] = useState("");
  const soundtrackAbortRef = useRef(null);
  const soundtrackInFlightRef = useRef(null);
  const soundtrackLoadedKeyRef = useRef("");

  useEffect(() => {
    setModalHostReady(true);
  }, []);

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
    setCommentModalOpen(false);
    setEpisodeRatingsModalOpen(false);
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
      setVideos(initialVideos);
      setVideosError("");
      setVideosLoading(false);
      setVideosResolved(true);
      return;
    }

    setVideos(initialVideos);
    setVideosError("");
    setVideosLoading(initialVideos.length === 0);
    setVideosResolved(initialVideos.length > 0);
  }, [id, endpointType, initialVideos]);

  // Carga los videos de TMDb en espanol e ingles, los fusiona eliminando
  // duplicados, filtra los reproducibles y los ordena por relevancia.
  useEffect(() => {
    let ignore = false;

    // Fetch seguro que devuelve array vacio en caso de error
    const safeFetchVideos = async (language) => {
      if (!TMDB_API_KEY) return [];
      try {
        const json = await getVideos(endpointType, id, language);
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

      setVideosLoading(initialVideos.length === 0);
      setVideosError("");

      try {
        const [es, en] = await Promise.all([
          safeFetchVideos("es-ES"),
          safeFetchVideos("en-US"),
        ]);
        if (ignore) return;

        const merged = uniqBy(
          [...initialVideos, ...es, ...en],
          (v) => `${v.site}:${v.key}`,
        ).filter(isPlayableVideo);

        merged.sort((a, b) => rankVideo(a) - rankVideo(b));
        setVideos(merged);
      } catch (e) {
        if (!ignore && initialVideos.length === 0) {
          setVideosError(e?.message || "Error cargando vídeos");
        }
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
  }, [id, endpointType, initialVideos]);

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
   * que comparte con DetailModal: prioriza backdrops sin idioma para que el
   * logo se pueda superponer sin texto duplicado.
   * Evita parpadeos: no devuelve fallback generico hasta que la inicializacion termine.
   */
  const detailModalPreviewBackdropFallback = useMemo(() => {
    // Durante la inicializacion no mostramos el backdrop base de TMDb:
    // puede ser una imagen secundaria que sera reemplazada por la seleccion final.
    if (!artworkInitialized) return null;

    // 1. Combinar todas las fuentes posibles de backdrops.
    const allBackdrops = [
      ...(imagesState?.backdrops || []),
      ...(data?.images?.backdrops ? data.images.backdrops : []),
    ];

    // 2. Usar exactamente el selector de DetailModal. La imagen inicial del
    // detalle no tiene metadatos de idioma, así que no participa como arte
    // neutro; solo queda como último fallback, igual que en la preview.
    if (allBackdrops.length > 0) {
      const galleryBackdrops = allBackdrops.filter(
        (backdrop) => backdrop?.file_path && backdrop.from !== "main",
      );
      const bestBackdrop = pickBestBackdropNoLang(galleryBackdrops);
      if (bestBackdrop?.file_path) return bestBackdrop.file_path;
    }

    // 3. Fallback final: si ya terminamos y no hay nada mejor, usamos el generico
    return data?.backdrop_path || null;
  }, [
    imagesState?.backdrops,
    data?.images?.backdrops,
    data?.backdrop_path,
    artworkInitialized,
  ]);

  // El cambio de modo de la portada es independiente de la pestaña «Vista
  // previa». Aquí se conserva la política localizada del póster (inglés antes
  // que cualquier fallback), que es la que siempre usó la ficha al alternar
  // entre Póster y Backdrop.
  const posterBackdropFallback = useMemo(() => {
    // Además de esperar a la inicialización, se espera a saber si hay un
    // backdrop de preview personalizado remoto (`remoteArtworkChecked`): si
    // no, este fallback "por defecto" pintaría antes que la selección del
    // usuario y luego sería sustituido -- el parpadeo que se quiere evitar.
    if (!artworkInitialized || !remoteArtworkChecked) return null;

    const allBackdrops = [
      ...(imagesState?.backdrops || []),
      ...(data?.images?.backdrops ? data.images.backdrops : []),
    ];
    const bestPath = pickBestBackdropForPreview(allBackdrops);
    return bestPath || data?.backdrop_path || null;
  }, [
    imagesState?.backdrops,
    data?.images?.backdrops,
    data?.backdrop_path,
    artworkInitialized,
    remoteArtworkChecked,
  ]);

  // Póster del hero móvil. Se prioriza el arte sin idioma para no duplicar el
  // logo, pero algunas series (por ejemplo realities) solo tienen pósteres
  // localizados en TMDb. En ese caso usamos el mejor disponible: dejar la ruta
  // vacía ocultaba por completo la capa móvil y dejaba la pantalla negra.
  const mobileNeutralPosterPath = useMemo(() => {
    if (selectedMobilePosterPath) return selectedMobilePosterPath;
    // Aún no se sabe si hay un póster móvil personalizado remoto: no calcular
    // el "por defecto" todavía, o parpadearía al llegar el override.
    if (!remoteArtworkChecked) return null;

    // La imagen principal carece de metadatos de idioma, así que no puede
    // considerarse neutra. Se excluye hasta el fallback final para preservar la
    // preferencia por una imagen confirmada por TMDb como textless.
    const galleryPosters = (imagesState?.posters || []).filter(
      (poster) => poster?.file_path && poster.from !== "main",
    );
    const bestFromGallery =
      pickBestNeutralPosterByResVotes(galleryPosters)?.file_path || null;

    return (
      bestFromGallery ||
      asTmdbPath(basePosterPath) ||
      asTmdbPath(data?.poster_path) ||
      asTmdbPath(data?.profile_path) ||
      null
    );
  }, [
    imagesState?.posters,
    selectedMobilePosterPath,
    remoteArtworkChecked,
    basePosterPath,
    data?.poster_path,
    data?.profile_path,
  ]);

  // `heroLogoPath` es el logo "recomendado" (calculado de TMDb): no se muestra
  // hasta saber si hay un logo personalizado remoto, para no parpadear.
  const displayHeroLogoPath =
    selectedLogoPath || (remoteArtworkChecked ? heroLogoPath : null) || null;

  /**
   * Procesa y filtra la galeria de artwork segun la pestana activa (posters/backdrops/background),
   * filtros de resolucion e idioma. Devuelve la lista ordenada, el aspect ratio,
   * el tamano de imagen y la ruta activa actual.
   */
  const artworkSelection = useMemo(() => {
    const isLogoTab = activeImagesTab === "logos";
    const isMobilePosterTab =
      isMobileViewport && activeImagesTab === "posters";
    const rawList = isLogoTab
      ? titleLogos
      : activeImagesTab === "posters"
        ? imagesState?.posters
        : imagesState?.backdrops;

    const isPoster = activeImagesTab === "posters";
    const isBackdropTab = activeImagesTab === "backdrops";
    const isBackgroundTab = activeImagesTab === "background";
    const aspect = isPoster ? "aspect-[2/3]" : "aspect-[16/9]";
    const size = isPoster ? "w342" : isLogoTab ? "w500" : "w780";

    const currentPosterActive =
      (selectedPosterPath || basePosterPath || data?.profile_path) ?? null;
    const currentMobilePosterActive =
      selectedMobilePosterPath || mobileNeutralPosterPath || null;

    // Vista previa de la galería: mismo backdrop neutro que DetailModal.
    const previewFallback = detailModalPreviewBackdropFallback;

    const currentPreviewActive = selectedPreviewBackdropPath || previewFallback;

    const currentBackgroundActive =
      (selectedBackgroundPath || baseBackdropPath || data?.backdrop_path) ??
      null;

    const activePath = isLogoTab
      ? displayHeroLogoPath
      : isMobilePosterTab
        ? currentMobilePosterActive
      : isPoster
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

      if (isMobilePosterTab) {
        // El hero móvil usa una portada sin idioma para no duplicar el logo.
        return !img?.iso_639_1;
      }

      if (isLogoTab) return matchesLang(img);

      if (isBackdropTab) {
        // Vista previa: el mismo arte neutro que DetailModal para poder mostrar
        // un logo encima. El fallback relajado cubre títulos que no lo tengan.
        return img.from !== "main" && isLanguageNeutralImage(img);
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
        const galleryBackdrops = withPath.filter(
          (img) => img.from !== "main",
        );
        const neutral = galleryBackdrops.filter(isLanguageNeutralImage);
        if (neutral.length) return neutral;
        return galleryBackdrops.length ? galleryBackdrops : withPath;
      }
      if (isPoster) {
        const neutral = withPath.filter((img) => !img?.iso_639_1);
        return neutral.length ? neutral : withPath;
      }
      if (isLogoTab) {
        const matching = withPath.filter(matchesLang);
        return matching.length ? matching : withPath;
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
      isMobilePosterTab,
      isLogoTab,
      isBackdropTab,
      isBackgroundTab,
      aspect,
      size,
      activePath,
    };
  }, [
    activeImagesTab,
    isMobileViewport,
    imagesState?.posters,
    imagesState?.backdrops,
    titleLogos,
    imagesResFilter,
    langES,
    langEN,
    selectedPosterPath,
    selectedMobilePosterPath,
    basePosterPath,
    data?.profile_path,
    mobileNeutralPosterPath,
    displayHeroLogoPath,
    detailModalPreviewBackdropFallback,
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
    // Recupera el modo de portada guardado, como hacía originalmente… pero SOLO
    // en dispositivos con puntero. En táctil se fuerza "poster": allí no existen
    // las zonas para alternar, así que si heredara un "preview" guardado desde
    // escritorio la portada se quedaría en backdrop sin forma de volver.
    //
    // Se consulta `matchMedia` directamente y no el estado `supportsHover`
    // porque ese arranca en false y se resuelve en un efecto posterior: aquí
    // haría creer que todo es táctil y nunca se restauraría la preferencia.
    // matchMedia es síncrono, así que en el montaje ya da el valor correcto.
    const canHover =
      typeof window !== "undefined" &&
      window.matchMedia?.("(hover: hover)")?.matches === true;

    let savedMode = "poster";
    if (canHover) {
      try {
        savedMode =
          window.localStorage.getItem(globalViewModeStorageKey) || "poster";
      } catch {
        // localStorage no disponible
      }
    }

    setPosterViewMode(savedMode);
    setPosterLayoutMode(savedMode);
    setPosterModeHydrated(true);
  }, []);

  useLayoutEffect(() => {
    setPosterResolved(false);
    setPosterLowLoaded(false);
    setPosterHighLoaded(false);
    setPosterImgError(false);
    setArtworkInitialized(false);
    posterSettledRef.current = false;
    // Nuevo título: hay que volver a confirmar si tiene overrides remotos
    // antes de poder pintar cualquier imagen por defecto (ver declaración).
    setRemoteArtworkChecked(false);

    const initialPoster = readArtworkPreference(posterStorageKey);
    const initialMobilePoster = readArtworkPreference(mobilePosterStorageKey);
    const initialLogo = readArtworkPreference(logoStorageKey);
    const initialPreviewBackdrop = readArtworkPreference(
      previewBackdropStorageKey,
    );
    const initialBackdrop = readArtworkPreference(backgroundStorageKey);

    setBaseBackdropPath(initialBackdrop);
    setBasePosterPath(initialPoster);
    setSelectedPosterPath(initialPoster);
    setSelectedMobilePosterPath(initialMobilePoster);
    setSelectedPreviewBackdropPath(initialPreviewBackdrop);
    setSelectedBackgroundPath(initialBackdrop);
    setSelectedLogoPath(initialLogo);
    // No activar posterResolved hasta que initArtwork termine

    setImagesState({
      posters: data.poster_path
        ? [{ file_path: data.poster_path, from: "main" }]
        : [],
      backdrops: data.backdrop_path
        ? [{ file_path: data.backdrop_path, from: "main" }]
        : [],
    });
    setImagesLoading(false);
    setImagesError("");
    setActiveImagesTab("posters");

    // No resetear posterViewMode/posterLayoutMode - respetar la preferencia global
    // Ya se inicializan desde localStorage en el useState inicial

    setActiveTab("details");
    setActiveSection(null);

    // No activar artworkInitialized aqui - esperar a que initArtwork termine
  }, [
    id,
    endpointType,
    data?.poster_path,
    data?.backdrop_path,
    data?.profile_path,
    posterStorageKey,
    mobilePosterStorageKey,
    logoStorageKey,
    backgroundStorageKey,
    previewBackdropStorageKey,
  ]);

  // La caché global de preferencias guarda una instantánea COMPLETA de los
  // overrides del usuario, incluidos los títulos que no tienen ninguno. Eso
  // permite distinguir «no hay selección personalizada» de «todavía no lo
  // sabemos» y montar las imágenes de TMDb antes de consultar de nuevo el NAS.
  //
  // La revalidación remota de abajo se mantiene intacta: si otro dispositivo
  // cambió una selección, la respuesta más reciente sigue siendo la fuente de
  // verdad y actualiza esta vista.
  const cachedArtworkOverride = useMemo(() => {
    return resolveCachedArtworkOverride({
      preferences,
      cached: preferencesCached,
      authenticated,
      type: endpointType,
      id,
    });
  }, [
    authenticated,
    preferencesCached,
    preferences,
    endpointType,
    id,
  ]);

  useLayoutEffect(() => {
    if (cachedArtworkOverride == null) return;

    const restore = (kind, storageKey, setter) => {
      const filePath = cachedArtworkOverride?.[kind] || null;
      writeArtworkPreference(storageKey, filePath);
      setter(filePath);
    };

    restore("poster", posterStorageKey, setSelectedPosterPath);
    restore("mobilePoster", mobilePosterStorageKey, setSelectedMobilePosterPath);
    restore("logo", logoStorageKey, setSelectedLogoPath);
    restore(
      "backdrop",
      previewBackdropStorageKey,
      setSelectedPreviewBackdropPath,
    );
    restore("background", backgroundStorageKey, setSelectedBackgroundPath);
    setRemoteArtworkChecked(true);
  }, [
    cachedArtworkOverride,
    posterStorageKey,
    mobilePosterStorageKey,
    logoStorageKey,
    previewBackdropStorageKey,
    backgroundStorageKey,
  ]);

  // La preferencia remota pertenece al usuario autenticado y es la fuente de
  // verdad entre dispositivos. La caché local solo pinta de inmediato mientras
  // llega la respuesta. Un restablecimiento remoto elimina también esa caché.
  //
  // Se lanza YA al montar, sin esperar a `authHydrated`: la API ya autentica
  // por cookies (`credentials: "include"`), así que esperar el propio ciclo de
  // hidratación de auth del cliente (su propia llamada a /api/auth/me) solo
  // encadenaba dos idas y vueltas en serie en vez de una -- justo el tiempo
  // que se quiere evitar que se note como una tarjeta vacía. Sin sesión, la
  // API devuelve simplemente "sin overrides" igual de rápido.
  //
  // Además marca `remoteArtworkChecked` cuando se resuelve esta comprobación
  // (éxito o fallo -- `finally` evita que las imágenes por defecto se queden
  // ocultas para siempre si la petición falla).
  useEffect(() => {
    let cancelled = false;
    const revisionAtStart = artworkPreferenceRevisionRef.current;

    const restoreRemoteArtwork = async () => {
      try {
        const overrides = await fetchArtworkOverride({ type: endpointType, id });
        if (
          cancelled ||
          overrides == null ||
          artworkPreferenceRevisionRef.current !== revisionAtStart
        ) {
          return;
        }

        const restore = (kind, storageKey, setter) => {
          const filePath = overrides?.[kind] || null;
          writeArtworkPreference(storageKey, filePath);
          setter(filePath);
        };

        restore("poster", posterStorageKey, setSelectedPosterPath);
        restore("mobilePoster", mobilePosterStorageKey, setSelectedMobilePosterPath);
        restore("logo", logoStorageKey, setSelectedLogoPath);
        restore(
          "backdrop",
          previewBackdropStorageKey,
          setSelectedPreviewBackdropPath,
        );
        restore("background", backgroundStorageKey, setSelectedBackgroundPath);
        cacheArtworkOverrides?.({
          type: endpointType,
          id,
          changes: [
            { kind: "poster", filePath: overrides?.poster || null },
            {
              kind: "mobilePoster",
              filePath: overrides?.mobilePoster || null,
            },
            { kind: "logo", filePath: overrides?.logo || null },
            { kind: "backdrop", filePath: overrides?.backdrop || null },
            { kind: "background", filePath: overrides?.background || null },
          ],
        });
      } finally {
        if (!cancelled) setRemoteArtworkChecked(true);
      }
    };

    void restoreRemoteArtwork();
    return () => {
      cancelled = true;
    };
  }, [
    id,
    endpointType,
    posterStorageKey,
    mobilePosterStorageKey,
    logoStorageKey,
    previewBackdropStorageKey,
    backgroundStorageKey,
    account?.id,
    cacheArtworkOverrides,
  ]);

  /**
   * Inicializacion asincrona del artwork.
   * Para series TV: carga imagenes extra de todas las temporadas y selecciona las mejores.
   * Para peliculas sin imagenes SSR: carga imagenes desde la API de TMDb.
   * Resuelve las imágenes seleccionadas sin bloquear el primer render del
   * póster. La imagen visible se solicita directamente desde el markup: esperar
   * aquí una precarga añadía una cadena de red innecesaria en móvil.
   */
  useEffect(() => {
    let cancelled = false;

    const initArtwork = async () => {
      setArtworkInitialized(false);

      let poster = data.poster_path || data.profile_path || null;
      let backdrop = data.backdrop_path || null;

      // La ficha ya trae una portada principal. Pintarla de inmediato evita que
      // el usuario espere la consulta secundaria de `/images` antes incluso de
      // que el navegador pueda iniciar la descarga. Cuando llegue una selección
      // mejor, la lógica existente la sustituye con su transición habitual.
      if (poster) {
        setBasePosterPath((current) => current || asTmdbPath(poster));
      }

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

            const fetched = await getImages(endpointType, id);

            if (!cancelled) {
              const bestPoster = pickBestEnglishPoster(fetched.posters);
              const bestBackdropForBackground = pickBestBackdropTVNeutralFirst(
                fetched.backdrops,
              );
              const bestPosterPath = asTmdbPath(bestPoster);
              const bestBackdropPath = asTmdbPath(bestBackdropForBackground);

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
          const bestPosterPath = asTmdbPath(bestPoster);
          const bestBackdropPath = asTmdbPath(bestBackdropForBackground);

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

          const json = await getImages(endpointType, id);
          const posters = json.posters || [];
          const backdrops = json.backdrops || [];

          const bestPoster = pickBestEnglishPoster(posters);
          if (bestPoster?.file_path) {
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
        const hasSavedPoster = Boolean(
          readArtworkPreference(posterStorageKey),
        );

        // Respetar selecciones manuales, pero permitir sustituir el poster base
        // localizado por el poster ingles calculado -- SALVO que la portada
        // visible ya haya terminado de cargar y estabilizarse (fetch de
        // `/images` más lento que el fundido de entrada, típico en títulos sin
        // `images` en el SSR, es decir sin caché de servidor todavía). En ese
        // caso sustituirla ahora se vería como un parpadeo, así que se
        // mantiene la que el usuario ya está viendo.
        if (poster) {
          setBasePosterPath((prev) => {
            if (hasSavedPoster) return prev || asTmdbPath(poster);
            if (posterSettledRef.current && prev) return prev;
            return asTmdbPath(poster);
          });
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

  // Poster a mostrar: seleccion manual > calculado > portada principal de la
  // ficha. La portada principal se pinta de inmediato (una selección mejor se
  // funde sobre ella cuando termina de resolverse el artwork) SALVO que aún no
  // se sepa si hay un override remoto (`remoteArtworkChecked`): mostrarla
  // antes se vería como el parpadeo "por defecto -> seleccionada" en sesiones
  // nuevas sin caché local.
  const basePosterDisplayPath =
    asTmdbPath(selectedPosterPath) ||
    (remoteArtworkChecked
      ? asTmdbPath(basePosterPath) ||
        (artworkInitialized
          ? asTmdbPath(data?.poster_path) || asTmdbPath(data?.profile_path)
          : null)
      : null) ||
    null;

  // Backdrop para modo preview: seleccion manual > fallback inteligente
  const previewBackdropPath =
    asTmdbPath(selectedPreviewBackdropPath) ||
    asTmdbPath(posterBackdropFallback) ||
    null;

  // Imagen principal del poster: en modo preview muestra backdrop, si no el poster
  const displayPosterPath =
    posterViewMode === "preview" ? previewBackdropPath : basePosterDisplayPath;

  // La portada visible se descubre desde sus propios <img>. Precargar aquí w342
  // y w780 duplicaba tráfico en móvil y competía con su versión original; además
  // esas peticiones no coincidían con las URLs que realmente se muestran allí.
  // La vista previa no es accesible en táctil, así que sí puede calentarse en
  // segundo plano para que el cambio de escritorio siga siendo instantáneo.
  useEffect(() => {
    if (!isMobileViewport && previewBackdropPath) {
      void preloadTmdb(previewBackdropPath, "w780");
      void preloadTmdb(previewBackdropPath, "w1280");
    }
  }, [isMobileViewport, previewBackdropPath]);

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

  // Backdrop de fondo: solo se admiten imagenes confirmadas por TMDb como
  // neutras. La ruta principal no incluye metadatos de idioma y no es segura.
  const displayBackdropPath = useMemo(() => {
    // Sin override remoto conocido todavía, no se elige un backdrop "por
    // defecto" de la galería: se vería sustituido al llegar la selección del
    // usuario. `selectedBackgroundPath` ya es seguro de usar en cuanto se
    // conoce (caché local o respuesta remota), pase lo que pase con el resto.
    if (!remoteArtworkChecked && !selectedBackgroundPath) return null;
    return resolveNeutralBackdropPath(imagesState?.backdrops || [], [
      selectedBackgroundPath,
      baseBackdropPath,
    ]);
  }, [
    imagesState?.backdrops,
    selectedBackgroundPath,
    baseBackdropPath,
    remoteArtworkChecked,
  ]);

  // ¿La portada que se muestra en móvil trae el título IMPRESO?
  //
  // `mobileNeutralPosterPath` no siempre acaba siendo textless: cuando no existe
  // ningún póster sin idioma, `pickBestNeutralPosterByResVotes` cae a uno CON
  // idioma (`pool0 = neutral.length ? neutral : list`). En ese caso la portada ya
  // lleva el título, y superponerle el logo lo duplica.
  //
  // Se busca el póster elegido entre los originales para leer su `iso_639_1`.
  // Solo se considera "con título impreso" cuando ese dato existe y no está
  // vacío: si no encontramos el póster o no trae metadatos de idioma, NO se
  // asume nada y se mantiene el logo, que es el comportamiento actual. Ocultarlo
  // por defecto ante la duda dejaría títulos sin identificar.
  const mobilePosterHasBurnedTitle = useMemo(() => {
    if (!mobileNeutralPosterPath) return false;
    const chosen = (imagesState?.posters || []).find(
      (p) => p?.file_path === mobileNeutralPosterPath,
    );
    const lang = chosen?.iso_639_1;
    return typeof lang === "string" && lang.trim() !== "";
  }, [mobileNeutralPosterPath, imagesState?.posters]);

  // Selecciona la imagen de fondo del hero segun el viewport:
  // - Desktop: usa el backdrop horizontal
  // - Movil: usa un poster neutro (sin texto) para mejor visualizacion vertical
  const heroBackgroundPath = (() => {
    if (!useBackdrop || !artworkInitialized) return null;

    // Desktop: usa el backdrop horizontal seleccionado
    const desktop = displayBackdropPath;

    // Movil series: usar solo poster con idioma null. Si no existe, no caer
    // al poster base porque puede venir localizado.
    const mobile =
      endpointType === "tv"
        ? mobileNeutralPosterPath
        : // MÓVIL: el héroe full-bleed ES el póster de portada; el fondo de la
          // transición debe ser ESE MISMO póster (no un backdrop distinto) para
          // que se perciba UNA sola imagen. Prioriza el póster neutro. Los
          // valores "por defecto" (basePosterPath/data.poster_path/profile_path)
          // se ocultan hasta saber si hay override remoto, para no parpadear;
          // `selectedBackgroundPath` es seguro en cuanto se conoce.
          mobileNeutralPosterPath ||
          (remoteArtworkChecked ? basePosterPath : null) ||
          (remoteArtworkChecked ? data.poster_path : null) ||
          selectedBackgroundPath ||
          (remoteArtworkChecked ? data.profile_path : null) ||
          desktop ||
          null;

    return isMobileViewport ? mobile : desktop;
  })();

  // Tamaño de TMDb para `heroBackgroundPath`/`prevBackgroundPath` como fondo
  // CSS (`background-image`). En MÓVIL es el mismo póster que ya se pinta en
  // w780 como <img> (ver `posterHighUrl`): pedirlo TAMBIÉN en "original" aquí
  // descargaba el mismo archivo pesado (varios MB) una SEGUNDA vez solo para
  // mostrarlo desenfocado (`.hero-bg-base` le aplica `blur(4px)` en móvil, que
  // ya borra cualquier detalle por encima de w780). Escritorio no se toca: ahí
  // es el backdrop panorámico, no el póster, y no forma parte de esta mejora.
  const heroBackgroundSize = isMobileViewport ? "w780" : "original";

  // =====================================================================
  // ESTADOS DE CUENTA (TMDb)
  // Carga el estado de favorito, watchlist y puntuacion del usuario.
  // =====================================================================
  useEffect(() => {
    let cancel = false;

    const load = async () => {
      if (!authHydrated) {
        setAccountStatesLoading(true);
        return;
      }

      if (authenticated) {
        setAccountStatesLoading(false);
        return;
      }

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
  }, [type, id, session, account?.id, authHydrated, authenticated]);

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
        title,
        posterPath: basePosterDisplayPath || data?.poster_path || null,
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
        title,
        posterPath: basePosterDisplayPath || data?.poster_path || null,
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

      // Alta optimista en Puntuaciones del Perfil: la nota recién puesta aparece
      // al instante junto al resto (el refresco reescribe con los datos reales).
      cacheAddRating({
        type,
        mediaId: id,
        title,
        posterPath: basePosterDisplayPath || data?.poster_path || null,
        rating: value,
      });

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

      // Baja optimista: la nota desaparece al instante de Puntuaciones del Perfil.
      cacheRemoveRating({ type, mediaId: id });

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
      window.location.href = `/login?next=/details/${type}/${id}`;
      return;
    }
    try {
      await setTraktRatingSafe(value);
    } catch (err) {
      if (err?.code === "TRAKT_REAUTH_REQUIRED" || err?.status === 401) {
        window.location.href = `/login?next=/details/${type}/${id}`;
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
  const hasInitialActionState = useMemo(
    () =>
      hasInitialTraktStatus ||
      (endpointType === "tv" && hasInitialShowWatched),
    [endpointType, hasInitialShowWatched, hasInitialTraktStatus],
  );
  const [actionStateReady, setActionStateReady] =
    useState(hasInitialActionState);
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
  const [traktUsername, setTraktUsername] = useState(null);

  useEffect(() => {
    if (!trakt.connected) {
      setTraktUsername(null);
      return;
    }
    let ignore = false;
    fetch("/api/trakt/profile?userOnly=1")
      .then((res) => res.json())
      .then((data) => {
        if (!ignore && data?.user?.username) {
          setTraktUsername(data.user.username);
        }
      })
      .catch((err) => console.error("Error fetching Trakt username:", err));

    return () => {
      ignore = true;
    };
  }, [trakt.connected]);

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

  // Máquina de "episodios vistos" (series) COMPARTIDA con la ficha rápida del
  // dashboard (DetailModal). Una sola fuente de verdad. DetailsClient conserva
  // sus efectos periféricos (hidratación desde servidor, persistencia en
  // localStorage, sync en foco, badge de progreso) apuntando al estado del hook.
  const episodesMachine = useTraktEpisodesWatched({
    mediaType: endpointType,
    tmdbId: id,
    title,
    connected: trakt?.connected,
    seasons: data?.seasons,
    traktResolvedIdRef,
    episodesModalOpen: traktEpisodesOpen,
    initialWatchedBySeason,
    initialWatchedLoaded: hasInitialShowWatched,
    onStatusShouldRefresh: () => reloadTraktStatus({ background: true }),
    onWatchedAnyChange: (has) =>
      setTrakt((prev) =>
        prev?.watched === has ? prev : { ...prev, watched: has },
      ),
  });
  const {
    watchedBySeason,
    watchedBySeasonLoaded,
    episodeBusyKey,
    showPlays,
    rewatchStartAt,
    rewatchWatchedBySeason,
    rewatchRuns,
    activeEpisodesView,
    loadTraktShowWatched,
    loadTraktShowPlays,
    applyWatchedBySeasonState,
    toggleEpisodeWatched,
    toggleEpisodeRewatch,
    onToggleShowWatched,
    onAddShowPlay,
    changeEpisodesView,
    createRewatchRun,
    deleteRewatchRun,
    getWatchedEpisodeCountForSeason,
    tvProgressBadge,
    reconcileAfterClose,
    hasAnyWatchedEpisode: hasAnyWatchedEpisodeInMap,
    setWatchedBySeason,
    setWatchedBySeasonLoaded,
    setEpisodeBusyKey,
    watchedBySeasonRef,
    watchedBySeasonLoadedRef,
  } = episodesMachine;

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

  // Cierra el modal de episodios al instante y reconcilia el % visto en segundo plano.
  const closeTraktEpisodesModal = useCallback(() => {
    setTraktEpisodesOpen(false);
    reconcileAfterClose();
  }, [reconcileAfterClose]);

  // -- Scoreboard de la comunidad (puntuaciones agregadas de multiples fuentes) --
  // Si hay datos prefetched desde page.jsx, usarlos como estado inicial
  const parseScoreboardData = (r) => {
    if (!r?.found) return null;
    const st = r?.stats || {};
    return {
      loading: false,
      error: "",
      found: true,
      traktUrl: r?.traktUrl || null,
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
    traktUrl: null,
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
      traktUrl: incoming?.traktUrl || current?.traktUrl || null,
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
    if (!initialParsedScoreboard?.found) {
      return { ...defaultScoreboard, loading: true };
    }
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

  // =====================================================================
  // TRAKT COMMUNITY: Sentimientos / Comentarios / Temporadas / Listas
  // Datos publicos de la comunidad de Trakt (no requiere autenticacion).
  // =====================================================================

  // -- Analisis de sentimiento: pros y contras extraidos de comentarios --
  // Semilla desde `initialSentiment` (SSR) para pintar al instante; el efecto
  // de carga sigue ejecutandose para refrescar/completar en 2º plano.
  const initialSentimentState = useMemo(() => {
    if (!initialSentiment) {
      return { loading: false, error: "", pros: [], cons: [], sourceCount: 0 };
    }
    return {
      loading: false,
      error: "",
      pros: formatTraktSentimentList(initialSentiment.good, 4),
      cons: formatTraktSentimentList(initialSentiment.bad, 4),
      sourceCount: Number(initialSentiment.comment_count || 0) || 0,
    };
  }, [initialSentiment]);
  const [tSentiment, setTSentiment] = useState(() => initialSentimentState);

  // -- Comentarios de Trakt con paginacion y pestanas --
  const [tCommentsTab, setTCommentsTab] = useState("recent"); // "likes30" (top 30 dias) | "likesAll" (top historico) | "recent"
  // Semilla desde `initialComments` (SSR: { items, pagination }).
  const initialCommentsState = useMemo(() => {
    if (!initialComments) {
      return {
        loading: false,
        error: "",
        items: [],
        page: 1,
        hasMore: false,
        total: 0,
      };
    }
    const items = Array.isArray(initialComments.items)
      ? initialComments.items
      : [];
    const pagination = initialComments.pagination || {};
    return {
      loading: false,
      error: "",
      items,
      page: 1,
      hasMore: !!(
        pagination.pageCount && pagination.page < pagination.pageCount
      ),
      total: Number(pagination.itemCount || 0),
    };
  }, [initialComments]);
  const [tComments, setTComments] = useState(() => initialCommentsState);
  const [commentProfileUsernames, setCommentProfileUsernames] = useState(
    () => new Map(),
  );
  const [ownedCommentIds, setOwnedCommentIds] = useState(() => new Set());
  const COMMENTS_SECTION_LIMIT = 5;
  const myComments = useMemo(() => {
    return (tComments.items || []).filter((item) =>
      isOwnedComment(item, {
        appUsername: account?.username,
        traktUsername,
        ownedCommentIds,
      }),
    );
  }, [account?.username, ownedCommentIds, tComments.items, traktUsername]);

  // Los comentarios pueden venir de Trakt y sus handles no tienen por qué
  // pertenecer a The Show Verse. Resolvemos todos los autores visibles de una
  // vez para enlazar solo perfiles que existan realmente en nuestra BBDD.
  useEffect(() => {
    const usernames = [
      ...new Set(
        (tComments.items || [])
          .map((comment) => String(comment?.user?.username || "").trim())
          .filter(Boolean),
      ),
    ];
    if (!usernames.length) {
      setCommentProfileUsernames(new Map());
      return undefined;
    }

    let cancelled = false;
    const controller = new AbortController();
    fetch(
      `/api/users/resolve-usernames?usernames=${encodeURIComponent(usernames.join(","))}`,
      { cache: "no-store", signal: controller.signal },
    )
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      })
      .then((payload) => {
        if (cancelled) return;
        const resolved = new Map(
          (Array.isArray(payload?.usernames) ? payload.usernames : []).map(
            (username) => [String(username).toLowerCase(), String(username)],
          ),
        );
        setCommentProfileUsernames(resolved);
      })
      .catch((error) => {
        if (!cancelled && error?.name !== "AbortError") {
          setCommentProfileUsernames(new Map());
        }
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [tComments.items]);

  const handleCommentSubmit = async ({ comment, spoiler }) => {
    const result = await traktAddComment({
      type: traktType,
      tmdbId: id,
      comment,
      spoiler,
    });

    const newCommentId = result?.id || Date.now();
    setOwnedCommentIds((previous) => {
      const next = new Set(previous);
      next.add(String(newCommentId));
      return next;
    });

    // Si tiene éxito, actualizamos localmente el feed
    setTComments((prev) => {
      const newCommentItem = {
        id: newCommentId,
        comment: result?.comment || comment,
        spoiler: result?.spoiler ?? spoiler,
        likes: 0,
        created_at: result?.created_at || new Date().toISOString(),
        user: result?.user || {
          username: "Tú",
          name: "Tú",
          images: { avatar: { full: "" } }
        }
      };

      return {
        ...prev,
        items: [newCommentItem, ...prev.items],
        total: (prev.total || 0) + 1,
      };
    });
  };

  const handleCommentUpdate = async ({ commentId, comment, spoiler }) => {
    const result = await traktUpdateComment({
      commentId,
      comment,
      spoiler,
      type: traktType,
      tmdbId: id,
    });

    // Actualizar localmente el comentario editado
    setTComments((prev) => {
      const nextItems = (prev.items || []).map((item) => {
        if (item.id === commentId) {
          return {
            ...item,
            comment: result?.comment || comment,
            spoiler: result?.spoiler ?? spoiler,
            created_at: result?.created_at || new Date().toISOString(),
          };
        }
        return item;
      });
      return {
        ...prev,
        items: nextItems,
      };
    });
  };

  const handleCommentDelete = async ({ commentId }) => {
    await traktDeleteComment({ commentId, type: traktType, tmdbId: id });

    // Eliminar localmente del feed
    setTComments((prev) => {
      const nextItems = (prev.items || []).filter((item) => item.id !== commentId);
      return {
        ...prev,
        items: nextItems,
        total: Math.max(0, (prev.total || 0) - 1),
      };
    });
  };


  // -- Temporadas de Trakt (datos de temporadas para series TV) --
  const [tSeasons, setTSeasons] = useState({
    loading: false,
    error: "",
    items: [],
  });

  // -- Listas de Trakt con paginacion (popular/trending) --
  const [tListsTab, setTListsTab] = useState("popular"); // "popular" | "trending"
  // Semilla desde `initialLists` (SSR: array de { list, user, previewPosters }).
  const initialListsState = useMemo(() => {
    const items = Array.isArray(initialLists) ? initialLists : [];
    return {
      loading: false,
      error: "",
      items,
      page: 1,
      hasMore: false,
      total: items.length,
    };
  }, [initialLists]);
  const [tLists, setTLists] = useState(() => initialListsState);

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

  // Resetear todos los datos de la comunidad de Trakt al cambiar de contenido.
  // Reseed desde los props `initial*` (en vez de a vacio) para que, si el
  // servidor ya trajo datos para el nuevo id, sigan pintados sin flash vacio.
  useEffect(() => {
    setTSentiment(initialSentimentState);
    setTComments(initialCommentsState);
    setOwnedCommentIds(new Set());
    setTCommentsTab("recent");
    setTSeasons({ loading: false, error: "", items: [] });
    setTLists(initialListsState);
    setTListsTab("popular");
  }, [
    id,
    traktType,
    initialSentimentState,
    initialCommentsState,
    initialListsState,
  ]);

  // Carga los comentarios de Trakt segun la pestana activa.
  // likes30: top con likes de los ultimos 30 dias. likesAll: top historico. recent: mas recientes.
  useEffect(() => {
    if (!traktDeferredReady) return;

    let ignore = false;
    // Poll corto mientras el backend siembra contenido en la primera visita
    // (state === "seeding"): reintenta a los ~3s y ~8s, una sola vez, sin
    // bloquear con spinner. Se limpia al desmontar o si cambian id/tipo.
    let seedTimers = [];
    let scheduledPoll = false;

    const commentsCacheKey = `showverse:trakt:comments:${traktType}:${id}:${tCommentsTab}`;

    const load = async () => {
      const isLikes30 = tCommentsTab === "likes30";
      const isFirstPage = isLikes30 || tComments.page === 1;

      // SWR: pintamos la caché al instante (sin spinner) y revalidamos en 2º
      // plano, así al volver a entrar los comentarios aparecen ya cargados.
      let hadCache = false;
      if (isFirstPage && typeof window !== "undefined") {
        try {
          const raw = window.localStorage.getItem(commentsCacheKey);
          const cached = raw ? JSON.parse(raw) : null;
          if (cached && Array.isArray(cached.items)) {
            hadCache = true;
            setTComments((p) => ({
              ...p,
              loading: false,
              error: "",
              items: cached.items,
              hasMore: !!cached.hasMore,
              total: Number(cached.total || 0),
            }));
          }
        } catch {}
      }

      setTComments((p) => ({ ...p, loading: !hadCache, error: "" }));

      try {
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

        // Persistimos solo la primera página (lo que se ve al entrar).
        if (isFirstPage && typeof window !== "undefined") {
          try {
            window.localStorage.setItem(
              commentsCacheKey,
              JSON.stringify({
                items,
                hasMore: !isLikes30 ? hasMore : false,
                total,
                t: Date.now(),
              }),
            );
          } catch {}
        }

        // Primera visita: el backend aun esta sembrando datos desde Trakt.
        // Reintentamos un par de veces sin mostrar spinner bloqueante.
        if (r?.state === "seeding" && !scheduledPoll) {
          scheduledPoll = true;
          seedTimers.push(
            window.setTimeout(() => {
              if (!ignore) load();
            }, 3000),
            window.setTimeout(() => {
              if (!ignore) load();
            }, 8000),
          );
        }
      } catch (e) {
        if (!ignore)
          setTComments((p) => ({
            ...p,
            loading: false,
            // Si ya mostramos caché, no rompemos la vista con el error.
            error: hadCache ? "" : e?.message || "Error",
          }));
      }
    };

    load();
    return () => {
      ignore = true;
      seedTimers.forEach((t) => window.clearTimeout(t));
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
    // Poll corto mientras el backend siembra contenido en la primera visita
    // (state === "seeding"): reintenta a los ~3s y ~8s, una sola vez, sin
    // bloquear con spinner. Se limpia al desmontar o si cambian id/tipo.
    let seedTimers = [];
    let scheduledPoll = false;

    const loadSentiment = async () => {
      // Preservamos pros/cons ya pintados (semilla SSR o carga previa)
      // mientras revalidamos, en vez de vaciar la seccion.
      setTSentiment((p) => ({ ...p, loading: true, error: "" }));

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

        // Primera visita: el backend aun esta sembrando datos desde Trakt.
        // Reintentamos un par de veces sin mostrar spinner bloqueante.
        if (r?.state === "seeding" && !scheduledPoll) {
          scheduledPoll = true;
          seedTimers.push(
            window.setTimeout(() => {
              if (!ignore) loadSentiment();
            }, 3000),
            window.setTimeout(() => {
              if (!ignore) loadSentiment();
            }, 8000),
          );
        }
      } catch (e) {
        if (ignore) return;
        setTSentiment((p) => ({
          ...p,
          loading: false,
          error: e?.message || "Error",
        }));
      }
    };

    loadSentiment();

    return () => {
      ignore = true;
      seedTimers.forEach((t) => window.clearTimeout(t));
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
    // Poll corto mientras el backend siembra contenido en la primera visita
    // (state === "seeding"): reintenta a los ~3s y ~8s, una sola vez, sin
    // bloquear con spinner. Se limpia al desmontar o si cambian id/tipo.
    let seedTimers = [];
    let scheduledPoll = false;

    const listsCacheKey = `showverse:trakt:lists:${traktType}:${id}:${tListsTab}`;
    // SWR: pintamos la caché al instante (sin spinner); el fetch revalida en 2º
    // plano, así al volver a entrar las listas aparecen ya cargadas.
    let hadCache = false;
    if (tLists.page === 1 && typeof window !== "undefined") {
      try {
        const raw = window.localStorage.getItem(listsCacheKey);
        const cached = raw ? JSON.parse(raw) : null;
        if (cached && Array.isArray(cached.items)) {
          hadCache = true;
          setTLists((p) => ({
            ...p,
            loading: false,
            error: "",
            items: cached.items,
            hasMore: !!cached.hasMore,
            total: Number(cached.total || 0),
          }));
        }
      } catch {}
    }

    const load = async () => {
      setTLists((p) => ({ ...p, loading: !hadCache, error: "" }));
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
          // Persistimos solo la primera página (lo que se ve al entrar).
          if (tLists.page === 1 && typeof window !== "undefined") {
            try {
              window.localStorage.setItem(
                listsCacheKey,
                JSON.stringify({ items, hasMore, total, t: Date.now() }),
              );
            } catch {}
          }

          // Primera visita: el backend aun esta sembrando datos desde Trakt.
          // Reintentamos un par de veces sin mostrar spinner bloqueante.
          if (r?.state === "seeding" && !scheduledPoll) {
            scheduledPoll = true;
            seedTimers.push(
              window.setTimeout(() => {
                if (!ignore) load();
              }, 3000),
              window.setTimeout(() => {
                if (!ignore) load();
              }, 8000),
            );
          }
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
            error: hadCache ? "" : isTransient ? "" : e?.message || "Error",
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

    // ⏱️ Pequeño delay para dejar que scoreboard y stats se asienten primero.
    // Reducido: la caché SWR ya pinta las listas al instante; este delay solo
    // afecta a la revalidación/primer acceso sin caché.
    timeoutId = setTimeout(() => {
      load();
    }, 400);

    return () => {
      ignore = true;
      if (timeoutId) clearTimeout(timeoutId);
      seedTimers.forEach((t) => window.clearTimeout(t));
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

        if (json?.source === "backend") {
          setFavorite(!!json.favorite);
          setWatchlist(!!json.watchlist || !!json.inWatchlist);
          if (json.rating !== undefined) {
            setUserRating(json.rating);
          }
          setHasBackendSession(true);
        }

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
              ? // Derivamos de los episodios YA cargados (ref), no de prev.watched:
                // con la carga en paralelo, item/status puede resolver antes de que
                // el efecto de sync actualice prev.watched, lo que revelaría el
                // botón como "no visto" un instante. Esto lo evita.
                Object.values(watchedBySeasonRef.current || {}).some(
                  (eps) => Array.isArray(eps) && eps.length > 0,
                )
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
        if (requestId === traktStatusRequestIdRef.current) {
          setActionStateReady(true);
        }
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
    // NOTA: usamos watchedBySeasonLoadedRef.current (no el state) a propósito.
    // Incluir watchedBySeasonLoaded aquí cambiaba la identidad de la función al
    // cargar los episodios, lo que re-ejecutaba el efecto de carga inicial y
    // disparaba un segundo reload no-background → `loading` volvía a true →
    // parpadeo en el primer acceso. Por eso NO va en las dependencias.
    [traktType, id, endpointType],
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

        if (payload?.source === "backend") {
          setFavorite(!!payload.favorite);
          setWatchlist(!!payload.watchlist || !!payload.inWatchlist);
          if (payload.rating !== undefined) {
            setUserRating(payload.rating);
          }
          setHasBackendSession(true);
        }

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

        if (requestId === movieWatchedRequestIdRef.current) {
          setActionStateReady(true);
        }
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
    setFavorite(!!nextTrakt.favorite);
    setWatchlist(!!nextTrakt.inWatchlist);
    setUserRating(
      typeof nextTrakt.rating === "number" ? nextTrakt.rating : null,
    );
    setTraktWatchedOpen(false);
    setTraktEpisodesOpen(false);
    setEpisodeBusyKey("");
    setTraktBusy("");
    setActionStateReady(
      hasInitialActionState || hydratedStatus || hydratedShowWatched,
    );

    setWatchedBySeason(nextWatchedBySeason);
    // Mantenemos loaded=true al hidratar desde caché (antes se forzaba a false).
    // Forzarlo a false desactivaba `preserveTvWatched`, así que el
    // reloadTraktStatus({ force:true }) inicial sobrescribía `trakt.watched` con
    // el valor "crudo" del item/status (false en series) y, justo después, la
    // carga de episodios lo volvía a marcar → el parpadeo
    // "marcado → desmarcado → marcado". Con loaded=true el % se muestra al
    // instante y el estado visto se PRESERVA durante la recarga; la
    // revalidación de episodios sigue corriendo en 2º plano (efecto aparte).
    setWatchedBySeasonLoaded(nextWatchedBySeasonLoaded);
    // Sincronizamos los refs YA (no esperamos al efecto de sync) para que el
    // reloadTraktStatus inicial vea watchedBySeasonLoadedRef=true y preserve el
    // estado visto aunque su respuesta llegue muy rápido.
    watchedBySeasonRef.current = nextWatchedBySeason;
    watchedBySeasonLoadedRef.current = nextWatchedBySeasonLoaded;
    setHasCachedTraktStatus(hydratedStatus);
    setHasCachedShowWatched(hydratedShowWatched);
  }, [
    id,
    endpointType,
    buildInitialTraktState,
    hasInitialActionState,
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
    traktBackgroundSyncAtRef.current = Date.now();
    const hasUsableInitialState =
      hasInitialTraktStatus ||
      hasCachedTraktStatus ||
      (endpointType === "tv" && (hasInitialShowWatched || hasCachedShowWatched));

    if (endpointType === "movie") {
      void loadTraktMovieWatched({
        background: hasUsableInitialState,
        force: true,
      });
      return;
    }

    // force:true para obtener siempre datos frescos de Trakt en la carga inicial
    void reloadTraktStatus({ background: hasUsableInitialState, force: true });
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
        `/login?next=/details/${type}/${id}`,
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

  // Alterna el estado de "visto" del contenido completo en Trakt
  const toggleTraktWatched = async () => {
    if (!trakt.connected || traktBusy) return;
    setTraktBusy("watched");
    try {
      const next = !trakt.watched;
      await traktSetWatched({
        type: traktType,
        tmdbId: id,
        watched: next,
        title,
        posterPath: basePosterDisplayPath || data?.poster_path || null,
      });
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
        title,
        posterPath: basePosterDisplayPath || data?.poster_path || null,
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
        title,
        posterPath: basePosterDisplayPath || data?.poster_path || null,
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
  const collectionViewerItems = useMemo(
    () =>
      (Array.isArray(collectionData?.items) ? collectionData.items : []).map(
        (item) => ({ tmdbId: item?.id, mediaType: "movie" }),
      ),
    [collectionData?.items],
  );
  const collectionViewerStates = useViewerTitleStates(
    collectionViewerItems,
    authenticated || hasBackendSession,
  );

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
  const [externalScoresLoading, setExternalScoresLoading] = useState(true);
  // Se recupera el getter (antes descartado). Arranca en `true`: los premios se
  // piden SIEMPRE al montar, así que desde el primer frame el menú puede
  // reservar el hueco de "Premios" en estado de carga, en vez de que aparezca
  // tarde (cuando termina el scraping) y desplace las demás secciones.
  const [awardsLoading, setAwardsLoading] = useState(true);
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
        setExternalScoresLoading(true);
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
            timeoutMs: cached?.imdbRating != null ? 1200 : 5000,
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
          const {
            imdbRating: omdbImdbRating,
            imdbVotes: omdbImdbVotes,
          } = extractOmdbImdbScore(omdb);
          const awards = normalizeOmdbAwards(omdb?.Awards);

          setExtras((prev) => ({
            ...prev,
            imdbRating: prev.imdbRating ?? omdbImdbRating,
            imdbVotes: prev.imdbVotes ?? omdbImdbVotes,
            awards,
            rtScore,
            mcScore,
          }));

          writeOmdbCache(imdbId, {
            awards,
            awardsFetched: true,
            rtScore,
            mcScore,
            imdbRating: omdbImdbRating,
            imdbVotes: omdbImdbVotes,
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
      } finally {
        if (!abort) setExternalScoresLoading(false);
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

  const handleUnifiedRate = async (value) => {
    if (!authenticated && !hasBackendSession && !session) {
      window.location.href = `/login?next=${encodeURIComponent(
        window.location.pathname + window.location.search,
      )}`;
      return false;
    }

    try {
      setRatingLoading(true);
      setRatingError("");
      const res = await fetch("/api/trakt/item/rating", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          type,
          tmdbId: id,
          rating: value,
          title,
          posterPath: basePosterDisplayPath || data?.poster_path || null,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 401) {
          window.location.href = `/login?next=${encodeURIComponent(
            window.location.pathname + window.location.search,
          )}`;
          return false;
        }
        throw new Error(json?.error || "Error al guardar puntuación");
      }
      const savedRating =
        json.rating == null ? null : Number(json.rating);
      if (savedRating == null) {
        cacheRemoveRating({ type, mediaId: id });
      } else {
        const resolvedPosterPath =
          json?.source === "backend" && json?.item
            ? json.item.posterPath || null
            : basePosterDisplayPath || data?.poster_path || null;
        cacheAddRating({
          type,
          mediaId: id,
          title,
          posterPath: resolvedPosterPath,
          rating: savedRating,
        });
      }
      setUserRating(savedRating);
      setTrakt((prev) => ({
        ...prev,
        rating: savedRating,
      }));
      return true;
    } catch (err) {
      setRatingError(err?.message || "Error al guardar puntuación");
      return false;
    } finally {
      setRatingLoading(false);
    }
  };

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

      setRatingsLoading(true);
      try {
        const res = await fetch(
          `/api/seriesgraph/episode-ratings?tmdbId=${encodeURIComponent(id)}`,
          { cache: "no-store" },
        );
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error);
        if (!ignore) {
          setRatings(json);
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
    // Reparte la media de SeriesGraph por temporada de TMDb. Cubre tanto una
    // temporada absoluta (One Piece) como varias agrupaciones incompatibles
    // entre sí (Gintama: 8 temporadas en SeriesGraph y 11 en TMDb).
    const averages = getSeriesGraphSeasonAverages({
      ratings,
      tmdbSeasons: Array.isArray(data?.seasons) ? data.seasons : [],
    });
    const map = new Map();
    averages.forEach((aggregate, seasonNumber) => {
      if (aggregate?.rating != null) map.set(seasonNumber, aggregate.rating);
    });
    return map;
  }, [ratings, data?.seasons]);

  // SeriesGraph e IMDb pueden agrupar un anime de forma distinta a TMDb
  // (Gintama: 8 temporadas frente a 11). En ese caso un número de temporada
  // idéntico no representa el mismo conjunto de episodios.
  const seriesGraphStructuresMismatch = useMemo(() => {
    const sgSeasons = Array.isArray(ratings?.seasons) ? ratings.seasons : [];
    const airedTmdbSeasons = (
      Array.isArray(data?.seasons) ? data.seasons : []
    ).filter(
      (s) =>
        Number(s?.season_number) > 0 && Number(s?.episode_count) > 0,
    );
    if (!sgSeasons.length || !airedTmdbSeasons.length) return false;
    return !seasonStructuresAlign(sgSeasons, airedTmdbSeasons);
  }, [ratings, data?.seasons]);

  useEffect(() => {
    if (
      type !== "tv" ||
      !resolvedImdbId ||
      !visibleSeasonNumbers.length ||
      seriesGraphStructuresMismatch
    ) {
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
  }, [
    type,
    id,
    resolvedImdbId,
    visibleSeasonNumbersKey,
    visibleSeasonNumbers,
    seriesGraphStructuresMismatch,
  ]);

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
    persistArtworkPreference(posterStorageKey, filePath);
    cacheArtworkOverrides?.({
      type: endpointType,
      id,
      changes: [{ kind: "poster", filePath }],
    });
    saveArtworkOverride({ type: endpointType, id, kind: "poster", filePath });
  };

  // La portada de móvil es independiente de la de escritorio: siempre procede
  // de la pestaña de pósters neutros y alimenta directamente el hero vertical.
  const handleSelectMobilePoster = (filePath) => {
    setSelectedMobilePosterPath(filePath);
    persistArtworkPreference(mobilePosterStorageKey, filePath);
    cacheArtworkOverrides?.({
      type: endpointType,
      id,
      changes: [{ kind: "mobilePoster", filePath }],
    });
    saveArtworkOverride({
      type: endpointType,
      id,
      kind: "mobilePoster",
      filePath,
    });
  };

  const handleSelectLogo = (filePath) => {
    setSelectedLogoPath(filePath);
    persistArtworkPreference(logoStorageKey, filePath);
    cacheArtworkOverrides?.({
      type: endpointType,
      id,
      changes: [{ kind: "logo", filePath }],
    });
    saveArtworkOverride({ type: endpointType, id, kind: "logo", filePath });
  };

  // Selecciona un backdrop para el modo preview y lo persiste
  const handleSelectPreviewBackdrop = (filePath) => {
    setSelectedPreviewBackdropPath(filePath);
    persistArtworkPreference(previewBackdropStorageKey, filePath);
    cacheArtworkOverrides?.({
      type: endpointType,
      id,
      changes: [{ kind: "backdrop", filePath }],
    });
    saveArtworkOverride({ type: endpointType, id, kind: "backdrop", filePath });
  };

  // Selecciona una imagen de fondo con transicion crossfade suave
  const handleSelectBackground = (filePath) => {
    // Guardar la imagen anterior para el fade
    setPrevBackgroundPath(displayBackdropPath);
    setIsTransitioning(true);

    setSelectedBackgroundPath(filePath);
    persistArtworkPreference(backgroundStorageKey, filePath);
    cacheArtworkOverrides?.({
      type: endpointType,
      id,
      changes: [{ kind: "background", filePath }],
    });
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
    setSelectedMobilePosterPath(null);
    setSelectedPreviewBackdropPath(null);
    setSelectedBackgroundPath(null);
    setSelectedLogoPath(null);
    setPosterViewMode("poster");
    setPosterLayoutMode("poster");
    persistArtworkPreference(posterStorageKey, null);
    persistArtworkPreference(mobilePosterStorageKey, null);
    persistArtworkPreference(previewBackdropStorageKey, null);
    persistArtworkPreference(backgroundStorageKey, null);
    persistArtworkPreference(logoStorageKey, null);
    const resetChanges = [
      { kind: "poster", filePath: null },
      { kind: "backdrop", filePath: null },
      { kind: "background", filePath: null },
      { kind: "mobilePoster", filePath: null },
      { kind: "logo", filePath: null },
    ];
    cacheArtworkOverrides?.({
      type: endpointType,
      id,
      changes: resetChanges,
    });
    saveArtworkOverrides({
      type: endpointType,
      id,
      changes: resetChanges,
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
      asTmdbPath(posterBackdropFallback) ||
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
    posterBackdropFallback,
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
    jwHref,
    isMovie,
    letterboxdUrl,
    type,
    seriesGraphUrl,
    filmAffinitySearchUrl,
  ]);

  const scoreboardExternalLinks = useMemo(
    () =>
      externalLinks.map((link) => ({
        key: link.id,
        icon: link.icon,
        title: link.label,
        href: link.href,
      })),
    [externalLinks],
  );

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
  const headerAwardsValue = hasAwards
    ? formatDashboardAwards(extras.awards)
    : null;
  const awardItems = useMemo(
    () => sortAwardItemsForDisplay(flattenAwardItems(extras?.awardsDetails)),
    [extras?.awardsDetails],
  );

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
  const episodeRuntimeFormatValue =
    type === "tv" ? formatEpisodeRuntimePerEpisode(data) : null;
  const seasonEpisodeValue =
    type === "tv" && data.number_of_seasons
      ? `${data.number_of_seasons} Temp.${
          data.number_of_episodes ? ` · ${data.number_of_episodes} Eps.` : ""
        }`
      : null;
  const displayRuntimeValue =
    type === "tv" ? seasonEpisodeValue : runtimeValue || episodeRuntimeValue;

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
    return buildCreativeCreditsForCast({
      type,
      movieDirectors: movieDirectorsCrew,
      tvCreators,
    });
  }, [type, movieDirectorsCrew, tvCreators]);

  const castDataForUI = useMemo(() => {
    const base =
      Array.isArray(tmdbCast) && tmdbCast.length
        ? tmdbCast
        : Array.isArray(castData)
          ? castData
          : [];

    return buildCastDataForUI({
      baseCast: base,
      creativeCredits: creativeCreditsForUI,
    });
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

    // Premios. Aparece desde el primer frame, a la vez que las demás secciones:
    // mientras se cargan (scraping), se reserva el hueco en estado `loading`
    // (mismo patrón que Colección) en vez de aparecer tarde y desplazar el menú.
    // Al resolver: si hay premios se queda con su `count`; si no, se retira.
    if (awardsLoading || awardItems.length > 0) {
      items.push({
        id: "awards",
        label: "Premios",
        icon: Trophy,
        count: awardItems.length || undefined,
        loading: awardsLoading && awardItems.length === 0,
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
        icon: BarChart3,
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
    collectionId,
    collectionData,
    collectionLoading,
    awardItems,
    awardsLoading,
  ]);

  // Menú global (scroll + sticky + spy). En móvil Details mantiene el navbar
  // superior compacto (48px); desde `sm` se conserva la referencia de 72px.
  const STICKY_TOP = isMobileViewport ? 48 : 72;

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
  const priorityCollectionResolved =
    priorityRecommendationsResolved && (!collectionId || !collectionLoading);
  const canRenderRecommendations = priorityCastResolved;
  const canRenderCollection = priorityRecommendationsResolved && !!collectionId;
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
  }, [STICKY_TOP]);

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
    [menuH, STICKY_TOP],
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
  }, [sectionItems, menuH, STICKY_TOP]);

  useEffect(() => {
    if (!Array.isArray(sectionItems) || sectionItems.length === 0) return;
    if (activeSection == null) return;
    if (!sectionItems.some((it) => it.id === activeSection)) {
      setActiveSection(null);
    }
  }, [sectionItems, activeSection]);

  // Estados de cuenta de las recomendaciones: respaldo para sesiones TMDb.
  const [recAccountStates, setRecAccountStates] = useState({});
  const recAccountStatesRef = useRef({});
  const recAccountStateInFlightRef = useRef(new Set());
  const [recImdbRatings, setRecImdbRatings] = useState({});
  const recImdbRatingsRef = useRef({});
  const recImdbRatingInFlightRef = useRef(new Set());
  const recImdbRequestScopeRef = useRef(0);

  useEffect(() => {
    recAccountStatesRef.current = recAccountStates;
  }, [recAccountStates]);

  useEffect(() => {
    recImdbRatingsRef.current = recImdbRatings;
  }, [recImdbRatings]);

  useEffect(() => {
    // reset al cambiar de item
    setRecAccountStates({});
    recAccountStatesRef.current = {};
    recAccountStateInFlightRef.current = new Set();
    setRecImdbRatings({});
    recImdbRatingsRef.current = {};
    recImdbRatingInFlightRef.current = new Set();
    recImdbRequestScopeRef.current += 1;
  }, [id, type]);

  const prefetchRecAccountState = useCallback(
    async (rec) => {
      if (!rec?.id) return;
      if (!session || !account?.id) return;
      if (session === "showverse") return;

      const mediaType =
        rec.media_type === "movie" || rec.media_type === "tv"
          ? rec.media_type
          : type === "tv"
            ? "tv"
            : "movie";
      const key = `${mediaType}:${rec.id}`;
      if (recAccountStatesRef.current[key]) return;
      if (recAccountStateInFlightRef.current.has(key)) return;

      recAccountStateInFlightRef.current.add(key);
      try {
        const st = await getMediaAccountStates(mediaType, rec.id, session);
        const next = {
          favorite: !!st?.favorite,
          watchlist: !!st?.watchlist,
          rating:
            st?.rated && typeof st.rated.value === "number"
              ? st.rated.value
              : null,
        };
        setRecAccountStates((prev) => ({ ...prev, [key]: next }));
      } catch {
        setRecAccountStates((prev) => ({
          ...prev,
          [key]: { favorite: false, watchlist: false, rating: null },
        }));
      } finally {
        recAccountStateInFlightRef.current.delete(key);
      }
    },
    [account?.id, session, type],
  );

  // IMDb no se incluye en el payload ligero de recomendaciones. Se resuelve
  // al interesarse por una tarjeta no favorita y se memoriza por ficha durante
  // la visita para no repetir ni el lookup externo ni la consulta de
  // puntuación al volver a pasar el cursor por la tarjeta.
  const prefetchRecImdbRating = useCallback(async (rec, mediaType) => {
    if (!rec?.id || (mediaType !== "movie" && mediaType !== "tv")) return;

    const key = `${mediaType}:${rec.id}`;
    if (Object.prototype.hasOwnProperty.call(recImdbRatingsRef.current, key)) return;
    const inFlight = recImdbRatingInFlightRef.current;
    if (inFlight.has(key)) return;

    const requestScope = recImdbRequestScopeRef.current;
    inFlight.add(key);
    try {
      const externalIds = rec?.imdb_id || rec?.imdbId
        ? null
        : await getExternalIds(mediaType, rec.id);
      const imdbId = rec?.imdb_id || rec?.imdbId || externalIds?.imdb_id || null;
      const payload = await fetchImdbRatingByImdb(imdbId, { timeoutMs: 5_000 });
      const rating = Number(payload?.rating);
      const nextRating = Number.isFinite(rating) && rating > 0 ? rating : null;
      if (requestScope !== recImdbRequestScopeRef.current) return;

      recImdbRatingsRef.current = {
        ...recImdbRatingsRef.current,
        [key]: nextRating,
      };
      setRecImdbRatings((current) => ({ ...current, [key]: nextRating }));
    } catch {
      if (requestScope !== recImdbRequestScopeRef.current) return;
      recImdbRatingsRef.current = {
        ...recImdbRatingsRef.current,
        [key]: null,
      };
      setRecImdbRatings((current) => ({ ...current, [key]: null }));
    } finally {
      inFlight.delete(key);
    }
  }, []);

  // En cuanto se conozca que una recomendación está en Pendientes se adelanta
  // su IMDb en segundo plano. Así el indicador aparece completo en el primer
  // hover; el mismo callback cubre los estados TMDb que se resuelven después
  // de pasar por primera vez por una tarjeta.
  useEffect(() => {
    for (const rec of (Array.isArray(recommendations) ? recommendations : []).slice(0, 15)) {
      if (!rec?.id) continue;
      const mediaType =
        rec.media_type === "movie" || rec.media_type === "tv"
          ? rec.media_type
          : type === "tv"
            ? "tv"
            : "movie";
      const key = `${mediaType}:${rec.id}`;
      const viewerState = recommendationViewerStates[
        titleStateKey({ tmdbId: rec.id, mediaType })
      ];
      const accountState = recAccountStates[key];
      const isFavorite = Boolean(viewerState?.favorite || accountState?.favorite);
      const isWatchlist = Boolean(viewerState?.watchlist || accountState?.watchlist);
      if (isWatchlist && !isFavorite) {
        void prefetchRecImdbRating(rec, mediaType);
      }
    }
  }, [recommendations, recAccountStates, recommendationViewerStates, prefetchRecImdbRating, type]);

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

  const platformItems = useMemo(
    () =>
      limitedProviders
        .map((provider) =>
          createPlatformItem(provider, {
            endpointType,
            justwatchUrl,
            title,
          }),
        )
        .filter((provider) => provider.icon),
    [limitedProviders, endpointType, justwatchUrl, title],
  );

  // Plataforma principal del overlay de la portada, según orden de prioridad
  // (Netflix, Prime, Crunchyroll, HBO Max, Disney+, Movistar+).
  const primaryStreamingProvider = useMemo(
    () => pickPrimaryProvider(streamingProviders),
    [streamingProviders],
  );

  // Refs para gestion de carga de poster (los estados estan definidos al inicio)
  const prevDisplayPosterRef = useRef(null);
  const posterLoadTokenRef = useRef(0);
  const posterToggleSeqRef = useRef(0);
  const posterRequestedModeRef = useRef("poster");

  useEffect(() => {
    posterRequestedModeRef.current = posterViewMode;
  }, [posterViewMode]);

  // Sincronizar token de carga de poster durante el render para evitar desfases
  const prevRenderPosterPathRef = useRef(displayPosterPath);
  if (prevRenderPosterPathRef.current !== displayPosterPath) {
    prevRenderPosterPathRef.current = displayPosterPath;
    posterLoadTokenRef.current += 1;
  }

  // Activar posterResolved y backdropResolved cuando sus respectivos paths estén disponibles
  useEffect(() => {
    if (displayPosterPath && !posterResolved) {
      setPosterResolved(true);
    }
    if (previewBackdropPath && !backdropResolved) {
      setBackdropResolved(true);
    }
  }, [displayPosterPath, posterResolved, previewBackdropPath, backdropResolved]);

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
      posterSettledRef.current = false;
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

    // Manejar cambio de imagen (incluyendo de null a valor)
    if (prev !== displayPosterPath) {
      // Si hay imagen anterior, guardarla para crossfade
      if (prev) {
        setPrevPosterPath(prev);
      }

      // Verificar si la nueva imagen ya esta precargada.
      //
      // Se prueban las URLs REALES que se van a pintar (`posterLowUrl` /
      // `posterHighUrl`). Antes esto construía la URL a mano con tamaños fijos
      // (w342/w780) sobre `displayPosterPath`, pero en móvil la portada usa
      // w500/original de `mobileNeutralPosterPath`: probaba una URL que no se
      // renderiza nunca, el test fallaba siempre y se caía al `else`, que hace
      // `setPosterLowLoaded(false)` y BORRA el `true` que ya había puesto el
      // `onLoad` → la imagen se veía un instante y desaparecía en negro.
      if (displayPosterPath) {
        const checkIfLoaded = (url) => {
          if (!url) return false;
          const testImg = new Image();
          testImg.src = url;
          return testImg.complete && testImg.naturalWidth > 0;
        };

        if (posterViewMode === "preview") {
          const isLowPreloaded = checkIfLoaded(posterLowUrl);
          const isHighPreloaded = checkIfLoaded(posterHighUrl);

          if (isLowPreloaded) {
            setBackdropLowLoaded(true);
            setBackdropHighLoaded(isHighPreloaded);
            setBackdropResolved(true);
          } else {
            setBackdropLowLoaded(false);
            setBackdropHighLoaded(false);
          }
          setBackdropImgError(false);
        } else {
          const isLowPreloaded = checkIfLoaded(posterLowUrl);
          const isHighPreloaded = checkIfLoaded(posterHighUrl);

          if (isLowPreloaded) {
            setPosterLowLoaded(true);
            setPosterHighLoaded(isHighPreloaded);
            setPosterResolved(true);
            posterSettledRef.current = isHighPreloaded;
          } else {
            setPosterLowLoaded(false);
            setPosterHighLoaded(false);
            posterSettledRef.current = false;
          }
          setPosterImgError(false);
        }

        setPosterTransitioning(!!prev); // Solo transición si había imagen anterior
      } else {
        // Si displayPosterPath es null, resetear estados
        if (posterViewMode === "preview") {
          setBackdropLowLoaded(false);
          setBackdropHighLoaded(false);
          setBackdropResolved(false);
        } else {
          setPosterLowLoaded(false);
          setPosterHighLoaded(false);
          setPosterResolved(false);
          posterSettledRef.current = false;
        }
        setPosterTransitioning(false);
        setPrevPosterPath(null);
      }
    }
  }, [displayPosterPath, posterViewMode]);

  // Resetear estados de carga del backdrop cuando cambia la vista o la imagen
  const prevDisplayBackdropRef = useRef(null);
  const backdropLoadTokenRef = useRef(0);

  // Sincronizar token de carga de backdrop durante el render
  const prevRenderBackdropPathRef = useRef(previewBackdropPath);
  if (prevRenderBackdropPathRef.current !== previewBackdropPath) {
    prevRenderBackdropPathRef.current = previewBackdropPath;
    backdropLoadTokenRef.current += 1;
  }

  const backdropLoadToken = backdropLoadTokenRef.current;

  useEffect(() => {
    const prev = prevDisplayBackdropRef.current;
    prevDisplayBackdropRef.current = previewBackdropPath;

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

  // MÓVIL (modo poster, sin preview): usar el poster SIN IDIOMA (textless), como en
  // DetailModal. En escritorio o preview se mantiene el poster normal.
  const mobilePosterPath =
    isMobileViewport && !isBackdropPoster ? mobileNeutralPosterPath : null;

  // URLs basadas en el modo de vista
  const posterLowUrl =
    posterViewMode === "preview" && previewBackdropPath
      ? `https://image.tmdb.org/t/p/w780${previewBackdropPath}`
      : mobilePosterPath
        ? `https://image.tmdb.org/t/p/w500${mobilePosterPath}`
        : displayPosterPath
          ? `https://image.tmdb.org/t/p/w342${displayPosterPath}`
          : null;

  // MÓVIL: alta calidad para el póster de portada. Antes pedía "original"
  // (varios MB, sin redimensionar por TMDb: 2000px+ de ancho en muchos
  // pósters) para un ancho renderizado real de ~390-430px -- con `unoptimized`
  // (sin pasar por el optimizador de Next.js) esa descarga entera bloqueaba la
  // carga final del póster en redes móviles. `w780` es el bucket de póster
  // más grande de TMDb aparte de "original" (cubre incluso pantallas 2x sin
  // recortar), igual que ya usa escritorio, y pesa una fracción del tamaño.
  const posterHighUrl =
    posterViewMode === "preview" && previewBackdropPath
      ? `https://image.tmdb.org/t/p/w1280${previewBackdropPath}`
      : mobilePosterPath
        ? `https://image.tmdb.org/t/p/w780${mobilePosterPath}`
        : displayPosterPath
          ? `https://image.tmdb.org/t/p/w780${displayPosterPath}`
          : null;
  // En móvil la versión w780 es la imagen final y candidata a LCP. Se le da
  // prioridad alta; la versión w500 sigue siendo un fallback inmediato, pero
  // no debe retrasar el inicio de la descarga de máxima calidad.
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

  // Aquí vivía `shouldRevealCurrentPosterImmediately`, que en la primera entrada
  // mostraba el póster ya visible para no romper la animación de entrada del
  // hero. Esa animación está desactivada (`initial={false}` en el poster card),
  // así que lo único que quedaba de la bandera era el efecto secundario: la
  // opacidad nunca cambiaba, la transición de 500ms no se disparaba y el póster
  // aparecía de golpe. Retirada: ya no la usa nadie.

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

  // Icono NO IMAGE solo cuando el artwork ya se ha inicializado por completo y se
  // ha resuelto que NO hay imagen (o falló). Requerir `artworkInitialized` en
  // TODOS los modos evita que el icono parpadee durante el proceso de carga
  // (antes podía mostrarse un instante antes de que apareciera el póster).
  // También se exige `remoteArtworkChecked`: mientras no se sepa si hay un
  // override remoto guardado, `currentImagePath` es `null` a propósito (evita
  // el parpadeo "por defecto -> seleccionada"), pero eso NO significa que no
  // haya imagen -- sin esto, ese hueco intencional se mostraba como el icono
  // de "sin imagen", pareciendo un título roto en vez de "cargando".
  const showNoPoster =
    artworkInitialized &&
    currentResolved &&
    remoteArtworkChecked &&
    (!currentImagePath || currentImgError);

  // Mientras se espera a `remoteArtworkChecked` (y no hay ya algo que mostrar:
  // un póster anterior en transición), el marco del póster (fondo oscuro,
  // sombra, borde) se oculta también: sin esto, aunque ya no aparezca el
  // icono de "sin imagen" (ver `showNoPoster`), quedaba un recuadro vacío con
  // marco visible -- la misma sensación de "tarjeta vacía" que se quiere
  // evitar. En cuanto se sabe si hay imagen o no, el marco vuelve.
  const posterChromeReady =
    remoteArtworkChecked || Boolean(posterLowUrl) || Boolean(prevPosterPath);

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

  // Una entrada corta de opacidad + escala da presencia a la portada sin
  // bloquear el render ni animar propiedades costosas. Queda desactivada para
  // personas que han pedido reducir movimiento.
  const posterLowEntranceScale =
    prefersReducedMotion || currentLowLoaded
      ? POSTER_OVERSCAN
      : POSTER_OVERSCAN + 0.025;
  const posterHighEntranceScale =
    prefersReducedMotion || currentHighLoaded
      ? POSTER_OVERSCAN
      : POSTER_OVERSCAN + 0.025;

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
      // ÚNICA animación: flotación 3D continua. No se inclina siguiendo al
      // puntero (eso dejaba la portada "clavada" en un ángulo fijo al parar el
      // ratón). Los clics los recibe la capa FIJA (fuera del marco).
      const dt = now / 1000;
      const target = {
        rx: Math.sin(dt * 1.05) * 5.5,
        ry: Math.cos(dt * 0.9) * 8.5,
        s: 1.03 + Math.sin(dt * 1.6) * 0.01,
      };

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

  const isDataLoading =
    (!!session && accountStatesLoading) ||
    (trakt.loading && (trakt.connected || hasBackendSession));
  const actionStateLoading =
    !authHydrated || !actionStateReady || accountStatesLoading;
  const watchedActionLoading =
    actionStateLoading ||
    (endpointType === "movie"
      ? trakt.loading && !canOpenMovieTraktModalInstantly
      : trakt.loading) ||
    (endpointType === "tv" && !!trakt.connected && !watchedBySeasonLoaded);
  const watchedActionValue = actionStateLoading ? false : !!trakt.watched;
  const watchedActionPlays =
    actionStateLoading || endpointType === "tv" ? 0 : trakt.plays;
  const watchedActionBadge =
    !actionStateLoading && endpointType === "tv" ? tvProgressBadge : null;
  const ratingActionValue = actionStateLoading ? null : unifiedUserRating;
  const favoriteActionValue = actionStateLoading ? false : favorite;
  const watchlistActionValue = actionStateLoading ? false : watchlist;
  const favoriteActionLoading = actionStateLoading || favLoading;
  const watchlistActionLoading = actionStateLoading || wlLoading;

  const detailsModalLayer = (
    <>
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

      {type === "tv" && (
        <EpisodeRatingsModal
          open={episodeRatingsModalOpen}
          onClose={() => setEpisodeRatingsModalOpen(false)}
          showId={Number(id)}
          title={title}
          initialRatings={ratings}
          initialTmdbSeasons={data?.seasons || []}
        />
      )}

      <TraktCommentModal
        open={commentModalOpen}
        onClose={() => setCommentModalOpen(false)}
        onSubmit={handleCommentSubmit}
        onUpdate={handleCommentUpdate}
        onDelete={handleCommentDelete}
        title={title}
        myComments={myComments}
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
    </>
  );

  return (
    <div
      data-details-root
      className="relative min-h-screen bg-[#101010] text-gray-100 font-sans selection:bg-yellow-500/30"
    >
      {/* --- BACKGROUND & OVERLAY --- */}
      <div className="fixed inset-0 z-0 overflow-hidden bg-[#0a0a0a] pointer-events-none">
        {useBackdrop && heroBackgroundPath ? (
          <>
            {/* Imagen anterior (fade out) */}
            {isTransitioning && prevBackgroundPath && (
              <>
                <div
                  className="absolute inset-0 bg-cover bg-center transition-opacity duration-500"
                  style={{
                    backgroundImage: `url(https://image.tmdb.org/t/p/${heroBackgroundSize}${prevBackgroundPath})`,
                    transform: "scale(1)",
                    filter: "brightness(0.75) saturate(1.03)",
                    opacity: 0,
                    willChange: "opacity",
                  }}
                />
                <div
                  className="absolute inset-0 bg-cover transition-opacity duration-500"
                  style={{
                    backgroundImage: `url(https://image.tmdb.org/t/p/${heroBackgroundSize}${prevBackgroundPath})`,
                    backgroundPosition: "center top",
                    transform: "scale(1)",
                    transformOrigin: "center top",
                    opacity: 0,
                    willChange: "opacity",
                  }}
                />
              </>
            )}

            {/* Capa base: siempre cubre (evita marcos laterales).

                MÓVIL: oculta hasta que carga el póster de portada. Antes pintaba
                con opacity:1 desde el primer frame sin esperar a nada, mientras
                que la portada espera a su `onLoad` y encima hace 500ms de
                fundido: el fondo ganaba siempre la carrera y se veía la MISMA
                imagen atenuada antes que la portada. Además, al desvanecerse la
                portada por encima, este fondo asomaba a través y causaba el
                parpadeo. Oculto, detrás queda el `bg-[#0a0a0a]` del contenedor,
                que es exactamente el mismo color que la caja del póster: fondo
                uniforme, sin rectángulo ni destello.

                La condición va por CSS (`max-sm:`) y NO por `isMobileViewport`:
                ese estado arranca en false y provocaría el destello que estamos
                eliminando. Escritorio (>=sm) no se toca: siempre visible.
                Se elimina también `opacity: isTransitioning ? 1 : 1`, que era un
                ternario muerto (siempre 1). */}
            <div
              className="hero-bg-base absolute inset-0 bg-cover bg-center max-sm:[opacity:var(--sv-hero-scroll,0)] sm:opacity-100 sm:transition-opacity sm:duration-500"
              style={{
                backgroundImage: `url(https://image.tmdb.org/t/p/${heroBackgroundSize}${heroBackgroundPath})`,
                // MÓVIL: desenfoque + un punto de escala.
                //
                // En móvil este fondo es el MISMO póster (atenuado y con otro
                // encuadre) contra el que funde el difuminado inferior de la
                // portada. Al hacer tope, el navegador estira el contenido del
                // flujo pero NO los elementos `fixed`: las dos copias se
                // desalinean y, en la zona de mezcla, el desajuste se lee como una
                // línea. Solo se nota en imágenes claras, donde contrasta.
                //
                // La desincronía no se puede evitar sin quitar el `fixed`. Pero un
                // fondo desenfocado no tiene detalle que pueda fantasmear: aunque
                // se desplace, no hay bordes que delaten el desajuste. Sigue
                // siendo el póster y sigue siendo `fixed`.
                //
                // El `scale` compensa el halo transparente que `blur()` deja en
                // los bordes del elemento.
                //
                // Va por CSS (`.hero-bg-base`, media query) y NO por
                // `isMobileViewport`: ese estado arranca en false y se resuelve
                // tras montar, así que el fondo entraría nítido y se
                // desenfocaría después — el mismo patrón que causó los bordes
                // marcados que estamos persiguiendo.
                willChange: "opacity",
              }}
            />

            {/* Capa detalle: zoom OUT (scale < 1). Mismo gateo que la capa base:
                si esta se mostrara antes, el problema seguiría igual. */}
            <div
              className={`absolute inset-0 bg-cover transition-opacity duration-500 opacity-100 max-sm:hidden ${
                currentLowLoaded ? "" : "max-sm:opacity-0"
              }`}
              style={{
                backgroundImage: `url(https://image.tmdb.org/t/p/original${heroBackgroundPath})`,
                backgroundPosition: "center top",
                transform: "scale(1)",
                transformOrigin: "center top",
                willChange: "opacity",
              }}
            />

            {/* MÓVIL: PÓSTER NÍTIDO como capa FIJA con el encuadre de la caja de
                portada (mismo alto, mismo `cover` centrado y overscan, con fundido
                inferior → botones sobre oscuro). Es la MISMA imagen que el fondo
                desenfocado (capa base), y al ser también FIJA queda perfectamente
                alineada con él: el crossfade por opacidad (nítida→difuminada,
                dirigido por `--sv-hero-scroll`) se percibe como UNA sola imagen
                que se difumina, sin la segunda imagen desalineada que causaba el
                scroll de la portada en flujo. Gateada por `currentLowLoaded`
                (evita destello). El logo y el contenido (en flujo, z-10) se
                superponen. Solo móvil (`sm:hidden`). */}
            <div
              className={`sv-mobile-poster-entry sm:hidden absolute top-0 inset-x-0 bg-cover bg-center poster-mobile-fade ${
                currentLowLoaded
                  ? "sv-mobile-poster-reveal [opacity:calc(1_-_var(--sv-hero-scroll,0))]"
                  : "opacity-0"
              }`}
              style={{
                height: `calc(100svh - 6rem - ${mobileActionRowHeight}px - env(safe-area-inset-bottom))`,
                backgroundImage: `url(https://image.tmdb.org/t/p/${heroBackgroundSize}${heroBackgroundPath})`,
                transform: `scale(${POSTER_OVERSCAN})`,
                willChange: "opacity",
              }}
            />
          </>
        ) : (
          <div className="absolute inset-0 bg-[#0a0a0a]" />
        )}

        {/* Sombreados de legibilidad del fondo. En MÓVIL se desvanecen con el scroll
            (`--sv-hero-scroll`): en p=0 el póster está nítido SIN oscurecer (entrada
            intacta); al hacer scroll aparecen para dar legibilidad sobre el fondo.
            Escritorio (>=sm): siempre visibles. */}
        <div className="absolute inset-0 pointer-events-none sm:opacity-100 max-sm:[opacity:calc(var(--sv-hero-scroll,0)*0.6)]">
          {/* Sombreado superior + laterales (sin "marcos") */}
          <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-transparent to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-r from-[#101010]/60 via-transparent to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-l from-[#101010]/60 via-transparent to-transparent" />
          {/* Overlays originales */}
          <div className="absolute inset-0 bg-gradient-to-t from-[#101010] via-[#101010]/60 to-black/20" />
          <div className="absolute inset-0 bg-gradient-to-r from-[#101010] via-transparent to-transparent opacity-30" />
        </div>
      </div>

      {/* --- CONTENIDO PRINCIPAL --- */}
      <div
        ref={contentTopRef}
        tabIndex={-1}
        // El margen superior se ajusta SOLO en `sm:`/`lg:` (vista normal). En
        // móvil el `pt-6` no se toca: el hero compensa los 3rem del navbar
        // superior compacto y conserva el póster full-bleed bajo el cristal.
        className="relative z-10 px-4 pt-6 pb-8 sm:pt-12 lg:pt-14 lg:pb-12 max-w-7xl mx-auto focus:outline-none"
      >
        {/* =================================================================
            HEADER HERO SECTION (Diseño Final Solicitado)
           ================================================================= */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
          className="-mt-[4.5rem] sm:mt-0 flex flex-col lg:flex-row gap-5 lg:gap-12 mb-6 sm:mb-12 items-start"
        >
          {/* --- COLUMNA IZQUIERDA: POSTER + PROVIDERS + ENLACES (cuando es backdrop) --- */}
          <div
            className={`flex-shrink-0 flex flex-col gap-5 lg:gap-7 relative z-10 w-[calc(100%+2rem)] -mx-4 max-w-none sm:w-full sm:mx-auto lg:mx-0 ${
              isBackdropPoster
                ? "sm:max-w-full lg:max-w-[600px]"
                : "sm:max-w-[320px] lg:max-w-[320px]"
            }`}
            style={{
              transition: "max-width 500ms cubic-bezier(0.25, 1, 0.5, 1)",
            }}
          >
            {/* Poster Card. SIN animación de entrada (`initial={false}`): el
                `scale`/`opacity` de entrada, en móvil full-bleed, encogía y hacía
                semitransparente la tarjeta dejando ver el póster de FONDO (atenuado
                + viñetas) durante la carga = "bordes marcados". Ahora aparece
                sólida y a tamaño completo desde el primer frame. */}
            <motion.div
              initial={false}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{
                duration: 0.64,
                delay: 0.08,
                ease: [0.16, 1, 0.3, 1],
              }}
              className="relative"
            >
              {/* MÓVIL: continuación ESPEJADA del póster bajo el navbar (4rem).
                  El póster arranca justo bajo el navbar (borde con borde, sin
                  pasar por debajo ni ocultar imagen). El problema era que encima
                  quedaba el fondo fijo (mismo póster pero atenuado y con otro
                  encuadre) bajo el cristal del navbar: nunca casaba con la fila
                  superior del póster y se veía la línea horizontal.

                  Aquí se refleja el póster sobre su propio borde superior con la
                  MISMA geometría (mismo ancho, misma altura de caja, mismo
                  object-cover y mismo overscan), así que la fila inferior del
                  espejo ES la fila superior del póster: continuidad exacta, sin
                  línea posible, sea cual sea el póster.

                  Cómo: el div interior se ancla con `top-full` (su borde superior
                  = borde inferior de la franja = borde superior del póster) y se
                  voltea sobre ese mismo borde con `origin-top scale-y-[-1]`, de
                  modo que sube reflejado y la franja lo recorta a 4rem.
                  Va con LOW (no HIGH): queda tras el blur del navbar, así que la
                  resolución es irrelevante y el color —lo único que importa para
                  que no haya línea— es idéntico. Escritorio: oculto. */}
              {/* Gateado por CSS (`sm:hidden`), NO por `isMobileViewport`: ese
                  estado arranca en false y pasa a true tras montar, así que la
                  franja llegaría tarde y la línea asomaría durante ese frame,
                  que es exactamente lo que estamos eliminando. */}
              {posterLowUrl && !currentImgError && (
                <div
                  className={`hidden absolute bottom-full inset-x-0 h-16 overflow-hidden pointer-events-none z-0 transition-opacity duration-500 ease-out ${
                    currentLowLoaded ? "opacity-100" : "opacity-0"
                  }`}
                >
                  <div className="absolute inset-x-0 top-full h-[calc(100svh_-_13.5rem_-_env(safe-area-inset-bottom))] origin-top scale-y-[-1]">
                    <OptimizedImage
                      src={posterLowUrl}
                      alt=""
                      aria-hidden="true"
                      unoptimized
                      loading="eager"
                      decoding="async"
                      className="absolute inset-0 w-full h-full object-cover"
                      style={{
                        transform: `translateZ(0) scale(${POSTER_OVERSCAN})`,
                      }}
                    />
                  </div>
                </div>
              )}

              {/* Wrapper: solo perspectiva + captura puntero. Ya NO cicla al
                  pulsar en toda la portada: el cambio póster/backdrop se hace
                  solo en las zonas laterales (flechas), y el botón play del
                  overlay abre la plataforma. `group/still` habilita el overlay. */}
              <div
                ref={posterWrapRef}
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
                className="group/still relative"
                style={{
                  touchAction: "pan-y",
                }}
              >
                {/* Contexto 3D acotado SOLO al marco: así la capa interactiva
                    (hermana, fuera del preserve-3d) no entra en el orden 3D y no
                    queda tapada por la imagen inclinada, y sus elementos son
                    clicables y estables. */}
                <div
                  className="relative"
                  style={{
                    perspective: poster3dEnabled ? 1100 : undefined,
                    transformStyle: "preserve-3d",
                  }}
                >
                {/* Este es el recuadro completo que se inclina */}
                <div
                  ref={posterTiltRef}
                  className={`relative rounded-none sm:rounded-2xl overflow-hidden bg-transparent will-change-transform poster-tilt-corner-mask ${
                    posterChromeReady
                      ? "sm:shadow-2xl sm:shadow-black/80 sm:bg-black/40"
                      : ""
                  }`}
                  style={{
                    transformStyle: "preserve-3d",
                    backfaceVisibility: "hidden",
                    WebkitBackfaceVisibility: "hidden",
                    outline: "1px solid transparent",
                    isolation: "isolate",
                    // Máscara radial (suavizado de esquinas) SOLO en escritorio, vía
                    // clase CSS `sm:` para que sea consistente desde el primer frame
                    // (antes dependía de isMobileViewport y "marcaba" los bordes al
                    // cargar, cuando pasaba de false→true). NO transition en transform.
                  }}
                >
                  {/* Borde premium suavizado en la capa superior para evitar entrecortados */}
                  {posterChromeReady && (
                    <div className="pointer-events-none absolute inset-0 rounded-2xl ring-1 ring-white/15 z-30 hidden sm:block" />
                  )}

                  {/* MÓVIL: el póster ocupa casi toda la pantalla para que en la
                      primera vista SOLO se vean póster + logo + fila de botones,
                      quedando los botones justo encima del navbar inferior y el
                      resto (premios/info/scoreboard/tabs) por debajo (scroll).
                      Su alto usa el viewport seguro, el área segura inferior y la
                      altura MEDIDA de los botones. De este modo, logo y acciones
                      acaban justo antes del navbar en cualquier ancho; el resto
                      de la información queda después al hacer scroll.
                      NO se descuenta la barra de "Continuar viendo": el póster
                      (y el logo) deben quedar FIJOS la haya o no. Cuando existe,
                      empuja la fila de acciones hacia abajo hasta quedar detrás
                      del navbar inferior flotante (z-30 > z-10 del contenido),
                      que la cubre por completo. ESCRITORIO: aspecto 2:3. */}
                  <div
                    className={`relative w-full h-[var(--details-mobile-poster-height)] overflow-hidden bg-transparent will-change-auto sm:h-0 poster-aspect-box ${
                      posterChromeReady ? "sm:bg-neutral-950" : ""
                    }`}
                    style={{
                      contain: "layout paint",
                      "--details-mobile-poster-height": `calc(100svh - 6rem - ${mobileActionRowHeight}px - env(safe-area-inset-bottom))`,
                      // ESCRITORIO: la forma de la caja sigue al modo de portada
                      // (2:3 póster ↔ 16:9 backdrop) y el cambio se anima desde
                      // `.poster-aspect-box`. Antes esto era `sm:aspect-[2/3]`
                      // FIJO —lo dejé así al rehacer la caja para el póster
                      // full-bleed de móvil—, así que al alternar a backdrop la
                      // caja seguía vertical y recortaba la imagen.
                      // En móvil la media query no aplica: manda `h-[...]`.
                      "--poster-pb": isBackdropPoster ? "56.25%" : "150%",
                    }}
                  >
                    {/* Aquí había una capa de carga `bg-neutral-950` enmascarada,
                        para tapar el póster de FONDO mientras cargaba la portada.
                        Ya no hace falta y además era la causante del parpadeo:
                        desaparecía de golpe al cargar la imagen, pero la portada
                        tarda 500ms en opacar, así que en ese hueco el fondo
                        asomaba a través de la portada semitransparente.

                        Ahora el fondo va oculto en móvil hasta que carga la
                        portada, y detrás queda el `bg-[#0a0a0a]` del contenedor
                        del fondo fijo, que es EXACTAMENTE el mismo color que
                        `neutral-950`. El resultado visual durante la carga es
                        idéntico, pero sin capa que quitar y, por tanto, sin
                        parpadeo. */}

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
                            className="absolute inset-0 z-0 poster-mobile-fade max-sm:hidden"
                          >
                            <OptimizedImage
                              src={`https://image.tmdb.org/t/p/${posterAspectIsBackdrop ? "w1280" : "w780"}${prevPosterPath}`}
                              alt={title}
                              className="absolute inset-0 w-full h-full object-cover"
                              style={{
                                transform: `scale(${POSTER_OVERSCAN})`,
                              }}
                            />
                          </motion.div>
                        )}
                    </AnimatePresence>

                    {posterLowUrl && !currentImgError && (
                      // Las imágenes de dentro NO llevan `translateZ(0)`, solo
                      // `scale()`. Con él se promovían a su PROPIA capa de
                      // composición, separada de esta —que es la que tiene la
                      // máscara—. Al hacer tope, el compositor estira el contenido
                      // y no garantiza que capa-máscara y capa-hija se estiren
                      // igual: si la imagen se desplazaba unos píxeles respecto a
                      // su máscara, asomaba su borde crudo por abajo (una línea
                      // blanca en pósters claros). Sin ese `translateZ(0)`,
                      // `scale()` es un transform 2D que NO promueve, así que la
                      // imagen rasteriza dentro de esta capa y la máscara siempre
                      // la cubre. No se pierde GPU: el wrapper ya es transform-gpu.
                      <div className="absolute inset-0 transform-gpu will-change-[opacity,transform] z-10 poster-mobile-fade max-sm:opacity-0">
                        {/* LOW */}
                        <OptimizedImage
                          src={posterLowUrl}
                          alt={title}
                          priority
                          unoptimized
                          sizes={
                            isBackdropPoster
                              ? "(max-width: 1024px) 100vw, 600px"
                              : "(max-width: 1024px) 280px, 320px"
                          }
                          loading="eager"
                          decoding="async"
                          // RED DE SEGURIDAD PARA IMÁGENES EN CACHÉ.
                          // Si la imagen ya está en caché, el navegador puede
                          // completar la carga ANTES de que React enganche
                          // `onLoad`, así que ese evento no llega nunca. Como
                          // `currentLowLoaded` gobierna la opacidad de la portada,
                          // la del fondo Y el montaje de la imagen HIGH, quedarse
                          // en false deja la pantalla en NEGRO de forma permanente
                          // — justo al reentrar en un título ya visitado.
                          // `complete` + `naturalWidth` detectan ese caso. El ref
                          // se ejecuta en la fase de commit, así que aquí sí se
                          // puede actualizar estado.
                          ref={(el) => {
                            if (!el || !el.complete || !el.naturalWidth) return;
                            if (
                              currentLoadTokenRef.current !== currentLoadToken
                            )
                              return;
                            if (posterViewMode === "preview") {
                              setBackdropLowLoaded(true);
                              setBackdropResolved(true);
                            } else {
                              setPosterLowLoaded(true);
                              setPosterResolved(true);
                            }
                          }}
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
                          // Entra SIEMPRE con el fundido inicial, pero permanece
                          // opaca debajo de HIGH cuando esta carga. Desvanecer
                          // LOW a la vez que HIGH aparecía dejaba ambas capas
                          // semitransparentes durante el cruce y el fondo negro
                          // asomaba como un microparpadeo. HIGH termina cubriendo
                          // LOW por completo sin necesidad de apagarla.
                          // SIN `transform-gpu`/`will-change:transform`: eso la
                          // promovía a su PROPIA capa, separada de la del wrapper
                          // (la que tiene la máscara). Al hacer tope/overscroll
                          // (tocar arriba), el compositor estira cada capa por su
                          // cuenta y la imagen se desplazaba unos px respecto a su
                          // máscara → asomaba el borde crudo por abajo (línea en
                          // pósters claros). Sin promoción, rasteriza DENTRO de la
                          // capa del wrapper y la máscara la cubre siempre. La GPU
                          // la sigue aportando el wrapper (`transform-gpu`).
                          className={`absolute inset-0 w-full h-full object-cover transition-[opacity,transform] duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none
${currentLowLoaded ? "opacity-100" : "opacity-0"}`}
                          style={{
                            transform: `scale(${posterLowEntranceScale})`,
                          }}
                        />

                        {/* HIGH: se monta inmediatamente, en paralelo a LOW.
                            Antes esperaba al onLoad de w500, creando una cadena
                            w500 → original especialmente lenta con datos móviles. */}
                        {posterHighUrl && (
                          <OptimizedImage
                            src={posterHighUrl}
                            alt={title}
                            priority
                            unoptimized
                            sizes={
                              isBackdropPoster
                                ? "(max-width: 1024px) 100vw, 600px"
                                : "(max-width: 1024px) 280px, 320px"
                            }
                            loading="eager"
                            decoding="async"
                            fetchPriority="high"
                            ref={(el) => {
                              if (!el || !el.complete || !el.naturalWidth)
                                return;
                              if (
                                currentLoadTokenRef.current !== currentLoadToken
                              )
                                return;
                              if (posterViewMode === "preview") {
                                setBackdropHighLoaded(true);
                              } else {
                                setPosterHighLoaded(true);
                                posterSettledRef.current = true;
                              }
                            }}
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
                                posterSettledRef.current = true;
                              }
                            }}
                            onError={() => {}}
                            // Igual que la LOW: sin promoción a capa propia para
                            // que rasterice DENTRO de la capa enmascarada del
                            // wrapper y no asome el borde crudo al hacer overscroll.
                            className={`absolute inset-0 w-full h-full object-cover transition-[opacity,transform] duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none
${currentHighLoaded ? "opacity-100" : "opacity-0"}`}
                            style={{
                              transform: `scale(${posterHighEntranceScale})`,
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

                    {/* MÓVIL (solo cuando la portada es textless): logo del título
                        sobre la portada (o título de texto si no hay logo), igual
                        que DetailModal.

                        Antes esto colgaba solo de `mobilePosterPath`, con la nota
                        de que así "nunca se superponía a una portada CON texto".
                        No era cierto: `mobilePosterPath` sale de
                        `mobileNeutralPosterPath`, que cae a un póster CON idioma
                        cuando no existe ninguno textless. En esos títulos la
                        portada ya trae el título impreso y el logo lo duplicaba.
                        `mobilePosterHasBurnedTitle` comprueba el idioma real del
                        póster elegido y cubre ese caso. */}
                    {currentLowLoaded &&
                      mobilePosterPath &&
                      !mobilePosterHasBurnedTitle &&
                      (displayHeroLogoPath || heroLogoResolved) && (
                      <motion.div
                        initial={
                          prefersReducedMotion
                            ? false
                            : { opacity: 0, y: 18, scale: 0.94, filter: "blur(8px)" }
                        }
                        animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
                        transition={{
                          duration: prefersReducedMotion ? 0 : 0.48,
                          delay: prefersReducedMotion ? 0 : 0.14,
                          ease: [0.16, 1, 0.3, 1],
                        }}
                        className="pointer-events-none absolute inset-x-0 bottom-2 z-[16] flex items-end justify-center p-4 sm:bottom-0"
                      >
                        {/* Aquí había una sombra de 10rem para el logo. No era un
                            degradado anclado sino una FRANJA flotante: negro al
                            45% en su punto medio y transparente por arriba Y por
                            abajo. Sobre pósters claros se leía como una mancha
                            oscura suspendida (la "línea negra"), y encima
                            oscurecía por segunda vez la zona que ya difumina la
                            máscara. Ya no hace falta: la máscara deja el fondo
                            casi a alfa 0 donde va el logo, así que detrás queda
                            el fondo oscuro de la página, y el logo/título llevan
                            su propio drop-shadow fuerte para el contraste local.
                            (Sin citar las clases: el escáner de Tailwind no
                            distingue comentarios y volvería a emitir ese CSS.) */}
                        {displayHeroLogoPath ? (
                          <ProgressiveHeroLogo
                            path={displayHeroLogoPath}
                            title={title}
                          />
                        ) : heroLogoResolved ? (
                          <h2 className="relative z-10 max-w-[90%] text-center text-2xl font-black leading-tight text-white drop-shadow-[0_2px_12px_rgba(0,0,0,0.85)]">
                            {title}
                          </h2>
                        ) : null}
                      </motion.div>
                    )}

                    {/* Overlay VISUAL DENTRO del marco: se inclina con la imagen
                        (integrado). Sin eventos: los clics los recibe la capa
                        FIJA de abajo (hermana del contexto 3D), que no se mueve
                        con la inclinación y por tanto sí registra el clic. */}
                    <div className="pointer-events-none absolute inset-0 z-[15]">
                      <StreamingHoverOverlay
                        provider={primaryStreamingProvider}
                        watched={trakt.watched}
                        mode="button"
                        part="visual"
                      />

                      {/* Visual de las flechas (degradado + chevron) DENTRO del
                          marco: se inclina/flota con la imagen = integrado. El
                          clic lo recibe la zona transparente de la capa fija.
                          Solo escritorio (`supportsHover`), igual que esas zonas. */}
                      <AnimatePresence>
                        {supportsHover &&
                          isPosterHovered &&
                          posterViewMode === "poster" && (
                            <motion.div
                              key="arrow-visual-right"
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              exit={{ opacity: 0 }}
                              transition={{ duration: 0.2, ease: "easeInOut" }}
                              className="pointer-events-none absolute inset-y-0 right-0 z-20 flex w-1/3 items-center justify-end bg-gradient-to-l from-black/70 to-transparent pr-4"
                            >
                              <ChevronRight className="h-8 w-8 text-white drop-shadow-lg" />
                            </motion.div>
                          )}
                      </AnimatePresence>
                      <AnimatePresence>
                        {supportsHover &&
                          isPosterHovered &&
                          posterViewMode === "preview" && (
                            <motion.div
                              key="arrow-visual-left"
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              exit={{ opacity: 0 }}
                              transition={{ duration: 0.2, ease: "easeInOut" }}
                              className="pointer-events-none absolute inset-y-0 left-0 z-20 flex w-1/3 items-center justify-start bg-gradient-to-r from-black/70 to-transparent pl-4"
                            >
                              <ChevronLeft className="h-8 w-8 text-white drop-shadow-lg" />
                            </motion.div>
                          )}
                      </AnimatePresence>
                    </div>

                    {/* Barra de progreso de "Continuar viendo": SIEMPRE visible
                        (no depende del hover), integrada en el poster. % + barra
                        verde para los titulos que se estan reproduciendo. */}
                    {inProgressPct != null && (
                      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 hidden sm:block">
                        <div className="bg-gradient-to-t from-black/90 via-black/55 to-transparent px-3 pb-2.5 pt-9 sm:px-4 sm:pb-3">
                          <div className="mb-1.5 flex items-end justify-between gap-2">
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-black shadow-[0_2px_10px_rgba(16,185,129,0.55)]">
                              <Play className="h-2.5 w-2.5 fill-current" /> Viendo
                            </span>
                            <span className="text-lg font-black leading-none text-white drop-shadow-[0_2px_4px_rgba(0,0,0,1)] sm:text-xl">
                              {inProgressPct}
                              <span className="ml-0.5 text-xs font-bold text-emerald-300">%</span>
                            </span>
                          </div>
                          <div className="h-2 w-full overflow-hidden rounded-full bg-white/25 backdrop-blur-sm">
                            <div
                              className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.9)]"
                              style={{ width: `${inProgressPct}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                </div>

                {/* Capa CLICABLE FIJA (hermana del contexto 3D, fuera del
                    preserve-3d): no se inclina ni se mueve, así el clic del botón
                    play (centrado = eje de giro) siempre se registra. */}
                <div className="pointer-events-none absolute inset-0 z-40">
                  <StreamingHoverOverlay
                    provider={primaryStreamingProvider}
                    mode="button"
                    part="hit"
                  />

                  {/* Zonas laterales CLICABLES para alternar póster↔backdrop
                      (transparentes): la parte visible (degradado + chevron) va
                      dentro del marco, integrada; aquí solo está el área de clic,
                      fija, para que siempre registre.

                      SOLO ESCRITORIO: van tras `supportsHover`, así que en táctil
                      ni se montan y la portada se queda siempre en modo póster.
                      La variante que existía para móvil (pulsar en cualquier parte
                      del póster para alternar) NO se restaura a propósito. */}
                  {supportsHover &&
                    isPosterHovered &&
                    posterViewMode === "poster" && (
                      <div
                        role="button"
                        tabIndex={0}
                        aria-label="Ver imagen de fondo"
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleCyclePoster();
                        }}
                        className="pointer-events-auto absolute inset-y-0 right-0 z-20 w-1/3 cursor-pointer"
                      />
                    )}

                  {supportsHover &&
                    isPosterHovered &&
                    posterViewMode === "preview" && (
                      <div
                        role="button"
                        tabIndex={0}
                        aria-label="Ver póster"
                        title="Ver póster"
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleCyclePoster();
                        }}
                        className="pointer-events-auto absolute inset-y-0 left-0 z-20 w-1/3 cursor-pointer"
                      />
                    )}
                </div>
              </div>
            </motion.div>

            {/* MÓVIL: el indicador conserva el mismo estado y estilo que la
                versión integrada en el póster de escritorio, pero vive debajo
                de la tarjeta, ocupando el lugar donde arrancaría la fila de
                acciones. El póster/logo NO se redimensionan por su presencia
                (ver `--details-mobile-poster-height` más arriba): al insertarse
                aquí, empuja la fila de acciones hacia abajo en flujo normal,
                hasta quedar detrás del navbar inferior flotante, que la cubre.
                `mb-6` preserva el hueco de flujo. El ajuste visual se hace en
                el propio bloque para igualar la distancia al navbar que tiene
                la fila de acciones sin progreso, sin variar el alto del póster
                ni desplazar el logo. */}
            {inProgressPct != null && (
              <div className="pointer-events-none relative -top-2 mb-6 w-full px-4 sm:hidden">
                <div className="px-3 pt-4">
                  <div className="mb-1.5 flex items-end justify-between gap-2">
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-black shadow-[0_2px_10px_rgba(16,185,129,0.55)]">
                      <Play className="h-2.5 w-2.5 fill-current" /> Viendo
                    </span>
                    <span className="text-lg font-black leading-none text-white drop-shadow-[0_2px_4px_rgba(0,0,0,1)]">
                      {inProgressPct}
                      <span className="ml-0.5 text-xs font-bold text-emerald-300">%</span>
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-white/25 backdrop-blur-sm">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.9)]"
                      style={{ width: `${inProgressPct}%` }}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Plataformas en escritorio. En móvil se colocan después de las
                acciones, dentro de la columna de información, para mantener la
                jerarquía compacta antes de los metadatos y los premios. */}
            {platformItems.length > 0 ? (
              <StaggerContainer
                className="hidden w-full flex-row flex-wrap items-center justify-center gap-3 px-1 py-1 sm:flex"
                staggerDelay={0.05}
              >
                {/* Providers - Solo si hay plataformas */}
                <div className="flex flex-row flex-nowrap items-center gap-2">
                  {platformItems.map((provider, index) => (
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
                      className="group/provider relative flex-shrink-0 cursor-pointer transform transition-transform hover:z-10 hover:scale-110 hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-yellow-400"
                    >
                      <OptimizedImage
                        src={provider.icon}
                        alt=""
                        className="w-9 h-9 lg:w-11 lg:h-11 rounded-xl shadow-lg object-contain bg-white/5"
                        onError={(e) => {
                          e.target.style.display = "none";
                        }}
                      />
                      {provider.isPlexProvider && (
                        <div className="absolute -top-1 -right-1 w-3 h-3 bg-green-500 rounded-full ring-2 ring-black" />
                      )}
                      <div className="pointer-events-none absolute top-full mt-2 left-1/2 z-[100] -translate-x-1/2 scale-95 whitespace-nowrap rounded-lg border border-white/10 bg-black/90 px-2.5 py-1 text-[10px] font-bold text-white opacity-0 shadow-xl transition-all duration-200 ease-out group-hover/provider:scale-100 group-hover/provider:opacity-100 group-hover/provider:delay-[2000ms]">
                        {provider.subtitle || provider.title}
                      </div>
                    </motion.a>
                  ))}
                </div>

                {/* Enlaces externos JUNTO a las plataformas, separados por una
                    línea vertical. Solo en modo backdrop: ahí se retiran de la
                    barra de puntuaciones (ver `externalLinks` del scoreboard)
                    para que no salgan duplicados, así que esto los mueve, no los
                    copia. En modo póster siguen viviendo en el scoreboard.
                    Se reutilizan `ToolbarSeparator` y `ExternalLinkButton`, los
                    mismos que usa el scoreboard, para que el aspecto sea idéntico. */}
                {isBackdropPoster && scoreboardExternalLinks.length > 0 && (
                  <>
                    <ToolbarSeparator className="mx-0.5" />
                    <div className="flex flex-row flex-nowrap items-center gap-2">
                      {scoreboardExternalLinks.map((link) => (
                        <ExternalLinkButton
                          key={link.key}
                          icon={link.icon}
                          title={link.title}
                          href={link.href}
                          fallbackHref={link.fallbackHref}
                        />
                      ))}
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
            <FadeIn delay={0.06} className="hidden sm:order-none sm:mb-6 sm:flex sm:flex-col sm:items-center sm:gap-0 sm:px-1 sm:text-center md:items-start md:text-left">
              {/* En MÓVIL (&lt;640) el título va como LOGO sobre la portada (ver poster
                  card); el h1 de texto se muestra de sm: en adelante. */}
              <h1 className="hidden sm:block text-4xl md:text-5xl lg:text-6xl font-black text-white leading-[1] tracking-tight text-balance drop-shadow-xl mb-3">
                {title}
              </h1>

              {headerAwardsValue && (
                <div className="order-2 mb-0 flex items-center justify-center gap-2 text-center text-xs font-bold text-emerald-300 drop-shadow-md sm:order-none sm:mb-3 sm:justify-start sm:text-left sm:text-sm">
                  <Award className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span className="line-clamp-1">{headerAwardsValue}</span>
                </div>
              )}

              <div className="order-1 w-full sm:order-none">
                <DetailsMetaGenresRow
                  yearIso={yearIso}
                  displayRuntimeValue={displayRuntimeValue}
                  status={data.status}
                  genres={data.genres}
                  hideGenresOnMobile
                />
              </div>
            </FadeIn>

            {/* =================================================================
                BARRA DE ACCIONES PRINCIPALES
               ================================================================= */}
            {/* Sección de botones de acción rápida: reproducir tráiler, marcar como visto,
                puntuar, agregar a favoritos, watchlist y listas, cambiar portada.
                En MÓVIL (&lt;640) van ANTES de premios/info (order-first), como en
                DetailModal; de sm: en adelante se mantiene el orden original. */}
            <div
              className={`order-1 sm:order-none sm:mx-0 sm:w-full ${
                inProgressPct != null
                  ? "mx-0 w-full"
                  : "-mx-1 w-[calc(100%+0.5rem)]"
              } ${
                // Debe coincidir EXACTAMENTE con la condición que añade
                // `sv-mobile-actions-reveal` más abajo. Si esta se hacía
                // visible solo con `inProgressChecked` (antes de que
                // `currentLowLoaded` also fuera true), los botones se
                // pintaban ya visibles y SIN animación (la clase de entrada
                // aún no estaba aplicada); al llegar `currentLowLoaded` un
                // instante después, esa clase se añadía de golpe y su
                // `animation` se disparaba desde cero sobre botones que YA
                // se veían -- efecto "aparecen sin imagen y un instante
                // después vuelven a aparecer con imagen".
                //
                // Con barra de progreso NO se usa `invisible`: ahí la fila la
                // oculta el revelado por scroll con su propia opacidad, y
                // `visibility` cortaría esa transición.
                mobileActionsWaitForScroll ||
                (currentLowLoaded && inProgressChecked)
                  ? ""
                  : "max-sm:invisible"
              }`}
            >
              <FadeIn delay={0.12} className="mb-4 px-1 w-full sm:mb-6">
                <div className="relative -top-2 sm:top-0">
                  <div
                    ref={mobileActionRowRef}
                    className={
                      mobileActionsWaitForScroll
                        ? // CON BARRA DE PROGRESO: la fila no entra con la
                          // portada. Antes se escondía tirando de ella hacia
                          // arriba hasta quedar TAPADA por el navbar inferior;
                          // ahora espera al primer scroll y aparece con el MISMO
                          // revelado que el marcador y las pestañas, en su sitio.
                          `${MOBILE_REVEAL_BASE} ${
                            mobileSecondaryVisible ? "" : MOBILE_REVEAL_HIDDEN
                          }`
                        : currentLowLoaded && inProgressChecked
                          ? "sv-mobile-actions-reveal"
                          : ""
                    }
                    inert={
                      isMobileViewport &&
                      mobileActionsWaitForScroll &&
                      !mobileSecondaryVisible
                    }
                  >
                  <DetailActionsRow
                mobileGapClass="gap-1.5"
                onTrailer={() => openVideo(preferredVideo)}
                trailerAvailable={!!preferredVideo}
                onSoundtrack={() => openSoundtrack()}
                soundtrackAvailable={!!soundtrackSearchQuery}
                onEpisodeRatings={
                  type === "tv"
                    ? () => setEpisodeRatingsModalOpen(true)
                    : undefined
                }
                episodeRatingsOpen={episodeRatingsModalOpen}
                trakt={{
                  connected: trakt.connected,
                  watched: watchedActionValue,
                  plays: watchedActionPlays,
                  badge: watchedActionBadge,
                  busy: !!traktBusy,
                  loading: watchedActionLoading,
                  onOpen: handleOpenTraktWatched,
                }}
                rate={{
                  rating: ratingActionValue,
                  max: 10,
                  loading: actionStateLoading || ratingLoading || !!traktBusy,
                  onRate: handleUnifiedRate,
                  connected:
                    authHydrated &&
                    (!!session || trakt.connected || hasBackendSession),
                  onConnect: () => {
                    window.location.href = `/login?next=${encodeURIComponent(
                      window.location.pathname + window.location.search,
                    )}`;
                  },
                }}
                favorite={favoriteActionValue}
                favoriteLoading={favoriteActionLoading}
                onToggleFavorite={toggleFavorite}
                watchlist={watchlistActionValue}
                watchlistLoading={watchlistActionLoading}
                onToggleWatchlist={toggleWatchlist}
                onAddToList={canUseLists ? openListsModal : undefined}
                listBusy={listsPresenceLoading}
                listActive={listActive}
                showComments={trakt.connected}
                commentsActive={myComments.length > 0}
                onComments={() => setCommentModalOpen(true)}
                  />
                  </div>
                </div>
            </FadeIn>
          </div>

            {/* MÓVIL: los metadatos viven en pestañas tras el marcador, sin una
                segunda fila de plataformas/estado/premios fuera de la jerarquía
                informativa. */}
            <FadeIn
              delay={0.04}
              duration={0.32}
              className="order-3 mb-2 w-full sm:hidden"
            >
              {/* El revelado por posición va en una capa PROPIA, por dentro del
                  FadeIn: así la animación de entrada de la ficha (que escribe
                  opacidad en línea) y este revelado no se pisan, cada uno anima
                  su propio elemento. Comparte señal con el marcador para que
                  ambos aparezcan y desaparezcan como una sola pieza. */}
              <div
                className={`${MOBILE_REVEAL_BASE} ${
                  mobileSecondaryVisible
                    ? "max-sm:will-change-[opacity,transform]"
                    : MOBILE_REVEAL_HIDDEN
                }`}
                inert={isMobileViewport && !mobileSecondaryVisible}
                aria-hidden={
                  isMobileViewport && !mobileSecondaryVisible ? true : undefined
                }
              >
              <DetailsInfoTabs
                key={`detailsTabMobile-${id}`}
                variant={isBackdropPoster ? "backdrop" : "normal"}
                layoutId="detailsTabMobile"
                mobileLayout
                mediaType={type}
                originalTitle={
                  type === "movie" ? data.original_title : data.original_name
                }
                formatValue={
                  type === "movie"
                    ? displayRuntimeValue || "—"
                    : seasonEpisodeValue || "—"
                }
                durationValue={
                  type === "tv" ? episodeRuntimeFormatValue || "—" : null
                }
                releaseDateValue={releaseDateValue}
                lastAirDateValue={lastAirDateValue}
                status={data.status}
                budgetValue={budgetValue}
                revenueValue={revenueValue}
                director={movieDirector}
                creators={createdByNames}
                network={network}
                productionText={production}
                tagline={data.tagline}
                overview={data.overview}
                awardsValue={headerAwardsValue}
                showAwardsTab={false}
                genres={data.genres}
                platforms={platformItems}
                platformLinks={
                  isBackdropPoster ? scoreboardExternalLinks : []
                }
              />
              </div>
            </FadeIn>

            {/* =================================================================
                PANEL DE PUNTUACIONES Y ESTADÍSTICAS
               ================================================================= */}
            {/* Tarjeta compacta que muestra los ratings de diferentes plataformas
                (TMDb, Trakt, IMDb, Rotten Tomatoes, Metacritic) y estadísticas
                de visualización (watchers, plays, lists, favorited) */}
              {/* Panel de puntuaciones + barra de acciones (ratings, enlaces
                  externos y compartir) + estadísticas. Componente presentacional
                  compartido con DetailModal para que se vean IDÉNTICOS. */}
            <div className={`order-2 sm:order-none ${isBackdropPoster ? "" : "mb-6"}`}>
              <span
                ref={mobileSecondaryTriggerRef}
                aria-hidden="true"
                className="block h-px sm:hidden"
              />
              <div
                className={`${MOBILE_REVEAL_BASE} ${
                  mobileSecondaryVisible
                    ? "max-sm:will-change-[opacity,transform]"
                    : MOBILE_REVEAL_HIDDEN
                }`}
                inert={isMobileViewport && !mobileSecondaryVisible}
                aria-hidden={
                  isMobileViewport && !mobileSecondaryVisible
                    ? true
                    : undefined
                }
              >
                <DetailsScoreboardPanel
                loading={tScoreboard.loading}
                tmdb={{
                  value:
                    typeof data.vote_average === "number" &&
                    data.vote_average > 0
                      ? data.vote_average.toFixed(1)
                      : null,
                  sub: data.vote_count
                    ? formatCountShort(data.vote_count)
                    : undefined,
                  href: buildTmdbHref({ href: tmdbDetailUrl, type, tmdbId: id }),
                }}
                // Trakt mantiene enlace canónico/búsqueda; el badge se oculta
                // mientras la nota está pendiente y muestra "-" solo al resolverse
                // sin puntuación.
                // Se unifica con el antiguo `traktPublic` (que iba sin enlace).
                trakt={{
                  value:
                    traktDecimal ??
                    (tScoreboard.loading ? undefined : null),
                  sub: tScoreboard.votes
                    ? formatCountShort(tScoreboard.votes)
                    : undefined,
                  href: buildTraktHref({
                    href: tScoreboard?.traktUrl || trakt?.traktUrl,
                    title,
                  }),
                  pending: tScoreboard.loading && traktDecimal == null,
                }}
                traktPublic={null}
                // IMDb SIEMPRE visible con enlace (directo por id, o búsqueda por
                // título si aún no se resolvió el id de IMDb).
                imdb={{
                  value:
                    extras.imdbRating != null
                      ? Number(extras.imdbRating).toFixed(1)
                      : externalScoresLoading
                        ? undefined
                        : null,
                  sub: extras.imdbRating != null
                    ? formatCountShort(extras.imdbVotes)
                    : undefined,
                  href: buildImdbHref({ imdbId: resolvedImdbId, title }),
                  pending:
                    externalScoresLoading && extras.imdbRating == null,
                }}
                rt={
                  tScoreboard?.external?.rtAudience != null ||
                  extras.rtScore != null
                    ? {
                        value:
                          tScoreboard?.external?.rtAudience != null
                            ? Math.round(tScoreboard.external.rtAudience)
                            : extras.rtScore != null
                              ? Math.round(extras.rtScore)
                              : null,
                      }
                    : null
                }
                mc={
                  extras.mcScore != null
                    ? { value: Math.round(extras.mcScore) }
                    : null
                }
                // En modo backdrop los enlaces se muestran junto a las
                // plataformas (bajo la portada), así que aquí se omiten para no
                // duplicarlos. En modo póster siguen aquí, como siempre.
                externalLinks={isBackdropPoster ? null : scoreboardExternalLinks}
                onMoreLinks={() => setExternalLinksOpen(true)}
                share={{
                  title,
                  text: `Echa un vistazo a ${title} en The Show Verse`,
                }}
                stats={tScoreboard?.stats}
                />
              </div>
            </div>

            {/* =================================================================
                CONTENEDOR DE TABS Y CONTENIDO - Información detallada
               ================================================================= */}
            {/* Sistema de tabs para mostrar información adicional: Detalles, Producción y Sinopsis */}
            {/* Solo visible cuando NO estamos en modo backdrop (en ese modo se muestra más abajo) */}
            {!isBackdropPoster && (
              <FadeIn delay={0.24} className="hidden sm:block sm:order-none">
                <div>
                  {/* Sección de pestañas compartida con DetailModal (misma tarjetas).
                      variant="normal": Presupuesto/Recaudación/Canal con fallback "—"
                      y tagline con comillas tipográficas. */}
                  <DetailsInfoTabs
                    key={id}
                    variant="normal"
                    layoutId="detailsTabInline"
                    mediaType={type}
                    originalTitle={
                      type === "movie"
                        ? data.original_title
                        : data.original_name
                    }
                    formatValue={
                      type === "tv" ? episodeRuntimeFormatValue || "—" : "—"
                    }
                    releaseDateValue={releaseDateValue}
                    status={data.status}
                    lastAirDateValue={lastAirDateValue}
                    budgetValue={budgetValue}
                    revenueValue={revenueValue}
                    director={movieDirector}
                    creators={createdByNames}
                    network={network}
                    productionText={production}
                    tagline={data.tagline}
                    overview={data.overview}
                    awards={extras.awards}
                    awardItems={awardItems}
                    showAwardsTab={false}
                    genres={data.genres}
                  />
                </div>
              </FadeIn>
            )}
          </div>
        </motion.div>

        {/* Tabs y contenido debajo de la tarjeta (solo cuando es backdrop) */}
        {isBackdropPoster && (
          <FadeIn delay={0.24} className="mt-8 hidden w-full sm:block lg:mt-6">
            {/* Sección de pestañas compartida con DetailModal (mismas tarjetas).
                variant="backdrop": Presupuesto/Recaudación/Canal solo si hay valor
                y tagline con comillas rectas. */}
            <div>
              <DetailsInfoTabs
              key={id}
              variant="backdrop"
              layoutId="detailsTabBackdrop"
              mediaType={type}
              originalTitle={
                type === "movie" ? data.original_title : data.original_name
              }
              formatValue={
                type === "tv" ? episodeRuntimeFormatValue || "—" : "—"
              }
              releaseDateValue={releaseDateValue}
              status={data.status}
              lastAirDateValue={lastAirDateValue}
              budgetValue={budgetValue}
              revenueValue={revenueValue}
              director={movieDirector}
              creators={createdByNames}
              network={network}
              productionText={production}
              tagline={data.tagline}
              overview={data.overview}
              awards={extras.awards}
              awardItems={awardItems}
              showAwardsTab={false}
              genres={data.genres}
            />
          </div>
        </FadeIn>
      )}

        {/* =================================================================
            MENÚ DE NAVEGACIÓN STICKY Y SECCIONES DE CONTENIDO
           ================================================================= */}
        {/* Sistema de navegación por secciones con detección de scroll */}
        {/* Incluye: Media, Actores, Recomendaciones, Comentarios, etc. */}
        <div className="mt-2 sm:mt-10">
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
          <div className="mt-14 space-y-14">
            <section
              id="section-cast"
              ref={registerSection("cast")}
            >
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
                              className="block group relative bg-zinc-900 rounded-xl overflow-hidden shadow-md lg:hover:shadow-yellow-900/20 transition-all duration-300 after:pointer-events-none after:absolute after:inset-0 after:z-30 after:rounded-[inherit] after:content-[''] after:transition-shadow after:duration-300 hover:after:shadow-[inset_0_0_0_2.5px_rgba(234,179,8,0.95)]"
                            >
                              <div className="aspect-[2/3] overflow-hidden relative">
                                {actor.profile_path ? (
                                  <OptimizedImage
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
                        {recommendations.slice(0, 15).map((rec) => {
                          const recTitle = rec.title || rec.name;
                          const recType =
                            rec.media_type === "movie" ||
                            rec.media_type === "tv"
                              ? rec.media_type
                              : type === "tv"
                                ? "tv"
                                : "movie";
                          const recAccountState =
                            recAccountStates[`${recType}:${rec.id}`] || null;
                          const recViewerState =
                            recommendationViewerStates[
                              titleStateKey({
                                tmdbId: rec.id,
                                mediaType: recType,
                              })
                            ] || null;
                          const recIsFavorite = Boolean(
                            recViewerState?.favorite || recAccountState?.favorite,
                          );
                          const recIsWatchlist = Boolean(
                            recViewerState?.watchlist || recAccountState?.watchlist,
                          );
                          const recRating =
                            recViewerState?.rating ?? recAccountState?.rating;
                          const recUserRating =
                            typeof recRating === "number" &&
                            Number.isFinite(recRating) &&
                            recRating > 0
                              ? recRating
                              : null;
                          const recImdbRating =
                            recImdbRatings[`${recType}:${rec.id}`] ?? null;
                          const prefetchRecommendationHoverData = () => {
                            void prefetchRecAccountState(rec);
                            if (!recIsFavorite) {
                              void prefetchRecImdbRating(rec, recType);
                            }
                          };

                          // En móvil, deshabilitar hover para mostrar solo las imágenes
                          const enableHover =
                            supportsHover && !isMobileViewport;
                          const recCardClass = enableHover
                            ? "block group relative bg-zinc-900 rounded-xl overflow-hidden shadow-md lg:hover:shadow-yellow-900/20 transition-all duration-300 after:pointer-events-none after:absolute after:inset-0 after:z-30 after:rounded-[inherit] after:content-[''] after:transition-shadow after:duration-300 hover:after:shadow-[inset_0_0_0_2.5px_rgba(234,179,8,0.95)]"
                            : "block relative bg-zinc-900 rounded-xl overflow-hidden shadow-md";
                          const recImageClass = enableHover
                            ? "w-full h-full object-cover transition-transform duration-500 ease-out group-hover:scale-110"
                            : "w-full h-full object-cover";

                          return (
                            <SwiperSlide key={rec.id}>
                              <Link
                                href={`/details/${rec.media_type || type}/${rec.id}`}
                                className={recCardClass}
                                onMouseEnter={
                                  enableHover
                                    ? prefetchRecommendationHoverData
                                    : undefined
                                }
                                onFocus={
                                  enableHover
                                    ? prefetchRecommendationHoverData
                                    : undefined
                                }
                              >
                                <div className="aspect-[2/3] overflow-hidden relative">
                                  <OptimizedImage
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
                                  <RecommendationHoverIndicator
                                    favorite={recIsFavorite}
                                    watchlist={recIsWatchlist}
                                    userRating={recUserRating}
                                    tmdbRating={rec.vote_average}
                                    imdbRating={recImdbRating}
                                  />
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
                    <Link
                      href={`/lists/collection/${collectionId}`}
                      className="group/collection-title flex items-center gap-3 sm:gap-4 mb-8 w-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-yellow-400"
                      aria-label="Ver detalles de la colección"
                    >
                      <div className="relative flex items-center justify-center w-11 h-11 sm:w-12 sm:h-12 rounded-[14px] bg-yellow-500/5 backdrop-blur-2xl shadow-[0_4px_24px_rgba(234,179,8,0.12)] shrink-0 overflow-hidden group-hover/section:bg-yellow-500/10 group-hover/section:shadow-[0_8px_32px_rgba(234,179,8,0.2)] transition-all duration-500">
                        <div className="absolute inset-0 bg-gradient-to-br from-yellow-400/20 via-transparent to-transparent opacity-60" />
                        <div className="absolute inset-0 shadow-[inset_0_1px_2px_rgba(255,255,255,0.15),inset_0_-1px_2px_rgba(0,0,0,0.2)] rounded-[14px] pointer-events-none" />
                        <Layers className="relative z-10 w-5 h-5 sm:w-6 sm:h-6 text-yellow-500 group-hover/section:text-yellow-400 group-hover/section:scale-110 transition-all duration-500 drop-shadow-[0_2px_8px_rgba(234,179,8,0.4)]" />
                      </div>
                      <h2 className="text-2xl sm:text-[28px] font-black tracking-tight text-white drop-shadow-md shrink-0 flex items-center">
                        Colección
                        <ChevronRight className="ml-1 sm:ml-2 h-6 w-6 sm:h-7 sm:w-7 text-yellow-500/70 transition-transform duration-300 group-hover/section:translate-x-1 group-hover/section:text-yellow-400 group-focus-visible/collection-title:translate-x-1 group-focus-visible/collection-title:text-yellow-400" />
                      </h2>
                      <div className="ml-2 sm:ml-4 flex-1 h-px bg-gradient-to-r from-white/20 via-white/5 to-transparent relative flex items-center">
                        <div className="absolute left-0 w-2 h-2 rounded-full bg-yellow-500 shadow-[0_0_12px_rgba(234,179,8,1)] opacity-40 group-hover/section:opacity-100 group-hover/section:scale-150 transition-all duration-500" />
                        <div className="absolute left-0 w-16 sm:w-24 h-[2px] bg-gradient-to-r from-yellow-500 to-transparent opacity-0 group-hover/section:opacity-100 transition-opacity duration-500" />
                      </div>
                    </Link>

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
                          const colAccountState =
                            recAccountStates[`movie:${m.id}`] || null;
                          const colViewerState =
                            collectionViewerStates[
                              titleStateKey({ tmdbId: m.id, mediaType: "movie" })
                            ] || null;
                          const colIsFavorite = Boolean(
                            colViewerState?.favorite || colAccountState?.favorite,
                          );
                          const colIsWatchlist = Boolean(
                            colViewerState?.watchlist || colAccountState?.watchlist,
                          );
                          const colRating =
                            colViewerState?.rating ?? colAccountState?.rating;
                          const colUserRating =
                            typeof colRating === "number" &&
                            Number.isFinite(colRating) &&
                            colRating > 0
                              ? colRating
                              : null;
                          const colImdbRating =
                            recImdbRatings[`movie:${m.id}`] ?? null;
                          const prefetchCollectionHoverData = () => {
                            void prefetchRecAccountState(m);
                            if (!colIsFavorite) {
                              void prefetchRecImdbRating(m, "movie");
                            }
                          };
                          const enableHover =
                            supportsHover && !isMobileViewport;
                          const colCardClass = enableHover
                            ? "block group relative bg-zinc-900 rounded-xl overflow-hidden shadow-md lg:hover:shadow-yellow-900/20 transition-all duration-300 after:pointer-events-none after:absolute after:inset-0 after:z-30 after:rounded-[inherit] after:content-[''] after:transition-shadow after:duration-300 hover:after:shadow-[inset_0_0_0_2.5px_rgba(234,179,8,0.95)]"
                            : "block relative bg-zinc-900 rounded-xl overflow-hidden shadow-md";
                          const colImageClass = enableHover
                            ? "w-full h-full object-cover transition-transform duration-500 ease-out group-hover:scale-110"
                            : "w-full h-full object-cover";

                          return (
                            <SwiperSlide key={m.id}>
                              <Link
                                href={`/details/movie/${m.id}`}
                                className={colCardClass}
                                aria-label={m.title}
                                onMouseEnter={
                                  enableHover
                                    ? prefetchCollectionHoverData
                                    : undefined
                                }
                                onFocus={
                                  enableHover
                                    ? prefetchCollectionHoverData
                                    : undefined
                                }
                              >
                                <div className="aspect-[2/3] overflow-hidden relative">
                                  {m.poster_path ? (
                                    <OptimizedImage
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

                                  <RecommendationHoverIndicator
                                    favorite={colIsFavorite}
                                    watchlist={colIsWatchlist}
                                    userRating={colUserRating}
                                    tmdbRating={m.vote_average}
                                    imdbRating={colImdbRating}
                                  />
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

            {/* SECCIÓN: PREMIOS. Va después de Reparto → Recomendaciones →
                Colección. Se había eliminado su render (el commit db0a685) pero
                se dejaron intactos los datos (awardItems), los helpers y el
                componente AwardCard, así que aquí solo se restaura el JSX.
                Gate: mismos flags progresivos que el resto (aparece cuando la
                Colección ya resolvió) + que existan premios que mostrar. */}
            {canRenderLowerPrioritySections && awardItems.length > 0 && (
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
                      className="pb-8 !overflow-visible"
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
                                  ? "relative before:absolute before:-left-2.5 before:top-3 before:bottom-3 before:w-px before:bg-white/10"
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
                            className="!mb-5 sm:!mb-8 !w-auto flex-1 min-w-0 pr-4 sm:pr-6"
                          />

                          {/* ========== Controles de Filtrado ========== */}
                          {/* Desktop: Tabs + Filtros en línea | Móvil: Botón que abre modal */}
                          <div className="self-start shrink-0 flex items-center gap-2 sm:gap-3 h-10 md:h-11">
                            {/* VERSIÓN DESKTOP: Tabs y filtros visibles */}
                            <div className="hidden sm:flex items-center gap-3 flex-wrap justify-end h-10 md:h-11">
                              {/* Tabs de tipo de imagen: Portada, Vista previa, Fondo y Logo */}
                              <div className="flex isolate transform-gpu items-center rounded-xl p-1 w-fit h-10 md:h-11 bg-black/20 bg-gradient-to-br from-white/10 via-white/5 to-black/40 backdrop-blur-[50px] shadow-[0_10px_30px_-10px_rgba(0,0,0,0.5)]">
                                {["posters", "backdrops", "background", "logos"].map(
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
                                          : tab === "background"
                                            ? "Fondo"
                                            : "Logo"}
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
                              {activeImagesTab !== "background" &&
                                activeImagesTab !== "backdrops" && (
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
                                {/* En móvil se editan exactamente las dos capas del hero:
                                    póster neutro y logo. */}
                                <div className="flex flex-wrap items-center gap-2">
                                  {/* Las etiquetas hacen explícita la categoría seleccionable,
                                      además de conservar su icono visual. */}
                                  <div className="flex isolate transform-gpu rounded-xl p-1 h-10 items-center bg-black/20 bg-gradient-to-br from-white/10 via-white/5 to-black/40 backdrop-blur-[50px] shadow-[0_10px_30px_-10px_rgba(0,0,0,0.5)]">
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setActiveImagesTab("posters")
                                      }
                                      className={`px-2.5 h-full rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                                        activeImagesTab === "posters"
                                          ? "bg-white/10 text-white shadow-md"
                                          : "text-zinc-400 hover:text-white hover:bg-white/10"
                                      }`}
                                      style={{
                                        WebkitTapHighlightColor: "transparent",
                                      }}
                                      aria-label="Portada"
                                      aria-pressed={activeImagesTab === "posters"}
                                    >
                                      <ImageIcon className="w-4 h-4" />
                                      <span className="text-xs font-semibold">Portada</span>
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setActiveImagesTab("logos")
                                      }
                                      className={`px-2.5 h-full rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                                        activeImagesTab === "logos"
                                          ? "bg-white/10 text-white shadow-md"
                                          : "text-zinc-400 hover:text-white hover:bg-white/10"
                                      }`}
                                      style={{
                                        WebkitTapHighlightColor: "transparent",
                                      }}
                                      aria-label="Logo"
                                      aria-pressed={activeImagesTab === "logos"}
                                    >
                                      <Sparkles className="w-4 h-4" />
                                      <span className="text-xs font-semibold">Logo</span>
                                    </button>
                                  </div>

                                  {/* Resolución móvil - más compacto */}
                                  <div
                                    ref={resMenuRef}
                                    className="relative min-w-[6.25rem] flex-1"
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

                                  {/* Los logos sí tienen variantes localizadas; el póster
                                      móvil se mantiene neutro y no necesita este filtro. */}
                                  {activeImagesTab === "logos" && (
                                    <div
                                      className="flex isolate transform-gpu rounded-xl p-1 h-10 items-center bg-black/20 bg-gradient-to-br from-white/10 via-white/5 to-black/40 backdrop-blur-[50px] shadow-[0_10px_30px_-10px_rgba(0,0,0,0.5)]"
                                      aria-label="Idioma de los logos"
                                    >
                                      <button
                                        type="button"
                                        onClick={() => setLangES((value) => !value)}
                                        className={`px-3 h-full rounded-lg text-xs font-medium transition-all flex items-center justify-center ${
                                          langES
                                            ? "bg-white/10 text-white shadow-md"
                                            : "text-zinc-400 hover:text-white hover:bg-white/10"
                                        }`}
                                        style={{
                                          WebkitTapHighlightColor: "transparent",
                                        }}
                                        aria-label="Mostrar logos en español"
                                        aria-pressed={langES}
                                      >
                                        ES
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => setLangEN((value) => !value)}
                                        className={`px-3 h-full rounded-lg text-xs font-medium transition-all flex items-center justify-center ${
                                          langEN
                                            ? "bg-white/10 text-white shadow-md"
                                            : "text-zinc-400 hover:text-white hover:bg-white/10"
                                        }`}
                                        style={{
                                          WebkitTapHighlightColor: "transparent",
                                        }}
                                        aria-label="Mostrar logos en inglés"
                                        aria-pressed={langEN}
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
                            isMobilePosterTab,
                            isLogoTab,
                            isBackdropTab,
                            aspect,
                            size,
                            activePath,
                          } = artworkSelection;

                          // 2 en móvil y 4 en escritorio para imágenes apaisadas
                          // (vista previa, fondo y logos).
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
                                      className={`w-full overflow-hidden rounded-xl bg-zinc-900 shadow-md animate-pulse ${aspect}`}
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
                                      ? `${isMobilePosterTab ? "Portada sin idioma" : "Portada"} de ${title}`
                                      : isLogoTab
                                        ? `Logo de ${title}`
                                      : isBackdropTab
                                        ? `Vista previa de ${title}`
                                        : `Fondo de ${title}`;

                                    const imgSrc = `https://image.tmdb.org/t/p/${size}${filePath}`;
                                    const imgSrcSet = isPoster
                                      ? `https://image.tmdb.org/t/p/w185${filePath} 185w, https://image.tmdb.org/t/p/w342${filePath} 342w, https://image.tmdb.org/t/p/w500${filePath} 500w`
                                      : isLogoTab
                                        ? `https://image.tmdb.org/t/p/w185${filePath} 185w, https://image.tmdb.org/t/p/w500${filePath} 500w, https://image.tmdb.org/t/p/original${filePath} 1000w`
                                      : `https://image.tmdb.org/t/p/w300${filePath} 300w, https://image.tmdb.org/t/p/w780${filePath} 780w, https://image.tmdb.org/t/p/w1280${filePath} 1280w`;
                                    const imgSizes = isPoster
                                      ? "(max-width: 640px) 32vw, (max-width: 1024px) 20vw, 140px"
                                      : isLogoTab
                                        ? "(max-width: 640px) 50vw, (max-width: 1024px) 30vw, 240px"
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
                                            if (isLogoTab) {
                                              handleSelectLogo(filePath);
                                            } else if (isMobilePosterTab) {
                                              handleSelectMobilePoster(filePath);
                                            } else if (activeImagesTab === "posters")
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
                                              if (isLogoTab) {
                                                handleSelectLogo(filePath);
                                              } else if (isMobilePosterTab) {
                                                handleSelectMobilePoster(filePath);
                                              } else if (activeImagesTab === "posters")
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
                                          // Solo la tarjeta seleccionada dibuja su borde verde. Las
                                          // demás permanecen limpias, incluso al hacer hover.
                                          className={`group relative w-full rounded-xl overflow-hidden bg-zinc-900 shadow-md cursor-pointer
                        transition-all duration-300 transform-gpu hover:-translate-y-1
                        after:pointer-events-none after:absolute after:inset-0 after:z-30 after:rounded-[inherit] after:content-[''] after:transition-shadow after:duration-300
                        ${
                          isActive
                            ? "shadow-[0_0_12px_rgba(16,185,129,0.35)] after:shadow-[inset_0_0_0_2px_rgba(52,211,153,1)] hover:shadow-[0_0_16px_rgba(16,185,129,0.45)]"
                            : "hover:shadow-yellow-900/20"
                        }`}
                                          aria-label="Seleccionar"
                                          style={{
                                            WebkitTapHighlightColor:
                                              "transparent",
                                          }}
                                        >
                                          <div
                                            className={`relative w-full overflow-hidden ${aspect} ${isLogoTab ? "bg-gradient-to-br from-white/10 via-black/50 to-black/70 p-4" : "bg-black/40"}`}
                                          >
                                            <OptimizedImage
                                              src={imgSrc}
                                              srcSet={imgSrcSet}
                                              sizes={imgSizes}
                                              alt={imgAlt}
                                              loading={
                                                isPriority ? "eager" : "lazy"
                                              }
                                              fetchPriority={
                                                isPriority ? "high" : undefined
                                              }
                                              decoding="async"
                                              className={`w-full h-full ${isLogoTab ? "object-contain" : "object-cover"} transition-transform duration-500 ease-out transform-gpu
                            group-hover:scale-[1.08]`}
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
                                            className="group/link absolute bottom-0 right-0 z-20 p-2 sm:p-2.5 rounded-tl-xl border-l border-t backdrop-blur-md shadow-sm transition-all duration-300 ease-out transform-gpu origin-bottom-right scale-0 opacity-0 group-hover:scale-100 group-hover:opacity-100 bg-black/40 border-white/10 text-zinc-300 hover:bg-white/20 hover:text-white"
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
                                  className="relative isolate overflow-hidden rounded-2xl border border-transparent bg-black/20 bg-gradient-to-br from-white/10 via-transparent to-black/40 backdrop-blur-lg shadow-lg transform-gpu animate-pulse sm:border-white/5"
                                  aria-hidden="true"
                                >
                                  <div className="relative z-10 aspect-video bg-white/5">
                                    <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent" />
                                    <div className="absolute inset-0 flex items-center justify-center">
                                      <div className="w-14 h-14 rounded-full bg-yellow-400/10 border border-yellow-300/10" />
                                    </div>
                                  </div>

                                  <div className="relative z-10 flex flex-col shrink-0 h-[120px] p-4 w-full">
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
                                      className="relative isolate w-full h-full text-left flex flex-col rounded-2xl overflow-hidden bg-black/20 bg-gradient-to-br from-white/10 via-transparent to-black/40 backdrop-blur-lg shadow-lg transform-gpu transition-all group after:pointer-events-none after:absolute after:inset-0 after:z-30 after:rounded-[inherit] after:content-[''] after:transition-shadow after:duration-300 hover:after:shadow-[inset_0_0_0_2.5px_rgba(234,179,8,0.95)]"
                                    >
                                      <div className="relative z-10 aspect-video overflow-hidden">
                                        <OptimizedImage
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

                                      <div className="relative z-10 flex flex-col shrink-0 h-[120px] p-4 items-start w-full">
                                        {/* Titulo arriba (1 linea siempre) */}
                                        <div className="w-full min-h-[22px]">
                                          <div className="font-bold text-white leading-snug text-sm sm:text-[16px] line-clamp-1 truncate">
                                            {v.name || "Vídeo"}
                                          </div>
                                        </div>

                                        {/* Propiedades debajo, alineadas a la izquierda */}
                                        <div className="mt-2 flex items-center gap-3 w-full overflow-hidden">
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
                                        <div className="mt-2 pt-0 text-xs text-zinc-400 flex items-center gap-2">
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
                                  className="relative isolate overflow-hidden rounded-2xl border border-transparent bg-black/20 bg-gradient-to-br from-white/10 via-transparent to-black/40 backdrop-blur-lg shadow-lg transform-gpu animate-pulse sm:border-white/5"
                                  aria-hidden="true"
                                >
                                  <div className="relative z-10 aspect-square bg-white/5">
                                    <div className="absolute inset-0 flex items-center justify-center">
                                      <div className="w-14 h-14 rounded-full bg-yellow-400/10 border border-yellow-300/10" />
                                    </div>
                                  </div>
                                  <div className="relative z-10 flex flex-col shrink-0 h-[144px] p-4 w-full">
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
                              // Sin borde en reposo, igual que las tarjetas de pista
                              // de al lado. Sin anillo de hover: no es interactivo.
                              <div className="relative isolate overflow-hidden rounded-2xl bg-black/20 bg-gradient-to-br from-white/10 via-transparent to-black/40 backdrop-blur-lg shadow-lg transform-gpu p-5 text-sm text-zinc-400">
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
                                      className="relative isolate w-full h-full text-left flex flex-col rounded-2xl overflow-hidden bg-black/20 bg-gradient-to-br from-white/10 via-transparent to-black/40 backdrop-blur-lg shadow-lg transform-gpu transition-all group after:pointer-events-none after:absolute after:inset-0 after:z-30 after:rounded-[inherit] after:content-[''] after:transition-shadow after:duration-300 hover:after:shadow-[inset_0_0_0_2.5px_rgba(234,179,8,0.95)]"
                                    >
                                      <div className="relative z-10 aspect-square overflow-hidden bg-black/40">
                                        {/* Fondo desenfocado para rellenar los bordes de la portada cuadrada */}
                                        <OptimizedImage
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
                                        <OptimizedImage
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

                                      <div className="relative z-10 flex flex-col shrink-0 h-[144px] p-4 items-start w-full overflow-hidden">
                                        <div className="w-full h-[40px] sm:h-[44px] mb-1">
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

                                        <div className="mt-2 flex items-center gap-3 w-full overflow-hidden pb-1">
                                          <span
                                            className={`shrink-0 whitespace-nowrap inline-flex items-center gap-1.5 text-[9px] sm:text-[10px] font-black uppercase tracking-widest ${sourceBadge.textClass}`}
                                          >
                                            <span
                                              className={`w-1.5 h-1.5 rounded-full ${sourceBadge.dotClass}`}
                                            />
                                            {sourceBadge.label}
                                          </span>
                                        </div>

                                        <div className="mt-2 pt-0 text-xs text-zinc-400 flex items-center gap-2 w-full overflow-hidden">
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
                                <OptimizedImage
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
                              <div className="relative isolate overflow-hidden rounded-2xl border border-transparent bg-gradient-to-br from-emerald-500/10 via-transparent to-transparent backdrop-blur-md shadow-sm transform-gpu p-5 sm:border-emerald-500/5">
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
                              <div className="relative isolate overflow-hidden rounded-2xl border border-transparent bg-gradient-to-br from-rose-500/10 via-transparent to-transparent backdrop-blur-md shadow-sm transform-gpu p-5 sm:border-rose-500/5">
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
                              const rating = seriesGraphStructuresMismatch
                                ? seriesGraphRating
                                : (imdbRating ?? seriesGraphRating);
                              const imdbSeasonUrl = resolvedImdbId
                                ? `https://www.imdb.com/title/${resolvedImdbId}/episodes/?season=${sn}`
                                : null;

                              // Lógica de progreso (usa TMDb para saber total)
                              const tmdbSeason = (data?.seasons || []).find(
                                (x) => Number(x?.season_number) === sn,
                              );
                              const totalEp =
                                Number(tmdbSeason?.episode_count || 0) || null;
                              const watchedEp = getWatchedEpisodeCountForSeason(
                                watchedBySeason,
                                sn,
                                totalEp || 0,
                              );
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
                                  className="group relative isolate overflow-hidden rounded-2xl bg-black/20 bg-gradient-to-br from-white/10 via-transparent to-transparent backdrop-blur-lg shadow-lg transform-gpu transition-all hover:-translate-y-1 hover:bg-white/5 hover:shadow-2xl after:pointer-events-none after:absolute after:inset-0 after:z-30 after:rounded-[inherit] after:content-[''] after:transition-shadow after:duration-300 hover:after:shadow-[inset_0_0_0_2.5px_rgba(234,179,8,0.95)] text-left w-full"
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
                            icon={BarChart3}
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
                        <SectionTitle
                          title="Críticas de Usuarios"
                          icon={MessageSquareIcon}
                        />

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          {reviews.slice(0, 2).map((r) => {
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
                                  <OptimizedImage
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
                              const commentUsername = String(
                                user?.username || "",
                              ).trim();
                              const profileUsername = commentProfileUsernames.get(
                                commentUsername.toLowerCase(),
                              );
                              const authorName =
                                user?.name || user?.username || "Usuario";

                              return (
                                <div
                                  key={String(
                                    c?.id || `${user?.username}-${created}`,
                                  )}
                                  className="group relative flex gap-4 rounded-2xl border border-transparent bg-white/5 p-5 transition-all hover:bg-white/10 hover:border-white/5 shadow-sm"
                                >
                                  {/* Avatar */}
                                  <div className="shrink-0">
                                    <OptimizedImage
                                      src={avatar}
                                      alt={user?.username}
                                      className="h-12 w-12 rounded-full object-cover shadow-lg ring-2 ring-white/10 transition group-hover:ring-white/20"
                                    />
                                  </div>

                                  {/* Content */}
                                  <div className="min-w-0 flex-1">
                                    <div className="mb-1 flex items-baseline justify-between gap-2">
                                      <div className="flex items-center gap-2">
                                        {profileUsername ? (
                                          <Link
                                            href={`/u/${encodeURIComponent(profileUsername)}`}
                                            className="font-bold text-white transition-colors hover:text-emerald-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/80 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-900"
                                          >
                                            {authorName}
                                          </Link>
                                        ) : (
                                          <span className="font-bold text-white">
                                            {authorName}
                                          </span>
                                        )}
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
                              const listId = list?.id || null;

                              // Ruta interna: el detalle de listas de la comunidad
                              // se sirve por el uuid interno desde nuestra BBDD.
                              const internalUrl = listId
                                ? `/lists/community/${encodeURIComponent(String(listId))}`
                                : null;

                              const avatar =
                                user?.images?.avatar?.full ||
                                `https://ui-avatars.com/api/?name=${encodeURIComponent(username || "user")}&background=random`;

                              const disabled = !internalUrl;

                              return (
                                <Link
                                  key={String(
                                    listId || `${username}-${name}` || name,
                                  )}
                                  href={internalUrl || "#"}
                                  aria-disabled={disabled}
                                  className={[
                                    // Conserva su acento índigo propio (no el amarillo
                                    // de la ficha): aquí solo cambia la CALIDAD del
                                    // borde, no el color que ya tenía.
                                    "group relative isolate flex flex-col overflow-hidden rounded-3xl bg-black/20 bg-gradient-to-br from-white/10 via-transparent to-transparent backdrop-blur-lg shadow-lg transform-gpu transition-all duration-500",
                                    "after:pointer-events-none after:absolute after:inset-0 after:z-30 after:rounded-[inherit] after:content-[''] after:transition-shadow after:duration-300 hover:after:shadow-[inset_0_0_0_2.5px_rgba(99,102,241,0.95)]",
                                    "hover:bg-white/5",
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
                                        <OptimizedImage
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
      {modalHostReady
        ? createPortal(detailsModalLayer, document.body)
        : detailsModalLayer}
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
