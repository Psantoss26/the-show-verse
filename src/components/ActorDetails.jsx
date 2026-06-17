// ActorDetails.jsx
"use client";

import OptimizedImage from "@/components/OptimizedImage";
import {
  Children,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  useRef,
} from "react";
import Link from "next/link";
import { createPortal } from "react-dom";
import { Swiper, SwiperSlide } from "swiper/react";
import { FreeMode } from "swiper/modules";
import "swiper/swiper-bundle.css";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  Award,
  CheckCircle2,
  ExternalLink,
  Film,
  Tv as TvIcon,
  User,
  Cake,
  Skull,
  Briefcase,
  TrendingUp,
  Star,
  Search,
  Filter,
  SlidersHorizontal,
  Images,
  Tags,
  Trophy,
  X,
  ArrowUpDown,
  ChevronDown,
  Calendar,
} from "lucide-react";
import {
  AnimatedSection,
  FadeIn,
  ScaleIn,
  StaggerContainer,
} from "@/components/details/AnimatedSection";
import { ExternalLinkButton } from "@/components/details/DetailHeaderBits";
import DetailsSectionMenu from "./DetailsSectionMenu";

/* --- CONFIG & UTILS --- */
const TMDB_API_KEY = process.env.NEXT_PUBLIC_TMDB_API_KEY;
const TMDB_BASE = "https://api.themoviedb.org/3";
const ACTOR_LIQUID_CARD_CLASS =
  "relative isolate overflow-hidden rounded-[2rem] border border-transparent bg-black/10 bg-gradient-to-br from-white/10 via-white/5 to-transparent backdrop-blur-[15px] shadow-[0_14px_36px_-18px_rgba(0,0,0,0.75)] transform-gpu";
const ACTOR_LIQUID_CARD_LAYER_CLASS =
  "pointer-events-none absolute inset-0 rounded-[inherit] bg-gradient-to-br from-white/10 via-transparent to-black/10 opacity-70";

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

