"use client";


import OptimizedImage from "@/components/OptimizedImage";
import DetailsSectionMenu from "@/components/DetailsSectionMenu";
import {
  Children,
  useRef,
  useState,
  useEffect,
  useMemo,
  useCallback,
  startTransition,
} from "react";
import { motion, AnimatePresence, MotionConfig } from "framer-motion";
import {
  BarChart3,
  Calendar as CalendarIcon,
  Clock,
  Film,
  Tv,
  TrendingUp,
  Award,
  Activity,
  PieChart as PieChartIcon,
  Star,
  Heart,
  Users,
  Target,
  Timer,
  Library,
  MessageSquare,
  MapPin,
  BookMarked,
  ChevronRight,
  LogOut,
  RotateCcw,
  MonitorPlay,
  Settings,
} from "lucide-react";
import Link from "next/link";
import { Swiper, SwiperSlide } from "swiper/react";
import { Navigation, FreeMode } from "swiper/modules";
import "swiper/swiper-bundle.css";

import LiquidButton from "@/components/LiquidButton";
import { useAuth } from "@/context/AuthContext";
import { COLORS } from "./chartConstants";

const PROFILE_STATS_CACHE_KEY = "showverse:profile:stats:v8";
const PROFILE_DATA_CACHE_KEY = "showverse:profile:data:v8";
const PROFILE_USER_CACHE_KEY = "showverse:profile:user:v2";
const PROFILE_DEFERRED_OVERVIEW_TIMEOUT_MS = 220;
const PROFILE_FULL_REFRESH_DELAY_MS = 80;

function scheduleProfileDeferredOverview(callback) {
  if (typeof window === "undefined") return null;
  if ("requestIdleCallback" in window) {
    return window.requestIdleCallback(callback, {
      timeout: PROFILE_DEFERRED_OVERVIEW_TIMEOUT_MS,
    });
  }
  return window.setTimeout(callback, 48);
}

function cancelProfileDeferredOverview(handle) {
  if (typeof window === "undefined" || handle == null) return;
  if ("cancelIdleCallback" in window) {
    window.cancelIdleCallback(handle);
    return;
  }
  window.clearTimeout(handle);
}

// Persisted in localStorage (survives across sessions) and served
// stale-while-revalidate: cached profile data paints instantly on the first
// visit of a new session, while the mount effect always refreshes in the
// background. A hard age cap drops data that is too old to be useful.
const PROFILE_CACHE_HARD_MAX_AGE = 1000 * 60 * 60 * 24 * 7; // 7 días

function readProfileSessionCache(key) {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    if (Date.now() - Number(parsed.t || 0) > PROFILE_CACHE_HARD_MAX_AGE) {
      window.localStorage.removeItem(key);
      return null;
    }
    return parsed.data || null;
  } catch {
    return null;
  }
}

function writeProfileSessionCache(key, data) {
  if (typeof window === "undefined" || !data) return;
  try {
    window.localStorage.setItem(key, JSON.stringify({ t: Date.now(), data }));
  } catch {}
}

function clearProfileSessionCache() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(PROFILE_STATS_CACHE_KEY);
    window.localStorage.removeItem(PROFILE_DATA_CACHE_KEY);
    window.localStorage.removeItem(PROFILE_USER_CACHE_KEY);
  } catch {}
}

function isCompactProfilePayload(payload) {
  return Boolean(payload?.compact);
}

function createEmptyProfileStatsData() {
  return {
    source: "showverse",
    stats: {
      movies: { watched: 0, plays: 0, minutes: 0, comments: 0, collected: 0 },
      shows: { watched: 0, collected: 0, comments: 0 },
      episodes: { watched: 0, plays: 0, minutes: 0, comments: 0, collected: 0 },
      seasons: { comments: 0 },
      ratings: { total: 0, distribution: {} },
      network: { followers: 0, friends: 0 },
    },
    history: [],
    genres: [],
    watchedMovies: [],
    watchedShows: [],
    topActors: [],
    topDirectors: [],
  };
}

function toShowVerseProfileUser(user) {
  if (!user) return null;
  const username = user.username || "usuario";
  return {
    username,
    name: user.displayName || username,
    avatarUrl: user.avatarUrl || null,
    about: null,
    location: null,
    joined_at: user.createdAt || null,
    private: false,
    vip: user.plan && user.plan !== "free",
    vip_ep: false,
    slug: username,
    provider: "showverse",
  };
}

const useIsMobileLayout = (breakpointPx = 768) => {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia(`(max-width:${breakpointPx - 1}px)`);
    const update = () => setIsMobile(mq.matches);
    update();
    if (mq.addEventListener) mq.addEventListener("change", update);
    else mq.addListener(update);
    window.addEventListener("orientationchange", update);
    window.addEventListener("resize", update);
    return () => {
      if (mq.removeEventListener) mq.removeEventListener("change", update);
      else mq.removeListener(update);
      window.removeEventListener("orientationchange", update);
      window.removeEventListener("resize", update);
    };
  }, [breakpointPx]);

  return isMobile;
};

import dynamic from "next/dynamic";

// Charts are code-split out of the initial Profile bundle (recharts is heavy and
// the charts render deferred / below the fold anyway).
const ChartLoading = ({ className = "h-[300px]" }) => (
  <div className={`${className} min-w-0 w-full animate-pulse rounded-2xl bg-white/5`} />
);
const MonthlyActivityChart = dynamic(
  () => import("./profileCharts").then((m) => m.MonthlyActivityChart),
  { ssr: false, loading: () => <ChartLoading /> },
);
const TimeDistributionChart = dynamic(
  () => import("./profileCharts").then((m) => m.TimeDistributionChart),
  { ssr: false, loading: () => <ChartLoading className="h-[250px]" /> },
);
const HourOfDayChart = dynamic(
  () => import("./profileCharts").then((m) => m.HourOfDayChart),
  { ssr: false, loading: () => <ChartLoading /> },
);
const DayOfWeekChart = dynamic(
  () => import("./profileCharts").then((m) => m.DayOfWeekChart),
  { ssr: false, loading: () => <ChartLoading /> },
);
const GenreRadarChart = dynamic(
  () => import("./profileCharts").then((m) => m.GenreRadarChart),
  { ssr: false, loading: () => <ChartLoading /> },
);
const RatingsBarChart = dynamic(
  () => import("./profileCharts").then((m) => m.RatingsBarChart),
  { ssr: false, loading: () => <ChartLoading /> },
);

// -----------------------------------------------------------------------------
// COLORS & CONSTANTS
// -----------------------------------------------------------------------------
function privateMediaUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;

  const lower = raw.toLowerCase();
  if (lower.startsWith("data:image/")) {
    return raw;
  }

  if (raw.startsWith("//")) {
    return `https:${raw}`;
  }

  if (lower.startsWith("http://") || lower.startsWith("https://")) {
    return raw;
  }

  if (
    raw.startsWith("/uploads/") ||
    raw.startsWith("/avatars/") ||
    raw.startsWith("/profile/") ||
    raw.startsWith("/images/") ||
    raw.startsWith("/placeholder")
  ) {
    return raw;
  }

  if (/^\/[A-Za-z0-9_.-]+\.(avif|gif|jpe?g|png|webp)$/i.test(raw)) {
    return `https://image.tmdb.org/t/p/w342${raw}`;
  }

  if (/^[A-Za-z0-9_.-]+\.(avif|gif|jpe?g|png|webp)$/i.test(raw)) {
    return `https://image.tmdb.org/t/p/w342/${raw}`;
  }

  return null;
}

