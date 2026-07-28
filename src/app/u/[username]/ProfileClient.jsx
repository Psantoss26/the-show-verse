"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { motion, useReducedMotion } from "framer-motion";
import { useIsHistoryNavigation } from "@/lib/hooks/useIsHistoryNavigation";
import OptimizedImage from "@/components/OptimizedImage";
import LiquidButton from "@/components/LiquidButton";
import { useAuth } from "@/context/AuthContext";
import FollowButton from "@/components/social/FollowButton";
import PosterTile from "@/components/social/PosterTile";
import { titleStateKey, useViewerTitleStates } from "@/components/social/useViewerTitleStates";
import { LIQUID_GLASS_PANEL, LIQUID_GLASS_TOOLTIP } from "@/lib/ui/liquidGlass";
import usePreviewOpen from "@/components/preview/usePreviewOpen";
import ProfileSection from "./ProfileSection";
import { PROFILE_TAB_IDS, profileTabHref } from "./profileRoutes";
import {
  Activity,
  Award,
  BookmarkPlus,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Eye,
  Film,
  Flame,
  Heart,
  Loader2,
  LogOut,
  PieChart,
  RotateCcw,
  Settings,
  Star,
  Target,
  UserRoundCheck,
  Users,
} from "lucide-react";

const ChartLoading = ({ className = "h-[280px]" }) => (
  <div className={`${className} w-full animate-pulse rounded-2xl bg-white/[0.035]`} />
);
const MonthlyActivityChart = dynamic(
  () => import("@/app/stats/profileCharts").then((module) => module.MonthlyActivityChart),
  { ssr: false, loading: () => <ChartLoading /> },
);
const TimeDistributionChart = dynamic(
  () => import("@/app/stats/profileCharts").then((module) => module.TimeDistributionChart),
  { ssr: false, loading: () => <ChartLoading className="h-[250px]" /> },
);
const HourOfDayChart = dynamic(
  () => import("@/app/stats/profileCharts").then((module) => module.HourOfDayChart),
  { ssr: false, loading: () => <ChartLoading /> },
);
const DayOfWeekChart = dynamic(
  () => import("@/app/stats/profileCharts").then((module) => module.DayOfWeekChart),
  { ssr: false, loading: () => <ChartLoading /> },
);
const GenreRadarChart = dynamic(
  () => import("@/app/stats/profileCharts").then((module) => module.GenreRadarChart),
  { ssr: false, loading: () => <ChartLoading /> },
);
const RatingsBarChart = dynamic(
  () => import("@/app/stats/profileCharts").then((module) => module.RatingsBarChart),
  { ssr: false, loading: () => <ChartLoading /> },
);

// Conserva la última ficha durante la vida de la pestaña. Al volver desde una
// ficha de título el perfil se pinta de inmediato y se refresca en segundo
// plano, en lugar de volver a mostrar una pantalla de espera.
const profileCache = new Map();
// v3 descarta instantáneas creadas con decisiones de artwork anteriores a la
// caché versionada del backend. Así móvil no restaura primero pósters ES.
const PROFILE_CACHE_STORAGE_PREFIX = "showverse:profile:snapshot:v3:";

function profileCacheKey(username) {
  return String(username || "").trim().toLocaleLowerCase();
}

function getCachedProfile(key) {
  const memory = profileCache.get(key);
  if (memory) return memory;
  if (!key || typeof window === "undefined") return null;
  try {
    const snapshot = JSON.parse(window.sessionStorage.getItem(`${PROFILE_CACHE_STORAGE_PREFIX}${key}`) || "null");
    if (snapshot?.user?.username) {
      profileCache.set(key, snapshot);
      return snapshot;
    }
  } catch {
    // Una instantánea dañada nunca debe bloquear la carga de la ficha.
  }
  return null;
}

function cacheProfile(key, profile) {
  if (!key || !profile) return;
  profileCache.set(key, profile);
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(`${PROFILE_CACHE_STORAGE_PREFIX}${key}`, JSON.stringify(profile));
  } catch {
    // La caché en memoria sigue evitando el estado vacío durante esta sesión.
  }
}

function ProfileBackdrop() {
  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden" aria-hidden="true">
      <div className="absolute -top-[10%] -left-[5%] aspect-square w-[60vw] max-w-[800px] rounded-full bg-emerald-600/15 blur-[120px] sm:blur-[150px]" />
      <div className="absolute top-[15%] -right-[5%] aspect-square w-[55vw] max-w-[700px] rounded-full bg-emerald-700/20 blur-[120px] sm:blur-[150px]" />
      <div className="absolute -bottom-[10%] left-[15%] aspect-square w-[65vw] max-w-[800px] rounded-full bg-teal-800/25 blur-[120px] sm:blur-[150px]" />
    </div>
  );
}

function ProfilePendingSurface() {
  return (
    <div className="relative min-h-screen bg-black text-zinc-100" aria-busy="true">
      <ProfileBackdrop />
    </div>
  );
}

// ─────────────────────────────────────────────
// Utilidades de presentación
// ─────────────────────────────────────────────

