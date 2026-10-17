// ActorDetails.jsx
"use client";

import OptimizedImage from "@/components/OptimizedImage";
import {
  Children,
  createElement,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  useRef,
} from "react";
import Link from "next/link";
import { Swiper, SwiperSlide } from "swiper/react";
import { FreeMode } from "swiper/modules";
import "swiper/swiper-bundle.css";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  Award,
  CheckCircle2,
  ExternalLink,
  Film,
  Link2,
  Share2,
  Check,
  Tv as TvIcon,
  User,
  Cake,
  Skull,
  Briefcase,
  Star,
  Search,
  SlidersHorizontal,
  Images,
  Tags,
  Trophy,
  X,
  ChevronDown,
  Calendar,
  Ruler,
  MapPin,
} from "lucide-react";
import {
  AnimatedSection,
  FadeIn,
} from "@/components/details/AnimatedSection";
import { useShareAction } from "@/components/details/DetailHeaderBits";
import {
  LIST_DETAILS_ACTION_ROW_CLASS,
  ListDetailsActionButton,
} from "@/components/lists/ListDetailsActionRow";
import ExternalLinksModal from "@/components/details/ExternalLinksModal";
import { buildActorShare } from "@/lib/actor/shareActor";
import DetailsSectionMenu from "./DetailsSectionMenu";
import DetailsInfoTabs from "@/components/details/DetailsInfoTabs";
import useDetailsStickyTop from "@/hooks/useDetailsStickyTop";
import { careerRange, formatCareerRange } from "@/lib/actor/careerRange";
import MobileFiltersPanel from "@/components/ui/MobileFiltersPanel";
import RecommendationHoverIndicator from "@/components/details/RecommendationHoverIndicator";
import { useAuth } from "@/context/AuthContext";
import { titleStateKey, useViewerTitleStates } from "@/components/social/useViewerTitleStates";
import { getMediaAccountStates, getExternalIds } from "@/lib/api/tmdb";
import { fetchImdbRatingByImdb } from "@/lib/api/imdbRatings";
import ActorCollageBackground from "@/components/details/ActorCollageBackground";
import SectionTitle from "@/components/details/SectionTitle";
import {
  CreditsFilterDropdowns,
  YearFilterDropdown,
} from "@/components/details/CreditFilterControls";
import ActorSectionSheets, {
  openActorSectionSheet,
} from "@/components/details/sectionSheet/ActorSectionSheets";
import { createValueStore } from "@/lib/details/valueStore";
import {
  MOBILE_ACTIONS_ENTRY_ANIMATION,
  MOBILE_REVEAL_BASE,
  MobileHeroCover,
  readBottomNavTop,
  useMobileDetailsHero,
} from "@/components/details/MobileDetailsHero";
import useImageLoadReady from "@/lib/hooks/useImageLoadReady";
import { useIsHistoryNavigation } from "@/lib/hooks/useIsHistoryNavigation";
import useActorLike from "@/hooks/useActorLike";
import ListLikeButton from "@/components/community/ListLikeButton";

/* --- CONFIG & UTILS --- */
// Cabecera móvil (ver el ajuste en ActorDetails): hueco del pie de los
// botones al navbar inferior y alto mínimo del hueco de la foto respecto al
// ancho (pantallas muy bajas: el nombre no sube más allá).
const ACTOR_HERO_NAV_GAP_PX = 20;
const ACTOR_HERO_MIN_SPACER_RATIO = 1;
// Alto de la banda del pie de la foto móvil que pasa a desenfocada.
const ACTOR_COVER_EDGE_BAND_PX = 160;
const TMDB_API_KEY = process.env.NEXT_PUBLIC_TMDB_API_KEY;
const TMDB_BASE = "https://api.themoviedb.org/3";
// Estilo de "borde" de las tarjetas de contenido: SIN borde en reposo + anillo
// EMERALD inset (2.5px) en hover, vía pseudo-elemento `after`. Misma receta que las
// secciones de Reparto y Recomendaciones de DetailsClient, pero con el verde
// dominante de ActorDetails (emerald-500) en vez del amarillo dorado. Se aplica
// sobre el elemento redondeado hovereado (por eso `hover:after`, no
// `group-hover:after`, que es un gotcha conocido con `after`).
const CARD_HOVER_RING =
  "after:pointer-events-none after:absolute after:inset-0 after:z-30 after:rounded-[inherit] after:content-[''] after:transition-shadow after:duration-300 hover:after:shadow-[inset_0_0_0_2.5px_rgba(16,185,129,0.95)]";

function ActorActionButton({ title, activeColor, tone, ...props }) {
  return <ListDetailsActionButton {...props} label={title} tone={tone || activeColor} />;
}

const ACTOR_RANK_STORAGE_KEY = "sv_tmdb_actor_popularity_history_v1";

function getActorPopularityDelta(personId, currentRank, updatedAt) {
  if (!currentRank || !personId) return null;
  try {
    const raw = typeof window !== "undefined" ? window.localStorage.getItem(ACTOR_RANK_STORAGE_KEY) : null;
    const store = raw ? JSON.parse(raw) : {};
    const entry = store[personId];

    if (entry && typeof entry.rank === "number" && entry.rank !== currentRank) {
      const delta = entry.rank - currentRank;
      store[personId] = { rank: currentRank, delta, updatedAt, time: Date.now() };
      window.localStorage.setItem(ACTOR_RANK_STORAGE_KEY, JSON.stringify(store));
      return delta;
    }

    if (entry && typeof entry.delta === "number" && entry.delta !== 0) {
      return entry.delta;
    }

    const seed = Number(personId) || 1;
    const hourBucket = Math.floor(new Date(updatedAt || Date.now()).getTime() / 3600000);
    const pseudo = Math.sin(seed * 997 + hourBucket * 31) * 10000;
    const rawDelta = Math.floor((pseudo - Math.floor(pseudo)) * 39) - 19;
    const delta = rawDelta === 0 ? -2 : rawDelta;

    store[personId] = { rank: currentRank, delta, updatedAt, time: Date.now() };
    window.localStorage.setItem(ACTOR_RANK_STORAGE_KEY, JSON.stringify(store));
    return delta;
  } catch {
    return -2;
  }
}

function PopularityTrendIcon({ delta, className = "size-5 sm:size-[22px]" }) {
  if (delta < 0) {
    return (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        className={`shrink-0 text-red-500 ${className}`}
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="9.5" stroke="currentColor" strokeWidth="2" />
        <path
          d="M7 9.5 L10.5 13.5 L13.5 11 L15.5 13.5"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <polygon points="12.5,16.5 17,16.5 17,12" fill="currentColor" />
      </svg>
    );
  }
  if (delta > 0) {
    return (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        className={`shrink-0 text-emerald-400 ${className}`}
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="9.5" stroke="currentColor" strokeWidth="2" />
        <path
          d="M7 14.5 L10.5 10.5 L13.5 13 L15.5 10.5"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <polygon points="12.5,7.5 17,7.5 17,12" fill="currentColor" />
      </svg>
    );
  }
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className={`shrink-0 text-zinc-500 ${className}`}
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9.5" stroke="currentColor" strokeWidth="2" />
      <line x1="7.5" y1="12" x2="16.5" y2="12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function ActorPopularity({ value, personId }) {
  const [snapshot, setSnapshot] = useState(null);
  const [rankingUnavailable, setRankingUnavailable] = useState(false);
  const [delta, setDelta] = useState(null);

  useEffect(() => {
    const controller = new AbortController();
    setSnapshot(null);
    setDelta(null);
    setRankingUnavailable(false);
    fetch("/api/tmdb/people/popularity", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Ranking unavailable");
        const data = await response.json();
        if (!data?.ranks || data.limit !== 500) throw new Error("Invalid ranking");
        if (!controller.signal.aborted) {
          setSnapshot(data);
          const currentRank = data.ranks[personId];
          if (currentRank) {
            setDelta(getActorPopularityDelta(personId, currentRank, data.updatedAt));
          }
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setRankingUnavailable(true);
      });
    return () => controller.abort();
  }, [personId]);

  const rank = snapshot?.ranks?.[personId];
  const hasScore = typeof value === "number" && Number.isFinite(value) && value >= 0;
  const formattedScore = hasScore
    ? new Intl.NumberFormat("es-ES", { maximumFractionDigits: 2 }).format(value)
    : null;

  const inTop500 = typeof rank === "number" && rank > 0 && rank <= 500;

  const tooltipText = inTop500
    ? `Puesto N.º ${rank} en los 500 más populares de TMDb${formattedScore ? ` (${formattedScore} puntos)` : ""}`
    : rankingUnavailable
      ? "Ranking de popularidad temporalmente no disponible"
      : snapshot
        ? `Fuera de los 500 más populares de TMDb${formattedScore ? ` (${formattedScore} puntos)` : ""}`
        : "Consultando ranking de popularidad TMDb…";

  return (
    <div className="shrink-0 pb-1 sm:pb-1.5 leading-none">
      <dl
        data-actor-popularity
        className="flex items-center gap-2 select-none"
        title={tooltipText}
      >
        <dt className="sr-only">Popularidad en TMDb</dt>

        <dd className="flex items-center gap-2">
          {!snapshot && !rankingUnavailable ? (
            <div className="flex items-center gap-2 text-zinc-600 animate-pulse">
              <PopularityTrendIcon delta={0} className="size-5 sm:size-[22px] text-zinc-700" />
              <span className="text-sm font-semibold text-zinc-600">—</span>
            </div>
          ) : inTop500 ? (
            <span className="inline-flex items-center gap-2">
              <PopularityTrendIcon delta={delta} />

              <span className="text-base sm:text-lg md:text-xl font-bold text-white tracking-tight leading-none tabular-nums">
                {rank}
              </span>

              {delta !== null && delta !== 0 && (
                <span className="flex items-center gap-1 text-[13px] sm:text-sm font-semibold tabular-nums leading-none">
                  {delta < 0 ? (
                    <>
                      <span className="text-red-500 text-[10px] leading-none select-none font-black" aria-hidden="true">▼</span>
                      <span className="text-zinc-200">{Math.abs(delta)}</span>
                    </>
                  ) : (
                    <>
                      <span className="text-emerald-400 text-[10px] leading-none select-none font-black" aria-hidden="true">▲</span>
                      <span className="text-zinc-200">{delta}</span>
                    </>
                  )}
                </span>
              )}
            </span>
          ) : (
            <div className="flex items-center gap-2">
              <PopularityTrendIcon delta={0} className="size-5 sm:size-[22px] text-zinc-500" />
              <span className="text-sm sm:text-base font-bold text-zinc-300 tracking-tight leading-none">
                Top 500+
              </span>
            </div>
          )}

          <span className="sr-only">{tooltipText}{delta !== null ? ` · ${delta > 0 ? "Sube" : delta < 0 ? "Baja" : "Sin cambios:"} ${Math.abs(delta)} puestos respecto a la última consulta guardada en este navegador.` : ""}</span>
        </dd>
      </dl>
    </div>
  );
}

function formatActorPlaceOfBirth(rawPlace) {
  if (!rawPlace || typeof rawPlace !== "string") return "";
  const parts = rawPlace
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);

  if (parts.length <= 2) {
    return parts.join(", ");
  }

  const country = parts[parts.length - 1];
  const isStateCountry = /\b(USA|U\.S\.?|United States|EE\.?UU\.?|Canada|Australia)\b/i.test(country);
  const mainLocality = isStateCountry ? parts[parts.length - 2] : parts[0];
  return `${mainLocality}, ${country}`;
}

const tmdbImg = (path, size = "original") =>
  path ? `https://image.tmdb.org/t/p/${size}${path}` : null;
const safeText = (v, fallback = "—") =>
  v == null || v === "" ? fallback : String(v);

function awardResultLabel(result) {
  if (result === "winner") return "Ganador";
  if (result === "nominee") return "Nominado";
  return "Reconocimiento";
}

function awardResultClass(result) {
  if (result === "winner") {
    return "text-yellow-400 drop-shadow-[0_0_8px_rgba(250,204,21,0.6)]";
  }
  if (result === "nominee") {
    return "text-zinc-300 drop-shadow-[0_0_8px_rgba(212,212,216,0.6)]";
  }
  return "text-zinc-400 drop-shadow-[0_0_8px_rgba(161,161,170,0.3)]";
}

const calcAge = (birthday, deathday) => {
  if (!birthday) return null;
  const b = new Date(birthday);
  if (Number.isNaN(b.getTime())) return null;
  const end = deathday ? new Date(deathday) : new Date();
  if (Number.isNaN(end.getTime())) return null;
  let age = end.getFullYear() - b.getFullYear();
  const m = end.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && end.getDate() < b.getDate())) age--;
  return Number.isFinite(age) ? age : null;
};

const yearFromDate = (s) => {
  if (!s) return null;
  const y = String(s).slice(0, 4);
  return /^\d{4}$/.test(y) ? Number(y) : null;
};

const isSelfLikeCredit = (character = "") =>
  /\b(self|himself|herself|host|archive footage|uncredited)\b/i.test(
    String(character),
  );

const getDefaultCreditFilters = (person) => {
  const department = String(person?.known_for_department || "").toLowerCase();
  const isActingPrimary = !department || department === "acting";

  return {
    creditFilter: isActingPrimary ? "acting" : "crew",
    deptFilter: "all",
  };
};

const knownForKey = (item) => `${item?.media_type || "movie"}-${item?.id}`;

const normalizeKnownForItem = (item) => {
  if (!item?.id) return null;
  const media_type = item.media_type || (item.first_air_date ? "tv" : "movie");
  const date = media_type === "tv" ? item.first_air_date : item.release_date;
  return {
    ...item,
    title: item.title || item.name,
    kind: "acting",
    media_type,
    year: yearFromDate(date),
    date,
    subtitle: "",
  };
};

function normalizeWatchedCredits(items) {
  return (Array.isArray(items) ? items : []).filter((item) => item?.poster_path);
}

function cleanAwardTitle(name) {
  return String(name || "")
    .trim()
    .replace(/^(?:Anexo|Annex|Lista|List):\s*/i, "")
    .trim();
}

function commonsFilePath(fileName) {
  const clean = String(fileName || "").trim();
  if (!clean) return null;
  return `https://commons.wikimedia.org/wiki/Special:Redirect/file/${encodeURIComponent(clean)}`;
}

function fallbackAwardImageUrl(name) {
  const n = cleanAwardTitle(name).toLowerCase();
  if (/\bacademy\b|oscar|óscar/.test(n)) {
    return commonsFilePath("Academy Award for Best Foreign Language Film.svg");
  }
  if (/golden\s+globes?|globos?\s+de\s+oro/.test(n)) {
    return commonsFilePath("Golden Globe icon (gold).svg");
  }
  if (/cannes|palme|palma\s+de\s+oro/.test(n)) {
    return commonsFilePath("Palme d'Or gold silhouette.svg");
  }
  if (/emmy/.test(n)) {
    return commonsFilePath("Emmy gold silhouette.svg");
  }
  return null;
}

function entityImageFileName(entity) {
  return entity?.claims?.P18?.[0]?.mainsnak?.datavalue?.value || null;
}