const fmtDate = (iso) => {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("es-ES", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
};

function formatProfileBadgeDate(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  const month = new Intl.DateTimeFormat("es-ES", { month: "short" })
    .format(d)
    .replace(".", "")
    .slice(0, 3)
    .toUpperCase();
  const day = new Intl.DateTimeFormat("es-ES", { day: "numeric" }).format(d);

  return {
    month,
    day,
    label: `${day} ${month.toLowerCase()}`,
  };
}

function ProfileDateIndicator({ dateParts }) {
  if (!dateParts) return null;

  return (
    <div
      className="absolute top-0 right-0 z-20 flex flex-col items-center justify-center gap-0 p-2 sm:p-2.5 rounded-bl-2xl border-l border-b border-white/25 bg-zinc-100/15 text-zinc-100 backdrop-blur-md shadow-sm transition-all duration-300 ease-out transform-gpu origin-top-right scale-0 opacity-0 group-hover:scale-100 group-hover:opacity-100 group-focus-within:scale-100 group-focus-within:opacity-100 pointer-events-none"
    >
      <span className="text-[8px] sm:text-[9px] font-black uppercase leading-none tracking-[0.08em] [text-box:trim-both_cap_alphabetic]">
        {dateParts.month}
      </span>
      <span className="mt-0.5 text-sm sm:text-base font-black leading-none tracking-tight [text-box:trim-both_cap_alphabetic]">
        {dateParts.day}
      </span>
    </div>
  );
}

const COLOR_STYLES = {
  emerald: {
    iconBg: "bg-emerald-500/10",
    iconText: "text-emerald-500",
    ring: "ring-emerald-500/20",
    glow: "bg-emerald-500/20",
    groupGlow: "group-hover:bg-emerald-500/30",
  },
  blue: {
    iconBg: "bg-blue-500/10",
    iconText: "text-blue-500",
    ring: "ring-blue-500/20",
    glow: "bg-blue-500/20",
    groupGlow: "group-hover:bg-blue-500/30",
  },
  purple: {
    iconBg: "bg-purple-500/10",
    iconText: "text-purple-500",
    ring: "ring-purple-500/20",
    glow: "bg-purple-500/20",
    groupGlow: "group-hover:bg-purple-500/30",
  },
  yellow: {
    iconBg: "bg-yellow-500/10",
    iconText: "text-yellow-500",
    ring: "ring-yellow-500/20",
    glow: "bg-yellow-500/20",
    groupGlow: "group-hover:bg-yellow-500/30",
  },
  pink: {
    iconBg: "bg-pink-500/10",
    iconText: "text-pink-500",
    ring: "ring-pink-500/20",
    glow: "bg-pink-500/20",
    groupGlow: "group-hover:bg-pink-500/30",
  },
  orange: {
    iconBg: "bg-orange-500/10",
    iconText: "text-orange-500",
    ring: "ring-orange-500/20",
    glow: "bg-orange-500/20",
    groupGlow: "group-hover:bg-orange-500/30",
  },
  cyan: {
    iconBg: "bg-cyan-500/10",
    iconText: "text-cyan-500",
    ring: "ring-cyan-500/20",
    glow: "bg-cyan-500/20",
    groupGlow: "group-hover:bg-cyan-500/30",
  },
  indigo: {
    iconBg: "bg-indigo-500/10",
    iconText: "text-indigo-500",
    ring: "ring-indigo-500/20",
    glow: "bg-indigo-500/20",
    groupGlow: "group-hover:bg-indigo-500/30",
  },
  rose: {
    iconBg: "bg-rose-500/10",
    iconText: "text-rose-500",
    ring: "ring-rose-500/20",
    glow: "bg-rose-500/20",
    groupGlow: "group-hover:bg-rose-500/30",
  },
  teal: {
    iconBg: "bg-teal-500/10",
    iconText: "text-teal-500",
    ring: "ring-teal-500/20",
    glow: "bg-teal-500/20",
    groupGlow: "group-hover:bg-teal-500/30",
  },
  lime: {
    iconBg: "bg-lime-500/10",
    iconText: "text-lime-500",
    ring: "ring-lime-500/20",
    glow: "bg-lime-500/20",
    groupGlow: "group-hover:bg-lime-500/30",
  },
};

const PROFILE_GLASS_SURFACE =
  "relative isolate overflow-hidden bg-black/40 bg-gradient-to-br from-white/20 via-transparent to-black/60 backdrop-blur-[60px] shadow-[0_15px_40px_-10px_rgba(0,0,0,0.9)] transform-gpu";
const PROFILE_GLASS_HOVER =
  "transition-all duration-300 hover:bg-black/50 hover:shadow-[0_20px_50px_-10px_rgba(0,0,0,1)]";
const PROFILE_GLASS_PANEL = `${PROFILE_GLASS_SURFACE} ${PROFILE_GLASS_HOVER}`;

// -----------------------------------------------------------------------------
// DATA HELPERS
// -----------------------------------------------------------------------------
const processMonthlyActivity = (historyData) => {
  const activity = {};
  const now = new Date();

  // Initialize last 12 months
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    activity[key] = {
      date: key,
      label: d.toLocaleDateString("es-ES", { month: "short" }),
      movies: 0,
      episodes: 0,
      total: 0,
    };
  }

  historyData.forEach((item) => {
    const date = new Date(item.watched_at);
    // Ignore future dates or weird parsed dates
    if (date > now) return;

    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    if (activity[key]) {
      if (item.type === "movie") activity[key].movies++;
      else activity[key].episodes++;
      activity[key].total++;
    }
  });

  return Object.values(activity);
};

const processGenreDistribution = (genres) => {
  if (!genres) return [];
  const entries = Array.isArray(genres)
    ? genres.map((item) => [item?.name, item?.value ?? item?.count ?? 0])
    : Object.entries(genres);

  return entries
    .map(([name, value]) => ({ name, value: Number(value || 0) }))
    .filter((item) => item.name && item.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, 6); // Top 6 for Radar
};

const processRatings = (ratingDist) => {
  return Object.entries(ratingDist)
    .map(([rating, count]) => ({
      name: rating,
      value: count,
    }))
    .sort((a, b) => Number(a.name) - Number(b.name));
};

const processDayOfWeek = (historyData) => {
  const days = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
  const counts = days.map((day) => ({ name: day, value: 0 }));

  historyData.forEach((item) => {
    const d = new Date(item.watched_at);
    counts[d.getDay()].value++;
  });
  return counts;
};

const processHourOfDay = (historyData) => {
  const counts = Array.from({ length: 24 }, (_, i) => ({
    name: `${i}h`,
    value: 0,
  }));
  historyData.forEach((item) => {
    const d = new Date(item.watched_at);
    counts[d.getHours()].value++;
  });
  return counts;
};

// -----------------------------------------------------------------------------
// COMPONENTS
// -----------------------------------------------------------------------------

function KPICard({
  title,
  value,
  subtitle,
  icon: Icon,
  color,
  delay = 0,
  loading = false,
}) {
  const styles = COLOR_STYLES[color] || COLOR_STYLES.emerald;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.5 }}
      className={`${PROFILE_GLASS_PANEL} group rounded-3xl p-4 sm:p-6`}
    >
      <div
        className={`absolute top-0 right-0 p-3 opacity-20 transition-opacity ${styles.iconText}`}
      >
        <Icon className="h-16 w-16 translate-x-4 -translate-y-4 rotate-12 transform sm:h-24 sm:w-24" />
      </div>

      <div className="relative z-10 flex flex-col h-full justify-between">
        <div className="mb-4 flex items-center gap-2 sm:gap-3">
          <div
            className={`p-2.5 rounded-xl ${styles.iconBg} ${styles.iconText} ring-1 ${styles.ring}`}
          >
            <Icon className="w-6 h-6" />
          </div>
          <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400 sm:text-sm">
            {title}
          </h3>
        </div>

        <div>
          <div className="mb-1 text-3xl font-black leading-none tracking-tight text-white sm:text-4xl">
            {loading ? (
              <span className="inline-block h-9 w-24 rounded-xl bg-white/10 animate-pulse" />
            ) : (
              value
            )}
          </div>
          {loading ? (
            <span className="inline-block h-4 w-28 rounded-lg bg-white/5 animate-pulse" />
          ) : subtitle ? (
            <div className="text-sm font-medium text-zinc-500">{subtitle}</div>
          ) : null}
        </div>
      </div>

      {/* Decorative gradient glow */}
      <div
        className={`absolute -bottom-10 -left-10 w-32 h-32 rounded-full blur-3xl pointer-events-none transition-all ${styles.glow} ${styles.groupGlow}`}
      />
    </motion.div>
  );
}

