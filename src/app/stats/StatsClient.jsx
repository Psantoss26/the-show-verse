"use client";

import {
  Children,
  useRef,
  useState,
  useEffect,
  useMemo,
  useCallback,
} from "react";
import { motion, AnimatePresence } from "framer-motion";
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
} from "lucide-react";
import Link from "next/link";
import { Swiper, SwiperSlide } from "swiper/react";
import { Navigation, FreeMode } from "swiper";
import "swiper/swiper-bundle.css";

// Score fetching APIs
import { getExternalIds } from "@/lib/api/tmdb";
import { fetchOmdbByImdb } from "@/lib/api/omdb";
import { traktGetScoreboard } from "@/lib/api/traktClient";

// Score caching system identical to favorites
const SCORE_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const PROFILE_STATS_CACHE_KEY = "showverse:profile:stats:v2";
const PROFILE_DATA_CACHE_KEY = "showverse:profile:data:v2";
const PROFILE_USER_CACHE_KEY = "showverse:profile:user:v1";
const PROFILE_CACHE_TTL_MS = 10 * 60 * 1000;

function readProfileSessionCache(key) {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    if (Date.now() - Number(parsed.t || 0) > PROFILE_CACHE_TTL_MS) return null;
    return parsed.data || null;
  } catch {
    return null;
  }
}

function writeProfileSessionCache(key, data) {
  if (typeof window === "undefined" || !data) return;
  try {
    window.sessionStorage.setItem(
      key,
      JSON.stringify({ t: Date.now(), data }),
    );
  } catch {}
}

function clearProfileSessionCache() {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(PROFILE_STATS_CACHE_KEY);
    window.sessionStorage.removeItem(PROFILE_DATA_CACHE_KEY);
    window.sessionStorage.removeItem(PROFILE_USER_CACHE_KEY);
  } catch {}
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

function readScoreCache(source) {
  if (typeof window === "undefined") return new Map();
  try {
    const key = `showverse:scores:${source}`;
    const raw = window.localStorage.getItem(key);
    if (!raw) return new Map();

    const parsed = JSON.parse(raw);
    const now = Date.now();
    const cache = new Map();

    Object.entries(parsed).forEach(([id, entry]) => {
      if (entry.t && now - entry.t < SCORE_CACHE_TTL_MS) {
        cache.set(id, entry.score);
      }
    });

    return cache;
  } catch {
    return new Map();
  }
}

function updateScoreCache(source, id, score) {
  if (typeof window === "undefined") return;
  try {
    const key = `showverse:scores:${source}`;
    const raw = window.localStorage.getItem(key);
    const data = raw ? JSON.parse(raw) : {};

    data[id] = { score, t: Date.now() };

    window.localStorage.setItem(key, JSON.stringify(data));
  } catch (e) {
    console.warn("Failed to update score cache:", e);
  }
}
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  Legend,
} from "recharts";

// -----------------------------------------------------------------------------
// COLORS & CONSTANTS
// -----------------------------------------------------------------------------
const COLORS = {
  emerald: "#10b981",
  blue: "#3b82f6",
  purple: "#a855f7",
  yellow: "#eab308",
  pink: "#ec4899",
  red: "#ef4444",
  cyan: "#06b6d4",
  orange: "#f97316",
  slate: "#64748b",
  indigo: "#6366f1",
  teal: "#14b8a6",
  rose: "#f43f5e",
  lime: "#84cc16",
  background: "#18181b", // zinc-900
};

const CHART_THEME = {
  background: "transparent",
  text: "#a1a1aa", // zinc-400
  grid: "#27272a", // zinc-800
  tooltipBg: "#18181b",
  tooltipBorder: "#27272a",
};

const tmdbImg = (path, size = "w342") =>
  path ? `https://image.tmdb.org/t/p/${size}${path}` : null;

const fmtDate = (iso) => {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("es-ES", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
};

const fmtDateShort = (iso) => {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("es-ES", {
    day: "numeric",
    month: "short",
  });
};

const starColor = (rating) => {
  if (rating >= 9) return COLORS.yellow;
  if (rating >= 7) return COLORS.emerald;
  if (rating >= 5) return COLORS.indigo;
  return COLORS.red;
};

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
  return Object.entries(genres)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 6); // Top 6 for Radar
};