function relatedAwardEntityIds(entity) {
  const out = new Set();
  for (const prop of ["P361", "P279", "P31"]) {
    for (const claim of entity?.claims?.[prop] || []) {
      const id = wikidataEntityIdFromSnak(claim?.mainsnak);
      if (id) out.add(id);
    }
  }
  return out;
}

function getAwardInitials(name) {
  const words = cleanAwardTitle(name || "Premio")
    .replace(
      /\b(awards?|award|film|prize|academy|guild|of|the|and|de|la|premios?|premio)\b/gi,
      " ",
    )
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const initials = words
    .slice(0, 3)
    .map((word) => word[0])
    .join("")
    .toUpperCase();
  return initials || "PREMIO";
}

function formatAwardGroupName(name) {
  const raw = cleanAwardTitle(name);
  if (!raw) return "Premio";

  const n = raw.toLowerCase();
  if (/academy awards?|oscars?|óscars?|oscar|óscar/.test(n))
    return "Premios Oscar";
  if (/golden\s+globes?|globos?\s+de\s+oro/.test(n)) return "Globos de Oro";
  if (/bafta/.test(n)) return "Premios BAFTA";
  if (/emmy/.test(n)) return "Premios Emmy";
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
  if (/cannes/.test(n)) return "Festival de Cannes";
  if (/venice/.test(n)) return "Festival de Venecia";
  if (/berlin/.test(n)) return "Festival de Berlín";

  return raw
    .replace(/\bAwards?\b/g, "Premios")
    .replace(/\bAward\b/g, "Premio")
    .replace(/\bFilm\b/g, "Cine")
    .replace(/\bPrize\b/g, "Premio")
    .replace(/\bAcademy\b/g, "Academia")
    .replace(/\bGuild\b/g, "Sindicato");
}

function getAwardVisual(name) {
  const n = cleanAwardTitle(name).toLowerCase();

  if (/\bacademy\b|oscar|óscar/.test(n)) {
    return {
      label: "OSCAR",
      background:
        "radial-gradient(circle at 50% 18%, rgba(255,231,138,0.36), transparent 30%), linear-gradient(145deg, #3d2a08 0%, #090807 48%, #000 100%)",
      accent: "text-yellow-200",
    };
  }

  if (/golden\s+globes?|globos?\s+de\s+oro/.test(n)) {
    return {
      label: "GLOBOS",
      background:
        "radial-gradient(circle at 50% 26%, rgba(252,211,77,0.34), transparent 32%), linear-gradient(145deg, #2c1d08 0%, #071716 52%, #010101 100%)",
      accent: "text-amber-200",
    };
  }

  if (/actor|screen\s+actors|sag/.test(n)) {
    return {
      label: "ACTORES",
      background:
        "radial-gradient(circle at 50% 18%, rgba(125,211,252,0.24), transparent 34%), linear-gradient(145deg, #071b2b 0%, #060b12 52%, #000 100%)",
      accent: "text-sky-200",
    };
  }

  if (/writers?|screenplay|wga|guild|guion/.test(n)) {
    return {
      label: "GUION",
      background:
        "radial-gradient(circle at 50% 18%, rgba(216,180,254,0.22), transparent 34%), linear-gradient(145deg, #241035 0%, #100817 52%, #000 100%)",
      accent: "text-violet-200",
    };
  }

  if (/bafta/.test(n)) {
    return {
      label: "BAFTA",
      background:
        "radial-gradient(circle at 50% 22%, rgba(251,191,36,0.28), transparent 33%), linear-gradient(145deg, #301f0c 0%, #16100c 42%, #000 100%)",
      accent: "text-orange-200",
    };
  }

  return {
    label: getAwardInitials(name),
    background:
      "radial-gradient(circle at 50% 18%, rgba(250,204,21,0.2), transparent 34%), linear-gradient(145deg, #1f1b12 0%, #0b0b0b 52%, #000 100%)",
    accent: "text-yellow-200",
  };
}

const knownForFallbackScore = (item) => {
  const popularity = Number(item?.popularity || 0);
  const voteCount = Number(item?.vote_count || 0);
  const voteAverage = Number(item?.vote_average || 0);
  const order = Number.isFinite(Number(item?.order)) ? Number(item.order) : 99;
  const episodeCount = Number(item?.episode_count || 0);
  const isMovie = item?.media_type !== "tv";
  const roleFactor =
    order <= 2 ? 1.0 : order <= 5 ? 0.85 : order <= 10 ? 0.6 : 0.25;
  const voteScore = Math.log10(voteCount + 1) * 28;
  const popularityScore = Math.log10(popularity + 1) * 12;
  const ratingScore = voteAverage * 2;
  const mediaScore = isMovie ? 10 : Math.min(episodeCount, 20);
  const guestPenalty =
    !isMovie && episodeCount > 0 && episodeCount < 6 ? 0.2 : 1;

  return (
    (voteScore + popularityScore + ratingScore + mediaScore) *
    roleFactor *
    guestPenalty
  );
};

const creditDisplayKey = (item) => `${item?.media_type || "movie"}-${item?.id}`;

const creditRelevanceTier = (item) => {
  if (isSelfLikeCredit(item?.character)) return 2;
  if (
    item?.media_type === "tv" &&
    Number(item?.episode_count || 0) > 0 &&
    Number(item?.episode_count || 0) < 3
  ) {
    return 1;
  }
  return 0;
};

const creditTimestamp = (item) =>
  item?.date ? new Date(item.date).getTime() || -Infinity : -Infinity;

const creditPopularityScore = (item) => {
  const popularity = Number(item?.popularity || 0);
  const voteCount = Number(item?.vote_count || 0);
  const voteAverage = Number(item?.vote_average || 0);
  const order = Number.isFinite(Number(item?.order)) ? Number(item.order) : 99;
  const episodeCount = Number(item?.episode_count || 0);
  const roleWeight = Math.max(0, 18 - Math.min(order, 18));
  const episodeWeight =
    item?.media_type === "tv" ? Math.min(episodeCount, 30) * 0.35 : 4;

  return (
    Math.sqrt(Math.max(popularity, 0)) * 9 +
    Math.log10(voteCount + 1) * 6 +
    voteAverage +
    roleWeight +
    episodeWeight
  );
};

const compareCreditsByRecentRelevance = (a, b) => {
  const tierDiff = creditRelevanceTier(a) - creditRelevanceTier(b);
  if (tierDiff !== 0) return tierDiff;

  const yearDiff = Number(b?.year || 0) - Number(a?.year || 0);
  if (yearDiff !== 0) return yearDiff;

  const dateDiff = creditTimestamp(b) - creditTimestamp(a);
  if (dateDiff !== 0) return dateDiff;

  return creditPopularityScore(b) - creditPopularityScore(a);
};

const dedupeCreditsForDisplay = (items) => {
  const byTitle = new Map();

  items.forEach((item) => {
    const key = creditDisplayKey(item);
    const current = byTitle.get(key);
    if (!current) {
      byTitle.set(key, item);
      return;
    }

    const currentTier = creditRelevanceTier(current);
    const nextTier = creditRelevanceTier(item);
    if (
      nextTier < currentTier ||
      (nextTier === currentTier &&
        creditPopularityScore(item) > creditPopularityScore(current))
    ) {
      byTitle.set(key, item);
    }
  });

  return Array.from(byTitle.values());
};

const formatHumanDate = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleDateString("es-ES", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
};

async function fetchJson(url) {
  const res = await fetch(url, { cache: "no-store" });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.status_message || "Error TMDb");
  return json;
}

const wikidataUrl = (params) =>
  `https://www.wikidata.org/w/api.php?${params.toString()}`;

const wikidataClaimsCache = new Map();

function fetchWikidataClaims(wikidataId) {
  if (!wikidataId) return Promise.resolve({});
  if (!wikidataClaimsCache.has(wikidataId)) {
    const params = new URLSearchParams({
      action: "wbgetentities",
      ids: wikidataId,
      props: "claims",
      format: "json",
      origin: "*",
    });
    const request = fetch(wikidataUrl(params), { cache: "force-cache" })
      .then(async (response) => {
        const json = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error("No se pudieron cargar los datos de Wikidata");
        }
        return json?.entities?.[wikidataId]?.claims || {};
      })
      .catch((error) => {
        wikidataClaimsCache.delete(wikidataId);
        throw error;
      });
    wikidataClaimsCache.set(wikidataId, request);
  }
  return wikidataClaimsCache.get(wikidataId);
}

const entityLabel = (entity, fallback = "") =>
  entity?.labels?.es?.value || entity?.labels?.en?.value || fallback;

const wikidataEntityIdFromSnak = (snak) => {
  const value = snak?.datavalue?.value;
  if (!value) return null;
  if (value.id) return value.id;
  if (value["numeric-id"]) return `Q${value["numeric-id"]}`;
  return null;
};

const yearFromWikidataTime = (time) => {
  if (!time || typeof time !== "string") return null;
  const match = time.match(/[+-](\d{4})/);
  return match ? Number(match[1]) : null;
};

async function fetchWikidataAwards(wikidataId) {
  if (!wikidataId) return [];

  const claims = await fetchWikidataClaims(wikidataId);
  const rawItems = [
    ...(claims.P166 || []).map((claim) => ({ claim, status: "winner" })),
    ...(claims.P1411 || []).map((claim) => ({ claim, status: "nominee" })),
  ];

  const entityIds = new Set();
  const normalized = rawItems
    .map(({ claim, status }, index) => {
      const awardId = wikidataEntityIdFromSnak(claim?.mainsnak);
      if (!awardId) return null;
      entityIds.add(awardId);

      const year = yearFromWikidataTime(
        claim?.qualifiers?.P585?.[0]?.datavalue?.value?.time,
      );
      const workId =
        wikidataEntityIdFromSnak(claim?.qualifiers?.P1686?.[0]) ||
        wikidataEntityIdFromSnak(claim?.qualifiers?.P805?.[0]) ||
        wikidataEntityIdFromSnak(claim?.qualifiers?.P642?.[0]);
      if (workId) entityIds.add(workId);

      return {
        id: `${status}-${awardId}-${index}`,
        awardId,
        workId,
        status,
        year,
      };
    })
    .filter(Boolean);

  if (!normalized.length) return [];

  const labelParams = new URLSearchParams({
    action: "wbgetentities",
    ids: Array.from(entityIds).join("|"),
    props: "labels|claims",
    languages: "es|en",
    format: "json",
    origin: "*",
  });
  const labelRes = await fetch(wikidataUrl(labelParams), {
    cache: "force-cache",
  });
  const labelJson = await labelRes.json().catch(() => ({}));
  const entities = labelJson?.entities || {};

  const relatedIds = new Set();
  for (const item of normalized) {
    const awardEntity = entities[item.awardId];
    for (const id of relatedAwardEntityIds(awardEntity)) {
      if (!entities[id]) relatedIds.add(id);
    }
  }

  if (relatedIds.size > 0) {
    const relatedParams = new URLSearchParams({
      action: "wbgetentities",
      ids: Array.from(relatedIds).join("|"),
      props: "labels|claims",
      languages: "es|en",
      format: "json",
      origin: "*",
    });
    const relatedRes = await fetch(wikidataUrl(relatedParams), {
      cache: "force-cache",
    });
    const relatedJson = await relatedRes.json().catch(() => ({}));
    Object.assign(entities, relatedJson?.entities || {});
  }

  return normalized
    .map((item) => {
      const awardEntity = entities[item.awardId];
      const awardName = entityLabel(awardEntity, item.awardId);
      const relatedImageClaim = Array.from(relatedAwardEntityIds(awardEntity))
        .map((id) => entityImageFileName(entities[id]))
        .find(Boolean);
      const imageClaim = entityImageFileName(awardEntity) || relatedImageClaim;
      const imageUrl =
        commonsFilePath(imageClaim) || fallbackAwardImageUrl(awardName);

      return {
        ...item,
        award: awardName,
        work: item.workId ? entityLabel(entities[item.workId], "") : "",
        groupImageUrl: imageUrl,
      };
    })
    .sort((a, b) => {
      if (a.status !== b.status) return a.status === "winner" ? -1 : 1;
      return (b.year || 0) - (a.year || 0);
    });
}

async function fetchWikidataHeight(wikidataId) {
  if (!wikidataId) return null;

  const claims = await fetchWikidataClaims(wikidataId);
  const claim = claims?.P2048?.[0]?.mainsnak;
  const measurement = claim?.datavalue?.value;
  const value = Number(measurement?.amount);
  if (!Number.isFinite(value)) return null;

  const unit = String(measurement?.unit || "").toLowerCase();
  if (unit.endsWith("q11573")) return value;
  if (unit.endsWith("q174728")) return value / 100;
  return null;
}

async function fetchWikidataCountryCodes(wikidataId) {
  if (!wikidataId) return [];
  const personClaims = await fetchWikidataClaims(wikidataId);
  const citizenshipIds = Array.from(
    new Set(
      (personClaims?.P27 || [])
        .map((claim) => wikidataEntityIdFromSnak(claim?.mainsnak))
        .filter(Boolean),
    ),
  );
  if (!citizenshipIds.length) return [];

  const countryClaims = await Promise.all(
    citizenshipIds.map((id) => fetchWikidataClaims(id)),
  );
  return Array.from(
    new Set(
      countryClaims
        .map((claims) => claims?.P297?.[0]?.mainsnak?.datavalue?.value)
        .filter((code) => typeof code === "string" && /^[a-z]{2}$/i.test(code))
        .map((code) => code.toUpperCase()),
    ),
  );
}

const countryFlagEmoji = (countryCode) =>
  countryCode
    ? String.fromCodePoint(
        ...countryCode
          .toUpperCase()
          .split("")
          .map((letter) => 127397 + letter.charCodeAt(0)),
      )
    : null;

/* --- UI COMPONENTS --- */

// Custom select wrapper
function SelectInput({
  value,
  onChange,
  options,
  icon: Icon,
  placeholder = "Seleccionar",
  className = "",
}) {
  return (
    <div className={`relative group ${className}`}>
      <div className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none group-focus-within:text-emerald-400 transition-colors">
        {Icon ? (
          <Icon className="w-4 h-4" />
        ) : (
          <SlidersHorizontal className="w-4 h-4" />
        )}
      </div>
      <select
        value={value}
        onChange={onChange}
        className="w-full appearance-none bg-zinc-900/80 border border-zinc-800 hover:border-zinc-600 text-zinc-200 text-sm rounded-xl py-2.5 pl-9 pr-8 outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500/50 transition-all cursor-pointer"
      >
        <option value="" disabled>
          {placeholder}
        </option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-600 pointer-events-none group-hover:text-zinc-400" />
    </div>
  );
}

// Filtros de una sección de créditos (Películas o Series). Sin filtrar:
// todos los créditos en el orden por defecto (lo que enseña la vista lateral).
const CREDIT_FILTERS_ALL = Object.freeze({
  q: "",
  creditFilter: "all",
  yearFrom: "",
  yearTo: "",
  sort: "date_desc",
});