function ProfilePageBackground({ variant = "indigo" }) {
  const isConnect = variant === "connect";

  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
      {isConnect ? (
        <>
          <div className="absolute -top-[10%] -left-[5%] w-[60vw] max-w-[800px] aspect-square rounded-full bg-emerald-600/15 blur-[120px] sm:blur-[150px]" />
          <div className="absolute top-[15%] -right-[5%] w-[55vw] max-w-[700px] aspect-square rounded-full bg-sky-700/20 blur-[120px] sm:blur-[150px]" />
          <div className="absolute -bottom-[10%] left-[15%] w-[65vw] max-w-[800px] aspect-square rounded-full bg-blue-800/25 blur-[120px] sm:blur-[150px]" />
        </>
      ) : (
        <>
          <div className="absolute -top-[10%] -left-[5%] w-[60vw] max-w-[800px] aspect-square rounded-full bg-indigo-600/15 blur-[120px] sm:blur-[150px]" />
          <div className="absolute top-[15%] -right-[5%] w-[55vw] max-w-[700px] aspect-square rounded-full bg-purple-700/20 blur-[120px] sm:blur-[150px]" />
          <div className="absolute -bottom-[10%] left-[15%] w-[65vw] max-w-[800px] aspect-square rounded-full bg-blue-800/25 blur-[120px] sm:blur-[150px]" />
        </>
      )}
    </div>
  );
}

function SectionTitle({ icon: Icon, title, subtitle, color = "indigo", href }) {
  const styles = COLOR_STYLES[color] || COLOR_STYLES.indigo;

  return (
    <div className="flex items-center justify-between gap-4 mb-6">
      <div className="flex items-center gap-3">
        <div
          className={`relative isolate overflow-hidden rounded-xl p-2 bg-black/40 bg-gradient-to-br from-white/10 via-transparent to-black/60 backdrop-blur-[50px] shadow-lg transform-gpu ${styles.iconText}`}
        >
          <Icon className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-white">{title}</h2>
          {subtitle && <p className="text-sm text-zinc-500">{subtitle}</p>}
        </div>
      </div>
      {href && (
        <Link
          href={href}
          className="flex items-center gap-1 text-xs text-zinc-500 transition-colors hover:text-white"
        >
          Ver todo <ChevronRight className="h-3 w-3" />
        </Link>
      )}
    </div>
  );
}

function ProfileCardScroller({ children }) {
  const swiperRef = useRef(null);
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(false);
  const isMobile = useIsMobileLayout(768);
  const slides = Children.toArray(children);
  const childrenCount = slides.length;

  const breakpointsRow = {
    0: { slidesPerView: 3, spaceBetween: 12 },
    640: { slidesPerView: 4, spaceBetween: 14 },
    768: { slidesPerView: 4, spaceBetween: 16 },
    1024: { slidesPerView: 5, spaceBetween: 18 },
    1280: { slidesPerView: 6, spaceBetween: 20 },
  };

  const getStep = useCallback((swiper) => {
    const current = swiper?.params?.slidesPerView;
    return typeof current === "number" ? Math.max(1, Math.floor(current)) : 1;
  }, []);

  const updateNav = useCallback((swiper) => {
    if (!swiper) return;
    const visibleSlides = getStep(swiper);
    const slideCount = swiper.slides?.length || childrenCount;
    const hasOverflow =
      slideCount > visibleSlides ||
      (Array.isArray(swiper.snapGrid) && swiper.snapGrid.length > 1) ||
      !swiper.isLocked;
    setCanPrev(hasOverflow && !swiper.isBeginning);
    setCanNext(hasOverflow && !swiper.isEnd);
  }, [childrenCount, getStep]);

  const handleSwiper = useCallback((swiper) => {
    swiperRef.current = swiper;
    updateNav(swiper);
    requestAnimationFrame(() => {
      swiper.update?.();
      updateNav(swiper);
    });
  }, [updateNav]);

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

  const showPrev = canPrev;
  const showNext = canNext;

  return (
    <div
      className="-mx-4 sm:-mx-10 sm:px-10 xl:-mx-12 xl:px-12"
      style={{
        overflowX: isMobile ? "clip" : "visible",
        overflowY: "visible",
      }}
    >
      <div className="group/row relative z-0 px-3 hover:z-[200] sm:px-0">
        <div
          className="relative z-0"
          style={{
            overflowX: isMobile ? "visible" : "clip",
            overflowY: "visible",
          }}
        >
          <Swiper
            slidesPerView={3}
            spaceBetween={12}
            observer={true}
            observeParents={true}
            resizeObserver={true}
            onSwiper={handleSwiper}
            onSlideChange={updateNav}
            onResize={updateNav}
            onReachBeginning={updateNav}
            onReachEnd={updateNav}
            breakpoints={breakpointsRow}
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
            className="relative z-0 !overflow-visible pb-8 pt-7"
          >
            {slides.map((child, idx) => (
              <SwiperSlide
                key={child?.key || idx}
                className="relative !h-auto select-none !overflow-visible !z-0 hover:!z-[300] focus-within:!z-[300]"
              >
                {child}
              </SwiperSlide>
            ))}
          </Swiper>
        </div>

        {showPrev && !isMobile && (
          <button
            type="button"
            onClick={handlePrevClick}
            className="absolute inset-y-0 -left-8 z-[500] hidden w-7 items-center justify-center text-white/80 opacity-0 transition-[color,opacity] duration-200 hover:text-white focus-visible:opacity-100 group-hover/row:opacity-100 pointer-events-auto sm:flex xl:-left-10"
            aria-label="Anterior"
          >
            <motion.span
              className="relative text-4xl font-semibold drop-shadow-[0_0_12px_rgba(0,0,0,0.95)]"
              whileHover={{ x: -4 }}
            >
              ‹
            </motion.span>
          </button>
        )}

        {showNext && !isMobile && (
          <button
            type="button"
            onClick={handleNextClick}
            className="absolute inset-y-0 -right-8 z-[500] hidden w-7 items-center justify-center text-white/80 opacity-0 transition-[color,opacity] duration-200 hover:text-white focus-visible:opacity-100 group-hover/row:opacity-100 pointer-events-auto sm:flex xl:-right-10"
            aria-label="Siguiente"
          >
            <motion.span
              className="relative text-4xl font-semibold drop-shadow-[0_0_12px_rgba(0,0,0,0.95)]"
              whileHover={{ x: 4 }}
            >
              ›
            </motion.span>
          </button>
        )}
      </div>
    </div>
  );
}

function ProfileCardScrollerItem({ children }) {
  return children;
}