function getInitials(source) {
  return String(source || "TSV")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

function ProfileAvatar({ user, size = "h-22 w-22 sm:h-26 sm:w-26" }) {
  return (
    <div className={`flex ${size} items-center justify-center overflow-hidden rounded-full bg-neutral-800 text-xl font-black text-white ring-2 ring-white/10`}>
      {user?.avatarUrl ? (
        <OptimizedImage
          src={user.avatarUrl}
          alt={user?.displayName || user?.username || ""}
          className="h-full w-full object-cover"
          priority
        />
      ) : (
        <span>{getInitials(user?.displayName || user?.username)}</span>
      )}
    </div>
  );
}

function CountStat({ value, label, href, icon: Icon, iconClassName = "text-emerald-400" }) {
  const className = "relative flex min-w-0 flex-1 flex-col items-center justify-center overflow-hidden rounded-[2rem] bg-gradient-to-br from-white/10 to-white/5 px-4 py-3 text-center shadow-lg transition duration-300 hover:-translate-y-0.5 hover:from-white/[0.16] hover:to-white/[0.07] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/70 sm:min-w-[120px] sm:px-5 sm:py-4";
  const body = (
    <>
      <span className={`relative z-10 mb-1 inline-flex h-7 w-7 items-center justify-center ${iconClassName}`}>
        <Icon className="h-6 w-6" aria-hidden="true" />
      </span>
      <span className="relative z-10 block text-xl font-black tracking-tight text-white drop-shadow-md sm:text-2xl lg:text-3xl">{value ?? 0}</span>
      <span className="relative z-10 mt-0.5 block text-[9px] font-bold uppercase tracking-wider text-zinc-300 sm:text-[10px]">
        {label}
      </span>
    </>
  );
  if (href) {
    return (
      <Link href={href} className={className}>
        {body}
      </Link>
    );
  }
  return <div className={className}>{body}</div>;
}

function ProfilePosterGrid({
  items,
  showStars = false,
  viewerTitleStates,
  label,
  prioritizeHorizontalScroll = false,
  fixedIndicator = false,
}) {
  return (
    <div
      data-profile-horizontal-scroll
      data-profile-swipe-exempt={prioritizeHorizontalScroll || undefined}
      role="region"
      aria-label={label}
      className="flex gap-3 overflow-x-auto pb-1 snap-x snap-mandatory overscroll-x-contain [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden sm:grid sm:grid-cols-5 sm:overflow-visible sm:pb-0"
    >
      {items.map((item) => (
        <div
          key={`${item.mediaType}:${item.tmdbId}`}
          className="w-[calc((100%_-_1.5rem)_/_3)] shrink-0 snap-start sm:w-auto"
        >
          <PosterTile
            item={item}
            showStars={showStars}
            viewerState={viewerTitleStates[titleStateKey(item)]}
            indicatorSize="profile"
            fixedIndicator={fixedIndicator}
          />
        </div>
      ))}
    </div>
  );
}

function SectionHeader({ label, action, onClick }) {
  return (
    <div className="mb-3 flex items-center justify-between border-b border-white/10 pb-2">
      <h2 className="text-xs font-bold uppercase tracking-widest text-zinc-400">
        {onClick ? (
          <button
            type="button"
            onClick={onClick}
            className="group -my-1 -ml-1 inline-flex items-center gap-1 rounded-md px-1 py-1 text-xs font-bold uppercase tracking-widest [font:inherit] transition-colors hover:text-emerald-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/70"
          >
            <span>{label}</span>
            <ChevronRight className="relative -top-px h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden="true" />
          </button>
        ) : label}
      </h2>
      {action}
    </div>
  );
}

function PendingPreview({ username, items, onOpen }) {
  const previewClick = usePreviewOpen();
  const [pendingItems, setPendingItems] = useState(() => (
    Array.isArray(items) ? items.slice(0, 5) : []
  ));
  const [pendingStatus, setPendingStatus] = useState(() => (
    Array.isArray(items) && items.length ? "ready" : "loading"
  ));

  useEffect(() => {
    let cancelled = false;
    setPendingStatus("loading");
    (async () => {
      try {
        const response = await fetch(
          `/api/users/${encodeURIComponent(username)}/watchlist?limit=5&offset=0`,
          { cache: "no-store" },
        );
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const payload = await response.json();
        if (cancelled) return;
        setPendingItems(Array.isArray(payload.items) ? payload.items.slice(0, 5) : []);
        setPendingStatus("ready");
      } catch {
        if (!cancelled) setPendingStatus("ready");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [username]);

  const maxItems = pendingItems.length;

  return (
    <section>
      <SectionHeader
        label="Pendientes"
        onClick={onOpen}
      />
      {pendingItems.length ? (
        /* Mazo de pósters apilados sin fondo ni borde contenedor */
        <div className="relative flex h-[170px] sm:h-[190px] w-full items-center justify-start overflow-visible py-3">
          {pendingItems.map((item, index) => {
            const source = item.posterPath ? `https://image.tmdb.org/t/p/w342${item.posterPath}` : null;
            const href = `/details/${item.mediaType === "tv" ? "tv" : "movie"}/${item.tmdbId}`;
            const titleText = item.title || item.name || "Título";
            const cardWidthPercent = 28;
            const leftPercent = maxItems > 1 ? (index * (100 - cardWidthPercent)) / (maxItems - 1) : 0;

            return (
              <Link
                key={`${item.mediaType}:${item.tmdbId}`}
                href={href}
                onClick={previewClick(item)}
                className="group/poster absolute top-3 bottom-3 aspect-[2/3] overflow-hidden rounded-lg bg-zinc-900 shadow-xl transition-all duration-300 ease-out hover:!z-50 hover:-translate-y-3 hover:scale-105 hover:shadow-[0_20px_40px_rgba(0,0,0,0.95)] focus-visible:outline-none"
                style={{ left: `${leftPercent}%`, zIndex: index + 1 }}
              >
                {source ? (
                  <OptimizedImage
                    src={source}
                    alt={titleText}
                    className="h-full w-full object-cover transition-transform duration-300 group-hover/poster:scale-105"
                    loading="lazy"
                  />
                ) : (
                  <div className="flex h-full w-full flex-col items-center justify-center p-2 text-center text-zinc-600">
                    <Film className="h-6 w-6 opacity-60" aria-hidden="true" />
                    <span className="mt-1 line-clamp-2 text-[10px] font-semibold text-zinc-400">
                      {titleText}
                    </span>
                  </div>
                )}
              </Link>
            );
          })}
        </div>
      ) : pendingStatus === "loading" ? (
        // Misma altura que el mazo de pósters para que al cargar no salte lo de debajo.
        <div className="flex h-[170px] sm:h-[190px] w-full items-center justify-center rounded-2xl border border-white/[0.06] bg-white/[0.025]">
          <Loader2 className="h-5 w-5 animate-spin text-emerald-400/70" aria-label="Cargando pendientes" />
        </div>
      ) : (
        <button
          type="button"
          onClick={onOpen}
          className="flex h-20 w-full items-center justify-center rounded-2xl border border-dashed border-white/[0.08] px-4 text-center text-xs font-semibold text-zinc-500 transition-colors hover:border-emerald-400/35 hover:text-emerald-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/70"
        >
          No hay títulos pendientes todavía.
        </button>
      )}
    </section>
  );
}

function relativeSidebarActivityTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const elapsed = Math.max(0, Date.now() - date.getTime());
  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 1) return "ahora";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} d`;
  return new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short" }).format(date);
}

function SidebarActivityTitle({ item }) {
  const previewClick = usePreviewOpen();
  if (!item?.tmdbId || !item?.mediaType) return null;
  const mediaType = item.mediaType === "tv" ? "tv" : "movie";
  return (
    <Link
      href={`/details/${mediaType}/${item.tmdbId}`}
      onClick={previewClick(item)}
      className="font-extrabold text-white transition-colors hover:text-emerald-400 focus-visible:outline-none focus-visible:text-emerald-400"
    >
      {item.title || "Ver ficha"}
    </Link>
  );
}

function SidebarActivityText({ item }) {
  const episodeLabel = item.type === "watched" && item.season && item.episode
    ? `S${String(item.season).padStart(2, "0")}E${String(item.episode).padStart(2, "0")} de `
    : "";

  if (item.type === "review") {
    return <><span className="text-zinc-300">ha escrito una reseña de </span><SidebarActivityTitle item={item} /></>;
  }
  if (item.type === "watchlist") {
    return <><span className="text-zinc-300">ha añadido </span><SidebarActivityTitle item={item} /><span className="text-zinc-300"> a Pendientes</span></>;
  }
  if (item.type === "favorite") {
    return <><span className="text-zinc-300">ha añadido </span><SidebarActivityTitle item={item} /><span className="text-zinc-300"> a Favoritos</span></>;
  }
  if (item.type === "rating") {
    return <><span className="text-zinc-300">ha puntuado </span><SidebarActivityTitle item={item} /><span className="text-zinc-300 font-medium">{typeof item.rating === "number" ? ` · ${item.rating}/10` : ""}</span></>;
  }
  if (item.type === "list") {
    return <><span className="text-zinc-300">ha creado la lista </span><Link href={`/lists/${String(item.id || "").replace("list:", "")}`} className="font-extrabold text-white transition-colors hover:text-emerald-400">{item.name || "sin título"}</Link></>;
  }
  if (item.type === "list_item") {
    return <><span className="text-zinc-300">ha añadido </span><SidebarActivityTitle item={item} /><span className="text-zinc-300">{item.listName ? ` a ${item.listName}` : " a una lista"}</span></>;
  }
  return <><span className="text-zinc-300">ha visto </span><span className="text-zinc-300">{episodeLabel}</span><SidebarActivityTitle item={item} /></>;
}

// Revelado "punto a punto" del timeline de actividad lateral: la línea se dibuja
// de arriba abajo mientras cada punto y su fila entran escalonados (no de golpe).
const activityTimelineContainer = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.13, delayChildren: 0.06 } },
};
const activityTimelineRow = {
  hidden: { opacity: 0, x: -6 },
  visible: { opacity: 1, x: 0, transition: { duration: 0.4, ease: [0.22, 1, 0.36, 1] } },
};
const activityTimelineDot = {
  hidden: { scale: 0, opacity: 0 },
  visible: { scale: 1, opacity: 1, transition: { type: "spring", stiffness: 480, damping: 20 } },
};

function ActivitySidebarPreview({ username, onOpen }) {
  const [items, setItems] = useState([]);
  const [status, setStatus] = useState("loading");
  // Al volver atrás o con "reducir movimiento" NO se anima: se pinta estático.
  const isBackNav = useIsHistoryNavigation();
  const reduceMotion = useReducedMotion();
  const animate = !isBackNav && !reduceMotion;

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    (async () => {
      try {
        const response = await fetch(
          `/api/users/${encodeURIComponent(username)}/activity?limit=5&offset=0`,
          { cache: "no-store" },
        );
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const payload = await response.json();
        if (cancelled) return;
        setItems(Array.isArray(payload.items) ? payload.items.slice(0, 5) : []);
        setStatus("ready");
      } catch {
        if (!cancelled) setStatus("ready");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [username]);

  return (
    <section>
      <SectionHeader label="Actividad" onClick={onOpen} />
      {status === "loading" ? (
        // El esqueleto REPLICA la estructura del timeline (5 filas con punto +
        // texto + hora) para reservar su altura final: así, al llegar los datos,
        // nada de lo que hay debajo (Puntuaciones…) salta de posición.
        <ol className="relative ml-1 space-y-3.5 py-1" aria-label="Cargando actividad">
          {[0, 1, 2, 3, 4].map((index) => (
            <li key={index} className="relative pl-4">
              <span className="absolute -left-[5px] top-1.5 h-2.5 w-2.5 rounded-full bg-white/10" aria-hidden="true" />
              <div className="h-5 w-11/12 animate-pulse rounded bg-white/[0.06]" />
              <div className="mt-0.5 h-4 w-10 animate-pulse rounded bg-white/[0.045]" />
            </li>
          ))}
        </ol>
      ) : items.length ? (
        <motion.ol
          className="relative ml-1 space-y-3.5 py-1"
          role="list"
          variants={activityTimelineContainer}
          initial={animate ? "hidden" : false}
          animate="visible"
        >
          {items.map((item) => (
            <motion.li key={item.id} className="relative pl-4" variants={activityTimelineRow}>
              <motion.span
                variants={activityTimelineDot}
                className="absolute -left-[5px] top-1.5 h-2.5 w-2.5 rounded-full bg-emerald-400/90 ring-4 ring-black shadow-[0_0_8px_rgba(52,211,153,0.4)]"
                aria-hidden="true"
              />
              {/* Una sola línea (truncada): altura fija por item → el esqueleto la
                  reserva exactamente y nada de debajo salta al cargar. */}
              <p className="truncate text-[13px] leading-5 text-zinc-300">
                <SidebarActivityText item={item} />
              </p>
              <time dateTime={item.createdAt} className="mt-0.5 block text-[11px] font-semibold leading-4 text-zinc-400">
                {relativeSidebarActivityTime(item.createdAt)}
              </time>
            </motion.li>
          ))}
          {/* Línea vertical que se "dibuja" de arriba abajo acompañando a los puntos. */}
          <motion.span
            aria-hidden="true"
            className="pointer-events-none absolute left-0 top-0 bottom-0 w-px origin-top bg-white/15"
            initial={animate ? { scaleY: 0 } : false}
            animate={{ scaleY: 1 }}
            transition={{ duration: Math.max(0.4, items.length * 0.13 + 0.25), ease: [0.22, 1, 0.36, 1] }}
          />
        </motion.ol>
      ) : (
        <button
          type="button"
          onClick={onOpen}
          className="flex h-20 w-full items-center justify-center rounded-2xl border border-dashed border-white/[0.08] px-4 text-center text-xs font-semibold text-zinc-500 transition-colors hover:border-emerald-400/35 hover:text-emerald-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/70"
        >
          Aún no hay actividad pública.
        </button>
      )}
    </section>
  );
}

function buildHalfStarHistogram(histogram) {
  return Array.from({ length: 10 }, (_, index) => ({
    star: (index + 1) / 2,
    value: Number(histogram?.[index] || 0),
  })).filter((item) => Number.isFinite(item.value) && item.value > 0);
}

function formatStarValue(value) {
  return Number.isInteger(value) ? String(value) : String(value).replace(".", ",");
}

function StarRatingHistogram({ histogram }) {
  const ratings = buildHalfStarHistogram(histogram);
  const max = Math.max(1, ...ratings.map((item) => item.value));
  const [selectedStar, setSelectedStar] = useState(null);
  const handleStarSelection = useCallback((star) => {
    // El estado fijado es una alternativa al hover solo para pantallas táctiles.
    // En escritorio el globo sigue siendo estrictamente temporal al pasar el
    // cursor por la barra, sin posibilidad de dejarlo fijado con un clic.
    if (!window.matchMedia("(max-width: 767px)").matches) return;
    setSelectedStar((current) => current === star ? null : star);
  }, []);
  // Entrada: cada barra "crece" desde su base, escalonada de izquierda a derecha.
  // No se anima al volver atrás ni con "reducir movimiento".
  const isBackNav = useIsHistoryNavigation();
  const reduceMotion = useReducedMotion();
  const animate = !isBackNav && !reduceMotion;
  if (!ratings.length) return null;

  return (
    <div className="flex h-20 items-end gap-1.5" aria-label="Distribución de puntuaciones por medias estrellas">
      <Star className="mb-1.5 h-3.5 w-3.5 shrink-0 fill-emerald-400 text-emerald-400" aria-hidden="true" />
      <ul className="flex h-full min-w-0 flex-1 items-end gap-1" role="list">
        {ratings.map((item, index) => {
          const starText = `${formatStarValue(item.star)} ${item.star === 1 ? "estrella" : "estrellas"}`;
          const label = `${item.value} valoraciones con ${starText}`;
          const isSelected = selectedStar === item.star;
          return (
            <li
              key={item.star}
              className="relative flex h-full min-w-0 flex-1 items-end"
            >
              <button
                type="button"
                aria-label={label}
                aria-pressed={isSelected}
                onClick={() => handleStarSelection(item.star)}
                className="group relative flex h-full w-full min-w-0 items-end border-0 bg-transparent p-0 text-left focus-visible:outline-none"
              >
                <span
                  className={`pointer-events-none absolute bottom-[calc(100%+0.5rem)] left-1/2 z-30 w-max -translate-x-1/2 rounded-2xl ${LIQUID_GLASS_TOOLTIP} px-3 py-2 text-center text-xs font-bold text-white opacity-0 translate-y-1.5 scale-95 transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:opacity-100 group-hover:translate-y-0 group-hover:scale-100 group-focus-visible:opacity-100 group-focus-visible:translate-y-0 group-focus-visible:scale-100 ${isSelected ? "opacity-100 translate-y-0 scale-100" : ""} will-change-transform transform-gpu shadow-2xl`}
                >
                  <span className="block text-white font-extrabold drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">{item.value} {item.value === 1 ? "valoración" : "valoraciones"}</span>
                  <span className="mt-0.5 inline-flex items-center justify-center gap-1 text-emerald-400 drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
                    <Star className="h-3 w-3 fill-current" aria-hidden="true" />
                    <span className="text-zinc-200 font-semibold">{starText}</span>
                  </span>
                </span>
                {/* Envoltorio que anima el crecimiento (scaleY desde la base); el
                    <span> interior conserva el hover (scale-x) sin conflicto. */}
                <motion.span
                  className="block w-full origin-bottom"
                  style={{ height: `${Math.max(5, (item.value / max) * 100)}%` }}
                  initial={animate ? { scaleY: 0 } : false}
                  animate={{ scaleY: 1 }}
                  transition={{ duration: 0.55, delay: animate ? 0.28 + index * 0.045 : 0, ease: [0.22, 1, 0.36, 1] }}
                  aria-hidden="true"
                >
                  <span className={`block h-full w-full rounded-t-sm bg-gradient-to-t from-slate-500/85 to-slate-300/90 transition-transform duration-200 group-hover:scale-x-110 group-hover:from-emerald-500/80 group-hover:to-emerald-300 group-focus-visible:scale-x-110 group-focus-visible:from-emerald-500/80 group-focus-visible:to-emerald-300 ${isSelected ? "scale-x-110 from-emerald-500/80 to-emerald-300" : ""}`} />
                </motion.span>
              </button>
            </li>
          );
        })}
      </ul>
      <span className="sr-only" aria-live="polite">
        {selectedStar === null
          ? ""
          : (() => {
            const selected = ratings.find((item) => item.star === selectedStar);
            return selected
              ? `${selected.value} ${selected.value === 1 ? "valoración" : "valoraciones"} con ${formatStarValue(selected.star)} ${selected.star === 1 ? "estrella" : "estrellas"}`
              : "";
          })()}
      </span>
      <span className="mb-1 inline-flex shrink-0 items-center gap-px text-emerald-400" aria-hidden="true">
        {Array.from({ length: 5 }).map((_, index) => (
          <Star key={index} className="h-3 w-3 fill-current" />
        ))}
      </span>
    </div>
  );
}

// Mientras el endpoint público se actualiza con las métricas agregadas, el
// perfil propio puede seguir usando la fuente privada que ya alimentaba la
// página Profile anterior. Solo se transforma información agregada para las
// gráficas, sin alterar el resto de la vista social.
function buildAnalyticsFromPrivateProfile(payload) {
  if (!payload || typeof payload !== "object") return null;

  const now = new Date();
  const months = new Map();
  for (let offset = 11; offset >= 0; offset -= 1) {
    const date = new Date(now.getFullYear(), now.getMonth() - offset, 1);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    months.set(key, {
      date: key,
      label: new Intl.DateTimeFormat("es-ES", { month: "short" }).format(date).replace(".", ""),
      movies: 0,
      episodes: 0,
      total: 0,
    });
  }

  const dayOfWeek = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"].map((name) => ({ name, value: 0 }));
  const hourOfDay = Array.from({ length: 24 }, (_, hour) => ({ name: `${hour}h`, value: 0 }));
  for (const item of Array.isArray(payload.history) ? payload.history : []) {
    const date = new Date(item?.watched_at || item?.watchedAt || "");
    if (Number.isNaN(date.getTime()) || date > now) continue;
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    const month = months.get(key);
    if (month) {
      if (item?.type === "movie" || item?.mediaType === "movie") month.movies += 1;
      else month.episodes += 1;
      month.total += 1;
    }
    dayOfWeek[date.getDay()].value += 1;
    hourOfDay[date.getHours()].value += 1;
  }

  const genreEntries = Array.isArray(payload.genres)
    ? payload.genres.map((item) => [item?.name, item?.value ?? item?.count])
    : Object.entries(payload.genres || {});
  const genres = genreEntries
    .map(([name, value]) => ({ name, value: Number(value || 0) }))
    .filter((item) => item.name && item.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, 6);
  const ratings = Object.entries(payload.stats?.ratings?.distribution || {})
    .map(([name, value]) => ({ name, value: Number(value || 0) }))
    .sort((a, b) => Number(a.name) - Number(b.name));
  const ratingCount = ratings.reduce((sum, item) => sum + item.value, 0);
  const monthlyActivity = [...months.values()];
  const top = (items) => items.reduce((best, item) => item.value > (best?.value || 0) ? item : best, null);
  const movieMinutes = Number(payload.stats?.movies?.minutes || 0);
  const episodeMinutes = Number(payload.stats?.episodes?.minutes || 0);
  const totalMinutes = movieMinutes + episodeMinutes;
  const currentMonth = monthlyActivity.at(-1) || { movies: 0, episodes: 0, total: 0 };
  const thisMonth = { ...currentMonth, minutes: 0 };

  return {
    totalMinutes,
    formattedTotalTime: `${Math.floor(totalMinutes / 60)}h ${totalMinutes % 60}m`,
    thisMonth,
    monthlyActivity,
    timeDistribution: [
      { name: "Películas", value: movieMinutes, color: "#3b82f6" },
      { name: "Series", value: episodeMinutes, color: "#a855f7" },
    ],
    dayOfWeek,
    hourOfDay,
    genres,
    ratings,
    insights: {
      currentStreak: 0,
      bestStreak: 0,
      averageRating: ratingCount
        ? ratings.reduce((sum, item) => sum + Number(item.name) * item.value, 0) / ratingCount
        : null,
      topGenre: genres[0] || null,
      topDay: top(dayOfWeek)?.value ? top(dayOfWeek) : null,
      peakHour: top(hourOfDay)?.value ? top(hourOfDay) : null,
    },
  };
}

// ─────────────────────────────────────────────
// Componente principal
// ─────────────────────────────────────────────

export default function ProfileClient({ username, initialTab = "profile", routeBase = null }) {
  const { user: viewer, logout } = useAuth();
  const router = useRouter();
  const isBackNav = useIsHistoryNavigation();
  const profileSwipe = useRef(null);
  // Al volver desde DetailsClient este montaje sólo existe en el cliente y ya
  // conocemos que es una navegación de historial. Sembrar la instantánea aquí
  // evita el frame vacío entre la restauración de scroll y el layout effect.
  // En una carga normal `isBackNav` es false, por lo que el HTML inicial sigue
  // siendo idéntico al del servidor y no se compromete la hidratación.
  const [state, setState] = useState(() => {
    const key = profileCacheKey(username);
    const cachedProfile = isBackNav ? getCachedProfile(key) : null;
    return cachedProfile
      ? { key, status: "ready", profile: cachedProfile }
      : { key, status: "pending", profile: null };
  });
  const routeTab = PROFILE_TAB_IDS.includes(initialTab) ? initialTab : "profile";
  // La primera ruta hija todavía puede no estar en la caché del App Router.
  // Conservamos la estructura del perfil y cambiamos su contenido de forma
  // optimista mientras Next termina de sincronizar la URL, para que el primer
  // clic no remonte ni vuelva a animar cabecera, métricas y navegación.
  const [pendingTab, setPendingTab] = useState(null);
  const tab = pendingTab || routeTab;
  const [refreshToken, setRefreshToken] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [privateAnalytics, setPrivateAnalytics] = useState(null);

  useEffect(() => {
    if (pendingTab === routeTab) setPendingTab(null);
  }, [pendingTab, routeTab]);

  useEffect(() => {
    const prefetchSections = () => {
      for (const section of PROFILE_TAB_IDS) {
        router.prefetch(profileTabHref(username, section, routeBase));
      }
    };

    if (typeof window === "undefined") return undefined;
    if (typeof window.requestIdleCallback === "function") {
      const idleId = window.requestIdleCallback(prefetchSections, { timeout: 1500 });
      return () => window.cancelIdleCallback(idleId);
    }

    const timeoutId = window.setTimeout(prefetchSections, 0);
    return () => window.clearTimeout(timeoutId);
  }, [routeBase, router, username]);

  useLayoutEffect(() => {
    const key = profileCacheKey(username);
    const cachedProfile = getCachedProfile(key);
    if (!cachedProfile) return;
    setState((current) => (
      current.key === key && current.profile === cachedProfile && current.status === "ready"
        ? current
        : { key, status: "ready", profile: cachedProfile }
    ));
  }, [username]);

  useEffect(() => {
    let cancelled = false;
    const isRefresh = refreshToken > 0;
    const key = profileCacheKey(username);
    const cachedProfile = getCachedProfile(key);
    if (!isRefresh) setState({ key, status: cachedProfile ? "ready" : "pending", profile: cachedProfile });
    else setSyncing(true);
    (async () => {
      try {
        const res = await fetch(`/api/users/${encodeURIComponent(username)}/profile`, {
          cache: "no-store",
        });
        if (res.status === 404) {
          if (!cancelled) setState({ key, status: "notfound", profile: null });
          return;
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (!cancelled) {
          cacheProfile(key, data.profile);
          setState({ key, status: "ready", profile: data.profile });
        }
      } catch {
        if (!cancelled && !isRefresh && !cachedProfile) {
          setState({ key, status: "error", profile: null });
        }
      } finally {
        if (!cancelled && isRefresh) setSyncing(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [username, refreshToken]);

  const activeCacheKey = profileCacheKey(username);
  const isCurrentProfile = state.key === activeCacheKey;
  const profile = isCurrentProfile
    ? state.profile
    : null;
  const status = isCurrentProfile
    ? state.status
    : "pending";
  const navigateToTab = useCallback((nextTab) => {
    if (!PROFILE_TAB_IDS.includes(nextTab) || nextTab === tab) return;
    setPendingTab(nextTab);
    router.push(profileTabHref(username, nextTab, routeBase), { scroll: false });
  }, [routeBase, router, tab, username]);

  useEffect(() => {
    const currentProfile = profile;
    const isOwnProfile = Boolean(
      currentProfile?.isSelf ||
      (viewer?.username && viewer.username === currentProfile?.user?.username),
    );
    if (!isOwnProfile || currentProfile?.analytics) {
      setPrivateAnalytics(null);
      return undefined;
    }

    let cancelled = false;
    (async () => {
      try {
        const response = await fetch("/api/profile?posters=0", {
          cache: "no-store",
          credentials: "include",
        });
        if (!response.ok) return;
        const payload = await response.json();
        const analytics = buildAnalyticsFromPrivateProfile(payload);
        if (!cancelled && analytics) setPrivateAnalytics(analytics);
      } catch {
        // Las gráficas permanecen disponibles cuando la API pública ya trae
        // analytics; este fallback no debe degradar la página si falla.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [profile, viewer?.username, refreshToken]);

  const profileFavoriteMovies = useMemo(() => {
    if (Array.isArray(profile?.favoriteMovies)) return profile.favoriteMovies;
    return (profile?.favorites || []).filter((item) => item?.mediaType === "movie");
  }, [profile?.favoriteMovies, profile?.favorites]);
  const profileFavoriteSeries = useMemo(() => {
    if (Array.isArray(profile?.favoriteSeries)) return profile.favoriteSeries;
    return (profile?.favorites || []).filter((item) => item?.mediaType === "tv");
  }, [profile?.favoriteSeries, profile?.favorites]);
  const profileTitleItems = useMemo(
    () => [...profileFavoriteMovies, ...profileFavoriteSeries, ...(profile?.recentWatched || [])],
    [profileFavoriteMovies, profileFavoriteSeries, profile?.recentWatched],
  );
  const viewerTitleStates = useViewerTitleStates(profileTitleItems, Boolean(viewer?.username));

  if (status === "pending") return <ProfilePendingSurface />;

  if (status === "notfound") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-black px-6 text-center">
        <Users className="h-12 w-12 text-zinc-700" />
        <h1 className="text-2xl font-black text-white">Usuario no encontrado</h1>
        <p className="max-w-sm text-sm text-zinc-500">
          No existe ningún miembro con el usuario{" "}
          <span className="text-zinc-300">@{username}</span>.
        </p>
        <Link
          href="/members"
          className="mt-2 inline-flex h-11 items-center rounded-full bg-emerald-500 px-6 text-sm font-bold text-black hover:bg-emerald-400"
        >
          Buscar miembros
        </Link>
      </div>
    );
  }

  if (status === "error" || !profile) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-black px-6 text-center">
        <h1 className="text-2xl font-black text-white">No se pudo cargar el perfil</h1>
        <p className="max-w-sm text-sm text-zinc-500">
          Ha habido un problema temporal. Vuelve a intentarlo en un momento.
        </p>
      </div>
    );
  }

  const isSelf = Boolean(
    profile.isSelf || (viewer?.username && viewer.username === profile.user.username),
  );
  const {
    user,
    counts,
    recentWatched,
    pendingPreview,
    followingPreview,
    stats,
    analytics,
    sections,
  } = profile;
  const resolvedAnalytics = analytics || privateAnalytics;
  const monthlyActivity = resolvedAnalytics?.monthlyActivity?.at(-1) || {};
  const thisMonth = resolvedAnalytics?.thisMonth || monthlyActivity;

  const handleProfileTouchStart = (event) => {
    if (window.matchMedia("(min-width: 640px)").matches || event.touches.length !== 1) return;
    const target = event.target;
    // Las filas desplazables y el menú de pestañas consumen su gesto
    // horizontal propio. Fuera de esas zonas el gesto cambia de sección.
    const preservesHorizontalScroll = target instanceof Element && Boolean(
      target.closest("[data-profile-swipe-exempt]"),
    );
    profileSwipe.current = {
      x: event.touches[0].clientX,
      y: event.touches[0].clientY,
      preservesHorizontalScroll,
    };
  };

  const handleProfileTouchEnd = (event) => {
    const gesture = profileSwipe.current;
    profileSwipe.current = null;
    if (!gesture || gesture.preservesHorizontalScroll || event.changedTouches.length !== 1) return;

    const deltaX = event.changedTouches[0].clientX - gesture.x;
    const deltaY = event.changedTouches[0].clientY - gesture.y;
    if (Math.abs(deltaX) < 64 || Math.abs(deltaX) <= Math.abs(deltaY) * 1.25) return;

    const currentIndex = PROFILE_TAB_IDS.indexOf(tab);
    const direction = deltaX < 0 ? 1 : -1;
    const nextIndex = Math.min(
      PROFILE_TAB_IDS.length - 1,
      Math.max(0, currentIndex + direction),
    );
    navigateToTab(PROFILE_TAB_IDS[nextIndex]);
  };

  return (
    <div
      className="min-h-screen bg-black text-zinc-100 pb-0 lg:pb-24"
      onTouchStartCapture={handleProfileTouchStart}
      onTouchEndCapture={handleProfileTouchEnd}
      onTouchCancelCapture={() => { profileSwipe.current = null; }}
    >
      {/* Fondo decorativo sutil */}
      <ProfileBackdrop />

      <div className="relative z-10 mx-auto max-w-[1600px] px-4 pb-8 pt-4 sm:px-6 sm:py-8 lg:px-8 lg:py-12">
        {/* ── CABECERA ── */}
        <header className="sv-profile-entry sv-profile-entry--header flex flex-wrap items-center gap-3 lg:flex-nowrap lg:justify-between lg:gap-6">
          <ProfileAvatar user={user} size="h-16 w-16 shrink-0 sm:h-26 sm:w-26" />
          <div className="min-w-0 flex-1 text-left">
            <div className="flex min-w-0 items-center justify-between gap-2 lg:justify-start lg:gap-4">
              <h1 className="min-w-0 flex-1 truncate text-[clamp(1.35rem,6vw,2rem)] font-black leading-[0.95] tracking-[-0.06em] text-white lg:flex-none sm:text-[clamp(2.25rem,4.1vw,3.5rem)]">
                {user.displayName}<span className="text-emerald-400">.</span>
              </h1>
              {isSelf ? (
                <div className="flex shrink-0 items-center gap-1 sm:gap-2" aria-label="Acciones de perfil">
                  <LiquidButton
                    onClick={() => window.location.assign("/profile/settings")}
                    disabled={syncing}
                    activeColor="teal"
                    groupId="profile-header-actions"
                    title="Configuración"
                    className="!h-10 !w-10 sm:!h-12 sm:!w-12 !border-0 !bg-white/5 !bg-gradient-to-br !from-white/20 !via-white/5 !to-transparent shadow-lg backdrop-blur-md hover:!bg-white/15"
                  >
                    <Settings className="h-4 w-4 sm:h-5 sm:w-5" />
                  </LiquidButton>
                  <LiquidButton
                    onClick={() => setRefreshToken((value) => value + 1)}
                    disabled={syncing}
                    loading={syncing}
                    activeColor="green"
                    groupId="profile-header-actions"
                    title="Sincronizar"
                    className="!h-10 !w-10 sm:!h-12 sm:!w-12 !border-0 !bg-white/5 !bg-gradient-to-br !from-white/20 !via-white/5 !to-transparent shadow-lg backdrop-blur-md hover:!bg-white/15"
                  >
                    <RotateCcw className={`h-4 w-4 sm:h-5 sm:w-5 ${syncing ? "animate-spin" : ""}`} />
                  </LiquidButton>
                  <LiquidButton
                    onClick={() => logout({ redirectTo: "/login" })}
                    disabled={syncing}
                    activeColor="red"
                    groupId="profile-header-actions"
                    title="Desconectar"
                    className="!h-10 !w-10 sm:!h-12 sm:!w-12 !border-0 !bg-white/5 !bg-gradient-to-br !from-white/20 !via-white/5 !to-transparent !text-red-400 shadow-lg backdrop-blur-md hover:!bg-white/15 hover:!text-red-300"
                  >
                    <LogOut className="h-4 w-4 sm:h-5 sm:w-5" />
                  </LiquidButton>
                </div>
              ) : (
                <FollowButton
                  username={user.username}
                  initialFollowing={profile.isFollowing}
                />
              )}
            </div>
            <p className="mt-0.5 truncate text-xs font-semibold tracking-tight text-zinc-500 sm:mt-2 sm:text-sm">@{user.username}</p>
            {user.bio && (
              <p className="mt-3 max-w-xl text-sm leading-relaxed text-zinc-400">
                {user.bio}
              </p>
            )}
          </div>

          {/* Contadores */}
          <div className="order-3 grid w-full grid-cols-4 gap-2 sm:gap-3 lg:order-none lg:w-auto lg:pl-4">
            <CountStat value={counts.films} label="Películas" icon={Film} iconClassName="text-sky-400" />
            <CountStat value={stats.completedShows} label="Series" icon={CheckCircle2} iconClassName="text-violet-400" />
            <CountStat
              value={counts.following}
              label="Siguiendo"
              icon={UserRoundCheck}
              iconClassName="text-emerald-400"
              href={`/u/${user.username}/following`}
            />
            <CountStat
              value={counts.followers}
              label="Seguidores"
              icon={Users}
              iconClassName="text-amber-400"
              href={`/u/${user.username}/followers`}
            />
          </div>
        </header>

        {/* ── BARRA DE PESTAÑAS ── */}
        <div className="sv-profile-entry sv-profile-entry--tabs">
          <ProfileTabs
            tab={tab}
            username={user.username}
            sections={sections}
            onNavigate={navigateToTab}
            routeBase={routeBase}
          />
        </div>

        {tab === "statistics" ? (
          <div className="sv-profile-entry sv-profile-entry--content mt-8">
            {resolvedAnalytics ? (
              <ProfileAnalytics analytics={resolvedAnalytics} />
            ) : (
              <section className="flex min-h-72 flex-col items-center justify-center rounded-2xl border border-dashed border-white/[0.08] bg-white/[0.02] px-6 text-center">
                <Activity className="h-7 w-7 text-emerald-400/70" />
                <h2 className="mt-4 text-lg font-black text-white">Estadísticas en preparación</h2>
                <p className="mt-1 max-w-sm text-sm text-zinc-500">
                  Este miembro todavía no tiene datos suficientes para mostrar sus gráficas.
                </p>
              </section>
            )}
          </div>
        ) : tab !== "profile" ? (
          <div className="sv-profile-entry sv-profile-entry--content mt-5 sm:mt-6">
            {/* `key={tab}` remonta la sección al cambiar de pestaña: evita un
                render intermedio con el layout nuevo pero los items del layout
                anterior (que no comparten forma de `key`) → aviso de keys. */}
            <ProfileSection key={tab} username={user.username} section={tab} actor={user} />
          </div>
        ) : (
        <div className="mt-8 grid grid-cols-1 gap-8 xl:grid-cols-[minmax(0,1fr)_360px] 2xl:grid-cols-[minmax(0,1fr)_400px]">
          {/* ── COLUMNA PRINCIPAL ── */}
          <div className="sv-profile-entry sv-profile-entry--content space-y-10">
            {/* Favoritos curados, separados por tipo para mostrar cinco de cada uno. */}
            <section>
              <SectionHeader label="Películas favoritas" />
              {profileFavoriteMovies.length ? (
                <ProfilePosterGrid
                  items={profileFavoriteMovies}
                  viewerTitleStates={viewerTitleStates}
                  label="Películas favoritas"
                  prioritizeHorizontalScroll
                  fixedIndicator="favorite"
                />
              ) : (
                <p className="text-sm text-zinc-600">
                  {isSelf
                    ? "Aún no has elegido películas favoritas. Edítalas en Ajustes."
                    : "Este miembro todavía no ha destacado películas favoritas."}
                </p>
              )}
            </section>

            <section>
              <SectionHeader label="Series favoritas" />
              {profileFavoriteSeries.length ? (
                <ProfilePosterGrid
                  items={profileFavoriteSeries}
                  viewerTitleStates={viewerTitleStates}
                  label="Series favoritas"
                  prioritizeHorizontalScroll
                  fixedIndicator="favorite"
                />
              ) : (
                <p className="text-sm text-zinc-600">
                  {isSelf
                    ? "Aún no has elegido series favoritas. Edítalas en Ajustes."
                    : "Este miembro todavía no ha destacado series favoritas."}
                </p>
              )}
            </section>

            {/* Actividad reciente */}
            <section>
              <SectionHeader label="Actividad reciente" />
              {recentWatched?.length ? (
                <ProfilePosterGrid
                  items={recentWatched}
                  showStars
                  viewerTitleStates={viewerTitleStates}
                  label="Actividad reciente"
                  prioritizeHorizontalScroll
                />
              ) : (
                <p className="text-sm text-zinc-600">Sin actividad reciente.</p>
              )}
            </section>
          </div>

          {/* ── COLUMNA LATERAL ── */}
          <aside className="sv-profile-entry sv-profile-entry--aside space-y-8 xl:sticky xl:top-24 xl:self-start">
            {/* Estadísticas */}
            <section>
              <SectionHeader
                label="Estadísticas"
                onClick={() => navigateToTab("statistics")}
              />
              <dl className="grid grid-cols-4 gap-2">
                <StatCell value={thisMonth.movies || 0} label="Películas" />
                <StatCell value={thisMonth.episodes || 0} label="Episodios" />
                <StatCell value={thisMonth.total || 0} label="Visionados" />
                <StatCell value={formatProfileTime(thisMonth.minutes)} label="Tiempo visto" />
              </dl>
            </section>

            <ActivitySidebarPreview username={user.username} onOpen={() => navigateToTab("activity")} />

            <section>
              <SectionHeader
                label="Puntuaciones"
                onClick={() => navigateToTab("ratings")}
              />
              {stats.totalRatings > 0 ? (
                <StarRatingHistogram histogram={stats.ratingHistogram} />
              ) : (
                <button
                  type="button"
                  onClick={() => navigateToTab("ratings")}
                  className="flex h-20 w-full items-center justify-center rounded-2xl border border-dashed border-white/[0.08] px-4 text-center text-xs font-semibold text-zinc-500 transition-colors hover:border-emerald-400/35 hover:text-emerald-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/70"
                >
                  Aún no hay puntuaciones.
                </button>
              )}
            </section>

            <PendingPreview username={user.username} items={pendingPreview} onOpen={() => navigateToTab("watchlist")} />

            {/* Siguiendo (avatares) */}
            {followingPreview?.length > 0 && (
              <section>
                <SectionHeader
                  label="Siguiendo"
                  onClick={() => navigateToTab("social")}
                />
                <div className="flex flex-wrap gap-2">
                  {followingPreview.map((f) => (
                    <Link
                      key={f.username}
                      href={`/u/${f.username}`}
                      className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full bg-neutral-800 text-[10px] font-black text-white transition-transform hover:scale-110 shadow-sm"
                    >
                      {f.avatarUrl ? (
                        <OptimizedImage
                          src={f.avatarUrl}
                          alt={f.displayName}
                          className="h-full w-full object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <span>{getInitials(f.displayName)}</span>
                      )}
                    </Link>
                  ))}
                </div>
              </section>
            )}
          </aside>
        </div>
        )}
      </div>
    </div>
  );
}

// Barra de pestañas del perfil. "Perfil" = resumen; el resto muestra su conteo
// y carga su sección bajo demanda.
function ProfileTabs({ tab, username, sections, onNavigate, routeBase }) {
  const navRef = useRef(null);
  const items = [
    { id: "profile", label: "Perfil" },
    { id: "statistics", label: "Estadísticas" },
    { id: "activity", label: "Actividad", count: sections?.activity },
    { id: "watched", label: "Diario", count: sections?.watched },
    { id: "reviews", label: "Reseñas", count: sections?.reviews },
    { id: "favorites", label: "Favoritos", count: sections?.favorites },
    { id: "watchlist", label: "Pendientes", count: sections?.watchlist },
    { id: "ratings", label: "Puntuaciones", count: sections?.ratings },
    { id: "lists", label: "Listas", count: sections?.lists },
    { id: "social", label: "Social" },
  ];

  useEffect(() => {
    const activeTab = navRef.current?.querySelector("[data-profile-tab-active='true']");
    if (!activeTab) return;
    activeTab.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
      block: "nearest",
      inline: "center",
    });
  }, [tab]);

  return (
    <nav
      ref={navRef}
      data-profile-horizontal-scroll
      data-profile-swipe-exempt
      aria-label="Secciones del perfil"
      className="mt-3 flex gap-1 overflow-x-auto border-b border-white/10 pb-px snap-x snap-proximity overscroll-x-contain [scrollbar-width:none] [-ms-overflow-style:none] sm:mt-8 [&::-webkit-scrollbar]:hidden"
    >
      {items.map((it) => {
        const active = tab === it.id;
        const handleNavigate = (event) => {
          // Se conservan los modificadores del enlace para abrir en otra
          // pestaña o copiar la URL. Para la navegación normal adelantamos el
          // estado local antes de que llegue el primer RSC de la ruta hija.
          if (
            active ||
            event.defaultPrevented ||
            event.button !== 0 ||
            event.metaKey ||
            event.ctrlKey ||
            event.shiftKey ||
            event.altKey
          ) return;
          event.preventDefault();
          onNavigate?.(it.id);
        };
        return (
          <Link
            key={it.id}
            href={profileTabHref(username, it.id, routeBase)}
            scroll={false}
            onClick={handleNavigate}
            data-profile-tab-active={active || undefined}
            className={`relative flex w-[calc((100%_-_0.75rem)_/_4)] shrink-0 snap-start items-center justify-center whitespace-nowrap px-0 py-2.5 text-[clamp(0.625rem,2.7vw,0.6875rem)] font-bold uppercase tracking-normal transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-400/70 sm:w-auto sm:justify-start sm:px-3.5 sm:text-xs sm:tracking-widest ${
              active ? "text-white" : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            {it.label}
            {typeof it.count === "number" && (
              <span className={`ml-1.5 hidden text-[10px] font-semibold tracking-normal sm:inline ${active ? "text-emerald-400" : "text-zinc-600"}`}>
                {it.count}
              </span>
            )}
            {active && (
              <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-emerald-400" />
            )}
          </Link>
        );
      })}
    </nav>
  );
}