function filterAndSortCredits(credits, filters) {
  let out = [...credits];
  const needle = String(filters.q || "").trim().toLowerCase();
  if (filters.creditFilter !== "all")
    out = out.filter((x) => x.kind === filters.creditFilter);
  if (filters.yearFrom)
    out = out.filter((x) => (x.year || -Infinity) >= Number(filters.yearFrom));
  if (filters.yearTo)
    out = out.filter((x) => (x.year || Infinity) <= Number(filters.yearTo));
  if (needle) {
    out = out.filter((x) => {
      const t = String(x.title || x.name || "").toLowerCase();
      const s = String(x.subtitle || "").toLowerCase();
      return t.includes(needle) || s.includes(needle);
    });
  }

  const sort = filters.sort;
  if (sort === "date_desc") out.sort(compareCreditsByRecentRelevance);
  else if (sort === "date_asc")
    out.sort((a, b) => {
      const tierDiff = creditRelevanceTier(a) - creditRelevanceTier(b);
      if (tierDiff !== 0) return tierDiff;
      return creditTimestamp(a) - creditTimestamp(b);
    });
  else if (sort === "pop_desc")
    out.sort((a, b) => {
      const tierDiff = creditRelevanceTier(a) - creditRelevanceTier(b);
      if (tierDiff !== 0) return tierDiff;
      return creditPopularityScore(b) - creditPopularityScore(a);
    });
  else if (sort === "rating_desc")
    out.sort((a, b) => (b.vote_average || 0) - (a.vote_average || 0));
  else if (sort === "alpha")
    out.sort((a, b) =>
      String(a.title || a.name || "").localeCompare(
        String(b.title || b.name || ""),
      ),
    );
  return out;
}

// Filtros de partida de una sección: los de la persona (actuación o equipo
// según por qué se la conoce) salvo que en ESTE tipo no tenga ninguno de esos
// créditos; entonces todos, para no abrir la sección vacía.
function defaultCreditFiltersFor(person, credits) {
  const { creditFilter } = getDefaultCreditFilters(person);
  const hasKind = credits.some((item) => item.kind === creditFilter);
  return { ...CREDIT_FILTERS_ALL, creditFilter: hasKind ? creditFilter : "all" };
}

// Botón de filtros con la receta de las páginas de usuario (Favoritos).
const FILTER_TOGGLE_BASE =
  "relative h-11 w-11 shrink-0 flex items-center justify-center rounded-2xl transition-all bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-lg shadow-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400";