const genderLabel = (g) => {
  if (g === 1) return "Mujer";
  if (g === 2) return "Hombre";
  if (g === 3) return "No binario";
  return "N/A";
};

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
    kind: "acting",
    media_type,
    year: yearFromDate(date),
    date,
    subtitle: "",
  };
};

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
  const roleScore = Math.max(0, 20 - Math.min(order, 20)) * 2.2;
  const voteScore = Math.log10(voteCount + 1) * 8;
  const popularityScore = Math.sqrt(Math.max(popularity, 0)) * 7;
  const mediaScore = isMovie ? 18 : Math.min(episodeCount, 30) * 0.9;
  const guestPenalty =
    !isMovie && episodeCount > 0 && episodeCount < 6 ? 0.2 : 1;

  return (
    (popularityScore + voteScore + voteAverage * 1.5 + roleScore + mediaScore) *
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

  const entityParams = new URLSearchParams({
    action: "wbgetentities",
    ids: wikidataId,
    props: "claims",
    format: "json",
    origin: "*",
  });
  const entityRes = await fetch(wikidataUrl(entityParams), {
    cache: "force-cache",
  });
  const entityJson = await entityRes.json().catch(() => ({}));
  if (!entityRes.ok) throw new Error("No se pudieron cargar los premios");

  const claims = entityJson?.entities?.[wikidataId]?.claims || {};
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

/* --- UI COMPONENTS --- */

function SectionTitle({ title, subtitle, icon: Icon, right }) {
  return (
    <div className="flex items-start justify-between gap-4 mb-5 w-full">
      <div className="flex items-center gap-3 flex-1 min-w-0">
        {Icon && (
          <div className="relative flex items-center justify-center p-2.5 rounded-[14px] bg-emerald-500/5 backdrop-blur-2xl shadow-[0_4px_24px_rgba(16,185,129,0.12)] shrink-0 overflow-hidden group-hover/section:bg-emerald-500/10 group-hover/section:shadow-[0_8px_32px_rgba(16,185,129,0.2)] transition-all duration-500">
            <div className="absolute inset-0 bg-gradient-to-br from-emerald-400/20 via-transparent to-transparent opacity-60" />
            <div className="absolute inset-0 shadow-[inset_0_1px_2px_rgba(255,255,255,0.15),inset_0_-1px_2px_rgba(0,0,0,0.2)] rounded-[14px] pointer-events-none" />
            <Icon className="relative z-10 w-5 h-5 text-emerald-500 group-hover/section:text-emerald-400 group-hover/section:scale-110 transition-all duration-500 drop-shadow-[0_2px_8px_rgba(16,185,129,0.4)]" />
          </div>
        )}
        <div className="flex flex-col flex-1 min-w-0">
          <div className="flex items-center w-full">
            <h2 className="text-xl md:text-2xl font-bold text-white tracking-tight shrink-0">
              {title}
            </h2>
            <div className="ml-3 sm:ml-4 flex-1 h-px bg-gradient-to-r from-white/20 via-white/5 to-transparent relative flex items-center min-w-[20px]">
              <div className="absolute left-0 w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_12px_rgba(16,185,129,1)] opacity-40 group-hover/section:opacity-100 group-hover/section:scale-150 transition-all duration-500" />
              <div className="absolute left-0 w-16 sm:w-24 h-[2px] bg-gradient-to-r from-emerald-500 to-transparent opacity-0 group-hover/section:opacity-100 transition-opacity duration-500" />
            </div>
          </div>
          {subtitle && (
            <p className="text-xs sm:text-sm text-zinc-400 mt-0.5 truncate">
              {subtitle}
            </p>
          )}
        </div>
      </div>
      {right ? <div className="shrink-0">{right}</div> : null}
    </div>
  );
}

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

function InlineDropdown({
  label,
  valueLabel,
  icon: Icon,
  children,
  className = "",
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

    setMenuStyle({
      position: "fixed",
      top: rect.bottom + 8,
      left,
      width: menuWidth,
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
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  useLayoutEffect(() => {
    if (!open) return;
    updateMenuPosition();
    window.addEventListener("resize", updateMenuPosition);
    window.addEventListener("scroll", updateMenuPosition, true);
    return () => {
      window.removeEventListener("resize", updateMenuPosition);
      window.removeEventListener("scroll", updateMenuPosition, true);
    };
  }, [open, updateMenuPosition]);

  return (
    <div
      ref={ref}
      className={`relative w-full lg:w-auto lg:shrink-0 ${className}`}
    >
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="h-11 w-full inline-flex items-center justify-between gap-3 px-4 rounded-xl transition text-sm lg:min-w-[145px] bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-lg shadow-lg text-zinc-200 hover:from-white/15 hover:to-white/10 focus:outline-none border border-white/10"
      >
        <div className="flex min-w-0 items-center gap-2">
          {Icon && <Icon className="h-4 w-4 shrink-0 text-emerald-400" />}
          <span className="shrink-0 text-xs font-bold uppercase tracking-wider text-zinc-500">
            {label}:
          </span>
          <span className="truncate font-semibold text-white">
            {valueLabel}
          </span>
        </div>
        <ChevronDown
          className={`h-3.5 w-3.5 shrink-0 text-zinc-500 transition-transform ${open ? "rotate-180" : ""}`}
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
                style={menuStyle}
                className="sv-scroll max-h-[min(360px,calc(100vh-96px))] overflow-y-auto rounded-2xl border border-white/10 bg-black/40 bg-gradient-to-br from-white/10 to-white/5 shadow-2xl backdrop-blur-2xl p-2"
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
      className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm transition ${
        active
          ? "bg-white/10 text-white font-bold"
          : "text-zinc-300 hover:bg-white/5 hover:text-white"
      }`}
    >
      <span className="font-medium">{children}</span>
      {active && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />}
    </button>
  );
}

function YearFilterDropdown({
  label,
  value,
  setValue,
  options,
  className = "",
}) {
  return (
    <InlineDropdown
      label={label}
      valueLabel={value || "Todos"}
      icon={Calendar}
      className={className}
    >
      {({ close }) => (
        <>
          <DropdownItem
            active={!value}
            onClick={() => {
              setValue("");
              close();
            }}
          >
            Todos
          </DropdownItem>
          {options.map((option) => (
            <DropdownItem
              key={`${label}-${option.value}`}
              active={value === option.value}
              onClick={() => {
                setValue(option.value);
                close();
              }}
            >
              {option.label}
            </DropdownItem>
          ))}
        </>
      )}
    </InlineDropdown>
  );
}

function CreditsFilterDropdowns({
  mediaFilter,
  setMediaFilter,
  creditFilter,
  setCreditFilter,
  sort,
  setSort,
}) {
  const mediaLabel =
    mediaFilter === "all"
      ? "Todo"
      : mediaFilter === "movie"
        ? "Películas"
        : "Series";
  const creditLabel =
    creditFilter === "all"
      ? "Todos"
      : creditFilter === "crew"
        ? "Equipo"
        : "Actuación";
  const sortLabel =
    sort === "date_asc"
      ? "Antiguos"
      : sort === "pop_desc"
        ? "Popularidad"
        : sort === "rating_desc"
          ? "Mejor valorados"
          : sort === "alpha"
            ? "A-Z"
            : "Recientes";

  return (
    <>
      <InlineDropdown label="Tipo" valueLabel={mediaLabel} icon={Filter}>
        {({ close }) => (
          <>
            <DropdownItem
              active={mediaFilter === "all"}
              onClick={() => {
                setMediaFilter("all");
                close();
              }}
            >
              Todo
            </DropdownItem>
            <DropdownItem
              active={mediaFilter === "movie"}
              onClick={() => {
                setMediaFilter("movie");
                close();
              }}
            >
              Películas
            </DropdownItem>
            <DropdownItem
              active={mediaFilter === "tv"}
              onClick={() => {
                setMediaFilter("tv");
                close();
              }}
            >
              Series
            </DropdownItem>
          </>
        )}
      </InlineDropdown>

      <InlineDropdown label="Rol" valueLabel={creditLabel} icon={Briefcase}>
        {({ close }) => (
          <>
            <DropdownItem
              active={creditFilter === "acting"}
              onClick={() => {
                setCreditFilter("acting");
                close();
              }}
            >
              Actuación
            </DropdownItem>
            <DropdownItem
              active={creditFilter === "crew"}
              onClick={() => {
                setCreditFilter("crew");
                close();
              }}
            >
              Equipo técnico
            </DropdownItem>
            <DropdownItem
              active={creditFilter === "all"}
              onClick={() => {
                setCreditFilter("all");
                close();
              }}
            >
              Todos
            </DropdownItem>
          </>
        )}
      </InlineDropdown>

      <InlineDropdown label="Ordenar" valueLabel={sortLabel} icon={ArrowUpDown}>
        {({ close }) => (
          <>
            <DropdownItem
              active={sort === "date_desc"}
              onClick={() => {
                setSort("date_desc");
                close();
              }}
            >
              Más recientes
            </DropdownItem>
            <DropdownItem
              active={sort === "date_asc"}
              onClick={() => {
                setSort("date_asc");
                close();
              }}
            >
              Más antiguos
            </DropdownItem>
            <DropdownItem
              active={sort === "pop_desc"}
              onClick={() => {
                setSort("pop_desc");
                close();
              }}
            >
              Popularidad
            </DropdownItem>
            <DropdownItem
              active={sort === "rating_desc"}
              onClick={() => {
                setSort("rating_desc");
                close();
              }}
            >
              Mejor valorados
            </DropdownItem>
            <DropdownItem
              active={sort === "alpha"}
              onClick={() => {
                setSort("alpha");
                close();
              }}
            >
              Título A-Z
            </DropdownItem>
          </>
        )}
      </InlineDropdown>
    </>
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

  const breakpoints = isAward
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
            slidesPerView={3}
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
            freeMode={{ enabled: true, momentum: true, momentumRatio: 0.55 }}
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
 * PosterCard (CRÉDITOS EN PANTALLA)
 * Mismo diseño y hover que las tarjetas de Perfil.
 */
function PosterCard({ item }) {
  const title = item?.title || item?.name || "Sin título";
  const poster = tmdbImg(item?.poster_path || item?.profile_path, "w500");
  const subtitle = item?.subtitle || "";
  const year = item?.year || yearFromDate(item?.date) || null;
  const mediaType = item?.media_type === "tv" ? "tv" : "movie";
  const href =
    mediaType === "movie"
      ? `/details/movie/${item?.id}`
      : `/details/tv/${item?.id}`;
  const typeLabel = mediaType === "tv" ? "Serie" : "Película";
  const meta = subtitle || [year, typeLabel].filter(Boolean).join(" · ");

  const [err, setErr] = useState(false);

  return (
    <Link
      href={href}
      prefetch={false}
      className="group relative block w-full"
      title={title}
    >
      <div className="relative aspect-[2/3] overflow-hidden rounded-xl bg-zinc-800 border border-white/5 group-hover:border-emerald-500/50 transition-all duration-300">
        {poster && !err ? (
          <OptimizedImage
            src={poster}
            alt={title}
            className="w-full h-full object-cover grayscale-[18%] group-hover:scale-110 group-hover:grayscale-0 transition-transform duration-500"
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

        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-transparent opacity-70 group-hover:opacity-85 transition" />

        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 via-black/35 to-transparent px-2.5 pb-2.5 pt-8 backdrop-blur-[1.5px]">
          <p className="line-clamp-2 text-[13px] font-extrabold leading-[1.12] text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.85)]">
            {title}
          </p>
          <p className="mt-0.5 truncate text-[11px] font-semibold leading-tight text-emerald-300 drop-shadow-[0_1px_2px_rgba(0,0,0,0.85)]">
            {meta}
          </p>
        </div>
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
    <article className="mt-3 block group relative rounded-xl overflow-hidden shadow-md border border-transparent hover:border-yellow-500/30 lg:hover:shadow-yellow-900/20 transition-all duration-300">
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
      className="group relative z-0 block aspect-[2/3] overflow-hidden rounded-2xl border border-white/10 bg-zinc-900 hover:z-[60] focus:z-[60] focus:outline-none"
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

function PersonExternalIconButton({
  href,
  label,
  icon: Icon,
  className = "",
  iconClassName = "",
}) {
  if (!href || !Icon) return null;

  return (
    <motion.a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      title={label}
      aria-label={label}
      initial={{ opacity: 0, y: 8, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
      whileHover={{ y: -2, scale: 1.08 }}
      className={[
        "grid h-9 w-9 place-items-center rounded-xl border border-white/10 bg-zinc-900/80 text-zinc-200 shadow-lg shadow-black/30 transition-colors hover:border-emerald-400/35 hover:bg-emerald-400/10 hover:text-emerald-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300",
        className,
      ].join(" ")}
    >
      <Icon className={`h-5 w-5 ${iconClassName}`} aria-hidden="true" />
    </motion.a>
  );
}

function TaggedMediaCard({ image }) {
  const title = image?.media?.title || image?.media?.name || "";

  return (
    <motion.a
      href={tmdbImg(image.file_path, "original")}
      target="_blank"
      rel="noreferrer"
      className="group relative z-0 block aspect-[16/10] overflow-hidden rounded-2xl border border-white/10 bg-zinc-900/60 hover:z-[60] focus:z-[60] focus:outline-none"
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
  const [showFullBio, setShowFullBio] = useState(false);
  const [loadingExtra, setLoadingExtra] = useState(
    Boolean(personId && TMDB_API_KEY && !hasInitialExtra),
  );
  const [extraErr, setExtraErr] = useState("");

  // Data States
  const [externalIds, setExternalIds] = useState(initialExternalIds);
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
  const [watchedCredits, setWatchedCredits] = useState([]);

  // Filter States (Créditos)
  const [q, setQ] = useState("");
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [mediaFilter, setMediaFilter] = useState("all");
  const initialCreditFilters = getDefaultCreditFilters(actorDetails);
  const [creditFilter, setCreditFilter] = useState(
    initialCreditFilters.creditFilter,
  );
  const [deptFilter, setDeptFilter] = useState(initialCreditFilters.deptFilter);
  const [yearFrom, setYearFrom] = useState("");
  const [yearTo, setYearTo] = useState("");
  const [sort, setSort] = useState("date_desc");

  const profileSrc = tmdbImg(actorDetails?.profile_path, "h632");
  const tmdbUrl = personId
    ? `https://www.themoviedb.org/person/${personId}`
    : null;

  // ====== Poster 3D Tilt ======
  const posterWrapRef = useRef(null);
  const posterTiltRef = useRef(null);
  const posterAnimRafRef = useRef(0);
  const posterTargetRef = useRef({ rx: 0, ry: 0, s: 1 });
  const posterStateRef = useRef({ rx: 0, ry: 0, s: 1 });
  const posterIsInteractingRef = useRef(false);

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

      if (posterIsInteractingRef.current || !isSettled) {
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
      knownFor: actorDetails?.name
        ? `${TMDB_BASE}/search/person?${qs}${lang}&query=${encodeURIComponent(
            actorDetails.name,
          )}&include_adult=false&page=1`
        : null,
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
    if (kf.status === "fulfilled") {
      const match = (kf.value?.results || []).find(
        (result) => String(result?.id) === String(personId),
      );
      const knownFor = (match?.known_for || [])
        .map(normalizeKnownForItem)
        .filter((item) => item?.poster_path);
      setTmdbKnownFor(knownFor);
    }

    setLoadingExtra(false);
    loadAwardsForWikidata(nextExternal?.wikidata_id);
  }, [actorDetails?.name, loadAwardsForWikidata, personId]);

  useEffect(() => {
    const defaultCreditFilters = getDefaultCreditFilters(actorDetails);
    setQ("");
    setMediaFilter("all");
    setCreditFilter(defaultCreditFilters.creditFilter);
    setDeptFilter(defaultCreditFilters.deptFilter);
    setYearFrom("");
    setYearTo("");
    setSort("date_desc");
    setMobileFiltersOpen(false);
    setShowFullBio(false);
    setExternalIds(initialExternalIds);
    setCombinedCredits(actorDetails?.combined_credits || null);
    setImages(actorDetails?.images || null);
    setTaggedImages(actorDetails?.tagged_images || null);
    setTranslations(actorDetails?.translations || null);
    setWatchedCredits([]);
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
      .then((res) => (res.ok ? res.json() : null))
      .then((payload) => {
        if (controller.signal.aborted) return;
        const items = Array.isArray(payload?.items) ? payload.items : [];
        setWatchedCredits(items.filter((item) => item?.poster_path));
      })
      .catch((error) => {
        if (error?.name !== "AbortError") {
          setWatchedCredits([]);
        }
      });

    return () => controller.abort();
  }, [personId]);

  useLayoutEffect(() => {
    if (typeof window === "undefined") return undefined;

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

  const deptOptions = useMemo(() => {
    const set = new Set(
      creditsAll.filter((c) => c.kind === "crew").map((c) => c.department),
    );
    return Array.from(set)
      .sort()
      .map((d) => ({ value: d, label: d }));
  }, [creditsAll]);

  const yearOptions = useMemo(() => {
    const set = new Set(creditsAll.map((c) => c.year).filter((y) => y > 0));
    return Array.from(set)
      .sort((a, b) => b - a)
      .map((y) => ({ value: String(y), label: String(y) }));
  }, [creditsAll]);

  const filteredCredits = useMemo(() => {
    let out = [...creditsAll];
    const needle = q.trim().toLowerCase();

    if (mediaFilter !== "all")
      out = out.filter((x) => x.media_type === mediaFilter);
    if (creditFilter !== "all")
      out = out.filter((x) => x.kind === creditFilter);
    if (creditFilter === "crew" && deptFilter !== "all")
      out = out.filter((x) => x.department === deptFilter);
    if (yearFrom)
      out = out.filter((x) => (x.year || -Infinity) >= Number(yearFrom));
    if (yearTo) out = out.filter((x) => (x.year || Infinity) <= Number(yearTo));
    if (needle) {
      out = out.filter((x) => {
        const t = String(x.title || x.name || "").toLowerCase();
        const s = String(x.subtitle || "").toLowerCase();
        return t.includes(needle) || s.includes(needle);
      });
    }

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
  }, [
    creditsAll,
    q,
    mediaFilter,
    creditFilter,
    deptFilter,
    yearFrom,
    yearTo,
    sort,
  ]);

  const displayCreditGroups = useMemo(() => {
    const unique = dedupeCreditsForDisplay(filteredCredits);
    const shouldShowMovies = mediaFilter === "all" || mediaFilter === "movie";
    const shouldShowSeries = mediaFilter === "all" || mediaFilter === "tv";
    const groups = [];

    if (shouldShowMovies) {
      const movies = unique.filter((item) => item.media_type === "movie");
      if (movies.length) {
        groups.push({ key: "movies", title: "Películas", items: movies });
      }
    }

    if (shouldShowSeries) {
      const series = unique.filter((item) => item.media_type === "tv");
      if (series.length) {
        groups.push({ key: "series", title: "Series", items: series });
      }
    }

    return groups;
  }, [filteredCredits, mediaFilter]);

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

  const careerYears = useMemo(() => {
    const years = creditsAll.map((x) => x.year).filter((y) => y > 0);
    if (!years.length) return "—";
    const min = Math.min(...years);
    const max = Math.max(...years);
    return min === max ? String(min) : `${min} - ${max}`;
  }, [creditsAll]);

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
      wikipedia: ex?.wikidata_id
        ? `https://es.wikipedia.org/wiki/Special:EntityPage/${ex.wikidata_id}`
        : null,
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
      socials.wikipedia
        ? {
            id: "wikipedia",
            label: "Wikipedia",
            icon: "/wikipedia.png",
            href: socials.wikipedia,
            iconSize: { width: 24, height: 24 },
            iconClassName: "!h-6 !w-6 rounded-none object-contain overflow-visible",
            menuIconClassName: "h-4 w-4 rounded-none object-contain",
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
  const esBio = translations?.translations?.find((t) => t.iso_639_1 === "es")
    ?.data?.biography;
  const bio = esBio || actorDetails?.biography || "";
  const photos = (images?.profiles || []).sort(
    (a, b) => (b.vote_count || 0) - (a.vote_count || 0),
  );

  const taggedCount = taggedImages?.results?.length || 0;
  const photosCount = photos.length;

  const clearFilters = () => {
    const defaultCreditFilters = getDefaultCreditFilters(actorDetails);
    setQ("");
    setMediaFilter("all");
    setCreditFilter(defaultCreditFilters.creditFilter);
    setDeptFilter(defaultCreditFilters.deptFilter);
    setYearFrom("");
    setYearTo("");
    setSort("date_desc");
  };

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

    return [...official, ...orderedFallback].slice(0, 6);
  }, [creditsAll, tmdbKnownFor]);

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
    if (stats.total > 0)
      items.push({
        id: "credits",
        label: "Créditos",
        icon: Film,
        count: stats.total,
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
    items.push({ id: "about", label: "Perfil", icon: User });
    return items;
  }, [
    popularItems.length,
    watchedCredits.length,
    stats.total,
    awardStats.total,
    photosCount,
    taggedCount,
  ]);

  const STICKY_TOP = 72;
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
  }, []);

  const scrollToSection = useCallback(
    (sid) => {
      const el =
        sectionElsRef.current[sid] || document.getElementById(`section-${sid}`);
      if (!el) return;

      const offset = STICKY_TOP + (menuH || 0) + 10;
      const y = window.scrollY + el.getBoundingClientRect().top - offset;
      window.scrollTo({ top: Math.max(0, y), behavior: "smooth" });
    },
    [menuH],
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
  }, [sectionItems, menuH]);

  return (
    <div className="min-h-screen bg-black text-zinc-100 font-sans selection:bg-emerald-500/30 selection:text-emerald-200">
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute -top-[10%] -left-[5%] w-[60vw] max-w-[800px] aspect-square rounded-full bg-emerald-600/15 blur-[120px] sm:blur-[150px]" />
        <div className="absolute top-[15%] -right-[5%] w-[55vw] max-w-[700px] aspect-square rounded-full bg-emerald-700/20 blur-[120px] sm:blur-[150px]" />
        <div className="absolute -bottom-[10%] left-[15%] w-[65vw] max-w-[800px] aspect-square rounded-full bg-teal-800/25 blur-[120px] sm:blur-[150px]" />
      </div>
      <div
        ref={contentTopRef}
        className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 lg:pt-12 pb-24"
      >
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
          className="flex flex-col lg:flex-row gap-8 lg:gap-12 mb-12 items-start transform-gpu"
        >
          {/* --- COLUMNA IZQUIERDA: POSTER + SOCIALS --- */}
          <div className="w-full max-w-[280px] lg:max-w-[320px] mx-auto lg:mx-0 flex-shrink-0 flex flex-col gap-5 relative z-10 transition-[max-width] duration-500 ease-out">
            {/* Profile Image */}
            <div className="relative">
              <div
                ref={posterWrapRef}
                onPointerMove={(e) =>
                  setPosterTargetFromPointer(e.clientX, e.clientY)
                }
                onPointerLeave={resetPosterTarget}
                onPointerDown={(e) => {
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
                  className="relative rounded-2xl overflow-hidden shadow-2xl shadow-black/80 border border-white/10 bg-black/40 aspect-[2/3] will-change-transform"
                  style={{
                    transformStyle: "preserve-3d",
                    backfaceVisibility: "hidden",
                    WebkitBackfaceVisibility: "hidden",
                    outline: "1px solid transparent",
                    isolation: "isolate",
                  }}
                >
                  <div className="pointer-events-none absolute inset-0 rounded-2xl ring-1 ring-white/10 z-20" />
                  <div className="relative w-full h-full bg-neutral-950 z-10 overflow-hidden">
                    {profileSrc ? (
                      <OptimizedImage
                        src={profileSrc}
                        alt={actorDetails?.name}
                        className="w-full h-full object-cover"
                        style={{
                          transform: poster3dEnabled
                            ? "scale(1.08)"
                            : "scale(1)",
                        }}
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-zinc-600">
                        <User className="w-16 h-16" />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* External links under profile picture using the same icon format as DetailsClient */}
            {actorExternalLinks.length > 0 && (
              <StaggerContainer
                className="flex flex-row flex-wrap justify-center items-center gap-2.5 w-full px-1 py-2"
                staggerDelay={0.05}
              >
                {actorExternalLinks.map((link) =>
                  link.iconComponent ? (
                    <PersonExternalIconButton
                      key={link.id}
                      href={link.href}
                      label={link.label}
                      icon={link.iconComponent}
                    />
                  ) : (
                    <ExternalLinkButton
                      key={link.id}
                      icon={link.icon}
                      href={link.href}
                      title={link.label}
                      size={link.size}
                      iconSize={link.iconSize}
                      iconClassName={link.iconClassName}
                      className={link.id === "tmdb" ? "mx-1" : ""}
                    />
                  ),
                )}
              </StaggerContainer>
            )}
          </div>

          {/* --- COLUMNA DERECHA: INFO --- */}
          <div className="flex-1 flex flex-col min-w-0 w-full">
            <FadeIn delay={0.06} className="mb-5 px-1">
              <h1 className="text-4xl md:text-5xl lg:text-6xl font-black text-white leading-[1] tracking-tight text-balance drop-shadow-xl mb-3 text-center md:text-left">
                {safeText(actorDetails?.name)}
              </h1>

              <div className="flex flex-wrap items-center justify-center md:justify-start gap-x-4 gap-y-2 text-base md:text-lg font-medium text-zinc-300">
                {actorDetails?.birthday && (
                  <span className="flex items-center gap-1.5">
                    <Cake className="w-4 h-4 text-zinc-500" />
                    {formatHumanDate(actorDetails.birthday)}
                    {age && (
                      <span className="text-emerald-400 font-semibold">
                        ({age} años)
                      </span>
                    )}
                  </span>
                )}
                {actorDetails?.deathday && (
                  <span className="flex items-center gap-1.5 text-red-400">
                    <Skull className="w-4 h-4" />†{" "}
                    {formatHumanDate(actorDetails.deathday)}
                  </span>
                )}
                {actorDetails?.place_of_birth && (
                  <span className="hidden sm:flex items-center gap-1.5">
                    <span className="w-1 h-1 rounded-full bg-zinc-700" />
                    {actorDetails.place_of_birth}
                  </span>
                )}
              </div>
            </FadeIn>

            <ScaleIn delay={0.18} className="mb-6">
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                {[
                  {
                    label: "Conocido/a por",
                    value: actorDetails?.known_for_department || "—",
                    icon: Briefcase,
                    tone: "emerald",
                  },
                  {
                    label: "Créditos",
                    value: stats.total,
                    sub: `${stats.movies} películas · ${stats.tv} series`,
                    icon: Film,
                    tone: "sky",
                  },
                  {
                    label: "Trayectoria",
                    value: careerYears,
                    icon: Calendar,
                    tone: "violet",
                  },
                  {
                    label: "Premios",
                    value: loadingAwards ? "..." : awardStats.total || "—",
                    sub:
                      awardStats.total > 0
                        ? `${awardStats.wins} ganados · ${awardStats.nominations} nominaciones`
                        : "Wikidata",
                    icon: Trophy,
                    tone: "yellow",
                  },
                ].map((item) => {
                  const Icon = item.icon;
                  const tones = {
                    emerald: "from-emerald-500/18 text-emerald-300",
                    sky: "from-sky-500/18 text-sky-300",
                    violet: "from-violet-500/18 text-violet-300",
                    yellow: "from-yellow-500/18 text-yellow-300",
                  };
                  return (
                    <div
                      key={item.label}
                      className={`${ACTOR_LIQUID_CARD_CLASS} p-4 sm:p-5`}
                    >
                      <div className={ACTOR_LIQUID_CARD_LAYER_CLASS} />
                      <div
                        className={`absolute -right-8 -top-8 h-24 w-24 rounded-full bg-gradient-to-br ${tones[item.tone]} to-transparent blur-2xl opacity-80`}
                      />
                      <div className="relative z-10 flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <span className="block text-[10px] font-black uppercase tracking-wider text-zinc-500">
                            {item.label}
                          </span>
                          <span className="mt-1 block truncate text-lg font-black text-white">
                            {item.value}
                          </span>
                          {item.sub ? (
                            <span className="mt-0.5 block truncate text-xs font-semibold text-zinc-500">
                              {item.sub}
                            </span>
                          ) : null}
                        </div>
                        <Icon
                          className={`h-5 w-5 shrink-0 ${tones[item.tone].split(" ")[1]}`}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </ScaleIn>

            {mostPopularCredit && (
              <FadeIn delay={0.2} className="mb-5">
                <div className={`${ACTOR_LIQUID_CARD_CLASS} flex items-center gap-3 p-4`}>
                  <div className={ACTOR_LIQUID_CARD_LAYER_CLASS} />
                  <div className="pointer-events-none absolute -left-10 -top-10 h-28 w-28 rounded-full bg-emerald-500/15 blur-2xl" />
                  <div className="relative z-10 flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-300">
                    <Star className="h-5 w-5 fill-emerald-300" />
                  </div>
                  <div className="relative z-10 min-w-0">
                    <p className="text-[10px] font-black uppercase tracking-wider text-emerald-300/80">
                      Crédito más popular
                    </p>
                    <p className="truncate text-sm font-bold text-white">
                      {mostPopularCredit.title || mostPopularCredit.name}
                      {mostPopularCredit.year
                        ? ` · ${mostPopularCredit.year}`
                        : ""}
                    </p>
                  </div>
                </div>
              </FadeIn>
            )}

            <FadeIn delay={0.24}>
              <div className={`${ACTOR_LIQUID_CARD_CLASS} p-5 sm:p-6`}>
                <div className={ACTOR_LIQUID_CARD_LAYER_CLASS} />
                <p
                  className={`relative z-10 text-zinc-200 text-base leading-relaxed text-justify whitespace-pre-line ${
                    !showFullBio && bio.length > 420
                      ? "line-clamp-4 mask-fade-bottom"
                      : ""
                  }`}
                >
                  {bio || (
                    <span className="italic text-zinc-500">
                      Sin biografía disponible.
                    </span>
                  )}
                </p>
                {bio.length > 420 && (
                  <button
                    onClick={() => setShowFullBio(!showFullBio)}
                    className="relative z-10 mt-2 text-xs font-bold text-emerald-400 hover:text-emerald-300 uppercase tracking-wide flex items-center gap-1"
                  >
                    {showFullBio ? "Ver menos" : "Leer más"}{" "}
                    <ChevronDown
                      className={`w-3 h-3 transition-transform ${showFullBio ? "rotate-180" : ""}`}
                    />
                  </button>
                )}
              </div>
            </FadeIn>
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

          <div className="mt-6 space-y-14">
            {popularItems.length > 0 && (
              <section id="section-popular" ref={registerSection("popular")}>
                <AnimatedSection delay={0.04}>
                  <section className="mb-16 group/section">
                    <SectionTitle title="Conocido por" icon={Star} />
                    <ActorRowCarousel>
                      {popularItems.map((item, index) => (
                        <PosterCard
                          key={`popular-${item.id}-${item.credit_id || index}`}
                          item={item}
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
                      title="Ya vistos"
                      subtitle={`${watchedCredits.length} títulos vistos de ${safeText(actorDetails?.name)}`}
                      icon={CheckCircle2}
                    />
                    <ActorRowCarousel>
                      {watchedCredits.map((item, index) => (
                        <PosterCard
                          key={`watched-${item.media_type || "movie"}-${item.id}-${index}`}
                          item={item}
                        />
                      ))}
                    </ActorRowCarousel>
                  </section>
                </AnimatedSection>
              </section>
            )}

            <section id="section-credits" ref={registerSection("credits")}>
              <AnimatedSection delay={0.04}>
                <section className="mb-16 group/section">
                  <SectionTitle
                    title="Créditos en pantalla"
                    subtitle={`${displayCreditGroups.reduce((total, group) => total + group.items.length, 0)} de ${stats.total} títulos`}
                    icon={Film}
                    right={
                      <button
                        type="button"
                        onClick={clearFilters}
                        className="px-4 py-2 rounded-xl bg-gradient-to-br from-white/10 to-white/5 border border-white/10 backdrop-blur-md shadow-sm hover:from-white/15 hover:to-white/10 transition text-xs font-bold text-zinc-200 hover:text-white"
                        title="Limpiar filtros"
                      >
                        Limpiar
                      </button>
                    }
                  />

                  {/* Filters */}
                  <div className="mt-3 mb-6 space-y-3">
                    <div className="flex gap-3 lg:hidden">
                      <div className="relative flex-1">
                        <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
                        <input
                          type="text"
                          value={q}
                          onChange={(e) => setQ(e.target.value)}
                          placeholder="Buscar por título o rol..."
                          className="h-11 w-full rounded-xl pl-10 pr-10 py-2.5 text-sm transition-all focus:outline-none focus:ring-2 focus:ring-emerald-500/50 placeholder:text-zinc-400 bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-lg shadow-lg border border-white/10 text-white"
                        />
                        {q && (
                          <button
                            type="button"
                            onClick={() => setQ("")}
                            className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1 transition-colors hover:bg-zinc-800"
                            aria-label="Limpiar búsqueda"
                          >
                            <X className="h-3.5 w-3.5 text-zinc-500" />
                          </button>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => setMobileFiltersOpen((v) => !v)}
                        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition-all bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-lg shadow-lg border border-white/10 ${
                          mobileFiltersOpen
                            ? "text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.3)]"
                            : "text-zinc-200 hover:text-white hover:bg-white/10 hover:border-white/20"
                        }`}
                        aria-label="Filtros"
                      >
                        <SlidersHorizontal className="h-4 w-4" />
                      </button>
                    </div>

                    <AnimatePresence>
                      {mobileFiltersOpen && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.25, ease: "easeInOut" }}
                          className="overflow-visible lg:hidden"
                        >
                          <div className="grid grid-cols-1 gap-2 pt-1 sm:grid-cols-2">
                            <CreditsFilterDropdowns
                              mediaFilter={mediaFilter}
                              setMediaFilter={setMediaFilter}
                              creditFilter={creditFilter}
                              setCreditFilter={setCreditFilter}
                              sort={sort}
                              setSort={setSort}
                            />
                            <YearFilterDropdown
                              label="Desde"
                              value={yearFrom}
                              setValue={setYearFrom}
                              options={yearOptions}
                            />
                            <YearFilterDropdown
                              label="Hasta"
                              value={yearTo}
                              setValue={setYearTo}
                              options={yearOptions}
                            />
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    <div className="hidden flex-nowrap items-center gap-3 overflow-x-auto pb-1 lg:flex">
                      <div className="relative min-w-[240px] flex-1">
                        <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
                        <input
                          type="text"
                          value={q}
                          onChange={(e) => setQ(e.target.value)}
                          placeholder="Buscar por título o rol..."
                          className="h-11 w-full rounded-xl pl-10 pr-10 py-2.5 text-sm transition-all focus:outline-none focus:ring-2 focus:ring-emerald-500/50 placeholder:text-zinc-400 bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-lg shadow-lg border border-white/10 text-white"
                        />
                        {q && (
                          <button
                            type="button"
                            onClick={() => setQ("")}
                            className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1 transition-colors hover:bg-zinc-800"
                            aria-label="Limpiar búsqueda"
                          >
                            <X className="h-3.5 w-3.5 text-zinc-500" />
                          </button>
                        )}
                      </div>

                      <CreditsFilterDropdowns
                        mediaFilter={mediaFilter}
                        setMediaFilter={setMediaFilter}
                        creditFilter={creditFilter}
                        setCreditFilter={setCreditFilter}
                        sort={sort}
                        setSort={setSort}
                      />

                      <YearFilterDropdown
                        className="w-[150px] shrink-0"
                        label="Desde"
                        value={yearFrom}
                        setValue={setYearFrom}
                        options={yearOptions}
                      />

                      <YearFilterDropdown
                        className="w-[150px] shrink-0"
                        label="Hasta"
                        value={yearTo}
                        setValue={setYearTo}
                        options={yearOptions}
                      />
                    </div>
                  </div>

                  {/* Results */}
                  {displayCreditGroups.length > 0 ? (
                    <div className="space-y-8">
                      {displayCreditGroups.map((group) => (
                        <div key={group.key}>
                          <div className="mb-2 flex items-center gap-2 text-white">
                            <span className="flex h-7 w-7 items-center justify-center rounded-full border border-emerald-400/25 bg-emerald-400/10 text-emerald-300">
                              {group.key === "movies" ? (
                                <Film className="h-3.5 w-3.5" />
                              ) : (
                                <TvIcon className="h-3.5 w-3.5" />
                              )}
                            </span>
                            <h3 className="text-lg font-black">
                              {group.title}
                            </h3>
                            <span className="text-xs font-semibold text-zinc-500">
                              {group.items.length}
                            </span>
                          </div>
                          <ActorRowCarousel>
                            {group.items.map((c, index) => (
                              <PosterCard
                                key={`${group.key}-${c.id}-${c.credit_id || index}-${c.media_type || "m"}`}
                                item={c}
                              />
                            ))}
                          </ActorRowCarousel>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="py-16 text-center border border-dashed border-white/10 rounded-[2rem] bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-lg shadow-lg">
                      <Film className="w-12 h-12 text-zinc-600 mx-auto mb-3" />
                      <p className="text-zinc-400">
                        No se encontraron créditos con estos filtros.
                      </p>
                      <button
                        onClick={clearFilters}
                        className="mt-4 text-sm text-emerald-400 hover:underline"
                      >
                        Limpiar filtros
                      </button>
                    </div>
                  )}
                </section>
              </AnimatedSection>
            </section>

            <section id="section-awards" ref={registerSection("awards")}>
              <AnimatedSection delay={0.04}>
                <section className="mb-16 group/section">
                  <SectionTitle
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
                      title="Apariciones en medios"
                      subtitle="Imágenes donde aparece etiquetado/a"
                      icon={Tags}
                    />
                    <ActorRowCarousel variant="wide">
                      {taggedImages.results.map((t) => (
                        <TaggedMediaCard key={t.file_path} image={t} />
                      ))}
                    </ActorRowCarousel>
                  </section>
                </AnimatedSection>
              </section>
            )}

            <section id="section-about" ref={registerSection("about")}>
              <AnimatedSection delay={0.04}>
                <section className="mb-16 group/section">
                  <SectionTitle
                    title="Perfil"
                    subtitle="Datos del actor/actriz"
                    icon={User}
                  />
                  <div className="mt-3 grid sm:grid-cols-2 gap-4">
                    <div className={`${ACTOR_LIQUID_CARD_CLASS} p-5 sm:p-6`}>
                      <div className={ACTOR_LIQUID_CARD_LAYER_CLASS} />
                      <div className="relative z-10 space-y-4">
                        <h3 className="text-sm font-bold text-zinc-500 uppercase tracking-wider">
                          Información
                        </h3>
                        <div className="flex justify-between border-b border-white/5 pb-2 gap-4">
                          <span className="text-zinc-400">Género</span>
                          <span className="text-white text-right">
                            {genderLabel(actorDetails?.gender)}
                          </span>
                        </div>
                        <div className="flex justify-between border-b border-white/5 pb-2 gap-4">
                          <span className="text-zinc-400">Lugar</span>
                          <span className="text-white text-right max-w-[60%] truncate">
                            {safeText(actorDetails?.place_of_birth)}
                          </span>
                        </div>
                        <div className="flex justify-between border-b border-white/5 pb-2 gap-4">
                          <span className="text-zinc-400">Conocido/a por</span>
                          <span className="text-white text-right">
                            {safeText(actorDetails?.known_for_department)}
                          </span>
                        </div>
                        <div className="flex justify-between gap-4">
                          <span className="text-zinc-400">TMDb ID</span>
                          <span className="text-white font-mono">
                            {safeText(actorDetails?.id)}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className={`${ACTOR_LIQUID_CARD_CLASS} p-5 sm:p-6`}>
                      <div className={ACTOR_LIQUID_CARD_LAYER_CLASS} />
                      <div className="relative z-10 space-y-4">
                        <h3 className="text-sm font-bold text-zinc-500 uppercase tracking-wider">
                          Enlaces & Alias
                        </h3>

                        <div className="flex flex-wrap gap-2">
                          {actorExternalLinks.map((link) => {
                            const Icon = link.iconComponent;
                            return (
                              <a
                                key={link.id}
                                href={link.href}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1.5 rounded-lg border border-transparent bg-white/5 px-3 py-1.5 text-sm text-zinc-200 shadow-sm backdrop-blur-md transition-colors hover:bg-emerald-500/15 hover:text-emerald-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300"
                                aria-label={`Abrir ${link.label}`}
                              >
                                {Icon ? (
                                  <Icon
                                    className="h-3.5 w-3.5"
                                    aria-hidden="true"
                                  />
                                ) : link.icon ? (
                                  <OptimizedImage
                                    src={link.icon}
                                    alt=""
                                    className={
                                      link.menuIconClassName ||
                                      "h-3.5 w-3.5 rounded-sm object-contain"
                                    }
                                    draggable="false"
                                  />
                                ) : (
                                  <ExternalLink
                                    className="h-3.5 w-3.5"
                                    aria-hidden="true"
                                  />
                                )}
                                <span>{link.label}</span>
                              </a>
                            );
                          })}
                        </div>

                        <div className="mt-1">
                          <h4 className="text-xs text-zinc-500 mb-2">
                            También conocido/a como
                          </h4>
                          <div className="flex flex-wrap gap-1.5">
                            {(actorDetails?.also_known_as || [])
                              .slice(0, 14)
                              .map((a) => (
                                <span
                                  key={a}
                                  className="px-2 py-0.5 rounded bg-white/5 text-xs text-zinc-400"
                                >
                                  {a}
                                </span>
                              ))}
                            {(actorDetails?.also_known_as || []).length >
                              14 && (
                              <span className="px-2 py-0.5 rounded bg-white/5 text-xs text-zinc-500">
                                +
                                {(actorDetails?.also_known_as || []).length -
                                  14}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </section>
              </AnimatedSection>
            </section>
          </div>
        </div>
      </div>

      <style jsx global>{`
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