function ProfileHero({ user, onSync, onDisconnect, syncing = false }) {
  if (!user) {
    return null;
  }

  const avatarUrl = privateMediaUrl(user?.avatarUrl);
  const displayName = user.name || user.username || "Usuario";

  const actionButtons = (className = "") => (
    <div className={`flex items-center gap-2 ${className}`}>
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.25 }}
      >
        <LiquidButton
          onClick={() => window.location.assign("/profile/settings")}
          disabled={syncing}
          activeColor="teal"
          groupId="profile-header-actions"
          title="Configuracion"
          className="!bg-white/5 !bg-gradient-to-br !from-white/20 !via-white/5 !to-transparent !border-0 shadow-lg backdrop-blur-md hover:!bg-white/15"
        >
          <Settings className="w-5 h-5" />
        </LiquidButton>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.3 }}
      >
        <LiquidButton
          onClick={onSync}
          disabled={syncing}
          loading={syncing}
          activeColor="green"
          groupId="profile-header-actions"
          title="Actualizar"
          className="!bg-white/5 !bg-gradient-to-br !from-white/20 !via-white/5 !to-transparent !border-0 shadow-lg backdrop-blur-md hover:!bg-white/15"
        >
          <RotateCcw className={`w-5 h-5 ${syncing ? "animate-spin" : ""}`} />
        </LiquidButton>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.4 }}
      >
        <LiquidButton
          onClick={onDisconnect}
          disabled={syncing}
          loading={syncing}
          activeColor="red"
          groupId="profile-header-actions"
          title="Cerrar sesión"
          className="!text-red-400 hover:!text-red-300 !bg-white/5 !bg-gradient-to-br !from-white/20 !via-white/5 !to-transparent !border-0 shadow-lg backdrop-blur-md hover:!bg-white/15"
        >
          <LogOut className="w-5 h-5" />
        </LiquidButton>
      </motion.div>
    </div>
  );

  return (
    <div className="flex min-w-0 items-center gap-4 sm:gap-5 w-full">
      {/* Clean Avatar Box */}
      <div className="h-28 w-28 sm:h-32 sm:w-32 md:h-36 md:w-36 flex-shrink-0 overflow-hidden rounded-[2rem] sm:rounded-[2.5rem] ring-2 ring-indigo-500/30 shadow-2xl shadow-indigo-500/10">
        {avatarUrl ? (
          <OptimizedImage
            src={avatarUrl}
            alt={displayName}
            width={144}
            height={144}
            loading="eager"
            fetchPriority="high"
            decoding="sync"
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-indigo-600 to-purple-700">
            <span className="text-4xl sm:text-5xl md:text-6xl font-black text-white">
              {displayName[0]?.toUpperCase() || "?"}
            </span>
          </div>
        )}
      </div>

      {/* User text details & Inline actions */}
      <div className="min-w-0 flex-1">
        <div className="mb-1.5 flex items-center gap-3">
          <div className="h-px w-10 bg-indigo-500" />
          <span className="text-[10px] sm:text-xs font-bold uppercase tracking-widest text-indigo-400">
            Tu cuenta
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-3 sm:gap-4 min-w-0">
          <h1 className="min-w-0 truncate text-3xl sm:text-4xl md:text-5xl font-black tracking-tighter leading-none text-white">
            {displayName}
            <span className="text-indigo-500">.</span>
          </h1>
          {user.vip && (
            <span className="shrink-0 rounded-full border border-yellow-500/30 bg-yellow-500/20 px-2 py-0.5 text-[9px] sm:text-[10px] font-black uppercase text-yellow-400">
              VIP
            </span>
          )}
          {actionButtons("shrink-0")}
        </div>
        <p className="mt-1 text-xs sm:text-sm font-medium text-zinc-500 hidden sm:block">
          @{user.username}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500 font-medium">
          {user.location && (
            <span className="flex items-center gap-1">
              <MapPin className="h-3 w-3" />
              {user.location}
            </span>
          )}
          {user.joined_at && (
            <span className="flex items-center gap-1">
              <CalendarIcon className="h-3 w-3" />
              Desde {fmtDate(user.joined_at)}
            </span>
          )}
        </div>
        {user.about && (
          <p className="mt-2 line-clamp-1 max-w-lg text-xs sm:text-sm text-zinc-400">
            {user.about}
          </p>
        )}
      </div>
    </div>
  );
}

function ProfileSectionTabs({ viewMode, setViewMode, className = "" }) {
  const tabs = [
    { id: "overview", label: "General", icon: PieChartIcon },
    { id: "patterns", label: "Patrones", icon: TrendingUp },
    { id: "yearly", label: "Histórico", icon: CalendarIcon },
  ];

  return (
    <DetailsSectionMenu
      items={tabs}
      activeId={viewMode}
      onChange={setViewMode}
      className={["w-full lg:w-[520px]", className].join(" ")}
      maxWidthClass="max-w-none"
      colorScheme="indigo"
    />
  );
}