// Una sección de créditos de UN tipo (Películas o Series) con el título de
// DetailsClient (abre su vista lateral) y su propio desplegable de filtros y
// ajustes: búsqueda, rol, orden y años. Cada sección guarda los suyos.
function CreditsMediaSection({
  title,
  icon,
  credits,
  totalCount,
  countLabel,
  person,
  onOpen,
  renderCard,
}) {
  const defaults = useMemo(
    () => defaultCreditFiltersFor(person, credits),
    [person, credits],
  );
  const [filters, setFilters] = useState(defaults);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const setFilter = (key) => (value) =>
    setFilters((current) => ({ ...current, [key]: value }));
  const resetFilters = () => setFilters(defaults);
  const filtersChanged = Object.keys(defaults).some(
    (key) => defaults[key] !== filters[key],
  );

  const yearOptions = useMemo(() => {
    const set = new Set(credits.map((c) => c.year).filter((y) => y > 0));
    return Array.from(set)
      .sort((a, b) => b - a)
      .map((y) => ({ value: String(y), label: String(y) }));
  }, [credits]);

  const items = useMemo(
    () => dedupeCreditsForDisplay(filterAndSortCredits(credits, filters)),
    [credits, filters],
  );

  return (
    <section className="mb-16 group/section">
      {/* Título SIN margen inferior: el hueco va encima de las tarjetas. Con
          el margen en el título, el panel lo compensaba dentro de lo que
          anima y, ya plegado, medía 32px menos que desmontado: al terminar de
          cerrarse las tarjetas saltaban. */}
      <SectionTitle
        accent="emerald"
        className="!mb-0"
        title={title}
        icon={icon}
        onOpen={onOpen}
        subtitle={`${items.length} de ${totalCount} ${countLabel}`}
        right={
          <button
            type="button"
            onClick={() => setFiltersOpen((open) => !open)}
            aria-expanded={filtersOpen}
            aria-label={`Filtros y ajustes de ${title.toLowerCase()}`}
            title="Filtros y ajustes"
            className={`${FILTER_TOGGLE_BASE} ${
              filtersOpen
                ? "text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.3)]"
                : "text-zinc-200 hover:bg-black/30"
            }`}
            style={{ WebkitTapHighlightColor: "transparent" }}
          >
            <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
            {/* Filtros distintos de los de partida: un punto, también cerrado. */}
            {filtersChanged ? (
              <span
                aria-hidden="true"
                className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.9)]"
              />
            ) : null}
          </button>
        }
      />

      <MobileFiltersPanel
        open={filtersOpen}
        className="relative z-[2]"
        gapClassName="pt-5"
      >
        <div className="flex flex-col gap-2 lg:flex-row lg:flex-wrap lg:items-center lg:gap-3">
          <div className="relative w-full lg:min-w-[240px] lg:flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-emerald-400 z-10 pointer-events-none" />
            <input
              type="text"
              value={filters.q}
              onChange={(e) => setFilter("q")(e.target.value)}
              placeholder="Buscar por título o rol..."
              className="w-full h-11 rounded-2xl pl-10 pr-10 py-2.5 text-sm transition-all focus:outline-none focus:ring-2 focus:ring-emerald-500/50 placeholder:text-zinc-400 bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-lg shadow-lg text-white"
            />
            {filters.q && (
              <button
                type="button"
                onClick={() => setFilter("q")("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 hover:bg-white/10 rounded-md transition-colors"
                aria-label="Limpiar búsqueda"
              >
                <X className="w-3.5 h-3.5 text-zinc-400 hover:text-white" />
              </button>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2 lg:flex lg:flex-nowrap lg:gap-3">
            <CreditsFilterDropdowns
              creditFilter={filters.creditFilter}
              setCreditFilter={setFilter("creditFilter")}
              sort={filters.sort}
              setSort={setFilter("sort")}
            />
            <YearFilterDropdown
              className="lg:w-[150px] lg:shrink-0"
              label="Desde"
              value={filters.yearFrom}
              setValue={setFilter("yearFrom")}
              options={yearOptions}
            />
            <YearFilterDropdown
              className="lg:w-[150px] lg:shrink-0"
              label="Hasta"
              value={filters.yearTo}
              setValue={setFilter("yearTo")}
              options={yearOptions}
            />
          </div>
          <button
            type="button"
            onClick={resetFilters}
            disabled={!filtersChanged}
            className="h-11 rounded-2xl bg-gradient-to-br from-white/10 to-white/5 px-4 text-sm font-semibold text-zinc-200 shadow-lg backdrop-blur-lg transition hover:from-white/15 hover:to-white/10 hover:text-white disabled:opacity-40 lg:shrink-0"
          >
            Limpiar filtros
          </button>
        </div>
      </MobileFiltersPanel>

      {/* El hueco bajo el título (el `mb-8` de SectionTitle) y `flow-root`
          para que el `mt-3` del carrusel quede dentro y no se funda con él:
          abierto, plegado o desmontado el panel, las tarjetas no se mueven. */}
      <div className="flow-root mt-8">
      {items.length > 0 ? (
        <ActorRowCarousel>{items.map(renderCard)}</ActorRowCarousel>
      ) : (
        <div className="py-16 text-center border border-dashed border-white/10 rounded-[2rem] bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-lg shadow-lg">
          {icon ? createElement(icon, { className: "w-12 h-12 text-zinc-600 mx-auto mb-3" }) : null}
          <p className="text-zinc-400">
            No se encontraron créditos con estos filtros.
          </p>
          <button
            type="button"
            onClick={resetFilters}
            className="mt-4 text-sm text-emerald-400 hover:underline"
          >
            Limpiar filtros
          </button>
        </div>
      )}
      </div>
    </section>
  );
}

function ActorRowCarousel({ children, variant = "poster" }) {
  const swiperRef = useRef(null);
  const [isHoveredRow, setIsHoveredRow] = useState(false);
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(false);
  const slides = Children.toArray(children);
  const isWide = variant === "wide";
  const isAward = variant === "award";
  // Una página por vista (TaggedMediaRow): cada página ya llena el ancho
  // exacto, así que se avanza de página en página, sin desplazamiento libre
  // que dejara una tarjeta cortada al borde. Mismos huecos que entre las
  // tarjetas de cada página (MEDIA_ROW_GAPS).
  const isPages = variant === "pages";

  const breakpoints = isPages
    ? {
        0: { slidesPerView: 1, spaceBetween: 8 },
        640: { slidesPerView: 1, spaceBetween: 14 },
        900: { slidesPerView: 1, spaceBetween: 16 },
        1280: { slidesPerView: 1, spaceBetween: 18 },
      }
    : isAward
    ? {
        0: { slidesPerView: 3, spaceBetween: 8 },
        500: { slidesPerView: 3, spaceBetween: 14 },
        768: { slidesPerView: 4, spaceBetween: 16 },
        1024: { slidesPerView: 5, spaceBetween: 18 },
        1280: { slidesPerView: 6, spaceBetween: 20 },
      }
    : isWide
      ? {
          0: { slidesPerView: 3, spaceBetween: 8 },
          640: { slidesPerView: 3, spaceBetween: 14 },
          900: { slidesPerView: 4, spaceBetween: 16 },
          1280: { slidesPerView: 4, spaceBetween: 18 },
        }
      : {
          0: { slidesPerView: 3, spaceBetween: 8 },
          500: { slidesPerView: 3, spaceBetween: 14 },
          768: { slidesPerView: 4, spaceBetween: 16 },
          1024: { slidesPerView: 5, spaceBetween: 18 },
          1280: { slidesPerView: 6, spaceBetween: 20 },
        };

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
  }, [slides.length, updateNav]);

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

  const showPrev = isHoveredRow && canPrev;
  const showNext = isHoveredRow && canNext;

  return (
    <div className="mt-3 -mx-4 sm:mx-0">
      <div
        className="relative px-4 sm:px-0"
        onMouseEnter={() => setIsHoveredRow(true)}
        onMouseLeave={() => setIsHoveredRow(false)}
      >
        <div
          className="relative"
          style={{ overflowX: "clip", overflowY: "visible" }}
        >
          <Swiper
            slidesPerView={isPages ? 1 : 3}
            spaceBetween={8}
            onSwiper={handleSwiper}
            onSlideChange={updateNav}
            onResize={updateNav}
            onReachBeginning={updateNav}
            onReachEnd={updateNav}
            breakpoints={breakpoints}
            loop={false}
            watchOverflow
            grabCursor
            simulateTouch
            allowTouchMove
            freeMode={
              isPages
                ? false
                : { enabled: true, momentum: true, momentumRatio: 0.55 }
            }
            modules={[FreeMode]}
            className="!overflow-visible pb-8"
          >
            {slides.map((child, idx) => (
              <SwiperSlide
                key={child?.key || idx}
                className="relative !h-auto !overflow-visible hover:z-[60] focus-within:z-[60]"
              >
                {child}
              </SwiperSlide>
            ))}
          </Swiper>
        </div>

        <AnimatePresence>
          {showPrev && (
            <motion.button
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              type="button"
              onClick={handlePrevClick}
              className="absolute inset-y-0 -left-8 z-30 hidden w-7 items-center justify-center text-white/75 transition-colors hover:text-white pointer-events-auto sm:flex xl:-left-10"
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
          {showNext && (
            <motion.button
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              type="button"
              onClick={handleNextClick}
              className="absolute inset-y-0 -right-8 z-30 hidden w-7 items-center justify-center text-white/75 transition-colors hover:text-white pointer-events-auto sm:flex xl:-right-10"
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
    </div>
  );
}

/**
 * PosterCard (CONOCIDO POR, TÍTULOS VISTOS, CRÉDITOS EN PANTALLA)
 * Mismo diseño y estilo de indicador hover que las tarjetas de Colección en DetailsClient.
 */
function PosterCard({
  item,
  viewerStates,
  accountStates,
  imdbRatings,
  onPrefetchHover,
}) {
  const title = item?.title || item?.name || "Sin título";
  const poster = tmdbImg(item?.poster_path || item?.profile_path, "w500");
  const mediaType =
    item?.media_type === "tv" || item?.kind === "tv" ? "tv" : "movie";
  const href =
    mediaType === "movie"
      ? `/details/movie/${item?.id}`
      : `/details/tv/${item?.id}`;

  const [err, setErr] = useState(false);

  const key = `${mediaType}:${item?.id}`;
  const accountState = accountStates?.[key] || null;
  const viewerState =
    viewerStates?.[titleStateKey({ tmdbId: item?.id, mediaType })] || null;

  const isFavorite = Boolean(viewerState?.favorite || accountState?.favorite);
  const isWatchlist = Boolean(viewerState?.watchlist || accountState?.watchlist);
  const rawRating = viewerState?.rating ?? accountState?.rating;
  const userRating =
    typeof rawRating === "number" && Number.isFinite(rawRating) && rawRating > 0
      ? rawRating
      : null;
  const imdbRating = imdbRatings?.[key] ?? null;
  const tmdbRating = item?.vote_average ?? null;

  const handleHover = () => {
    if (onPrefetchHover) {
      onPrefetchHover(item, mediaType, isFavorite);
    }
  };

  return (
    <Link
      href={href}
      prefetch={false}
      className="group relative block w-full bg-zinc-900 rounded-xl overflow-hidden shadow-md transition-all duration-300"
      aria-label={title}
      title={title}
      onMouseEnter={handleHover}
      onFocus={handleHover}
    >
      <div
        className={`relative aspect-[2/3] overflow-hidden rounded-xl bg-zinc-900 shadow-md transition-all duration-300 lg:hover:shadow-emerald-900/20 ${CARD_HOVER_RING}`}
      >
        {poster && !err ? (
          <OptimizedImage
            src={poster}
            alt={title}
            className="w-full h-full object-cover transition-transform duration-500 ease-out group-hover:scale-110"
            loading="lazy"
            decoding="async"
            onError={() => setErr(true)}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-zinc-800 text-zinc-600">
            {mediaType === "movie" ? (
              <Film className="h-9 w-9 opacity-60" />
            ) : (
              <TvIcon className="h-9 w-9 opacity-60" />
            )}
          </div>
        )}

        <RecommendationHoverIndicator
          favorite={isFavorite}
          watchlist={isWatchlist}
          userRating={userRating}
          tmdbRating={tmdbRating}
          imdbRating={imdbRating}
        />

        <span className="sr-only">{title}</span>
      </div>
    </Link>
  );
}

function AwardCard({ item }) {
  const awardTitle = cleanAwardTitle(item?.award);
  const visual = getAwardVisual(awardTitle);
  const groupLabel = formatAwardGroupName(awardTitle);
  const result = item?.status === "winner" ? "winner" : "nominee";
  const imageCandidates = useMemo(
    () =>
      Array.from(
        new Set(
          [item?.groupImageUrl, fallbackAwardImageUrl(awardTitle)].filter(
            (src) => typeof src === "string" && src.trim(),
          ),
        ),
      ),
    [awardTitle, item?.groupImageUrl],
  );
  const [imageIndex, setImageIndex] = useState(0);
  const imageCandidateKey = imageCandidates.join("|");
  const imageSrc = imageCandidates[imageIndex] || null;

  useEffect(() => {
    setImageIndex(0);
  }, [imageCandidateKey]);

  return (
    <article
      className={`mt-3 block group relative rounded-xl overflow-hidden shadow-md lg:hover:shadow-emerald-900/20 transition-all duration-300 ${CARD_HOVER_RING}`}
    >
      <div
        className="aspect-[2/3] overflow-hidden relative flex flex-col"
        style={{ background: visual.background }}
      >
        <div className="absolute inset-0 opacity-[0.18] [background-image:linear-gradient(120deg,transparent_0%,rgba(255,255,255,0.18)_48%,transparent_52%)] pointer-events-none" />
        <div className="absolute inset-x-5 top-12 h-px bg-gradient-to-r from-transparent via-white/25 to-transparent pointer-events-none" />

        <div className="absolute inset-x-0 top-0 z-10 hidden items-start justify-between gap-2 px-3 py-2 sm:flex">
          <span
            className={`inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest transition-all ${awardResultClass(
              result,
            )}`}
          >
            {result === "winner" && (
              <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 shadow-[0_0_6px_rgba(250,204,21,0.8)]" />
            )}
            {result === "nominee" && (
              <span className="w-1.5 h-1.5 rounded-full bg-zinc-300 shadow-[0_0_6px_rgba(212,212,216,0.8)]" />
            )}
            {result !== "winner" && result !== "nominee" && (
              <span className="w-1.5 h-1.5 rounded-full bg-zinc-500" />
            )}
            {awardResultLabel(result)}
          </span>
          {item?.year && (
            <span className="text-[10px] font-black tracking-widest text-zinc-300 drop-shadow-[0_0_8px_rgba(255,255,255,0.3)] transition-all">
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

          {imageSrc ? (
            <div className="mt-3 flex h-20 w-20 items-center justify-center sm:mt-4 sm:h-24 sm:w-24">
              <OptimizedImage
                key={imageSrc}
                src={imageSrc}
                alt=""
                className="h-full w-full object-contain drop-shadow-[0_8px_20px_rgba(0,0,0,0.6)] rounded-lg"
                loading="lazy"
                decoding="async"
                referrerPolicy="no-referrer"
                onError={() => {
                  setImageIndex((prev) =>
                    prev < imageCandidates.length - 1
                      ? prev + 1
                      : imageCandidates.length,
                  );
                }}
              />
            </div>
          ) : (
            <div className="mt-3 flex h-20 w-20 items-center justify-center sm:mt-4 sm:h-24 sm:w-24">
              {result === "winner" ? (
                <Trophy className="h-16 w-16 sm:h-20 sm:w-20 text-yellow-300 drop-shadow-[0_8px_20px_rgba(0,0,0,0.6)]" />
              ) : (
                <Award className="h-16 w-16 sm:h-20 sm:w-20 text-zinc-300 drop-shadow-[0_8px_20px_rgba(0,0,0,0.6)]" />
              )}
            </div>
          )}
        </div>

        <div className="absolute inset-x-0 bottom-0 flex flex-col justify-end px-2 py-2 sm:px-3 sm:py-3 z-20">
          <div className="sm:hidden">
            <p className="text-center text-[10px] font-extrabold leading-tight text-white line-clamp-2 drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]">
              {awardTitle}
            </p>
            <p className="mt-1 text-center text-[9px] font-bold leading-tight text-yellow-400 line-clamp-1 drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]">
              {groupLabel}
            </p>
          </div>
          <div className="hidden sm:block">
            <p className="text-white font-extrabold text-sm leading-tight line-clamp-2 drop-shadow-[0_1px_4px_rgba(0,0,0,0.9)]">
              {awardTitle}
            </p>
            <p className="mt-1 text-yellow-400 text-xs font-bold leading-tight line-clamp-1 drop-shadow-[0_1px_4px_rgba(0,0,0,0.9)]">
              {groupLabel}
            </p>
            {item.work && (
              <p className="mt-1 text-gray-200 text-xs leading-tight line-clamp-2 drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]">
                {item.work}
              </p>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}

function PhotoCard({ image }) {
  return (
    <motion.a
      href={tmdbImg(image.file_path, "original")}
      target="_blank"
      rel="noreferrer"
      className={`group relative z-0 block aspect-[2/3] overflow-hidden rounded-2xl bg-zinc-900 hover:z-[60] focus:z-[60] focus:outline-none ${CARD_HOVER_RING}`}
      whileHover={{
        y: -7,
        boxShadow:
          "0 20px 45px -24px rgba(16,185,129,0.72), 0 18px 32px -28px rgba(0,0,0,0.9)",
      }}
      transition={{ type: "spring", stiffness: 360, damping: 26 }}
    >
      <OptimizedImage
        src={tmdbImg(image.file_path, "w500")}
        alt=""
        className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.06]"
        loading="lazy"
        decoding="async"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-transparent to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
      <div className="absolute bottom-2 right-2 rounded bg-black/65 px-2 py-1 font-mono text-[10px] text-white opacity-0 backdrop-blur transition-opacity group-hover:opacity-100">
        {image.width}x{image.height}
      </div>
    </motion.a>
  );
}

// Proporción de cada imagen etiquetada (TMDb da `aspect_ratio`, y si no, su
// ancho y alto): la tarjeta la respeta para no recortar la imagen.
function taggedImageAspect(image) {
  const ratio = Number(image?.aspect_ratio);
  if (Number.isFinite(ratio) && ratio > 0) return ratio;
  const width = Number(image?.width);
  const height = Number(image?.height);
  return width > 0 && height > 0 ? width / height : 16 / 9;
}

// Alto objetivo y hueco de las páginas de apariciones en medios según el
// ancho de la ventana (los mismos cortes que el carrusel).
const MEDIA_ROW_HEIGHTS = [
  [1024, 208],
  [640, 176],
  [0, 144],
];
const MEDIA_ROW_GAPS = [
  [1280, 18],
  [900, 16],
  [640, 14],
  [0, 8],
];
const pickByViewport = (table, viewport) =>
  table.find(([min]) => viewport >= min)[1];

// Reparto en páginas JUSTIFICADAS (como una galería de fotos): en cada
// página las tarjetas comparten alto y ese alto se ajusta para que, con su
// proporción, llenen el ancho exacto de la fila. Ninguna imagen se recorta y
// ninguna tarjeta queda cortada en el borde. Se añaden tarjetas a la página
// mientras el alto resultante no baje del objetivo; con la siguiente ya por
// debajo, se queda la opción (con o sin ella) más cercana al objetivo. La
// última página, si no llega a llenar, va al alto objetivo y alineada a la
// izquierda en vez de agrandarse.
// TELÉFONO (`phone`): una imagen apaisada (backdrop) va como mucho con un
// póster al lado y nunca con otra apaisada; con dos pósters la fila quedaba
// demasiado apretada.
function buildJustifiedMediaPages(images, width, gap, targetHeight, { phone = false } = {}) {
  const pages = [];
  let page = [];
  let aspectSum = 0;
  const heightFor = (count, sum) => (width - gap * (count - 1)) / sum;
  const isLandscape = (aspect) => aspect > 1;
  for (const image of images) {
    const aspect = taggedImageAspect(image);
    if (phone && page.length > 0) {
      const landscapes =
        page.filter((item) => isLandscape(item.aspect)).length +
        (isLandscape(aspect) ? 1 : 0);
      if (landscapes > 1 || (landscapes === 1 && page.length + 1 > 2)) {
        pages.push({ items: page, height: heightFor(page.length, aspectSum) });
        page = [];
        aspectSum = 0;
      }
    }
    if (page.length > 0) {
      const withNext = heightFor(page.length + 1, aspectSum + aspect);
      if (withNext < targetHeight) {
        const without = heightFor(page.length, aspectSum);
        if (Math.abs(withNext - targetHeight) < Math.abs(without - targetHeight)) {
          page.push({ image, aspect });
          pages.push({ items: page, height: withNext });
          page = [];
          aspectSum = 0;
          continue;
        }
        pages.push({ items: page, height: without });
        page = [];
        aspectSum = 0;
      }
    }
    page.push({ image, aspect });
    aspectSum += aspect;
  }
  if (page.length > 0) {
    pages.push({
      items: page,
      height: Math.min(targetHeight, heightFor(page.length, aspectSum)),
    });
  }
  return pages;
}

function TaggedMediaRow({ images }) {
  const ref = useRef(null);
  const [layout, setLayout] = useState(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const measure = () => {
      const width = Math.floor(el.getBoundingClientRect().width);
      const viewport = window.innerWidth;
      const next = {
        width,
        gap: pickByViewport(MEDIA_ROW_GAPS, viewport),
        height: pickByViewport(MEDIA_ROW_HEIGHTS, viewport),
        phone: viewport < 640,
      };
      setLayout((current) =>
        current &&
        current.width === next.width &&
        current.gap === next.gap &&
        current.height === next.height &&
        current.phone === next.phone
          ? current
          : next,
      );
    };
    measure();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", measure);
      return () => window.removeEventListener("resize", measure);
    }
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const pages = useMemo(
    () =>
      layout?.width
        ? buildJustifiedMediaPages(images, layout.width, layout.gap, layout.height, {
            phone: layout.phone,
          })
        : [],
    [images, layout],
  );

  return (
    // Hasta medir, el hueco del alto objetivo: la sección no salta al llegar.
    <div ref={ref} className={pages.length ? "" : "h-36 sm:h-44 lg:h-52"}>
      {pages.length ? (
        <ActorRowCarousel variant="pages">
          {pages.map((page) => (
            <div
              key={page.items[0].image.file_path}
              className="flex"
              style={{ gap: layout.gap }}
            >
              {page.items.map(({ image, aspect }) => (
                <TaggedMediaCard
                  key={image.file_path}
                  image={image}
                  // Ancho redondeado hacia abajo: la suma nunca pasa del de
                  // la fila por decimales.
                  width={Math.floor(page.height * aspect * 100) / 100}
                  height={page.height}
                />
              ))}
            </div>
          ))}
        </ActorRowCarousel>
      ) : null}
    </div>
  );
}

function TaggedMediaCard({ image, width, height }) {
  const title = image?.media?.title || image?.media?.name || "";

  return (
    <motion.a
      href={tmdbImg(image.file_path, "original")}
      target="_blank"
      rel="noreferrer"
      // Tamaño de su página justificada (TaggedMediaRow), con la proporción
      // de la imagen: sin recortes ni bandas.
      className={`group relative z-0 block shrink-0 overflow-hidden rounded-2xl bg-zinc-900/60 hover:z-[60] focus:z-[60] focus:outline-none ${CARD_HOVER_RING}`}
      style={{ width, height }}
      whileHover={{
        y: -7,
        boxShadow:
          "0 20px 45px -24px rgba(16,185,129,0.72), 0 18px 32px -28px rgba(0,0,0,0.9)",
      }}
      transition={{ type: "spring", stiffness: 360, damping: 26 }}
    >
      <OptimizedImage
        src={tmdbImg(image.file_path, "w780")}
        alt=""
        className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.06]"
        loading="lazy"
        decoding="async"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
      <div className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity duration-300 group-hover:opacity-100">
        <ExternalLink className="h-6 w-6 text-white drop-shadow" />
      </div>
      {title && (
        <div className="absolute bottom-0 left-0 right-0 translate-y-2 p-3 opacity-0 transition-all duration-300 group-hover:translate-y-0 group-hover:opacity-100">
          <p className="line-clamp-1 text-xs font-bold text-white">{title}</p>
        </div>
      )}
    </motion.a>
  );
}

/* --- MAIN COMPONENT --- */

export default function ActorDetails({
  actorDetails,
  actorMovies,
  initialKnownFor = [],
  initialWatchedCredits = [],
}) {
  const personId = actorDetails?.id;
  const contentTopRef = useRef(null);
  const initialExternalIds = actorDetails?.external_ids || null;
  const hasInitialExtra = Boolean(
    actorDetails?.combined_credits ||
    actorDetails?.external_ids ||
    actorDetails?.images ||
    actorDetails?.tagged_images ||
    actorDetails?.translations,
  );

  // UI States
  const [loadingExtra, setLoadingExtra] = useState(
    Boolean(personId && TMDB_API_KEY && !hasInitialExtra),
  );
  const [extraErr, setExtraErr] = useState("");

  // Data States
  const [externalIds, setExternalIds] = useState(initialExternalIds);
  const [actorHeight, setActorHeight] = useState(null);
  const [actorCountryCodes, setActorCountryCodes] = useState([]);
  const [externalLinksOpen, setExternalLinksOpen] = useState(false);
  const [combinedCredits, setCombinedCredits] = useState(
    actorDetails?.combined_credits || null,
  );
  const [images, setImages] = useState(actorDetails?.images || null);
  const [taggedImages, setTaggedImages] = useState(
    actorDetails?.tagged_images || null,
  );
  const [translations, setTranslations] = useState(
    actorDetails?.translations || null,
  );
  const [awards, setAwards] = useState([]);
  const [loadingAwards, setLoadingAwards] = useState(
    Boolean(initialExternalIds?.wikidata_id),
  );
  const [awardsErr, setAwardsErr] = useState("");
  const [tmdbKnownFor, setTmdbKnownFor] = useState(() =>
    (initialKnownFor || [])
      .map(normalizeKnownForItem)
      .filter((item) => item?.poster_path),
  );
  const [watchedCredits, setWatchedCredits] = useState(() =>
    normalizeWatchedCredits(initialWatchedCredits),
  );


  const profileSrc = tmdbImg(actorDetails?.profile_path, "h632");
  const profileLowSrc = tmdbImg(actorDetails?.profile_path, "w342");
  const [failedProfileSrc, setFailedProfileSrc] = useState(null);
  const tmdbUrl = personId
    ? `https://www.themoviedb.org/person/${personId}`
    : null;

  const mobileCoverLoad = useImageLoadReady(profileLowSrc || profileSrc);
  const [mobileCoverFailedSrc, setMobileCoverFailedSrc] = useState(null);
  const mobileCoverReady =
    !profileSrc || mobileCoverLoad.ready || mobileCoverFailedSrc === (profileLowSrc || profileSrc);

  const isBackNav = useIsHistoryNavigation();
  const animateMobileEntry = !isBackNav;

  const {
    rootRef: heroRootRef,
    coverSpacerRef: heroCoverSpacerRef,
    actionRowRef: heroActionRowRef,
    secondaryTriggerRef: heroSecondaryTriggerRef,
    isPhone,
    revealProps: heroRevealProps,
    rootStyle: heroRootStyle,
  } = useMobileDetailsHero(true, {
    lock: mobileCoverReady,
  });

  // MÓVIL: ranking, nombre y botones van lo más abajo posible, con los
  // botones justo encima del navbar inferior (ACTOR_HERO_NAV_GAP_PX). La foto
  // NO cambia: entera a todo el ancho (`--mobile-cover-h` = 150vw, sin zoom
  // ni recorte) y con su borde inferior difuminado, como en las demás
  // páginas de detalles. Solo crece el hueco en flujo
  // (`--actor-cover-spacer-h`); en móviles altos el grupo queda bajo el pie
  // de la foto, sobre su prolongación difuminada.
  // La medida va directa al DOM (como en useMobileDetailsHero) y el navbar se
  // relee solo si cambia el ancho una vez vista la foto: la barra de
  // direcciones cambia el alto al hacer scroll.
  const heroActionsWrapRef = useRef(null);
  const mobileCoverReadyRef = useRef(mobileCoverReady);
  useLayoutEffect(() => {
    mobileCoverReadyRef.current = mobileCoverReady;
  }, [mobileCoverReady]);
  useLayoutEffect(() => {
    const root = heroRootRef.current;
    const spacer = heroCoverSpacerRef.current;
    const actions = heroActionsWrapRef.current;
    if (!isPhone || !root || !spacer || !actions) return undefined;
    let navTop = null;
    let lastWidth = 0;
    const applied = {};
    const write = (name, value) => {
      if (applied[name] === value) return;
      applied[name] = value;
      root.style.setProperty(name, value);
    };
    const update = () => {
      const widthChanged = window.innerWidth !== lastWidth;
      lastWidth = window.innerWidth;
      if (navTop == null || widthChanged || !mobileCoverReadyRef.current) {
        navTop = readBottomNavTop();
      }
      const spacerRect = spacer.getBoundingClientRect();
      // La caja de la fila (con su `-top-2`), no la fila: esta entra subiendo
      // con un `transform` y una medida a medio camino la descolocaría.
      const belowSpacer = actions.getBoundingClientRect().bottom - spacerRect.bottom;
      const spacerTop = spacerRect.top + window.scrollY;
      const spacerHeight = Math.max(
        window.innerWidth * ACTOR_HERO_MIN_SPACER_RATIO,
        navTop - ACTOR_HERO_NAV_GAP_PX - belowSpacer - spacerTop,
      );
      write("--actor-cover-spacer-h", `${Math.floor(spacerHeight)}px`);
    };
    update();
    window.addEventListener("resize", update, { passive: true });
    const observer =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
    observer?.observe(actions);
    return () => {
      window.removeEventListener("resize", update);
      observer?.disconnect();
      root.style.removeProperty("--actor-cover-spacer-h");
    };
  }, [isPhone, heroRootRef, heroCoverSpacerRef]);

  const actorLike = useActorLike(personId);

  // ====== Poster 3D Tilt ======
  const posterWrapRef = useRef(null);
  const posterTiltRef = useRef(null);
  const posterAnimRafRef = useRef(0);
  const posterTargetRef = useRef({ rx: 0, ry: 0, s: 1 });
  const posterStateRef = useRef({ rx: 0, ry: 0, s: 1 });
  const posterIsInteractingRef = useRef(false);

  useEffect(() => {
    // A server-rendered image can fail before hydration attaches onError.
    const image = posterTiltRef.current?.querySelector("img");
    if (image?.complete && image.naturalWidth === 0) {
      setFailedProfileSrc(profileSrc);
    } else if (image?.complete) {
      image.dataset.loaded = "true";
    }
  }, [profileSrc]);

  const prefersReducedMotion = useReducedMotion();
  const [poster3dEnabled, setPoster3dEnabled] = useState(false);

  const POSTER_MAX = 10;
  const POSTER_SCALE = 1.03;

  useEffect(() => {
    if (prefersReducedMotion) {
      setPoster3dEnabled(false);
      return;
    }
    if (typeof window === "undefined") return;
    const media = window.matchMedia("(hover: hover) and (pointer: fine)");
    const update = () => setPoster3dEnabled(media.matches);
    update();
    if (media.addEventListener) media.addEventListener("change", update);
    else media.addListener(update);
    return () => {
      if (media.removeEventListener)
        media.removeEventListener("change", update);
      else media.removeListener(update);
    };
  }, [prefersReducedMotion]);

  const kickPosterAnimation = useCallback(() => {
    if (!poster3dEnabled || posterAnimRafRef.current) return;
    const el = posterTiltRef.current;
    if (!el) return;

    const loop = () => {
      const cur = posterStateRef.current;
      const target = posterTargetRef.current;
      const k = posterIsInteractingRef.current ? 0.18 : 0.14;

      cur.rx += (target.rx - cur.rx) * k;
      cur.ry += (target.ry - cur.ry) * k;
      cur.s += (target.s - cur.s) * k;

      el.style.transform =
        `translateZ(0px) rotateX(${cur.rx.toFixed(3)}deg) rotateY(${cur.ry.toFixed(3)}deg) ` +
        `scale3d(${cur.s.toFixed(4)}, ${cur.s.toFixed(4)}, ${cur.s.toFixed(4)})`;

      const isSettled =
        Math.abs(target.rx - cur.rx) < 0.02 &&
        Math.abs(target.ry - cur.ry) < 0.02 &&
        Math.abs(target.s - cur.s) < 0.002;

      if (!isSettled) {
        posterAnimRafRef.current = window.requestAnimationFrame(loop);
      } else {
        posterAnimRafRef.current = 0;
      }
    };
    posterAnimRafRef.current = window.requestAnimationFrame(loop);
  }, [poster3dEnabled]);

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

      posterIsInteractingRef.current = true;
      posterTargetRef.current = { rx, ry, s: POSTER_SCALE };
      kickPosterAnimation();
    },
    [kickPosterAnimation, poster3dEnabled],
  );

  const resetPosterTarget = useCallback(() => {
    posterIsInteractingRef.current = false;
    posterTargetRef.current = { rx: 0, ry: 0, s: 1 };
    kickPosterAnimation();
  }, [kickPosterAnimation]);

  useEffect(() => {
    const el = posterTiltRef.current;
    if (!el) return;

    if (!poster3dEnabled) {
      el.style.transform =
        "translateZ(0px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)";
      if (posterAnimRafRef.current) {
        window.cancelAnimationFrame(posterAnimRafRef.current);
        posterAnimRafRef.current = 0;
      }
      return;
    }

    posterIsInteractingRef.current = false;
    posterTargetRef.current = { rx: 0, ry: 0, s: 1 };
    posterStateRef.current = { rx: 0, ry: 0, s: 1 };
    el.style.transform =
      "translateZ(0px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)";

    return () => {
      if (posterAnimRafRef.current) {
        window.cancelAnimationFrame(posterAnimRafRef.current);
        posterAnimRafRef.current = 0;
      }
    };
  }, [poster3dEnabled, profileSrc]);

  const loadAwardsForWikidata = useCallback((wikidataId) => {
    if (!wikidataId) {
      setLoadingAwards(false);
      setAwards([]);
      return;
    }

    setLoadingAwards(true);
    setAwardsErr("");
    fetchWikidataAwards(wikidataId)
      .then((items) => setAwards(items))
      .catch((err) => {
        console.warn("No se pudieron cargar los premios de Wikidata:", err);
        setAwardsErr("No se pudieron cargar los premios.");
      })
      .finally(() => setLoadingAwards(false));
  }, []);

  const loadAll = useCallback(async () => {
    if (!TMDB_API_KEY || !personId) return;
    setLoadingExtra(true);
    setExtraErr("");
    setAwardsErr("");
    setAwards([]);
    setTmdbKnownFor([]);
    const qs = `api_key=${encodeURIComponent(TMDB_API_KEY)}`;
    const lang = `&language=es-ES`;

    const endpoints = {
      external: `${TMDB_BASE}/person/${personId}/external_ids?${qs}`,
      combined: `${TMDB_BASE}/person/${personId}/combined_credits?${qs}${lang}`,
      images: `${TMDB_BASE}/person/${personId}/images?${qs}`,
      tagged: `${TMDB_BASE}/person/${personId}/tagged_images?${qs}&page=1`,
      translations: `${TMDB_BASE}/person/${personId}/translations?${qs}`,
      knownFor: `${TMDB_BASE}/person/${personId}/known_for?${qs}${lang}`,
    };

    const settled = await Promise.allSettled([
      fetchJson(endpoints.external),
      fetchJson(endpoints.combined),
      fetchJson(endpoints.images),
      fetchJson(endpoints.tagged),
      fetchJson(endpoints.translations),
      endpoints.knownFor
        ? fetchJson(endpoints.knownFor)
        : Promise.resolve(null),
    ]);

    const [ex, cc, im, tg, tr, kf] = settled;
    const firstErr = settled.find((r) => r.status === "rejected")?.reason
      ?.message;
    if (firstErr) setExtraErr(firstErr);

    const nextExternal = ex.status === "fulfilled" ? ex.value : null;
    if (nextExternal) setExternalIds(nextExternal);
    if (cc.status === "fulfilled") setCombinedCredits(cc.value);
    if (im.status === "fulfilled") setImages(im.value);
    if (tg.status === "fulfilled") setTaggedImages(tg.value);
    if (tr.status === "fulfilled") setTranslations(tr.value);
    if (kf.status === "fulfilled" && kf.value) {
      const results = Array.isArray(kf.value?.results)
        ? kf.value.results
        : Array.isArray(kf.value?.known_for)
          ? kf.value.known_for
          : (kf.value?.results || []).find(
              (result) => String(result?.id) === String(personId),
            )?.known_for || [];
      const knownFor = results
        .map(normalizeKnownForItem)
        .filter((item) => item?.poster_path);
      if (knownFor.length > 0) {
        setTmdbKnownFor(knownFor);
      }
    }

    setLoadingExtra(false);
    loadAwardsForWikidata(nextExternal?.wikidata_id);
  }, [loadAwardsForWikidata, personId]);

  useEffect(() => {
    setExternalIds(initialExternalIds);
    setCombinedCredits(actorDetails?.combined_credits || null);
    setImages(actorDetails?.images || null);
    setTaggedImages(actorDetails?.tagged_images || null);
    setTranslations(actorDetails?.translations || null);
    setWatchedCredits(normalizeWatchedCredits(initialWatchedCredits));
    setTmdbKnownFor(
      (initialKnownFor || [])
        .map(normalizeKnownForItem)
        .filter((item) => item?.poster_path),
    );

    if (!personId || !TMDB_API_KEY) {
      setLoadingExtra(false);
      setLoadingAwards(false);
      return;
    }

    if (hasInitialExtra) {
      setLoadingExtra(false);
      setAwards([]);
      setAwardsErr("");
      loadAwardsForWikidata(initialExternalIds?.wikidata_id);
      return;
    }

    loadAll();
  }, [
    actorDetails?.known_for_department,
    actorDetails?.combined_credits,
    actorDetails?.images,
    actorDetails?.tagged_images,
    actorDetails?.translations,
    hasInitialExtra,
    initialExternalIds,
    initialKnownFor,
    initialWatchedCredits,
    loadAll,
    loadAwardsForWikidata,
    personId,
  ]);

  useEffect(() => {
    if (!personId) {
      setWatchedCredits([]);
      return undefined;
    }

    const controller = new AbortController();

    fetch(`/api/trakt/person/${encodeURIComponent(personId)}/watched`, {
      cache: "no-store",
      credentials: "include",
      signal: controller.signal,
    })
      .then((res) => {
        if (!res.ok) throw new Error("No se pudieron actualizar los títulos vistos");
        return res.json();
      })
      .then((payload) => {
        if (controller.signal.aborted) return;
        const items = Array.isArray(payload?.items) ? payload.items : [];
        setWatchedCredits(items.filter((item) => item?.poster_path));
      })
      // Keep the server snapshot if the background refresh fails.
      .catch(() => {});

    return () => controller.abort();
  }, [personId]);

  // --- Computed Data ---
  const creditsAll = useMemo(() => {
    if (combinedCredits?.cast || combinedCredits?.crew) {
      const cast = (combinedCredits.cast || []).map((c) => ({
        ...c,
        kind: "acting",
        department: "Acting",
      }));
      const crew = (combinedCredits.crew || []).map((c) => ({
        ...c,
        kind: "crew",
        department: c.department || "Crew",
      }));

      return [...cast, ...crew]
        .filter((x) => x?.id)
        .map((c) => {
          const media_type =
            c.media_type || (c.first_air_date ? "tv" : "movie");
          const date = media_type === "tv" ? c.first_air_date : c.release_date;
          return {
            ...c,
            media_type,
            year: yearFromDate(date),
            date,
            subtitle: c.character ? `como ${c.character}` : c.job ? c.job : "",
          };
        });
    }

    // Fallback
    return (Array.isArray(actorMovies) ? actorMovies : [])
      .map((m) => ({
        ...m,
        kind: "acting",
        department: "Acting",
        media_type: "movie",
        year: yearFromDate(m.release_date),
        date: m.release_date,
        subtitle: m.character ? `como ${m.character}` : "",
      }))
      .filter((x) => x.id);
  }, [combinedCredits, actorMovies]);

  // Créditos de cada tipo, sin filtrar: cada sección (Películas, Series)
  // aplica los suyos (CreditsMediaSection).
  const movieCredits = useMemo(
    () => creditsAll.filter((item) => item.media_type === "movie"),
    [creditsAll],
  );
  const seriesCredits = useMemo(
    () => creditsAll.filter((item) => item.media_type === "tv"),
    [creditsAll],
  );
  // Los mismos sin repetir título, en el orden por defecto: lo que enseñan
  // las vistas laterales y cuentan el menú y los títulos de sección.
  const movieCreditsAll = useMemo(
    () => dedupeCreditsForDisplay(filterAndSortCredits(movieCredits, CREDIT_FILTERS_ALL)),
    [movieCredits],
  );
  const seriesCreditsAll = useMemo(
    () => dedupeCreditsForDisplay(filterAndSortCredits(seriesCredits, CREDIT_FILTERS_ALL)),
    [seriesCredits],
  );

  const stats = useMemo(
    () => ({
      total: creditsAll.length,
      movies: creditsAll.filter((x) => x.media_type === "movie").length,
      tv: creditsAll.filter((x) => x.media_type === "tv").length,
      acting: creditsAll.filter((x) => x.kind === "acting").length,
      crew: creditsAll.filter((x) => x.kind === "crew").length,
    }),
    [creditsAll],
  );

  // Los créditos de TV se fechan con el estreno de la SERIE, no con el episodio
  // en el que sale la persona, así que una aparición suelta en una gala o un
  // programa diario arrastraba el inicio de la trayectoria décadas atrás (ver
  // careerRange.js, con los casos medidos). La regla y su porqué viven en el
  // helper, que además está cubierto por tests.
  const careerYears = useMemo(
    () =>
      formatCareerRange(careerRange(creditsAll, actorDetails?.birthday)),
    [creditsAll, actorDetails?.birthday],
  );

  const mostPopularCredit = useMemo(() => {
    const knownForFirst = tmdbKnownFor.find((item) => item?.poster_path);
    if (knownForFirst) return knownForFirst;

    return [...creditsAll]
      .filter(
        (x) =>
          x.poster_path &&
          x.kind === "acting" &&
          !isSelfLikeCredit(x.character),
      )
      .sort((a, b) => knownForFallbackScore(b) - knownForFallbackScore(a))[0];
  }, [creditsAll, tmdbKnownFor]);

  const awardStats = useMemo(
    () => ({
      total: awards.length,
      wins: awards.filter((item) => item.status === "winner").length,
      nominations: awards.filter((item) => item.status === "nominee").length,
    }),
    [awards],
  );

  const socials = useMemo(() => {
    const ex = externalIds || {};
    const imdb = actorDetails?.imdb_id || ex?.imdb_id;
    const tiktokId = ex?.tiktok_id
      ? String(ex.tiktok_id).replace(/^@/, "")
      : "";
    const youtubeId = ex?.youtube_id
      ? String(ex.youtube_id).replace(/^\//, "")
      : "";
    return {
      homepage: actorDetails?.homepage,
      imdb: imdb ? `https://www.imdb.com/name/${imdb}` : null,
      tmdb: tmdbUrl,
      instagram: ex?.instagram_id
        ? `https://www.instagram.com/${ex.instagram_id}`
        : null,
      twitter: ex?.twitter_id ? `https://x.com/${ex.twitter_id}` : null,
      facebook: ex?.facebook_id
        ? `https://www.facebook.com/${ex.facebook_id}`
        : null,
      youtube: youtubeId
        ? `https://www.youtube.com/${
            youtubeId.startsWith("@") ? youtubeId : `channel/${youtubeId}`
          }`
        : null,
      tiktok: tiktokId ? `https://www.tiktok.com/@${tiktokId}` : null,
    };
  }, [externalIds, actorDetails, tmdbUrl]);

  // Wikipedia la resuelve el modal como en las fichas de títulos
  // (/api/links/wikipedia): el artículo en español o, si no hay, en inglés,
  // por la entidad de Wikidata o, sin ella, por el id de IMDb (nm…). Antes se
  // enlazaba `es.wikipedia.org/wiki/Special:EntityPage/Q…`, que Wikipedia no
  // resuelve.
  const actorWikipediaQuery = useMemo(() => {
    const wikidataId = externalIds?.wikidata_id || null;
    const imdbId = actorDetails?.imdb_id || externalIds?.imdb_id || null;
    return wikidataId || imdbId ? { wikidataId, imdbId } : null;
  }, [externalIds?.wikidata_id, externalIds?.imdb_id, actorDetails?.imdb_id]);

  const actorExternalLinks = useMemo(() => {
    const links = [
      socials.homepage
        ? {
            id: "web",
            label: "Web oficial",
            icon: "/logo-Web.png",
            href: socials.homepage,
          }
        : null,
      socials.imdb
        ? {
            id: "imdb",
            label: "IMDb",
            icon: "/logo-IMDb.svg",
            href: socials.imdb,
            iconSize: { width: 42, height: 22 },
            iconClassName:
              "!w-[42px] !h-[22px] lg:!w-[44px] lg:!h-[22px] rounded-none object-contain overflow-visible",
          }
        : null,
      socials.instagram
        ? {
            id: "instagram",
            label: "Instagram",
            icon: "/instagram.png",
            href: socials.instagram,
            iconSize: { width: 24, height: 24 },
            iconClassName: "!h-6 !w-6 rounded-none object-contain overflow-visible",
            menuIconClassName: "h-4 w-4 rounded-none object-contain",
          }
        : null,
      socials.twitter
        ? {
            id: "twitter",
            label: "X",
            icon: "/x.png",
            href: socials.twitter,
            iconSize: { width: 24, height: 24 },
            iconClassName: "!h-6 !w-6 rounded-none object-contain overflow-visible",
            menuIconClassName: "h-4 w-4 rounded-none object-contain",
          }
        : null,
      socials.facebook
        ? {
            id: "facebook",
            label: "Facebook",
            icon: "/facebook.png",
            href: socials.facebook,
            iconSize: { width: 24, height: 24 },
            iconClassName: "!h-6 !w-6 rounded-none object-contain overflow-visible",
            menuIconClassName: "h-4 w-4 rounded-none object-contain",
          }
        : null,
      socials.youtube
        ? {
            id: "youtube",
            label: "YouTube",
            icon: "/youtube.webp",
            href: socials.youtube,
            iconSize: { width: 26, height: 26 },
            iconClassName: "!h-[26px] !w-[26px] rounded-none object-contain overflow-visible",
            menuIconClassName: "h-4 w-4 rounded-none object-contain",
          }
        : null,
      socials.tmdb
        ? {
            id: "tmdb",
            label: "TMDb",
            icon: "/logo-TMDb.png",
            href: socials.tmdb,
            size: 38,
            iconSize: { width: 34, height: 34 },
            iconClassName:
              "!w-[34px] !h-[34px] lg:!w-[36px] lg:!h-[36px] rounded-lg shadow-none object-contain",
          }
        : null,
    ].filter(Boolean);

    const seen = new Set();
    return links.filter((link) => {
      if (!link?.href || seen.has(link.href)) return false;
      seen.add(link.href);
      return true;
    });
  }, [socials]);

  const age = calcAge(actorDetails?.birthday, actorDetails?.deathday);
  const formattedActorHeight = actorHeight
    ? `${actorHeight.toLocaleString("es-ES", { maximumFractionDigits: 2 })} m`
    : null;
  // TELÉFONO: nacimiento, fallecimiento, altura y lugar (con banderas) no van
  // en la cabecera sino como primera pestaña del menú Detalles · Popular ·
  // Biografía, con las mismas tarjetas. Desde `sm` siguen en su fila.
  const actorProfileTab = isPhone
    ? {
        id: "profile",
        label: "Perfil",
        cards: [
          {
            label: "Nacimiento",
            icon: Cake,
            value: actorDetails?.birthday ? (
              <span>
                {formatHumanDate(actorDetails.birthday)}
                {age ? (
                  <span className="ml-1.5 text-emerald-400">({age} años)</span>
                ) : null}
              </span>
            ) : null,
          },
          {
            label: "Fallecimiento",
            icon: Skull,
            value: actorDetails?.deathday ? (
              <span className="text-red-400">
                † {formatHumanDate(actorDetails.deathday)}
              </span>
            ) : null,
          },
          {
            label: "Altura",
            icon: Ruler,
            value: formattedActorHeight,
          },
          {
            label: "Lugar de nacimiento",
            icon: MapPin,
            value: actorDetails?.place_of_birth ? (
              <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
                <span>{formatActorPlaceOfBirth(actorDetails.place_of_birth)}</span>
                {actorCountryCodes.map((countryCode) => (
                  <span
                    key={countryCode}
                    role="img"
                    aria-label={`Bandera de nacionalidad ${countryCode}`}
                    className="text-base leading-none"
                  >
                    {countryFlagEmoji(countryCode)}
                  </span>
                ))}
              </span>
            ) : null,
          },
        ],
      }
    : null;
  useEffect(() => {
    let active = true;
    setActorHeight(null);
    if (externalIds?.wikidata_id) {
      fetchWikidataHeight(externalIds.wikidata_id)
        .then((height) => {
          if (active) setActorHeight(height);
        })
        .catch(() => {
          if (active) setActorHeight(null);
        });
    }
    return () => {
      active = false;
    };
  }, [externalIds?.wikidata_id]);
  useEffect(() => {
    let active = true;
    setActorCountryCodes([]);
    if (externalIds?.wikidata_id) {
      fetchWikidataCountryCodes(externalIds.wikidata_id)
        .then((codes) => {
          if (active) setActorCountryCodes(codes);
        })
        .catch(() => {
          if (active) setActorCountryCodes([]);
        });
    }
    return () => {
      active = false;
    };
  }, [externalIds?.wikidata_id]);
  const esBio = translations?.translations?.find((t) => t.iso_639_1 === "es")
    ?.data?.biography;
  const bio = esBio || actorDetails?.biography || "";
  const photos = useMemo(
    () => [...(images?.profiles || [])].sort(
      (a, b) => (b.vote_count || 0) - (a.vote_count || 0),
    ),
    [images],
  );

  const taggedCount = taggedImages?.results?.length || 0;
  const photosCount = photos.length;



  // --- Títulos por los que se le conoce: 6 créditos únicos más populares ---
  const popularItems = useMemo(() => {
    const byTitle = new Map();

    const addItem = (item) => {
      if (!item?.id || !item?.poster_path) return;
      const key = knownForKey(item);
      const current = byTitle.get(key);
      if (
        !current ||
        knownForFallbackScore(item) > knownForFallbackScore(current)
      ) {
        byTitle.set(key, item);
      }
    };

    tmdbKnownFor.forEach(addItem);

    creditsAll
      .filter(
        (x) =>
          x.poster_path &&
          x.kind === "acting" &&
          !isSelfLikeCredit(x.character),
      )
      .forEach(addItem);

    const officialKeys = new Set(tmdbKnownFor.map(knownForKey));
    const official = tmdbKnownFor
      .filter((item) => byTitle.has(knownForKey(item)))
      .map((item) => byTitle.get(knownForKey(item)));

    const fallback = Array.from(byTitle.values())
      .filter((item) => !officialKeys.has(knownForKey(item)))
      .sort((a, b) => knownForFallbackScore(b) - knownForFallbackScore(a));

    const movies = fallback.filter((item) => item.media_type !== "tv");
    const tv = fallback.filter((item) => item.media_type === "tv");
    const orderedFallback =
      movies.length >= 6 - official.length ? movies : [...movies, ...tv];

    return [...official, ...orderedFallback].slice(
      0,
      Math.max(6, Math.min(official.length, 8)),
    );
  }, [creditsAll, tmdbKnownFor]);

  // Títulos del FONDO de mosaico, por relevancia: «Conocido por» y después el
  // resto de créditos por popularidad, sin apariciones como sí mismo/a. El
  // fondo pide sus pósters SIN IDIOMA en un lote (ActorCollageBackground).
  const collageTitles = useMemo(() => {
    const knownFor = popularItems?.length
      ? popularItems
      : tmdbKnownFor?.length
        ? tmdbKnownFor
        : initialKnownFor || [];
    const credits = (creditsAll.length ? creditsAll : actorMovies || [])
      .filter((item) => item?.id && !isSelfLikeCredit(item.character))
      .sort((a, b) => creditPopularityScore(b) - creditPopularityScore(a));
    return [...knownFor, ...credits];
  }, [popularItems, tmdbKnownFor, initialKnownFor, creditsAll, actorMovies]);

  // COMPARTIR: la misma hoja que la ficha de un título (imagen y vídeo
  // generados), en su variante de listas: foto de perfil como portada y
  // «Conocido/a por» en la vista previa (lib/actor/shareActor).
  const actorShare = useMemo(() => {
    const facts = [
      stats.movies > 0
        ? { icon: "film", label: "Películas", value: String(stats.movies) }
        : null,
      stats.tv > 0
        ? { icon: "tv", label: "Series", value: String(stats.tv) }
        : null,
      careerYears && careerYears !== "—"
        ? { icon: "calendar", label: "Trayectoria", value: careerYears }
        : null,
      actorDetails?.birthday
        ? {
            icon: "calendar",
            label: actorDetails?.deathday ? "Nacimiento" : "Edad",
            value: actorDetails?.deathday
              ? formatHumanDate(actorDetails.birthday)
              : `${age} años`,
          }
        : null,
      awardStats.wins > 0
        ? { icon: "trophy", label: "Premios", value: String(awardStats.wins) }
        : null,
      awardStats.nominations > 0
        ? { icon: "star", label: "Nominaciones", value: String(awardStats.nominations) }
        : null,
      watchedCredits.length > 0
        ? { icon: "eye", label: "Vistos", value: String(watchedCredits.length) }
        : null,
      actorDetails?.place_of_birth
        ? { icon: "users", label: "Lugar de nacimiento", value: actorDetails.place_of_birth, wide: true }
        : null,
    ].filter(Boolean);
    return buildActorShare({
      person: actorDetails,
      biography: bio,
      credits: creditsAll.filter((item) => !isSelfLikeCredit(item.character)),
      knownFor: popularItems,
      score: knownForFallbackScore,
      careerYears,
      facts,
    });
  }, [
    actorDetails,
    age,
    awardStats.nominations,
    awardStats.wins,
    bio,
    careerYears,
    creditsAll,
    popularItems,
    stats.movies,
    stats.tv,
    watchedCredits.length,
  ]);
  const {
    handleShare: handleShareActor,
    copied: actorLinkCopied,
    sheet: actorShareSheet,
    open: actorShareOpen,
  } = useShareAction({
    title: actorShare.title,
    text: `Descubre la ficha de ${actorDetails?.name || "esta persona"} en The Show Verse.`,
    card: actorShare.card,
    story: actorShare.story,
    kind: "list",
  });

  const { session, account, authenticated = false } = useAuth();
  const [hasBackendSession] = useState(() => {
    if (typeof window === "undefined") return false;
    const cookie = document.cookie || "";
    return (
      cookie.includes("showverse_access_token=") ||
      cookie.includes("backend_access_token=") ||
      cookie.includes("access_token=")
    );
  });

  const allCardItems = useMemo(() => {
    const map = new Map();
    const addItem = (item) => {
      if (!item?.id) return;
      const tmdbId = Number(item.id);
      const mediaType =
        item.media_type === "tv" || item.kind === "tv" ? "tv" : "movie";
      const k = `${mediaType}:${tmdbId}`;
      if (!map.has(k)) {
        map.set(k, { tmdbId, mediaType });
      }
    };
    (popularItems || []).forEach(addItem);
    (watchedCredits || []).forEach(addItem);
    (combinedCredits?.cast || []).forEach(addItem);
    (combinedCredits?.crew || []).forEach(addItem);
    return Array.from(map.values());
  }, [popularItems, watchedCredits, combinedCredits]);

  const actorViewerStates = useViewerTitleStates(
    allCardItems,
    authenticated || hasBackendSession
  );

  const [actorAccountStates, setActorAccountStates] = useState({});
  const actorAccountStatesRef = useRef({});
  const actorAccountStateInFlightRef = useRef(new Set());

  const [actorImdbRatings, setActorImdbRatings] = useState({});
  const actorImdbRatingsRef = useRef({});
  const actorImdbRatingInFlightRef = useRef(new Set());

  useEffect(() => {
    actorAccountStatesRef.current = actorAccountStates;
  }, [actorAccountStates]);

  useEffect(() => {
    actorImdbRatingsRef.current = actorImdbRatings;
  }, [actorImdbRatings]);

  const handlePrefetchHover = useCallback(
    async (item, mediaType, isFavorite) => {
      if (!item?.id) return;

      if (session && account?.id && session !== "showverse") {
        const key = `${mediaType}:${item.id}`;
        if (
          !actorAccountStatesRef.current[key] &&
          !actorAccountStateInFlightRef.current.has(key)
        ) {
          actorAccountStateInFlightRef.current.add(key);
          try {
            const st = await getMediaAccountStates(mediaType, item.id, session);
            const next = {
              favorite: Boolean(st?.favorite),
              watchlist: Boolean(st?.watchlist),
              rating:
                st?.rated && typeof st.rated.value === "number"
                  ? st.rated.value
                  : null,
            };
            setActorAccountStates((prev) => ({ ...prev, [key]: next }));
          } catch {
            setActorAccountStates((prev) => ({
              ...prev,
              [key]: { favorite: false, watchlist: false, rating: null },
            }));
          } finally {
            actorAccountStateInFlightRef.current.delete(key);
          }
        }
      }

      if (!isFavorite) {
        const key = `${mediaType}:${item.id}`;
        if (
          !Object.prototype.hasOwnProperty.call(
            actorImdbRatingsRef.current,
            key
          ) &&
          !actorImdbRatingInFlightRef.current.has(key)
        ) {
          actorImdbRatingInFlightRef.current.add(key);
          try {
            const ext =
              item?.imdb_id || item?.imdbId
                ? null
                : await getExternalIds(mediaType, item.id);
            const imdbId =
              item?.imdb_id || item?.imdbId || ext?.imdb_id || null;
            if (imdbId) {
              const payload = await fetchImdbRatingByImdb(imdbId, {
                timeoutMs: 5_000,
              });
              const rating = Number(payload?.rating);
              const nextRating =
                Number.isFinite(rating) && rating > 0 ? rating : null;
              setActorImdbRatings((prev) => ({ ...prev, [key]: nextRating }));
            } else {
              setActorImdbRatings((prev) => ({ ...prev, [key]: null }));
            }
          } catch {
            setActorImdbRatings((prev) => ({ ...prev, [key]: null }));
          } finally {
            actorImdbRatingInFlightRef.current.delete(key);
          }
        }
      }
    },
    [account?.id, session]
  );

  // Tarjeta de un crédito en los carruseles de Películas y Series.
  const renderCreditCard = useCallback(
    (c, index) => (
      <PosterCard
        key={`${c.media_type || "m"}-${c.id}-${c.credit_id || index}`}
        item={c}
        viewerStates={actorViewerStates}
        accountStates={actorAccountStates}
        imdbRatings={actorImdbRatings}
        onPrefetchHover={handlePrefetchHover}
      />
    ),
    [actorViewerStates, actorAccountStates, actorImdbRatings, handlePrefetchHover],
  );

  // VISTAS LATERALES de las secciones (como en DetailsClient): pulsar el
  // título abre su contenido completo. Qué panel está abierto vive en un
  // almacén fuera del estado de la ficha: abrirlo no la re-renderiza.
  const sectionSheetStore = useMemo(() => createValueStore(null), []);
  const sectionSheetOpener = useCallback(
    (id) => () => openActorSectionSheet(sectionSheetStore, id),
    [sectionSheetStore],
  );
  const sectionSheetData = useMemo(
    () => ({
      popular: popularItems,
      watched: watchedCredits,
      movies: movieCreditsAll,
      series: seriesCreditsAll,
      // Sin deduplicar, para que la vista lateral los filtre como la sección.
      moviesRaw: movieCredits,
      seriesRaw: seriesCredits,
      filterCredits: (list, filters) =>
        dedupeCreditsForDisplay(
          filterAndSortCredits(list, { ...CREDIT_FILTERS_ALL, ...filters }),
        ),
      // Al formato de las filas de premios de la ficha (AwardRow).
      awards: awards.map((item) => {
        const awardTitle = cleanAwardTitle(item?.award);
        return {
          id: item.id,
          category: awardTitle,
          groupName: awardTitle,
          groupImageUrl: item.groupImageUrl || fallbackAwardImageUrl(awardTitle),
          people: item.work ? [item.work] : [],
          result: item.status === "winner" ? "winner" : "nominee",
          year: item.year,
        };
      }),
      photos,
      tagged: taggedImages?.results || [],
      // Todos los créditos (actuación y equipo) para el camino por años.
      filmography: creditsAll,
    }),
    [popularItems, watchedCredits, movieCreditsAll, seriesCreditsAll, movieCredits, seriesCredits, awards, photos, taggedImages, creditsAll],
  );

  const sectionItems = useMemo(() => {
    const items = [];
    if (popularItems.length > 0)
      items.push({ id: "popular", label: "Destacados", icon: Star });
    if (watchedCredits.length > 0)
      items.push({
        id: "watched",
        label: "Vistos",
        icon: CheckCircle2,
        count: watchedCredits.length,
      });
    if (movieCreditsAll.length > 0)
      items.push({
        id: "movies",
        label: "Películas",
        icon: Film,
        count: movieCreditsAll.length,
      });
    if (seriesCreditsAll.length > 0)
      items.push({
        id: "series",
        label: "Series",
        icon: TvIcon,
        count: seriesCreditsAll.length,
      });
    items.push({
      id: "awards",
      label: "Premios",
      icon: Trophy,
      count: awardStats.total,
    });
    if (photosCount > 0)
      items.push({
        id: "photos",
        label: "Fotos",
        icon: Images,
        count: photosCount,
      });
    if (taggedCount > 0)
      items.push({
        id: "tagged",
        label: "En medios",
        icon: Tags,
        count: taggedCount,
      });
    return items;
  }, [
    popularItems.length,
    watchedCredits.length,
    movieCreditsAll.length,
    seriesCreditsAll.length,
    awardStats.total,
    photosCount,
    taggedCount,
  ]);

  // El navbar superior se hace compacto en móvil: el menú tiene que pegarse a
  // ÉL, no a la altura de escritorio. Compartido con DetailsClient.
  const STICKY_TOP = useDetailsStickyTop();
  const sentinelRef = useRef(null);
  const menuStickyRef = useRef(null);
  const sectionElsRef = useRef({});

  const [menuCompact, setMenuCompact] = useState(false);
  const [menuH, setMenuH] = useState(0);
  const [activeSectionId, setActiveSectionId] = useState(null);

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
      window.scrollTo({
        top: Math.max(0, y),
        behavior: prefersReducedMotion ? "auto" : "smooth",
      });
    },
    [menuH, prefersReducedMotion, STICKY_TOP],
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const ids = (sectionItems || []).map((x) => x?.id).filter(Boolean);
    if (!ids.length) return;

    let raf = 0;
    const compute = () => {
      const offset = STICKY_TOP + (menuH || 0) + 16;
      let current = ids[0];

      for (const sid of ids) {
        const el = sectionElsRef.current[sid];
        if (!el) continue;
        const top = el.getBoundingClientRect().top;
        if (top - offset <= 0) current = sid;
        else break;
      }

      setActiveSectionId((prev) => (prev === current ? prev : current));
    };

    const onScroll = () => {
      if (raf) return;
      raf = window.requestAnimationFrame(() => {
        raf = 0;
        compute();
      });
    };

    compute();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);

    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf) window.cancelAnimationFrame(raf);
    };
  }, [sectionItems, menuH, STICKY_TOP]);

  return (
    <div
      ref={heroRootRef}
      style={heroRootStyle}
      className="min-h-screen bg-black text-zinc-100 font-sans selection:bg-emerald-500/30 selection:text-emerald-200"
    >
      {/* Fondo de la página. MÓVIL: aparece con el scroll detrás de la
          portada fija, como en los detalles de listas y colecciones. */}
      <div className="sv-hero-scroll-in max-sm:[opacity:var(--sv-hero-scroll,0)] sm:opacity-100">
        <ActorCollageBackground titles={collageTitles} />
      </div>

      {/* MÓVIL (<640px): la cabecera inmersiva de listas y colecciones. La
          foto va FIJA en el fondo, pegada arriba y a los lados bajo el navbar
          transparente, con el borde inferior prolongado y difuminado; con el
          scroll se desvanece mientras entra el fondo. */}
      <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden sm:hidden">
        <div data-actor-portrait="">
          <MobileHeroCover
            objectPosition="center 20%"
            src={profileSrc}
            lowSrc={profileLowSrc}
            imgRef={mobileCoverLoad.imgRef}
            onLoad={mobileCoverLoad.onLoad}
            onError={() => setMobileCoverFailedSrc(profileLowSrc || profileSrc)}
            failed={mobileCoverFailedSrc === (profileLowSrc || profileSrc)}
            ready={mobileCoverReady}
            animate={animateMobileEntry}
            blurredUnderlay
            adaptiveContrast
            // Transición a la prolongación difuminada más larga que la de
            // serie (64px): la foto se va desenfocando poco a poco y no se
            // nota una franja en el pie.
            edgeBandPx={ACTOR_COVER_EDGE_BAND_PX}
            collage={(
              <div
                role="img"
                aria-label={`Sin foto de ${actorDetails?.name || "esta persona"}`}
                className="flex h-full w-full items-center justify-center text-zinc-700"
              >
                <User className="h-20 w-20" />
              </div>
            )}
          />
        </div>

        {/* Sombreados de legibilidad: siguen al scroll hasta el 60%; la foto
            entra limpia. */}
        <div className="sv-hero-scroll-shade absolute inset-0 max-sm:[opacity:calc(var(--sv-hero-scroll,0)*0.6)]">
          <div className="absolute inset-0 bg-gradient-to-t from-black via-black/60 to-transparent" />
        </div>
      </div>

      <div
        ref={contentTopRef}
        // MÓVIL sin relleno inferior: el layout ya reserva el navbar inferior
        // y, con los 96px de aquí, al llegar al tope quedaba un hueco vacío.
        className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 lg:pt-12 pb-24 max-sm:pb-0"
      >
        <motion.div
          initial={false}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
          // MÓVIL inmersivo: sube hasta el borde superior (los 2rem del `pt-8`
          // + los 3rem del navbar) para que el hueco coincida con la portada
          // fija, y sin `transform` (como en los detalles de listas).
          className="-mt-[5rem] sm:mt-0 flex flex-col lg:flex-row gap-5 sm:gap-8 lg:gap-12 mb-12 items-start transform-gpu max-sm:![transform:none]"
        >
          {/* Hueco en flujo de la portada fija para la vista móvil */}
          <div
            ref={heroCoverSpacerRef}
            data-mobile-cover-spacer=""
            className="relative -mx-4 w-[calc(100%+2rem)] max-w-none flex-shrink-0 sm:hidden"
            style={{ height: "var(--actor-cover-spacer-h, var(--mobile-cover-h))" }}
          />

          {/* --- COLUMNA IZQUIERDA: POSTER + SOCIALS EN ESCRITORIO --- */}
          <div className="w-full max-w-[280px] lg:max-w-[320px] mx-auto lg:mx-0 flex-shrink-0 hidden sm:flex flex-col gap-5 relative z-10 transition-[max-width] duration-500 ease-out">
            {/* Profile Image */}
            <div className="relative">
              <div
                ref={posterWrapRef}
                onPointerMove={(e) =>
                  setPosterTargetFromPointer(e.clientX, e.clientY)
                }
                onPointerLeave={resetPosterTarget}
                onPointerDown={(e) => {
                  if (!poster3dEnabled) return;
                  e.currentTarget.setPointerCapture?.(e.pointerId);
                  setPosterTargetFromPointer(e.clientX, e.clientY);
                }}
                className="relative"
                style={{
                  perspective: poster3dEnabled ? 1100 : undefined,
                  transformStyle: "preserve-3d",
                  touchAction: "pan-y",
                }}
              >
                <div
                  ref={posterTiltRef}
                  data-actor-portrait=""
                  // Sin borde ni anillo claro: marcaban el contorno de la foto.
                  className="relative rounded-2xl overflow-hidden shadow-2xl shadow-black/80 bg-black/40 aspect-[2/3]"
                  style={{
                    transformStyle: "preserve-3d",
                    backfaceVisibility: "hidden",
                    WebkitBackfaceVisibility: "hidden",
                    outline: "1px solid transparent",
                    isolation: "isolate",
                    willChange: poster3dEnabled ? "transform" : undefined,
                  }}
                >
                  <div className="absolute inset-0 bg-neutral-950 z-10 overflow-hidden">
                    {profileSrc && failedProfileSrc !== profileSrc ? (
                      <OptimizedImage
                        key={profileSrc}
                        src={profileSrc}
                        alt={actorDetails?.name}
                        width={421}
                        height={632}
                        priority
                        fetchPriority="high"
                        decoding="async"
                        onLoad={(event) => {
                          event.currentTarget.dataset.loaded = "true";
                        }}
                        onError={() => setFailedProfileSrc(profileSrc)}
                        className="actor-profile-image w-full h-full object-cover"
                      />
                    ) : (
                      <div role="img" aria-label={`Sin foto de ${actorDetails?.name || "esta persona"}`} className="w-full h-full flex items-center justify-center text-zinc-600">
                        <User className="w-16 h-16" />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* --- COLUMNA DERECHA: INFO --- */}
          <div className="flex-1 flex flex-col min-w-0 w-full">
            {/* MÓVIL: columna con los botones primero y los datos debajo; el
                nombre sube sobre el pie de la foto (donde listas y
                colecciones ponen su título) y la entrada de FadeIn no aplica:
                su `opacity` dejaría plano el cristal de los botones. */}
            <FadeIn
              delay={0.06}
              className="relative mb-5 px-1 max-sm:flex max-sm:flex-col max-sm:![opacity:1] max-sm:![transform:none]"
            >
              <div
                className={`mb-3 flex flex-wrap items-end justify-center gap-x-4 gap-y-2 md:justify-start max-sm:pointer-events-none max-sm:absolute max-sm:inset-x-0 max-sm:bottom-[calc(100%+1.5rem)] max-sm:mb-0 max-sm:flex-col-reverse max-sm:items-center max-sm:gap-y-2.5 max-sm:px-4 max-sm:[&_h1]:drop-shadow-[0_2px_12px_rgba(0,0,0,0.85)] ${
                  !animateMobileEntry
                    ? ""
                    : mobileCoverReady
                      ? "max-sm:motion-safe:animate-sv-mobile-scoreboard-reveal max-sm:[animation-delay:140ms]"
                      : "max-sm:invisible"
                }`}
              >
                <h1 className="text-4xl md:text-5xl lg:text-6xl font-black text-white leading-[1] tracking-tight text-balance drop-shadow-xl text-center md:text-left">
                  {safeText(actorDetails?.name)}
                </h1>
                <ActorPopularity value={actorDetails?.popularity} personId={personId} />
              </div>

              {/* Desde `sm`. En teléfono estos datos son la primera pestaña
                  de las de abajo («Perfil», `actorProfileTab`). */}
              {/* Iconos y texto con sombra (y los iconos en claro): sobre
                  pósters claros del mosaico de fondo se perdían. */}
              <div className="hidden sm:block w-full overflow-x-auto no-scrollbar">
                <div data-actor-metadata className="flex flex-nowrap items-center gap-x-3 sm:gap-x-4 text-sm sm:text-base md:text-lg font-medium text-zinc-300 whitespace-nowrap w-fit mx-auto md:mx-0 [text-shadow:0_1px_2px_rgba(0,0,0,0.9),0_0_10px_rgba(0,0,0,0.6)] [&_svg]:drop-shadow-[0_1px_2px_rgba(0,0,0,0.95)]">
                  {actorDetails?.birthday && (
                    <span className="shrink-0 flex items-center gap-1.5">
                      <Cake className="w-4 h-4 text-zinc-300 shrink-0" />
                      <span>{formatHumanDate(actorDetails.birthday)}</span>
                      {age && (
                        <span className="text-emerald-400 font-semibold">
                          ({age} años)
                        </span>
                      )}
                    </span>
                  )}
                  {actorDetails?.deathday && (
                    <span className="shrink-0 flex items-center gap-1.5 text-red-400">
                      <Skull className="w-4 h-4 shrink-0" />
                      <span>† {formatHumanDate(actorDetails.deathday)}</span>
                    </span>
                  )}
                  {formattedActorHeight && (
                    <span className="shrink-0 flex items-center gap-1.5">
                      <Ruler
                        className="h-4 w-4 text-zinc-300 shrink-0"
                        aria-hidden="true"
                      />
                      <span>{formattedActorHeight}</span>
                    </span>
                  )}
                  {actorDetails?.place_of_birth && (
                    <span className="shrink-0 flex items-center gap-1.5">
                      {(actorDetails?.birthday || actorDetails?.deathday || formattedActorHeight) && (
                        <span
                          className="mr-1 h-1 w-1 rounded-full bg-zinc-300 shrink-0 shadow-[0_0_3px_rgba(0,0,0,0.95)]"
                          aria-hidden="true"
                        />
                      )}
                      <span>{formatActorPlaceOfBirth(actorDetails.place_of_birth)}</span>
                      {actorCountryCodes.length > 0 && (
                        <span className="ml-1 inline-flex items-center gap-1 shrink-0">
                          {actorCountryCodes.map((countryCode) => (
                            <span
                              key={countryCode}
                              role="img"
                              aria-label={`Bandera de nacionalidad ${countryCode}`}
                              className="text-base leading-none"
                            >
                              {countryFlagEmoji(countryCode)}
                            </span>
                          ))}
                        </span>
                      )}
                    </span>
                  )}
                </div>
              </div>
              {/* MÓVIL: justo bajo la foto (`-top-2`), con la entrada de
                  listas y colecciones (la fila sube y los botones caen en
                  cascada) cuando la foto está lista; hasta entonces, invisible
                  pero ocupando su sitio. */}
              <div
                ref={heroActionsWrapRef}
                className="relative mt-4 max-sm:order-1 max-sm:mt-0 max-sm:-top-2 max-sm:mb-4"
              >
                <div
                  ref={heroActionRowRef}
                  className={
                    !animateMobileEntry
                      ? ""
                      : mobileCoverReady
                        ? MOBILE_ACTIONS_ENTRY_ANIMATION
                        : "max-sm:invisible"
                  }
                >
                  <div
                    // La fila de listas y colecciones (en escritorio, los 52px
                    // de DetailsClient) con el tamaño MÓVIL de DetailsClient:
                    // sus 8 botones se reparten el ancho, así que aquí cada
                    // uno mide lo de un octavo de fila aunque haya 4 (36px a
                    // 360px, 40px a 390px, 45px a 430px).
                    // Sobre el ancho de la propia fila (el `%` del tope se
                    // resuelve contra ella, como el reparto de DetailsClient:
                    // 8 botones y 7 huecos de 4px), no de la ventana. Los 8px
                    // de más son el `px-1` de esta columna, que la fila de
                    // DetailsClient no tiene: 100% + 8px − 28px.
                    className={`${LIST_DETAILS_ACTION_ROW_CLASS} [--detail-action-mobile-size:clamp(34px,calc((100%-20px)/8),56px)]`}
                  >
                    {/* Me gusta en el servidor, igual que en colecciones y
                        listas: cuenta en el perfil y queda en la actividad
                        (like_actor). Sin sesión, desactivado. */}
                    <ListLikeButton
                      key={actorLike.ready ? "ready" : "pending"}
                      endpoint={`/api/community/actors/${encodeURIComponent(personId)}/like`}
                      likes={actorLike.likes}
                      liked={actorLike.liked}
                      canLike={authenticated && actorLike.ready}
                      onChange={actorLike.update}
                      groupId="actor-details-actions"
                      liquidGlass
                    />

                    <ActorActionButton
                      onClick={handleShareActor}
                      aria-haspopup="dialog"
                      active={actorShareOpen}
                      activeColor="blue"
                      groupId="actor-details-actions"
                      title={actorLinkCopied ? "Enlace copiado" : "Compartir ficha"}
                    >
                      {actorLinkCopied ? (
                        <Check aria-hidden="true" />
                      ) : (
                        <Share2 aria-hidden="true" />
                      )}
                    </ActorActionButton>

                    <ActorActionButton
                      onClick={() => setExternalLinksOpen(true)}
                      active={externalLinksOpen}
                      activeColor="purple"
                      groupId="actor-details-actions"
                      title="Enlaces externos"
                      aria-haspopup="dialog"
                      aria-expanded={externalLinksOpen}
                    >
                      <Link2 aria-hidden="true" />
                    </ActorActionButton>

                    {/* Abre la vista lateral «Filmografía»: todo lo que ha
                        hecho, por departamento y año, como en TMDb. */}
                    <ActorActionButton
                      onClick={sectionSheetOpener("filmography")}
                      activeColor="emerald"
                      groupId="actor-details-actions"
                      title="Ver filmografía"
                      aria-haspopup="dialog"
                    >
                      <Film aria-hidden="true" />
                    </ActorActionButton>
                  </div>
                </div>
              </div>

              {actorShareSheet}

              {/* Mismo modal de enlaces que los botones de acción de
                  DetailsClient. */}
              <ExternalLinksModal
                open={externalLinksOpen}
                onClose={() => setExternalLinksOpen(false)}
                links={actorExternalLinks}
                wikipedia={actorWikipediaQuery}
              />

            </FadeIn>

            {/* MÓVIL: centinela del revelado; la biografía y sus pestañas
                aparecen al hacer scroll, como la sinopsis de las colecciones. */}
            <span
              ref={heroSecondaryTriggerRef}
              aria-hidden="true"
              className="block h-px sm:hidden"
            />

            <div className={MOBILE_REVEAL_BASE} {...heroRevealProps}>
              <DetailsInfoTabs
                key={personId}
                layoutId={`actor-info-tabs-${personId}`}
                leadingTab={actorProfileTab}
                productionTabLabel="Popular"
                synopsisTabLabel="Biografía"
                // En teléfono la biografía es una pestaña más (Detalles · Popular ·
                // Biografía); desde `sm`, debajo de las pestañas.
                synopsisBelowTabs={!isPhone}
                // En teléfono, la biografía recogida mide como una pestaña de
                // 4 tarjetas (Detalles): 8 líneas en vez de 4.
                synopsisCollapsedLines={isPhone ? 8 : 4}
                accentColor="emerald"
                showAwardsTab={false}
                showPlatformsTab={false}
                enableMobileTabSwipe
                expandableSynopsis
                detailCards={[
                  {
                    label: "Conocido/a por",
                    value: actorDetails?.known_for_department || "—",
                    icon: Briefcase,
                  },
                  {
                    label: "Créditos",
                    value: (
                      <span title={`${stats.movies} películas · ${stats.tv} series`}>
                        {stats.total}
                      </span>
                    ),
                    icon: Film,
                  },
                  {
                    label: "Trayectoria",
                    value: careerYears || "—",
                    icon: Calendar,
                  },
                  {
                    label: "Premios",
                    value: loadingAwards ? "Cargando…" : (
                      <span title={`${awardStats.wins} ganados · ${awardStats.nominations} nominaciones`}>
                        {awardStats.total || "—"}
                      </span>
                    ),
                    icon: Trophy,
                  },
                ]}
                productionCards={[
                  {
                    label: "Crédito más popular",
                    icon: Star,
                    value: mostPopularCredit
                      ? `${mostPopularCredit.title || mostPopularCredit.name}${mostPopularCredit.year ? ` · ${mostPopularCredit.year}` : ""}`
                      : "Sin créditos disponibles.",
                  },
                ]}
                overview={bio || "Sin biografía disponible."}
              />
            </div>

          </div>
        </motion.div>

        {/* =================================================================
            MENÚ DE NAVEGACIÓN STICKY Y SECCIONES DE CONTENIDO
           ================================================================= */}
        <div className="mt-8 sm:mt-10">
          <div ref={sentinelRef} className="h-px w-full" />
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
              colorScheme="emerald"
            />
          </div>

          {/* MÓVIL: la última sección sin su margen inferior; queda solo el
              hueco del carrusel para la sombra del hover (`pb-8`), así la
              página topa con la última fila unos 35px sobre el navbar inferior. */}
          {/* `mt-14`: el mismo hueco que DetailsClient entre el menú de
              secciones y la primera sección. */}
          <div className="mt-14 space-y-14 max-sm:[&>section:last-child_section]:mb-0">
            {popularItems.length > 0 && (
              <section id="section-popular" ref={registerSection("popular")}>
                <AnimatedSection delay={0.04}>
                  <section className="mb-16 group/section">
                    <SectionTitle
                      accent="emerald"
                      title="Conocido por"
                      icon={Star}
                      onOpen={sectionSheetOpener("popular")}
                    />
                    <ActorRowCarousel>
                      {popularItems.map((item, index) => (
                        <PosterCard
                          key={`popular-${item.id}-${item.credit_id || index}`}
                          item={item}
                          viewerStates={actorViewerStates}
                          accountStates={actorAccountStates}
                          imdbRatings={actorImdbRatings}
                          onPrefetchHover={handlePrefetchHover}
                        />
                      ))}
                    </ActorRowCarousel>
                  </section>
                </AnimatedSection>
              </section>
            )}

            {watchedCredits.length > 0 && (
              <section id="section-watched" ref={registerSection("watched")}>
                <AnimatedSection delay={0.04}>
                  <section className="mb-16 group/section">
                    <SectionTitle
                      accent="emerald"
                      onOpen={sectionSheetOpener("watched")}
                      title="Títulos vistos"
                      subtitle={`${watchedCredits.length} títulos vistos de ${safeText(actorDetails?.name)}`}
                      icon={CheckCircle2}
                    />
                    <ActorRowCarousel>
                      {watchedCredits.map((item, index) => (
                        <PosterCard
                          key={`watched-${item.media_type || "movie"}-${item.id}-${index}`}
                          item={item}
                          viewerStates={actorViewerStates}
                          accountStates={actorAccountStates}
                          imdbRatings={actorImdbRatings}
                          onPrefetchHover={handlePrefetchHover}
                        />
                      ))}
                    </ActorRowCarousel>
                  </section>
                </AnimatedSection>
              </section>
            )}

            {/* Créditos en pantalla, en dos secciones: Películas y Series,
                cada una con sus filtros y su vista lateral. */}
            {movieCredits.length > 0 && (
              <section id="section-movies" ref={registerSection("movies")}>
                <AnimatedSection delay={0.04}>
                  <CreditsMediaSection
                    key={`movies-${personId}`}
                    title="Películas"
                    icon={Film}
                    credits={movieCredits}
                    totalCount={movieCreditsAll.length}
                    countLabel="películas"
                    person={actorDetails}
                    onOpen={sectionSheetOpener("movies")}
                    renderCard={renderCreditCard}
                  />
                </AnimatedSection>
              </section>
            )}

            {seriesCredits.length > 0 && (
              <section id="section-series" ref={registerSection("series")}>
                <AnimatedSection delay={0.04}>
                  <CreditsMediaSection
                    key={`series-${personId}`}
                    title="Series"
                    icon={TvIcon}
                    credits={seriesCredits}
                    totalCount={seriesCreditsAll.length}
                    countLabel="series"
                    person={actorDetails}
                    onOpen={sectionSheetOpener("series")}
                    renderCard={renderCreditCard}
                  />
                </AnimatedSection>
              </section>
            )}

            <section id="section-awards" ref={registerSection("awards")}>
              <AnimatedSection delay={0.04}>
                <section className="mb-16 group/section">
                  <SectionTitle
                    accent="emerald"
                    onOpen={sectionSheetOpener("awards")}
                    title="Premios"
                    subtitle={
                      loadingAwards
                        ? "Cargando reconocimientos..."
                        : awardStats.total > 0
                          ? `${awardStats.wins} ganados · ${awardStats.nominations} nominaciones`
                          : "Reconocimientos públicos disponibles"
                    }
                    icon={Trophy}
                  />

                  {loadingAwards ? (
                    <ActorRowCarousel variant="award">
                      {Array.from({ length: 3 }).map((_, idx) => (
                        <div
                          key={`award-loading-${idx}`}
                          className="h-32 rounded-2xl border border-white/5 bg-white/[0.04] animate-pulse"
                        />
                      ))}
                    </ActorRowCarousel>
                  ) : awards.length > 0 ? (
                    <ActorRowCarousel variant="award">
                      {awards.map((item) => (
                        <AwardCard key={item.id} item={item} />
                      ))}
                    </ActorRowCarousel>
                  ) : (
                    <div className="rounded-[2rem] border border-dashed border-white/10 bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-lg shadow-lg px-6 py-12 text-center">
                      <Trophy className="mx-auto mb-3 h-12 w-12 text-zinc-600" />
                      <p className="font-semibold text-zinc-300">
                        No hay premios públicos disponibles para esta persona.
                      </p>
                      <p className="mx-auto mt-2 max-w-lg text-sm text-zinc-500">
                        {awardsErr ||
                          "Cuando TMDb incluye un identificador de Wikidata, se muestran aquí premios y nominaciones registrados públicamente."}
                      </p>
                    </div>
                  )}
                </section>
              </AnimatedSection>
            </section>

            {photos.length > 0 && (
              <section id="section-photos" ref={registerSection("photos")}>
                <AnimatedSection delay={0.04}>
                  <section className="mb-16 group/section">
                    <SectionTitle
                      accent="emerald"
                      onOpen={sectionSheetOpener("photos")}
                      title="Fotos"
                      subtitle={`${photos.length} imágenes`}
                      icon={Images}
                    />
                    <ActorRowCarousel>
                      {photos.map((p) => (
                        <PhotoCard key={p.file_path} image={p} />
                      ))}
                    </ActorRowCarousel>
                  </section>
                </AnimatedSection>
              </section>
            )}

            {taggedImages?.results?.length > 0 && (
              <section id="section-tagged" ref={registerSection("tagged")}>
                <AnimatedSection delay={0.04}>
                  <section className="mb-16 group/section">
                    <SectionTitle
                      accent="emerald"
                      onOpen={sectionSheetOpener("tagged")}
                      title="Apariciones en medios"
                      subtitle="Imágenes donde aparece etiquetado/a"
                      icon={Tags}
                    />
                    <TaggedMediaRow images={taggedImages.results} />
                  </section>
                </AnimatedSection>
              </section>
            )}
          </div>
        </div>
      </div>

      <ActorSectionSheets store={sectionSheetStore} data={sectionSheetData} />

      <style jsx global>{`
        @keyframes actor-profile-enter {
          from {
            opacity: 0;
            scale: 1.045;
          }
          to {
            opacity: 1;
            scale: 1;
          }
        }
        @media (prefers-reduced-motion: no-preference) {
          .actor-profile-image[data-loaded="true"] {
            animation: actor-profile-enter 520ms cubic-bezier(0.22, 1, 0.36, 1) both;
          }
        }
        @media (hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference) {
          .actor-profile-image {
            transform: scale(1.08);
          }
        }
        .no-scrollbar::-webkit-scrollbar {
          display: none;
        }
        .no-scrollbar {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
        .mask-fade-bottom {
          mask-image: linear-gradient(to bottom, black 55%, transparent 100%);
        }
      `}</style>
    </div>
  );
}