const processRatings = (ratingDist) => {
  return Object.entries(ratingDist)
    .map(([rating, count]) => ({
      name: rating,
      value: count,
    }))
    .sort((a, b) => parseInt(a.name) - parseInt(b.name));
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
      className="relative overflow-hidden rounded-3xl border border-white/5 bg-zinc-900/50 p-4 backdrop-blur-xl transition-all duration-300 group hover:bg-zinc-900/80 sm:p-6"
    >
      <div
        className={`absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity ${styles.iconText}`}
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

function SectionTitle({ icon: Icon, title, subtitle, color = "indigo", href }) {
  const styles = COLOR_STYLES[color] || COLOR_STYLES.indigo;

  return (
    <div className="flex items-center justify-between gap-4 mb-6">
      <div className="flex items-center gap-3">
        <div
          className={`p-2 rounded-lg border ${styles.iconBg} border-white/10 ${styles.iconText}`}
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
  const [isHoveredRow, setIsHoveredRow] = useState(false);
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(false);
  const isMobile = useIsMobileLayout(768);
  const slides = Children.toArray(children);

  const breakpointsRow = {
    0: { slidesPerView: 3, spaceBetween: 12 },
    640: { slidesPerView: 4, spaceBetween: 14 },
    768: { slidesPerView: 4, spaceBetween: 16 },
    1024: { slidesPerView: 5, spaceBetween: 18 },
    1280: { slidesPerView: 6, spaceBetween: 20 },
  };

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

  const handlePrevClick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const swiper = swiperRef.current;
    if (!swiper) return;
    const target = Math.max((swiper.activeIndex || 0) - 6, 0);
    swiper.slideTo(target);
  };

  const handleNextClick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const swiper = swiperRef.current;
    if (!swiper) return;
    const maxIndex = swiper.slides.length - 1;
    const target = Math.min((swiper.activeIndex || 0) + 6, maxIndex);
    swiper.slideTo(target);
  };

  const showPrev = isHoveredRow && canPrev;
  const showNext = isHoveredRow && canNext;

  return (
    <div className="-mx-4 sm:mx-0">
      <div
        className="relative z-0 px-3 hover:z-[200] sm:px-0"
        onMouseEnter={() => setIsHoveredRow(true)}
        onMouseLeave={() => setIsHoveredRow(false)}
      >
        <div
          className="relative z-0"
          style={{ overflowX: "clip", overflowY: "visible" }}
        >
          <Swiper
            slidesPerView={3}
            spaceBetween={12}
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

        <AnimatePresence>
          {showPrev && !isMobile && (
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
          {showNext && !isMobile && (
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

function ProfileCardScrollerItem({ children }) {
  return children;
}

function CustomTooltip({ active, payload, label, formatter }) {
  if (active && payload && payload.length) {
    const title = label || (payload[0] && payload[0].name);
    return (
      <div className="bg-zinc-950/90 border border-white/10 rounded-xl p-3 shadow-xl backdrop-blur-md z-50">
        <p className="font-bold text-white mb-2 text-sm">{title}</p>
        <div className="space-y-1">
          {payload.map((p, idx) => (
            <div
              key={idx}
              className="flex items-center justify-between gap-4 text-xs"
            >
              <span
                className="flex items-center gap-2"
                style={{ color: p.color }}
              >
                <span
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: p.color }}
                />
                {p.name}
              </span>
              <span className="font-mono font-bold text-zinc-300">
                {formatter ? formatter(p.value) : p.value.toLocaleString()}
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  }
  return null;
}

function ProfileHero({ user }) {
  if (!user) {
    return (
      <div className="flex items-center gap-5">
        <div className="h-24 w-24 rounded-3xl bg-zinc-900/50 animate-pulse" />
        <div className="space-y-3">
          <div className="h-10 w-64 rounded-xl bg-zinc-900/50 animate-pulse" />
          <div className="h-4 w-44 rounded-lg bg-zinc-900/40 animate-pulse" />
        </div>
      </div>
    );
  }

  const avatarUrl = user?.avatarUrl || null;
  const displayName = user.name || user.username || "Usuario";

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: 0.1 }}
      className="flex min-w-0 items-center gap-5"
    >
      <div className="h-24 w-24 flex-shrink-0 overflow-hidden rounded-3xl ring-2 ring-indigo-500/35 shadow-2xl shadow-indigo-500/10 sm:h-28 sm:w-28">
        {avatarUrl ? (
          <img
            src={avatarUrl}
            alt={displayName}
            width={112}
            height={112}
            loading="eager"
            fetchPriority="high"
            decoding="sync"
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-indigo-600 to-purple-700">
            <span className="text-4xl font-black text-white">
              {displayName[0]?.toUpperCase() || "?"}
            </span>
          </div>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="mb-2 flex items-center gap-3">
          <div className="h-px w-12 bg-indigo-500" />
          <span className="text-xs font-bold uppercase tracking-widest text-indigo-400">
            Tu cuenta
          </span>
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <h1 className="min-w-0 truncate text-4xl font-black tracking-tighter text-white md:text-6xl">
            {displayName}
            <span className="text-indigo-500">.</span>
          </h1>
          {user.vip && (
            <span className="rounded-full border border-yellow-500/30 bg-yellow-500/20 px-2 py-0.5 text-[10px] font-black uppercase text-yellow-400">
              VIP
            </span>
          )}
        </div>
        <p className="mt-1 text-sm font-medium text-zinc-500">@{user.username}</p>
        <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-zinc-500">
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
          <p className="mt-2 line-clamp-1 max-w-lg text-sm text-zinc-400">
            {user.about}
          </p>
        )}
      </div>
    </motion.div>
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
  const [imdbScore, setImdbScore] = useState(null);
  const [traktScore, setTraktScore] = useState(null);
  const [loadingScores, setLoadingScores] = useState(false);

  // Extract media properties safely
  const media = type === "movie" ? (item?.movie || item) : type === "show" ? (item?.show || item) : item;
  const tmdbId = media?.ids?.tmdb || media?.tmdbId || media?.id;
  const title = media?.title || media?.name || "Sin título";
  const year = media?.year || (media?.release_date ? media.release_date.slice(0, 4) : "") || (media?.first_air_date ? media.first_air_date.slice(0, 4) : "");
  const episodeSeason = item?.episode?.season;
  const episodeNumber = item?.episode?.number;
  const isEpisodeCard =
    type !== "movie" &&
    Number.isFinite(Number(episodeSeason)) &&
    Number.isFinite(Number(episodeNumber));

  // Extract TMDb score
  const tmdbScore =
    item?.episode?.vote_average || media?.vote_average || item?.vote_average || null;

  // Extract first genre
  const firstGenre = media?.genres?.[0]?.name || media?.genres?.[0] || null;

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

  // Image source path
  let path = media?.poster_path || media?.profile_path || null;
  const src = tmdbImg(path, "w342");

  // Load scores on hover if not in cache
  const handleHover = useCallback(async () => {
    if (type === "person" || loadingScores || (imdbScore && traktScore) || !tmdbId) return;

    setLoadingScores(true);

    try {
      const scoreType = isEpisodeCard ? "episode" : mediaType;
      const itemId = isEpisodeCard
        ? `${tmdbId}:s${episodeSeason}:e${episodeNumber}`
        : String(tmdbId);

      // Load IMDb score
      if (!imdbScore) {
        const cachedImdb = readScoreCache("imdb");
        if (cachedImdb.has(itemId)) {
          setImdbScore(cachedImdb.get(itemId));
        } else {
          try {
            const imdbId = isEpisodeCard
              ? item?.episode?.imdb_id
              : (await getExternalIds(mediaType, tmdbId))?.imdb_id;

            if (imdbId) {
              const omdbData = await fetchOmdbByImdb(imdbId);
              const imdbRating = omdbData?.imdbRating;

              if (imdbRating && imdbRating !== "N/A") {
                const numRating = parseFloat(imdbRating);
                if (!isNaN(numRating)) {
                  setImdbScore(numRating);
                  updateScoreCache("imdb", itemId, numRating);
                }
              }
            }
          } catch (err) {
            console.warn(`Failed to fetch IMDb score for ${itemId}:`, err);
          }
        }
      }

      // Load Trakt score
      if (!traktScore) {
        const cachedTrakt = readScoreCache("trakt");
        if (cachedTrakt.has(itemId)) {
          setTraktScore(cachedTrakt.get(itemId));
        } else {
          try {
            const traktData = await traktGetScoreboard({
              type: scoreType,
              tmdbId,
              season: isEpisodeCard ? episodeSeason : undefined,
              episode: isEpisodeCard ? episodeNumber : undefined,
            });
            const traktRating = traktData?.community?.rating;

            if (
              traktRating &&
              typeof traktRating === "number" &&
              !isNaN(traktRating)
            ) {
              setTraktScore(traktRating);
              updateScoreCache("trakt", itemId, traktRating);
            }
          } catch (err) {
            console.warn(`Failed to fetch Trakt score for ${itemId}:`, err);
          }
        }
      }
    } finally {
      setLoadingScores(false);
    }
  }, [
    episodeNumber,
    episodeSeason,
    imdbScore,
    isEpisodeCard,
    item?.episode?.imdb_id,
    loadingScores,
    mediaType,
    tmdbId,
    traktScore,
    type,
  ]);

  // Render top right badge
  const renderTopRight = () => {
    if (type === "person") {
      return null;
    }

    return (
      <div className="flex flex-col items-end gap-1">
        {tmdbScore && (
          <div className="flex items-center gap-1.5 drop-shadow-[0_2px_4px_rgba(0,0,0,1)]">
            <span className="text-emerald-400 text-[10px] sm:text-xs font-black font-mono tracking-tight">
              {Number(tmdbScore).toFixed(1)}
            </span>
            <img src="/logo-TMDb.png" alt="" className="w-auto h-2 sm:h-2.5 opacity-100" />
          </div>
        )}
        {imdbScore && (
          <div className="flex items-center gap-1.5 drop-shadow-[0_2px_4px_rgba(0,0,0,1)]">
            <span className="text-yellow-400 text-[10px] sm:text-xs font-black font-mono tracking-tight">
              {typeof imdbScore === "number" ? imdbScore.toFixed(1) : imdbScore}
            </span>
            <img src="/logo-IMDb.svg" alt="" className="w-auto h-2.5 sm:h-3 opacity-100" />
          </div>
        )}
        {traktScore && (
          <div className="flex items-center gap-1.5 drop-shadow-[0_2px_4px_rgba(0,0,0,1)]">
            <span className="text-pink-400 text-[10px] sm:text-xs font-black font-mono tracking-tight">
              {typeof traktScore === "number" ? traktScore.toFixed(1) : traktScore}
            </span>
            <img src="/logo-Trakt.png" alt="" className="w-auto h-2 sm:h-2.5 opacity-100" />
          </div>
        )}
      </div>
    );
  };

  // Render top left badge
  const renderTopLeft = () => {
    if (rank !== undefined) {
      return (
        <span className="rounded-md border border-yellow-500/30 bg-yellow-500/20 px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-wider text-yellow-300 shadow-sm backdrop-blur-md">
          #{rank}
        </span>
      );
    }
    const itemType = type || item.type;
    if (itemType === "movie") {
      return (
        <span className="text-[9px] font-extrabold uppercase tracking-wider px-1.5 py-0.5 rounded-md border border-sky-500/30 bg-sky-500/20 text-sky-300 shadow-sm backdrop-blur-md">
          PELÍCULA
        </span>
      );
    }
    if (itemType === "show" || itemType === "tv") {
      return (
        <span className="text-[9px] font-extrabold uppercase tracking-wider px-1.5 py-0.5 rounded-md border border-purple-500/30 bg-purple-500/20 text-purple-300 shadow-sm backdrop-blur-md">
          SERIE
        </span>
      );
    }
    if (type === "person" && role) {
      return (
        <span className="text-[9px] font-extrabold uppercase tracking-wider px-1.5 py-0.5 rounded-md border border-white/10 bg-white/5 text-zinc-300 shadow-sm backdrop-blur-md">
          {role === "actor" ? "ACTOR" : "DIRECTOR"}
        </span>
      );
    }
    return null;
  };

  const borderColorStyles = {
    emerald: "rgba(16, 185, 129, 0.4)",
    yellow: "rgba(234, 179, 8, 0.4)",
    indigo: "rgba(99, 102, 241, 0.4)",
    blue: "rgba(59, 130, 246, 0.4)",
    purple: "rgba(168, 85, 247, 0.4)",
    rose: "rgba(244, 63, 94, 0.4)",
  };

  const hoverBorderColor = borderColorStyles[sectionColor] || borderColorStyles.indigo;
  const shadowColorStyles = {
    emerald: "16, 185, 129",
    yellow: "234, 179, 8",
    indigo: "99, 102, 241",
    blue: "59, 130, 246",
    purple: "168, 85, 247",
    rose: "244, 63, 94",
  };
  const hoverShadowRgb = shadowColorStyles[sectionColor] || shadowColorStyles.indigo;
  const hoverShadowColor = [
    `0 18px 48px -24px rgba(${hoverShadowRgb}, 0.72)`,
    `0 10px 24px -18px rgba(${hoverShadowRgb}, 0.58)`,
    "0 16px 30px -24px rgba(0, 0, 0, 0.75)",
  ].join(", ");

  return (
    <Link
      href={href}
      className={`relative z-0 block hover:z-[300] focus:z-[300] focus:outline-none ${isScrollable ? "w-32 sm:w-40 flex-shrink-0" : "w-full"}`}
      draggable={false}
      onDragStart={(e) => e.preventDefault()}
    >
      <motion.div
        className="group relative z-0 aspect-[2/3] w-full overflow-hidden rounded-2xl border border-white/5 bg-neutral-800/80 shadow-lg transition-colors duration-300 transform-gpu will-change-transform"
        whileHover={{
          y: -6,
          zIndex: 300,
          boxShadow: hoverShadowColor,
          borderColor: hoverBorderColor,
        }}
        whileTap={{ y: -2 }}
        transition={{ type: "spring", stiffness: 360, damping: 26 }}
        onMouseEnter={handleHover}
        onFocus={handleHover}
      >
        {src && !err ? (
          <img
            src={src}
            alt={title}
            loading="lazy"
            decoding="async"
            draggable={false}
            className="h-full w-full object-cover grayscale-[18%] transition-transform duration-500 transform-gpu group-hover:scale-[1.08] group-hover:-translate-y-1 group-hover:grayscale-0"
            onError={() => setErr(true)}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-neutral-900 text-zinc-600">
            {type === "person" ? (
              <Users className="h-8 w-8 opacity-60" />
            ) : type === "movie" || item.type === "movie" ? (
              <Film className="h-8 w-8 opacity-60" />
            ) : (
              <Tv className="h-8 w-8 opacity-60" />
            )}
          </div>
        )}

        {/* Top hover overlay badges */}
        <div className="absolute inset-x-0 top-0 z-10 flex items-start justify-between p-3 opacity-0 transition-all duration-300 transform-gpu -translate-y-2 group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:translate-y-0 group-focus-within:opacity-100">
          <div>{renderTopLeft()}</div>
          <div>{renderTopRight()}</div>
        </div>

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
                <p className="text-yellow-500 text-[10px] font-bold mt-0.5 drop-shadow-md">
                  {year}
                  {firstGenre && ` • ${firstGenre}`}
                  {item.episode && ` • T${item.episode.season}:E${item.episode.number}`}
                </p>
              ) : (
                count !== undefined && (
                  <p className="mt-0.5 text-[10px] font-bold text-zinc-300 sm:text-xs">
                    {count} {role === "actor" ? "pelis" : "obras"}
                  </p>
                )
              )}

              {dateField && item[dateField] && (
                <p className="mt-0.5 text-[10px] leading-tight text-zinc-400 font-medium">
                  {fmtDateShort(item[dateField])}
                </p>
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
  const [loading, setLoading] = useState(true);
  const [peopleLoading, setPeopleLoading] = useState(false);
  const [peopleLoaded, setPeopleLoaded] = useState(false);
  const [notConnected, setNotConnected] = useState(false);
  const [data, setData] = useState(null);
  const [profileData, setProfileData] = useState(null);
  const [error, setError] = useState("");
  const [viewMode, setViewMode] = useState("overview"); // overview | patterns | yearly

  useEffect(() => {
    let ignore = false;

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

    const mergeStatsData = (json) => {
      setData((prev) => {
        const nextMoviesHaveArtwork = (json?.watchedMovies || []).some(
          (item) => item?.movie?.poster_path,
        );
        const prevMoviesHaveArtwork = (prev?.watchedMovies || []).some(
          (item) => item?.movie?.poster_path,
        );
        const nextShowsHaveArtwork = (json?.watchedShows || []).some(
          (item) => item?.show?.poster_path,
        );
        const prevShowsHaveArtwork = (prev?.watchedShows || []).some(
          (item) => item?.show?.poster_path,
        );
        const merged = {
          ...json,
          watchedMovies:
            !nextMoviesHaveArtwork && prevMoviesHaveArtwork
              ? prev.watchedMovies
              : json?.watchedMovies || prev?.watchedMovies || [],
          watchedShows:
            !nextShowsHaveArtwork && prevShowsHaveArtwork
              ? prev.watchedShows
              : json?.watchedShows || prev?.watchedShows || [],
          topActors:
            Array.isArray(json?.topActors) && json.topActors.length
              ? json.topActors
              : prev?.topActors || [],
          topDirectors:
            Array.isArray(json?.topDirectors) && json.topDirectors.length
              ? json.topDirectors
              : prev?.topDirectors || [],
        };
        writeProfileSessionCache(PROFILE_STATS_CACHE_KEY, merged);
        return merged;
      });
    };

    const refreshTopArtwork = async () => {
      try {
        const res = await fetch(
          "/api/trakt/user-stats?historyLimit=0&includePeople=0&localizeTitles=1",
          { cache: "no-store" },
        );
        if (ignore || !res.ok) return;
        const json = await res.json();
        if (ignore) return;
        setData((prev) => {
          if (!prev) return prev;
          const merged = {
            ...prev,
            watchedMovies: Array.isArray(json?.watchedMovies)
              ? json.watchedMovies
              : prev.watchedMovies,
            watchedShows: Array.isArray(json?.watchedShows)
              ? json.watchedShows
              : prev.watchedShows,
          };
          writeProfileSessionCache(PROFILE_STATS_CACHE_KEY, merged);
          return merged;
        });
      } catch (e) {
        console.error(e);
      }
    };

    const fetchData = async () => {
      setError("");
      if (!cachedStats) setLoading(true);

      const userPromise =
        cachedProfile?.user || cachedUser?.user
          ? Promise.resolve()
          : (async () => {
              try {
                const res = await fetch("/api/trakt/profile?userOnly=1", {
                  cache: "no-store",
                });
                if (ignore) return;
                if (res.status === 401) {
                  clearProfileSessionCache();
                  setNotConnected(true);
                  return;
                }
                if (!res.ok) return;
                const json = await res.json();
                if (ignore || !json?.user) return;
                setProfileData((prev) => ({ ...(prev || {}), user: json.user }));
                writeProfileSessionCache(PROFILE_USER_CACHE_KEY, {
                  user: json.user,
                });
              } catch (e) {
                console.error(e);
              }
            })();

      const statsPromise = (async () => {
        try {
          const res = await fetch(
            "/api/trakt/user-stats?historyLimit=1500&includePeople=0&localizeTitles=0",
            { cache: "no-store" },
          );
          if (ignore) return;
          if (res.status === 401) {
            clearProfileSessionCache();
            setNotConnected(true);
            return;
          }
          if (!res.ok) {
            const json = await res.json().catch(() => ({}));
            if (!cachedStats) {
              setError(
                json?.error || "No se pudieron cargar las estadísticas.",
              );
            }
            return;
          }

          const json = await res.json();
          if (ignore) return;
          mergeStatsData(json);
          refreshTopArtwork();
        } catch (e) {
          console.error(e);
          if (!ignore && !cachedStats) {
            setError("No se pudieron cargar las estadísticas.");
          }
        } finally {
          if (!ignore) setLoading(false);
        }
      })();

      const profilePromise = (async () => {
        try {
          const res = await fetch("/api/trakt/profile?compact=1", {
            cache: "no-store",
          });
          if (ignore) return;
          if (res.status === 401) {
            clearProfileSessionCache();
            setNotConnected(true);
            return;
          }
          if (!res.ok) return;
          const json = await res.json();
          if (ignore) return;
          setProfileData(json);
          writeProfileSessionCache(PROFILE_DATA_CACHE_KEY, json);
          if (json?.user) {
            writeProfileSessionCache(PROFILE_USER_CACHE_KEY, {
              user: json.user,
            });
          }
        } catch (e) {
          console.error(e);
        }
      })();

      await Promise.allSettled([userPromise, statsPromise, profilePromise]);
    };
    fetchData();

    return () => {
      ignore = true;
    };
  }, []);

  useEffect(() => {
    if (!data || notConnected || peopleLoaded) return;
    if ((data.topActors || []).length || (data.topDirectors || []).length) {
      return;
    }

    let ignore = false;

    const fetchPeople = async () => {
      setPeopleLoading(true);
      try {
        const res = await fetch(
          "/api/trakt/user-stats?peopleOnly=1&historyLimit=0&localizeTitles=0",
          { cache: "no-store" },
        );
        if (!res.ok) return;
        const json = await res.json();
        if (ignore) return;
        setData((prev) => {
          if (!prev) return prev;
          const merged = {
            ...prev,
            topActors: json.topActors || [],
            topDirectors: json.topDirectors || [],
          };
          writeProfileSessionCache(PROFILE_STATS_CACHE_KEY, merged);
          return merged;
        });
      } catch (e) {
        console.error(e);
      } finally {
        if (!ignore) {
          setPeopleLoaded(true);
          setPeopleLoading(false);
        }
      }
    };

    fetchPeople();

    return () => {
      ignore = true;
    };
  }, [data, notConnected, peopleLoaded]);

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
      topMoviesReady: (data.watchedMovies || []).some(
        (item) => item?.movie?.poster_path,
      ),
      topShowsReady: (data.watchedShows || []).some(
        (item) => item?.show?.poster_path,
      ),
      years: [
        ...new Set(history.map((h) => new Date(h.watched_at).getFullYear())),
      ].sort((a, b) => b - a),
      topActors: (data.topActors || []).slice(0, 15),
      topDirectors: (data.topDirectors || []).slice(0, 15),
    };
  }, [data]);

  const formatMinutes = (mins) => {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${h}h ${m}m`;
  };

  const profileUser = profileData?.user || null;
  const recentHistory = profileData?.recentHistory || [];
  const recentRatings = profileData?.recentRatings || [];
  const watchlist = profileData?.watchlist || [];
  const headerReady = !!profileUser;
  const profileRowsReady = !!stats;

  if (notConnected) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] text-zinc-100 pb-20">
        {/* Background Ambience */}
        <div className="fixed inset-0 pointer-events-none">
          <div className="absolute top-0 left-0 w-[500px] h-[500px] bg-blue-500/10 rounded-full blur-[120px] mix-blend-screen" />
          <div className="absolute bottom-0 right-0 w-[500px] h-[500px] bg-purple-500/10 rounded-full blur-[120px] mix-blend-screen" />
        </div>

        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
          {/* Header */}
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-8"
          >
            <div className="flex items-center gap-3 mb-2">
              <div className="h-px w-12 bg-indigo-500" />
              <span className="text-indigo-400 font-bold uppercase tracking-widest text-xs">
                Tu Perfil
              </span>
            </div>
            <h1 className="text-4xl md:text-6xl font-black tracking-tighter text-white">
              Perfil
              <span className="text-indigo-500">.</span>
            </h1>
            <p className="mt-2 text-zinc-400 max-w-lg text-lg hidden md:block">
              Tu actividad y estadísticas en Trakt.
            </p>
          </motion.div>

          <div className="flex items-center justify-center py-12 lg:py-24">
            <div className="max-w-md w-full flex flex-col items-center justify-center py-12 bg-zinc-900/20 border border-white/5 rounded-3xl text-center px-4 border-dashed">
              <div className="mb-6">
                <img
                  src="/logo-Trakt.png"
                  alt="Trakt Logo"
                  className="w-24 h-24 object-contain shadow-lg shadow-red-500/20 rounded-2xl"
                />
              </div>
              <h2 className="text-2xl font-bold text-white mb-2">
                Conecta tu cuenta de Trakt
              </h2>
              <p className="text-zinc-400 max-w-sm mb-8 text-sm">
                Para ver tus estadísticas personales, historial detallado y
                patrones de visualización, necesitas iniciar sesión.
              </p>
              <button
                onClick={() =>
                  window.location.assign(
                    `/api/trakt/auth/start?next=${encodeURIComponent(connectNext)}`,
                  )
                }
                className="px-8 py-3 bg-white text-black font-bold rounded-xl hover:bg-zinc-200 transition shadow-lg shadow-white/10"
              >
                Conectar ahora
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] pb-20 text-zinc-100 selection:bg-emerald-500/30">
      {/* Background Ambience */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-0 w-[500px] h-[500px] bg-blue-500/10 rounded-full blur-[120px] mix-blend-screen" />
        <div className="absolute bottom-0 right-0 w-[500px] h-[500px] bg-purple-500/10 rounded-full blur-[120px] mix-blend-screen" />
      </div>

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        {/* Header - Always Visible */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(320px,auto)] lg:items-center"
        >
          <ProfileHero user={profileUser} />

          <div className="flex justify-start lg:justify-end">
            {headerReady ? (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25 }}
                className="flex p-1.5 bg-zinc-900/80 backdrop-blur-md rounded-2xl border border-white/5 overflow-x-auto"
              >
                {[
                  { id: "overview", label: "General", icon: PieChartIcon },
                  { id: "patterns", label: "Patrones", icon: TrendingUp },
                  { id: "yearly", label: "Histórico", icon: CalendarIcon },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setViewMode(tab.id)}
                    className={`relative px-5 py-2.5 rounded-xl text-sm font-bold transition-all duration-300 flex items-center gap-2 whitespace-nowrap ${viewMode === tab.id
                        ? "text-black"
                        : "text-zinc-400 hover:text-white hover:bg-white/5"
                      }`}
                  >
                    {viewMode === tab.id && (
                      <motion.div
                        layoutId="activeTab"
                        className="absolute inset-0 bg-white rounded-xl"
                        transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                      />
                    )}
                    <span className="relative z-10 flex items-center gap-2">
                      <tab.icon className="w-4 h-4" />
                      {tab.label}
                    </span>
                  </button>
                ))}
              </motion.div>
            ) : null}
          </div>
        </motion.div>

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
                    <div className="bg-zinc-900/30 rounded-2xl p-4 flex items-center gap-3 border border-white/5 hover:bg-zinc-900/60 transition-colors">
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
                    <div className="bg-zinc-900/30 rounded-2xl p-4 flex items-center gap-3 border border-white/5 hover:bg-zinc-900/60 transition-colors">
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
                    <div className="bg-zinc-900/30 rounded-2xl p-4 flex items-center gap-3 border border-white/5 hover:bg-zinc-900/60 transition-colors">
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
                    <div className="bg-zinc-900/30 rounded-2xl p-4 flex items-center gap-3 border border-white/5 hover:bg-zinc-900/60 transition-colors">
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

                {profileRowsReady && recentHistory.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.18 }}
                    className="relative order-2 [content-visibility:auto] [contain-intrinsic-size:auto_340px]"
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
                        <ProfileCardScrollerItem key={`${item.type}-${item.tmdbId}-${idx}`}>
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

                {profileRowsReady && recentRatings.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.22 }}
                    className="relative order-2 [content-visibility:auto] [contain-intrinsic-size:auto_340px]"
                  >
                    <SectionTitle
                      icon={Star}
                      title="Últimas valoraciones"
                      subtitle="Lo que has puntuado recientemente"
                      color="yellow"
                    />
                    <ProfileCardScroller>
                      {recentRatings.slice(0, 15).map((item, idx) => (
                        <ProfileCardScrollerItem key={`${item.type}-${item.tmdbId}-${idx}`}>
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

                {profileRowsReady && watchlist.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.26 }}
                    className="relative order-2 [content-visibility:auto] [contain-intrinsic-size:auto_340px]"
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
                        <ProfileCardScrollerItem key={`${item.type}-${item.tmdbId}-${idx}`}>
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
                {stats && (
                  <div className="order-1 grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Activity Chart - Spans 2 cols */}
                    <motion.div
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: 0.2 }}
                      className="lg:col-span-2 bg-zinc-900/50 border border-white/5 rounded-3xl p-6 backdrop-blur-xl relative overflow-hidden"
                    >
                      <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/5 rounded-full blur-3xl pointer-events-none" />
                      <SectionTitle
                        icon={Activity}
                        title="Actividad Mensual"
                        subtitle="Visualizaciones en el último año"
                        color="indigo"
                      />

                      <div className="h-[300px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart
                            data={stats.monthlyData}
                            margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                          >
                            <defs>
                              <linearGradient
                                id="colorTotal"
                                x1="0"
                                y1="0"
                                x2="0"
                                y2="1"
                              >
                                <stop
                                  offset="5%"
                                  stopColor={COLORS.indigo}
                                  stopOpacity={0.3}
                                />
                                <stop
                                  offset="95%"
                                  stopColor={COLORS.indigo}
                                  stopOpacity={0}
                                />
                              </linearGradient>
                            </defs>
                            <CartesianGrid
                              strokeDasharray="3 3"
                              vertical={false}
                              stroke={CHART_THEME.grid}
                            />
                            <XAxis
                              dataKey="label"
                              stroke={CHART_THEME.text}
                              tick={{ fill: CHART_THEME.text, fontSize: 12 }}
                              tickLine={false}
                              axisLine={false}
                              dy={10}
                            />
                            <YAxis
                              stroke={CHART_THEME.text}
                              tick={{ fill: CHART_THEME.text, fontSize: 12 }}
                              tickLine={false}
                              axisLine={false}
                            />
                            <Tooltip
                              content={<CustomTooltip />}
                              cursor={{
                                stroke: "rgba(255,255,255,0.1)",
                                strokeWidth: 2,
                              }}
                            />
                            <Area
                              type="monotone"
                              dataKey="total"
                              name="Total"
                              stroke={COLORS.indigo}
                              strokeWidth={3}
                              fillOpacity={1}
                              fill="url(#colorTotal)"
                              animationDuration={1500}
                            />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                    </motion.div>

                    {/* Time Distribution */}
                    <motion.div
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: 0.3 }}
                      className="bg-zinc-900/50 border border-white/5 rounded-3xl p-6 backdrop-blur-xl flex flex-col items-center justify-center relative"
                    >
                      <SectionTitle
                        icon={Clock}
                        title="Distribución de Tiempo"
                        subtitle="Películas vs Series"
                        color="indigo"
                      />
                      <div className="h-[250px] w-full relative">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={stats.timeDistribution}
                              innerRadius={60}
                              outerRadius={80}
                              paddingAngle={5}
                              dataKey="value"
                            >
                              {stats.timeDistribution.map((entry, index) => (
                                <Cell
                                  key={`cell-${index}`}
                                  fill={entry.color}
                                  stroke="rgba(0,0,0,0)"
                                />
                              ))}
                            </Pie>
                            <Tooltip
                              content={
                                <CustomTooltip formatter={formatMinutes} />
                              }
                              wrapperStyle={{ zIndex: 1000 }}
                            />
                            <Legend
                              verticalAlign="bottom"
                              height={36}
                              iconType="circle"
                            />
                          </PieChart>
                        </ResponsiveContainer>
                        {/* Center Text */}
                        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none pb-8">
                          <span className="text-3xl font-black text-white">
                            {stats.formattedTotalTime.split(" ")[0]}
                          </span>
                          <span className="text-sm font-bold text-zinc-500 uppercase tracking-widest">
                            {stats.formattedTotalTime.split(" ")[1]}
                          </span>
                        </div>
                      </div>
                    </motion.div>
                  </div>
                )}

                {/* Top Content Row */}
                {stats && (stats.topMoviesReady || stats.topShowsReady) && (
                  <div className="order-3 space-y-8 [content-visibility:auto] [contain-intrinsic-size:auto_720px]">
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
                            .filter((item) => item?.movie?.poster_path)
                            .slice(0, 15)
                            .map((item, idx) => (
                              <ProfileCardScrollerItem key={item.movie?.ids?.tmdb || idx}>
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
                            .filter((item) => item?.show?.poster_path)
                            .slice(0, 15)
                            .map((item, idx) => (
                              <ProfileCardScrollerItem key={item.show?.ids?.tmdb || idx}>
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
                {stats?.topActors?.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.65 }}
                    className="relative order-4 [content-visibility:auto] [contain-intrinsic-size:auto_340px]"
                  >
                    <SectionTitle
                      icon={Users}
                      title="Actores Favoritos"
                      subtitle="Las caras que más ves"
                      color="yellow"
                    />
                    <ProfileCardScroller>
                      {stats.topActors.slice(0, 15).map((person, idx) => (
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
                {stats?.topDirectors?.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.7 }}
                    className="relative order-4 [content-visibility:auto] [contain-intrinsic-size:auto_340px]"
                  >
                    <SectionTitle
                      icon={Film}
                      title="Directores Favoritos"
                      subtitle="Los cineastas que más sigues"
                      color="rose"
                    />
                    <ProfileCardScroller>
                      {stats.topDirectors.slice(0, 15).map((person, idx) => (
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
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Hour of Day */}
                  <div className="bg-zinc-900/50 border border-white/5 rounded-3xl p-6 backdrop-blur-xl">
                    <SectionTitle
                      icon={Clock}
                      title="Hora del Día"
                      subtitle="¿Cuándo ves más contenido?"
                      color="pink"
                    />
                    <div className="h-[300px] w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={stats.hourOfDayData}>
                          <CartesianGrid
                            strokeDasharray="3 3"
                            vertical={false}
                            stroke={CHART_THEME.grid}
                          />
                          <XAxis
                            dataKey="name"
                            stroke={CHART_THEME.text}
                            tick={{ fontSize: 10 }}
                            tickLine={false}
                            axisLine={false}
                          />
                          <Tooltip
                            content={<CustomTooltip />}
                            cursor={{ fill: "rgba(255,255,255,0.05)" }}
                          />
                          <Bar
                            dataKey="value"
                            fill={COLORS.pink}
                            radius={[4, 4, 0, 0]}
                          />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {/* Day of Week */}
                  <div className="bg-zinc-900/50 border border-white/5 rounded-3xl p-6 backdrop-blur-xl">
                    <SectionTitle
                      icon={CalendarIcon}
                      title="Día de la Semana"
                      subtitle="Tus días más activos"
                      color="cyan"
                    />
                    <div className="h-[300px] w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={stats.dayOfWeekData}>
                          <CartesianGrid
                            strokeDasharray="3 3"
                            vertical={false}
                            stroke={CHART_THEME.grid}
                          />
                          <XAxis
                            dataKey="name"
                            stroke={CHART_THEME.text}
                            tick={{ fontSize: 10 }}
                            tickLine={false}
                            axisLine={false}
                          />
                          <Tooltip
                            content={<CustomTooltip />}
                            cursor={{ fill: "rgba(255,255,255,0.05)" }}
                          />
                          <Bar
                            dataKey="value"
                            fill={COLORS.cyan}
                            radius={[4, 4, 0, 0]}
                          />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>

                {/* Genres & Ratings row */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Genres - Radar */}
                  <motion.div className="bg-zinc-900/50 border border-white/5 rounded-3xl p-6 backdrop-blur-xl">
                    <SectionTitle
                      icon={Target}
                      title="Gustos por Género"
                      subtitle="Tus categorías más frecuentes"
                      color="lime"
                    />
                    <div className="h-[300px] w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <RadarChart
                          cx="50%"
                          cy="50%"
                          outerRadius="80%"
                          data={stats.genreData}
                        >
                          <PolarGrid stroke={CHART_THEME.grid} />
                          <PolarAngleAxis
                            dataKey="name"
                            tick={{
                              fill: CHART_THEME.text,
                              fontSize: 13,
                              fontWeight: 500,
                            }}
                          />
                          <PolarRadiusAxis
                            angle={30}
                            domain={[0, "auto"]}
                            tick={false}
                            axisLine={false}
                          />
                          <Radar
                            name="Géneros"
                            dataKey="value"
                            stroke={COLORS.lime}
                            fill={COLORS.lime}
                            fillOpacity={0.4}
                          />
                          <Tooltip content={<CustomTooltip />} />
                        </RadarChart>
                      </ResponsiveContainer>
                    </div>
                  </motion.div>

                  {/* Ratings - Bar */}
                  <motion.div className="bg-zinc-900/50 border border-white/5 rounded-3xl p-6 backdrop-blur-xl">
                    <SectionTitle
                      icon={Award}
                      title="Tus Puntuaciones"
                      subtitle="Distribución de ratings (1-10)"
                      color="teal"
                    />
                    <div className="h-[300px] w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={stats.ratingData} barSize={20}>
                          <CartesianGrid
                            strokeDasharray="3 3"
                            vertical={false}
                            stroke={CHART_THEME.grid}
                          />
                          <XAxis
                            dataKey="name"
                            stroke={CHART_THEME.text}
                            tick={{ fill: CHART_THEME.text, fontSize: 12 }}
                            axisLine={false}
                            tickLine={false}
                          />
                          <Tooltip
                            content={<CustomTooltip />}
                            cursor={{ fill: "rgba(255,255,255,0.05)" }}
                          />
                          <Bar
                            dataKey="value"
                            name="Votos"
                            radius={[4, 4, 0, 0]}
                          >
                            {stats.ratingData.map((entry, index) => (
                              <Cell
                                key={`cell-${index}`}
                                fill={
                                  index > 6
                                    ? COLORS.teal
                                    : index > 4
                                      ? COLORS.yellow
                                      : COLORS.rose
                                }
                              />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </motion.div>
                </div>
              </motion.div>
            )}

            {stats && viewMode === "yearly" && (
              <motion.div
                key="yearly"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 1.05 }}
                transition={{ duration: 0.4 }}
                className="flex flex-col items-center justify-center py-20 text-center"
              >
                <div className="w-24 h-24 bg-zinc-900 rounded-full border border-white/10 flex items-center justify-center mb-6 relative">
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
                      className="px-4 py-2 rounded-lg bg-zinc-900 border border-white/10 text-zinc-400 font-mono text-sm"
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
    </div>
  );
}