function ProfileUnifiedCard({
  item,
  type, // "movie" | "show" | "person"
  sectionColor = "indigo",
  rank,
  plays,
  showRating = false,
  dateField,
  role,
  count,
  isScrollable = false,
}) {
  const [err, setErr] = useState(false);
  // Extract media properties safely
  const media =
    type === "movie"
      ? item?.movie || item
      : type === "show"
        ? item?.show || item
        : item;
  const tmdbId = media?.ids?.tmdb || media?.tmdbId || media?.id;
  const title = media?.title || media?.name || "Sin título";
  const year =
    media?.year ||
    (media?.release_date ? media.release_date.slice(0, 4) : "") ||
    (media?.first_air_date ? media.first_air_date.slice(0, 4) : "");
  const episodeSeason = item?.episode?.season;
  const episodeNumber = item?.episode?.number;
  const isEpisodeCard =
    type !== "movie" &&
    Number.isFinite(Number(episodeSeason)) &&
    Number.isFinite(Number(episodeNumber));

  // Resolve links
  let href = "#";
  const mediaType = (type || item.type) === "movie" ? "movie" : "tv";
  if (item?.detailsHref) {
    href = item.detailsHref;
  } else if (type === "person") {
    if (item.id) href = `/details/person/${item.id}`;
  } else if (isEpisodeCard) {
    href = `/details/tv/${tmdbId}/season/${episodeSeason}/episode/${episodeNumber}`;
  } else {
    if (tmdbId) href = `/details/${mediaType}/${tmdbId}`;
  }

  const itemType = type || item.type;
  const isMedia =
    itemType === "movie" || itemType === "show" || itemType === "tv";
  const dateParts =
    dateField && item?.[dateField]
      ? formatProfileBadgeDate(item[dateField])
      : null;

  const shadowColorStyles = {
    emerald: "16, 185, 129",
    yellow: "234, 179, 8",
    indigo: "99, 102, 241",
    blue: "59, 130, 246",
    purple: "168, 85, 247",
    rose: "244, 63, 94",
  };
  const hoverShadowRgb =
    shadowColorStyles[sectionColor] || shadowColorStyles.indigo;
  const hoverShadowColor = [
    `0 18px 48px -24px rgba(${hoverShadowRgb}, 0.72)`,
    `0 10px 24px -18px rgba(${hoverShadowRgb}, 0.58)`,
    "0 16px 30px -24px rgba(0, 0, 0, 0.75)",
  ].join(", ");
  const path =
    media?.poster_path ||
    media?.posterPath ||
    media?.profile_path ||
    item?.poster_path ||
    item?.posterPath ||
    item?.profilePosterPath ||
    null;
  const resolvedSrc = privateMediaUrl(path);
  const src = err ? null : resolvedSrc;

  useEffect(() => {
    setErr(false);
  }, [resolvedSrc]);

  return (
    <Link
      href={href}
      className={`relative z-0 block hover:z-[300] focus:z-[300] focus:outline-none ${isScrollable ? "w-32 sm:w-40 flex-shrink-0" : "w-full"}`}
      draggable={false}
      onDragStart={(e) => e.preventDefault()}
    >
      <motion.div
        className={`${PROFILE_GLASS_PANEL} group z-0 aspect-[2/3] w-full rounded-lg shadow-lg transform-gpu will-change-transform`}
        whileHover={{
          y: -6,
          zIndex: 300,
          boxShadow: hoverShadowColor,
        }}
        whileTap={{ y: -2 }}
        transition={{ type: "spring", stiffness: 360, damping: 26 }}
      >
        {src ? (
          <OptimizedImage
            src={src}
            alt={title}
            loading="lazy"
            decoding="async"
            draggable={false}
            className="h-full w-full object-cover grayscale-[18%] transition-transform duration-500 transform-gpu group-hover:scale-[1.08] group-hover:-translate-y-1 group-hover:grayscale-0"
            onError={() => setErr(true)}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-zinc-500">
            {type === "person" ? (
              <Users className="h-8 w-8 opacity-60" />
            ) : type === "movie" || item.type === "movie" ? (
              <Film className="h-8 w-8 opacity-60" />
            ) : (
              <Tv className="h-8 w-8 opacity-60" />
            )}
          </div>
        )}

        {isMedia && rank === undefined && (
          <div
            className={`absolute top-0 left-0 z-20 p-2 sm:p-2.5 rounded-br-2xl border-r border-b backdrop-blur-md shadow-sm transition-all duration-300 ease-out transform-gpu origin-top-left scale-0 opacity-0 group-hover:scale-100 group-hover:opacity-100 group-focus-within:scale-100 group-focus-within:opacity-100 ${
              itemType === "movie"
                ? "bg-sky-500/15 border-sky-500/30 text-sky-300"
                : "bg-purple-500/15 border-purple-500/30 text-purple-300"
            }`}
          >
            {itemType === "movie" ? (
              <Film className="w-4 h-4 sm:w-[18px] sm:h-[18px]" />
            ) : (
              <MonitorPlay className="w-4 h-4 sm:w-[18px] sm:h-[18px]" />
            )}
          </div>
        )}

        {rank !== undefined && (
          <div className="absolute top-0 left-0 z-20 px-2.5 py-1.5 sm:px-3 sm:py-2 rounded-br-2xl border-r border-b backdrop-blur-md shadow-sm transition-all duration-300 ease-out transform-gpu origin-top-left scale-0 opacity-0 group-hover:scale-100 group-hover:opacity-100 group-focus-within:scale-100 group-focus-within:opacity-100 bg-yellow-500/15 border-yellow-500/30 text-yellow-400 font-black text-[11px] sm:text-xs text-center">
            #{rank}
          </div>
        )}

        <ProfileDateIndicator dateParts={dateParts} />

        {/* Bottom gradient */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

        {/* Bottom hover details */}
        <div className="absolute bottom-0 left-0 right-0 p-3 opacity-0 transition-all duration-300 transform-gpu translate-y-3 group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:translate-y-0 group-focus-within:opacity-100">
          <div className="flex items-end justify-between gap-3">
            <div className="min-w-0 text-left flex-1">
              <h3 className="line-clamp-2 text-xs font-bold leading-tight text-white sm:text-sm drop-shadow-md">
                {title}
              </h3>

              {/* Subtitle depending on card context */}
              {type !== "person" ? (
                <p className="text-yellow-500 text-[10px] font-bold mt-0.5 drop-shadow-md line-clamp-1">
                  {year}
                  {item.episode &&
                    `${year ? " • " : ""}T${String(item.episode.season).padStart(2, "0")} · E${String(item.episode.number).padStart(2, "0")}`}
                </p>
              ) : (
                count !== undefined && (
                  <p className="mt-0.5 text-[10px] font-bold text-zinc-300 sm:text-xs">
                    {count} {role === "actor" ? "pelis" : "obras"}
                  </p>
                )
              )}

            </div>

            {/* Play Count (vistas) for ranked top movie/shows */}
            {plays !== undefined && (
              <span className="text-zinc-400 text-[10px] font-bold shrink-0 opacity-75 sm:text-xs">
                {plays} vistas
              </span>
            )}

            {/* User rating (e.g. "10") rendered big on bottom-right */}
            {showRating && item.rating && (
              <span className="text-yellow-400 text-2xl font-black font-mono tracking-tight drop-shadow-[0_2px_4px_rgba(0,0,0,1)] shrink-0">
                {item.rating}
              </span>
            )}
          </div>
        </div>
      </motion.div>
    </Link>
  );
}

// -----------------------------------------------------------------------------
// MAIN COMPONENT
// -----------------------------------------------------------------------------
export default function StatsClient({ connectNext = "/profile" }) {
  const {
    user: authUser,
    authenticated,
    hydrated: authHydrated,
    logout,
  } = useAuth();
  const isMobile = useIsMobileLayout(768);
  const [loading, setLoading] = useState(true);
  const [notConnected, setNotConnected] = useState(false);
  const [data, setData] = useState(null);
  const [profileData, setProfileData] = useState(null);
  const [error, setError] = useState("");
  const [viewMode, setViewMode] = useState("overview"); // overview | patterns | yearly
  const [refreshTick, setRefreshTick] = useState(0);
  const [showDisconnectModal, setShowDisconnectModal] = useState(false);
  const [deferredOverviewReady, setDeferredOverviewReady] = useState(false);
  const overviewDeferredOnceRef = useRef(false);
  const showVerseProfileUser = useMemo(
    () => toShowVerseProfileUser(authUser),
    [authUser],
  );

  const handleSyncProfile = useCallback(() => {
    clearProfileSessionCache();
    overviewDeferredOnceRef.current = false;
    setError("");
    setNotConnected(false);
    setLoading(true);
    setDeferredOverviewReady(false);
    setRefreshTick((tick) => tick + 1);
  }, []);

  useEffect(() => {
    const handleNetflixSyncUpdate = () => {
      handleSyncProfile();
    };
    window.addEventListener("netflix-sync-update", handleNetflixSyncUpdate);
    return () => {
      window.removeEventListener("netflix-sync-update", handleNetflixSyncUpdate);
    };
  }, [handleSyncProfile]);

  const handleDisconnect = useCallback(async () => {
    try {
      clearProfileSessionCache();
      setShowDisconnectModal(false);
      await logout({ redirectTo: "/login" });
    } catch (e) {
      console.error("Error cerrando sesión:", e);
      setShowDisconnectModal(false);
      alert("Error al cerrar sesión. Por favor, inténtalo de nuevo.");
    }
  }, [logout]);

  useEffect(() => {
    let ignore = false;

    if (!authHydrated) {
      return () => {
        ignore = true;
      };
    }

    if (!authenticated) {
      clearProfileSessionCache();
      setNotConnected(true);
      setLoading(false);
      setData(null);
      setProfileData(null);
      return () => {
        ignore = true;
      };
    }

    setNotConnected(false);
    if (showVerseProfileUser) {
      setProfileData((prev) => ({
        ...(prev || {}),
        user: showVerseProfileUser,
      }));
    }

    const cachedStats = readProfileSessionCache(PROFILE_STATS_CACHE_KEY);
    const cachedProfile = readProfileSessionCache(PROFILE_DATA_CACHE_KEY);
    const cachedUser = readProfileSessionCache(PROFILE_USER_CACHE_KEY);

    if (cachedStats) {
      setData(cachedStats);
      setLoading(false);
    }
    if (cachedProfile) {
      setProfileData(cachedProfile);
    } else if (cachedUser?.user) {
      setProfileData(cachedUser);
    }
    if (showVerseProfileUser) {
      setProfileData((prev) => ({
        ...(prev || {}),
        user: showVerseProfileUser,
      }));
    }

    const applyShowVerseFallback = () => {
      clearProfileSessionCache();
      if (showVerseProfileUser) {
        setProfileData((prev) => ({
          ...(prev || {}),
          user: showVerseProfileUser,
        }));
      }
      if (!cachedStats) setData(createEmptyProfileStatsData());
      setLoading(false);
    };

    const applyProfileJson = (json) => {
      const profile = {
        user: json.user || showVerseProfileUser,
        recentHistory: Array.isArray(json.recentHistory)
          ? json.recentHistory
          : [],
        recentRatings: Array.isArray(json.recentRatings)
          ? json.recentRatings
          : [],
        watchlist: Array.isArray(json.watchlist) ? json.watchlist : [],
      };

      const statsPayload = {
        ...createEmptyProfileStatsData(),
        ...json,
        source: "showverse",
        stats: {
          ...createEmptyProfileStatsData().stats,
          ...(json.stats || {}),
        },
        history: Array.isArray(json.history) ? json.history : [],
        watchedMovies: Array.isArray(json.watchedMovies)
          ? json.watchedMovies
          : [],
        watchedShows: Array.isArray(json.watchedShows)
          ? json.watchedShows
          : [],
        topActors: Array.isArray(json.topActors) ? json.topActors : [],
        topDirectors: Array.isArray(json.topDirectors) ? json.topDirectors : [],
      };

      setProfileData(profile);
      setData(statsPayload);
      writeProfileSessionCache(PROFILE_DATA_CACHE_KEY, profile);
      writeProfileSessionCache(PROFILE_STATS_CACHE_KEY, statsPayload);
      if (profile.user) {
        writeProfileSessionCache(PROFILE_USER_CACHE_KEY, {
          user: profile.user,
        });
      }

      return statsPayload;
    };

    const fetchProfileJson = async (compact) => {
      const res = await fetch(`/api/profile${compact ? "?compact=1" : ""}`, {
        cache: "no-store",
        credentials: "include",
      });
      if (ignore) return null;
      if (res.status === 401) return { unauthorized: true };
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        return {
          error: json?.error || "No se pudieron cargar las estadísticas.",
          status: res.status,
        };
      }
      return { json };
    };

    const fetchData = async () => {
      setError("");
      if (!cachedStats) setLoading(true);

      try {
        const shouldUseCompactFirst =
          !cachedStats || isCompactProfilePayload(cachedStats);
        const initialResult = await fetchProfileJson(shouldUseCompactFirst);
        if (ignore) return;
        if (initialResult?.unauthorized) {
          applyShowVerseFallback();
          return;
        }
        if (initialResult?.error) {
          if (authenticated) {
            console.warn(
              "No se pudo cargar el perfil desde el backend propio:",
              initialResult.error || initialResult.status,
            );
            applyShowVerseFallback();
          } else if (!cachedStats) {
            setError("No se pudieron cargar las estadísticas.");
          }
          return;
        }

        const initialStats = initialResult?.json
          ? applyProfileJson(initialResult.json)
          : null;
        if (ignore) return;
        setLoading(false);

        if (isCompactProfilePayload(initialStats)) {
          window.setTimeout(async () => {
            if (ignore) return;
            try {
              const fullResult = await fetchProfileJson(false);
              if (ignore || fullResult?.unauthorized) return;
              if (fullResult?.json) {
                applyProfileJson(fullResult.json);
              }
            } catch (e) {
              console.error(e);
            } finally {
              if (!ignore) setLoading(false);
            }
          }, PROFILE_FULL_REFRESH_DELAY_MS);
        }
      } catch (e) {
        console.error(e);
        if (!ignore && !cachedStats) {
          setError("No se pudieron cargar las estadísticas.");
        }
      } finally {
        if (!ignore) setLoading(false);
      }
    };
    fetchData();

    return () => {
      ignore = true;
    };
  }, [authHydrated, authenticated, refreshTick, showVerseProfileUser]);

  const stats = useMemo(() => {
    if (!data) return null;

    // Safety checks for all nested properties
    const tStats = data.stats || {};
    const movies = tStats.movies || {};
    const showStats = tStats.shows || {}; // Renamed to avoid confusion with topShows
    const episodes = tStats.episodes || {};
    const seasons = tStats.seasons || {};
    const history = data.history || [];

    const totalMinutes = (movies.minutes || 0) + (episodes.minutes || 0);
    const totalHours = Math.round(totalMinutes / 60);

    const monthlyData = processMonthlyActivity(history);
    const genreData = processGenreDistribution(data.genres);
    const ratingData = processRatings(tStats.ratings?.distribution || {});
    const dayOfWeekData = processDayOfWeek(history);
    const hourOfDayData = processHourOfDay(history);

    const timeDistribution = [
      { name: "Películas", value: movies.minutes || 0, color: COLORS.blue },
      { name: "Series", value: episodes.minutes || 0, color: COLORS.purple },
    ];

    const totalComments =
      (movies.comments || 0) +
      (showStats.comments || 0) +
      (seasons.comments || 0) +
      (episodes.comments || 0);
    const totalCollected =
      (movies.collected || 0) +
      (showStats.collected || 0) +
      (episodes.collected || 0);

    return {
      raw: tStats,
      history,
      movies,
      episodes,
      showStats,
      network: tStats.network || {},
      ratings: tStats.ratings || {},
      totalMinutes,
      totalHours,
      totalDays: Math.floor(totalHours / 24),
      formattedTotalTime: `${Math.floor(totalMinutes / 60)}h ${totalMinutes % 60}m`,
      totalComments,
      totalCollected,
      monthlyData,
      genreData,
      ratingData,
      dayOfWeekData,
      hourOfDayData,
      timeDistribution,
      topMovies: (data.watchedMovies || [])
        .sort((a, b) => b.plays - a.plays)
        .slice(0, 15),
      topShows: (data.watchedShows || [])
        .sort((a, b) => b.plays - a.plays)
        .slice(0, 15),
      topMoviesReady: (data.watchedMovies || []).length > 0,
      topShowsReady: (data.watchedShows || []).length > 0,
      years: [
        ...new Set(history.map((h) => new Date(h.watched_at).getFullYear())),
      ].sort((a, b) => b - a),
      topActors: (data.topActors || []).slice(0, 15),
      topDirectors: (data.topDirectors || []).slice(0, 15),
    };
  }, [data]);

  const profileUser = showVerseProfileUser || profileData?.user || null;
  const recentHistory = profileData?.recentHistory || [];
  const recentRatings = profileData?.recentRatings || [];
  const watchlist = profileData?.watchlist || [];
  const headerReady = !!profileUser;
  const profileRowsReady = !!stats;
  const pageReady = headerReady && profileRowsReady;

  useEffect(() => {
    if (!pageReady) {
      overviewDeferredOnceRef.current = false;
      setDeferredOverviewReady(false);
      return undefined;
    }

    if (viewMode !== "overview") return undefined;

    if (overviewDeferredOnceRef.current) {
      setDeferredOverviewReady(true);
      return undefined;
    }

    setDeferredOverviewReady(false);
    const handle = scheduleProfileDeferredOverview(() => {
      overviewDeferredOnceRef.current = true;
      startTransition(() => {
        setDeferredOverviewReady(true);
      });
    });

    return () => cancelProfileDeferredOverview(handle);
  }, [pageReady, refreshTick, viewMode]);

  if (notConnected) {
    return (
      <div className="min-h-screen bg-black text-zinc-100 pb-20 selection:bg-emerald-500/30">
        <ProfilePageBackground variant="connect" />

        <div className="relative z-10 max-w-7xl mx-auto px-4 py-8 lg:py-12">
          {/* Header */}
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-8 lg:mb-10"
          >
            <div className="flex items-center gap-3 mb-2">
              <div className="h-px w-12 bg-emerald-500" />
              <span className="text-emerald-400 font-bold uppercase tracking-widest text-xs">
                Tu Perfil
              </span>
            </div>
            <h1 className="text-4xl md:text-6xl font-black tracking-tighter text-white">
              Perfil
              <span className="text-emerald-500">.</span>
            </h1>
            <p className="mt-2 text-zinc-400 max-w-lg text-lg hidden md:block">
              Tu actividad, estadísticas y listas personales.
            </p>
          </motion.div>

          <div className="flex items-center justify-center py-12 lg:py-24">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className={`${PROFILE_GLASS_SURFACE} max-w-md w-full flex flex-col items-center justify-center py-12 rounded-3xl text-center px-4`}
            >
              <div className="mb-6">
                <OptimizedImage
                  src="/logo-TSV-sinFondo.png"
                  alt="The Show Verse"
                  className="w-24 h-24 object-contain shadow-lg shadow-emerald-500/20 rounded-2xl"
                />
              </div>
              <h2 className="text-2xl font-bold text-white mb-2">
                Inicia sesión
              </h2>
              <p className="text-zinc-400 max-w-sm mb-8 text-sm">
                Inicia sesión para ver tus estadísticas personales, historial
                detallado y patrones de visualización.
              </p>
              <button
                onClick={() =>
                  window.location.assign(
                    `/login?next=${encodeURIComponent(connectNext)}`,
                  )
                }
                type="button"
                className="px-8 py-3 bg-white text-black font-bold rounded-xl hover:bg-zinc-200 transition shadow-lg shadow-white/10"
              >
                Iniciar sesión
              </button>
            </motion.div>
          </div>
        </div>
      </div>
    );
  }

  if (!headerReady && !error) {
    return (
      <div className="min-h-screen bg-black pb-20 text-zinc-100 selection:bg-emerald-500/30">
        <ProfilePageBackground />
      </div>
    );
  }

  return (
    <MotionConfig reducedMotion="user">
    <div className="min-h-screen bg-black pb-20 text-zinc-100 selection:bg-emerald-500/30">
      <ProfilePageBackground />

      <div className="relative z-10 max-w-7xl mx-auto px-4 py-8 lg:py-12">
        {headerReady ? (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6 lg:mb-8 lg:grid lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center lg:gap-8"
          >
            <ProfileHero
              user={profileUser}
              onSync={handleSyncProfile}
              onDisconnect={() => setShowDisconnectModal(true)}
              syncing={loading}
            />
            <ProfileSectionTabs
              viewMode={viewMode}
              setViewMode={setViewMode}
              className="hidden justify-self-end lg:block"
            />
          </motion.div>
        ) : null}

        {headerReady ? (
          <motion.div
            className="sticky top-20 z-[60] mb-3 transition-all duration-300 lg:hidden"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.25 }}
          >
            <ProfileSectionTabs viewMode={viewMode} setViewMode={setViewMode} />
          </motion.div>
        ) : null}

        {/* Content Area */}
        {!stats && error ? (
          <div className="flex h-64 flex-col items-center justify-center gap-3 text-zinc-500">
            <BarChart3 className="w-10 h-10 text-zinc-700" />
            <p>{error || "No se pudieron cargar las estadísticas."}</p>
          </div>
        ) : !stats ? (
          <div className="min-h-[55vh]" aria-busy="true" />
        ) : (
          <AnimatePresence mode="wait">
            {viewMode === "overview" && (
              <motion.div
                key="overview"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.5 }}
                className="flex flex-col gap-8"
              >
                {/* KPIs */}
                {stats && (
                  <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
                    <KPICard
                      title="Tiempo Total"
                      value={`${stats.totalDays}d ${stats.totalHours % 24}h`}
                      subtitle={`${stats.totalHours.toLocaleString()} horas`}
                      icon={Timer}
                      color="cyan"
                      delay={0.1}
                    />
                    <KPICard
                      title="Películas"
                      value={stats.movies.watched.toLocaleString()}
                      subtitle={`${stats.movies.plays.toLocaleString()} plays`}
                      icon={Film}
                      color="blue"
                      delay={0.2}
                    />
                    <KPICard
                      title="Episodios"
                      value={stats.episodes.watched.toLocaleString()}
                      subtitle={`${(stats.raw?.shows?.watched || 0).toLocaleString()} series`}
                      icon={Tv}
                      color="purple"
                      delay={0.3}
                    />
                    <KPICard
                      title="Colección"
                      value={stats.totalCollected.toLocaleString()}
                      subtitle="Items guardados"
                      icon={Library}
                      color="orange"
                      delay={0.4}
                    />
                  </div>
                )}

                {/* Secondary KPIs */}
                {stats && (
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    <div
                      className={`${PROFILE_GLASS_PANEL} rounded-2xl p-4 flex items-center gap-3`}
                    >
                      <div className="p-2 bg-yellow-500/10 rounded-lg text-yellow-500">
                        <Star className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="text-xl font-bold">
                          {stats.ratings.total}
                        </div>
                        <div className="text-xs text-zinc-500 uppercase font-bold">
                          Valoraciones
                        </div>
                      </div>
                    </div>
                    <div
                      className={`${PROFILE_GLASS_PANEL} rounded-2xl p-4 flex items-center gap-3`}
                    >
                      <div className="p-2 bg-rose-500/10 rounded-lg text-rose-500">
                        <MessageSquare className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="text-xl font-bold">
                          {stats.totalComments}
                        </div>
                        <div className="text-xs text-zinc-500 uppercase font-bold">
                          Comentarios
                        </div>
                      </div>
                    </div>
                    <div
                      className={`${PROFILE_GLASS_PANEL} rounded-2xl p-4 flex items-center gap-3`}
                    >
                      <div className="p-2 bg-indigo-500/10 rounded-lg text-indigo-500">
                        <Users className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="text-xl font-bold">
                          {stats.network.followers}
                        </div>
                        <div className="text-xs text-zinc-500 uppercase font-bold">
                          Seguidores
                        </div>
                      </div>
                    </div>
                    <div
                      className={`${PROFILE_GLASS_PANEL} rounded-2xl p-4 flex items-center gap-3`}
                    >
                      <div className="p-2 bg-teal-500/10 rounded-lg text-teal-500">
                        <Heart className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="text-xl font-bold">
                          {stats.network.friends}
                        </div>
                        <div className="text-xs text-zinc-500 uppercase font-bold">
                          Amigos
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {deferredOverviewReady && profileRowsReady && recentHistory.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0, y: 14 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.18 }}
                    className="relative order-2"
                  >
                    <SectionTitle
                      icon={Activity}
                      title="Vistos recientemente"
                      subtitle="Tus últimas visualizaciones"
                      color="emerald"
                      href="/history"
                    />
                    <ProfileCardScroller>
                      {recentHistory.slice(0, 15).map((item, idx) => (
                        <ProfileCardScrollerItem
                          key={`${item.type}-${item.tmdbId}-${idx}`}
                        >
                          <ProfileUnifiedCard
                            item={item}
                            type={item.type}
                            sectionColor="emerald"
                            dateField="watched_at"
                          />
                        </ProfileCardScrollerItem>
                      ))}
                    </ProfileCardScroller>
                  </motion.div>
                )}

                {deferredOverviewReady && profileRowsReady && recentRatings.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0, y: 14 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.22 }}
                    className="relative order-2"
                  >
                    <SectionTitle
                      icon={Star}
                      title="Últimas valoraciones"
                      subtitle="Lo que has puntuado recientemente"
                      color="yellow"
                    />
                    <ProfileCardScroller>
                      {recentRatings.slice(0, 15).map((item, idx) => (
                        <ProfileCardScrollerItem
                          key={`${item.type}-${item.tmdbId}-${idx}`}
                        >
                          <ProfileUnifiedCard
                            item={item}
                            type={item.type}
                            sectionColor="yellow"
                            showRating
                            dateField="rated_at"
                          />
                        </ProfileCardScrollerItem>
                      ))}
                    </ProfileCardScroller>
                  </motion.div>
                )}

                {deferredOverviewReady && profileRowsReady && watchlist.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0, y: 14 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.26 }}
                    className="relative order-2"
                  >
                    <SectionTitle
                      icon={BookMarked}
                      title="Watchlist"
                      subtitle="Títulos que quieres ver"
                      color="indigo"
                      href="/watchlist"
                    />
                    <ProfileCardScroller>
                      {watchlist.slice(0, 15).map((item, idx) => (
                        <ProfileCardScrollerItem
                          key={`${item.type}-${item.tmdbId}-${idx}`}
                        >
                          <ProfileUnifiedCard
                            item={item}
                            type={item.type}
                            sectionColor="indigo"
                            dateField="listed_at"
                          />
                        </ProfileCardScrollerItem>
                      ))}
                    </ProfileCardScroller>
                  </motion.div>
                )}

                {/* Main Charts Row */}
                {deferredOverviewReady && stats && (
                  <div className="order-1 grid min-w-0 grid-cols-1 gap-6 lg:grid-cols-3">
                    {/* Activity Chart - Spans 2 cols */}
                    <motion.div
                      initial={{ opacity: 0, y: 14 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.2 }}
                      className={`${PROFILE_GLASS_PANEL} min-w-0 lg:col-span-2 rounded-3xl p-4 sm:p-6`}
                    >
                      <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/5 rounded-full blur-3xl pointer-events-none" />
                      <SectionTitle
                        icon={Activity}
                        title="Actividad Mensual"
                        subtitle="Visualizaciones en el último año"
                        color="indigo"
                      />

                      <MonthlyActivityChart data={stats.monthlyData} />
                    </motion.div>

                    {/* Time Distribution */}
                    <motion.div
                      initial={{ opacity: 0, y: 14 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.3 }}
                      className={`${PROFILE_GLASS_PANEL} min-w-0 rounded-3xl p-6 flex flex-col items-center justify-center`}
                    >
                      <SectionTitle
                        icon={Clock}
                        title="Distribución de Tiempo"
                        subtitle="Películas vs Series"
                        color="indigo"
                      />
                      <TimeDistributionChart
                        data={stats.timeDistribution}
                        formattedTotalTime={stats.formattedTotalTime}
                      />
                    </motion.div>
                  </div>
                )}

                {/* Top Content Row */}
                {deferredOverviewReady && stats && (stats.topMoviesReady || stats.topShowsReady) && (
                  <div className="order-3 space-y-8">
                    {/* Top Movies */}
                    {stats.topMoviesReady && (
                      <motion.div
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.7 }}
                        className="relative"
                      >
                        <SectionTitle
                          icon={Film}
                          title="Películas Top"
                          subtitle="Las que más has visto"
                          color="blue"
                        />
                        <ProfileCardScroller>
                          {stats.topMovies
                            .slice(0, 15)
                            .map((item, idx) => (
                              <ProfileCardScrollerItem
                                key={item.movie?.ids?.tmdb || idx}
                              >
                                <ProfileUnifiedCard
                                  item={item}
                                  type="movie"
                                  sectionColor="blue"
                                  rank={idx + 1}
                                  plays={item.plays}
                                />
                              </ProfileCardScrollerItem>
                            ))}
                        </ProfileCardScroller>
                      </motion.div>
                    )}

                    {/* Top Shows */}
                    {stats.topShowsReady && (
                      <motion.div
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.7 }}
                        className="relative"
                      >
                        <SectionTitle
                          icon={Tv}
                          title="Series Top"
                          subtitle="Tus maratones favoritos"
                          color="purple"
                        />
                        <ProfileCardScroller>
                          {stats.topShows
                            .slice(0, 15)
                            .map((item, idx) => (
                              <ProfileCardScrollerItem
                                key={item.show?.ids?.tmdb || idx}
                              >
                                <ProfileUnifiedCard
                                  item={item}
                                  type="show"
                                  sectionColor="purple"
                                  rank={idx + 1}
                                  plays={item.plays}
                                />
                              </ProfileCardScrollerItem>
                            ))}
                        </ProfileCardScroller>
                      </motion.div>
                    )}
                  </div>
                )}

                {/* Top People Row */}
                {deferredOverviewReady && stats?.topActors?.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.65 }}
                    className="relative order-4"
                  >
                    <SectionTitle
                      icon={Users}
                      title="Actores Favoritos"
                      subtitle="Las caras que más ves"
                      color="yellow"
                    />
                    <ProfileCardScroller>
                      {stats.topActors.slice(0, 15).map((person) => (
                        <ProfileCardScrollerItem key={person.id}>
                          <ProfileUnifiedCard
                            item={person}
                            type="person"
                            sectionColor="yellow"
                            role="actor"
                            count={person.count}
                          />
                        </ProfileCardScrollerItem>
                      ))}
                    </ProfileCardScroller>
                  </motion.div>
                )}

                {/* Top Directors Row */}
                {deferredOverviewReady && stats?.topDirectors?.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.7 }}
                    className="relative order-4"
                  >
                    <SectionTitle
                      icon={Film}
                      title="Directores Favoritos"
                      subtitle="Los cineastas que más sigues"
                      color="rose"
                    />
                    <ProfileCardScroller>
                      {stats.topDirectors.slice(0, 15).map((person) => (
                        <ProfileCardScrollerItem key={person.id}>
                          <ProfileUnifiedCard
                            item={person}
                            type="person"
                            sectionColor="rose"
                            role="director"
                            count={person.count}
                          />
                        </ProfileCardScrollerItem>
                      ))}
                    </ProfileCardScroller>
                  </motion.div>
                )}
              </motion.div>
            )}

            {stats && viewMode === "patterns" && (
              <motion.div
                key="patterns"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.5 }}
                className="space-y-8"
              >
                <div className="grid min-w-0 grid-cols-1 gap-6 md:grid-cols-2">
                  {/* Hour of Day */}
                  <div className={`${PROFILE_GLASS_PANEL} min-w-0 rounded-3xl p-4 sm:p-6`}>
                    <SectionTitle
                      icon={Clock}
                      title="Hora del Día"
                      subtitle="¿Cuándo ves más contenido?"
                      color="pink"
                    />
                    <HourOfDayChart data={stats.hourOfDayData} />
                  </div>

                  {/* Day of Week */}
                  <div className={`${PROFILE_GLASS_PANEL} min-w-0 rounded-3xl p-4 sm:p-6`}>
                    <SectionTitle
                      icon={CalendarIcon}
                      title="Día de la Semana"
                      subtitle="Tus días más activos"
                      color="cyan"
                    />
                    <DayOfWeekChart data={stats.dayOfWeekData} />
                  </div>
                </div>

                {/* Genres & Ratings row */}
                <div className="grid min-w-0 grid-cols-1 gap-6 md:grid-cols-2">
                  {/* Genres - Radar */}
                  <motion.div
                    className={`${PROFILE_GLASS_PANEL} min-w-0 rounded-3xl p-4 sm:p-6`}
                  >
                    <SectionTitle
                      icon={Target}
                      title="Gustos por Género"
                      subtitle="Tus categorías más frecuentes"
                      color="lime"
                    />
                     <GenreRadarChart data={stats.genreData} isMobile={isMobile} />
                  </motion.div>

                  {/* Ratings - Bar */}
                  <motion.div
                    className={`${PROFILE_GLASS_PANEL} min-w-0 rounded-3xl p-4 sm:p-6`}
                  >
                    <SectionTitle
                      icon={Award}
                      title="Tus Puntuaciones"
                      subtitle="Distribución de ratings (1-10)"
                      color="teal"
                    />
                    <RatingsBarChart data={stats.ratingData} />
                  </motion.div>
                </div>
              </motion.div>
            )}

            {stats && viewMode === "yearly" && (
              <motion.div
                key="yearly"
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -14 }}
                transition={{ duration: 0.4 }}
                className="flex flex-col items-center justify-center py-20 text-center"
              >
                <div
                  className={`${PROFILE_GLASS_SURFACE} w-24 h-24 rounded-full flex items-center justify-center mb-6`}
                >
                  <div className="absolute inset-0 bg-indigo-500/20 rounded-full blur-xl animate-pulse" />
                  <CalendarIcon className="w-10 h-10 text-zinc-400" />
                </div>
                <h2 className="text-3xl font-bold text-white mb-2">
                  Histórico Detallado
                </h2>
                <p className="text-zinc-500 max-w-md mx-auto mb-8">
                  Estamos preparando una vista cronológica completa para que
                  explores tu historia año por año con un nivel de detalle
                  increíble.
                </p>
                <div className="flex gap-2">
                  {stats.years.slice(0, 5).map((year) => (
                    <span
                      key={year}
                      className={`${PROFILE_GLASS_SURFACE} px-4 py-2 rounded-xl text-zinc-400 font-mono text-sm`}
                    >
                      {year}
                    </span>
                  ))}
                  {stats.years.length > 5 && (
                    <span className="px-4 py-2 text-zinc-600">...</span>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        )}
      </div>

      <AnimatePresence>
        {showDisconnectModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm"
            onClick={() => setShowDisconnectModal(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className={`${PROFILE_GLASS_SURFACE} w-full max-w-sm rounded-2xl p-6 text-center`}
              onClick={(e) => e.stopPropagation()}
            >
              <LogOut className="mx-auto mb-4 h-10 w-10 text-red-500" />
              <h2 className="mb-2 text-lg font-bold text-white">
                ¿Cerrar sesión?
              </h2>
              <p className="mb-6 text-sm text-zinc-400">
                Saldrás de tu cuenta de The Show Verse en este dispositivo.
              </p>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowDisconnectModal(false)}
                  className="flex-1 rounded-xl bg-zinc-800 py-2.5 text-sm font-semibold text-white transition hover:bg-zinc-700"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleDisconnect}
                  className="flex-1 rounded-xl bg-red-600 py-2.5 text-sm font-semibold text-white transition hover:bg-red-500"
                >
                  Cerrar sesión
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
    </MotionConfig>
  );
}