function StatCell({ value, label }) {
  return (
    <div className="min-w-0 rounded-xl bg-zinc-900/40 px-1.5 py-2.5 text-center shadow-sm sm:px-2">
      <span className="block text-base font-black leading-none text-white sm:text-lg">{value ?? 0}</span>
      <span className="mt-1 block text-[8px] font-bold uppercase leading-3 tracking-[0.08em] text-zinc-500 sm:text-[9px]">
        {label}
      </span>
    </div>
  );
}

function formatProfileTime(minutes) {
  const value = Math.max(0, Number(minutes || 0));
  if (value < 60) return `${value} min`;
  return `${Math.floor(value / 60)} h`;
}

function AnalyticsCard({ title, subtitle, icon: Icon, iconClassName = "text-emerald-400", children, className = "" }) {
  return (
    <section
      className={`min-w-0 rounded-xl bg-zinc-900/30 p-4 shadow-sm sm:p-5 ${className}`}
    >
      <div className="mb-3 flex items-center gap-3">
        {Icon && (
          <span className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white/[0.045] ${iconClassName}`}>
            <Icon className="h-4 w-4" aria-hidden="true" />
          </span>
        )}
        <div>
        <h2 className="text-sm font-black text-white">{title}</h2>
        {subtitle && <p className="mt-0.5 text-xs text-zinc-500">{subtitle}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

function ProfileAnalytics({ analytics }) {
  const hasActivity = analytics.monthlyActivity?.some((item) => item.total > 0);
  return (
    <section className="space-y-4">
      <div className="grid min-w-0 gap-4 xl:grid-cols-12">
        <AnalyticsCard
          title="Actividad mensual"
          subtitle="Últimos doce meses"
          icon={Activity}
          iconClassName="text-indigo-400"
          className="xl:col-span-6"
        >
          {hasActivity ? (
            <MonthlyActivityChart data={analytics.monthlyActivity} />
          ) : (
            <EmptyChart message="Aún no hay actividad para representar." />
          )}
        </AnalyticsCard>
        <AnalyticsCard
          title="Tiempo de visionado"
          subtitle="Películas frente a series"
          icon={PieChart}
          iconClassName="text-violet-400"
          className="xl:col-span-3"
        >
          {analytics.totalMinutes > 0 ? (
            <TimeDistributionChart
              data={analytics.timeDistribution || []}
              formattedTotalTime={analytics.formattedTotalTime || "0h 0m"}
            />
          ) : (
            <EmptyChart message="Aún no hay tiempo de visionado registrado." />
          )}
        </AnalyticsCard>
        <aside
          aria-label="Resumen de hábitos"
          className="grid min-w-0 grid-cols-3 gap-2 sm:grid-cols-2 xl:col-span-3"
        >
          <HabitMetrics insights={analytics.insights} />
        </aside>
      </div>
      <div className="grid min-w-0 gap-4 md:grid-cols-2">
        <AnalyticsCard title="Hora del día" subtitle="Cuándo hay más actividad" icon={Clock3} iconClassName="text-pink-400">
          {hasActivity ? <HourOfDayChart data={analytics.hourOfDay || []} /> : <EmptyChart />}
        </AnalyticsCard>
        <AnalyticsCard title="Día de la semana" subtitle="Ritmo semanal" icon={CalendarDays} iconClassName="text-cyan-400">
          {hasActivity ? <DayOfWeekChart data={analytics.dayOfWeek || []} /> : <EmptyChart />}
        </AnalyticsCard>
        <AnalyticsCard title="Gustos por género" subtitle="Las categorías más frecuentes" icon={Target} iconClassName="text-lime-400">
          {analytics.genres?.length ? <GenreRadarChart data={analytics.genres} /> : <EmptyChart />}
        </AnalyticsCard>
        <AnalyticsCard title="Puntuaciones" subtitle="Distribución de notas">
          {analytics.ratings?.length ? <RatingsBarChart data={analytics.ratings} /> : <EmptyChart />}
        </AnalyticsCard>
      </div>
    </section>
  );
}

function EmptyChart({ message = "Todavía no hay datos suficientes." }) {
  return (
    <div className="flex h-[280px] items-center justify-center rounded-xl border border-dashed border-white/[0.08] px-6 text-center text-sm text-zinc-600">
      {message}
    </div>
  );
}

function HabitMetrics({ insights = {} }) {
  const items = [
    { icon: Flame, label: "Racha actual", value: `${insights.currentStreak || 0} días`, tone: "orange" },
    { icon: Award, label: "Mejor racha", value: `${insights.bestStreak || 0} días`, tone: "rose" },
    { icon: Star, label: "Nota media", value: insights.averageRating != null ? insights.averageRating.toFixed(1) : "—", tone: "amber" },
    { icon: Activity, label: "Género top", value: insights.topGenre?.name || "—", tone: "emerald" },
    { icon: CalendarDays, label: "Día favorito", value: insights.topDay?.name || "—", tone: "sky" },
    { icon: Clock3, label: "Hora punta", value: insights.peakHour?.name || "—", tone: "violet" },
  ];

  return items.map(({ icon, label, value, tone }) => (
    <HabitMetric key={label} icon={icon} label={label} value={value} tone={tone} />
  ));
}

function HabitMetric({ icon: Icon, label, value, tone = "emerald" }) {
  const toneClass = {
    amber: "text-amber-300",
    emerald: "text-emerald-300",
    orange: "text-orange-300",
    rose: "text-rose-300",
    sky: "text-sky-300",
    violet: "text-violet-300",
  }[tone] || "text-emerald-300";

  return (
    <div
      className="relative flex min-w-0 flex-col items-center justify-center overflow-hidden rounded-xl bg-zinc-900/30 px-2 py-2.5 text-center shadow-sm"
      aria-label={`${label}: ${value}`}
    >
      <span className={`relative z-10 mb-1 inline-flex h-6 w-6 items-center justify-center ${toneClass}`}>
        <Icon className="h-5 w-5" aria-hidden="true" />
      </span>
      <span className="relative z-10 block max-w-full truncate text-base font-black tracking-tight text-white drop-shadow-md sm:text-lg">
        {value}
      </span>
      <span className="relative z-10 mt-0.5 block max-w-full truncate text-[8px] font-bold uppercase tracking-wider text-zinc-300 sm:text-[9px]">
        {label}
      </span>
    </div>
  );
}
