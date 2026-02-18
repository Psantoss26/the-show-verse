"use client";

import {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
    memo,
} from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import {
    Tv,
    Play,
    Clock,
    Eye,
    Layers,
    ChevronRight,
    Search,
    SlidersHorizontal,
    ArrowUpDown,
    CheckCircle2,
    ChevronDown,
    X,
    Loader2,
    BarChart3,
    TrendingUp,
    Calendar,
    Film,
    LogOut,
    RotateCcw,
    LayoutList,
} from "lucide-react";

import {
    traktAuthStatus,
    traktGetInProgress,
    traktDisconnect,
} from "@/lib/api/traktClient";

const TMDB_API_KEY = process.env.NEXT_PUBLIC_TMDB_API_KEY;

// ----------------------------
// HELPERS
// ----------------------------
function formatLastWatched(iso) {
    if (!iso) return "Desconocido";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "Desconocido";
    const now = new Date();
    const diffMs = now - d;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "Justo ahora";
    if (diffMins < 60) return `Hace ${diffMins} min`;
    if (diffHours < 24) return `Hace ${diffHours}h`;
    if (diffDays < 7) return `Hace ${diffDays}d`;
    if (diffDays < 30) return `Hace ${Math.floor(diffDays / 7)} sem`;
    return new Intl.DateTimeFormat("es-ES", {
        day: "numeric",
        month: "short",
        year: "numeric",
    }).format(d);
}

function formatEpCode(season, number) {
    if (season == null || number == null) return null;
    return `S${String(season).padStart(2, "0")}E${String(number).padStart(2, "0")}`;
}

function getProgressColor(pct) {
    if (pct >= 90) return { bar: "from-emerald-400 to-green-300", text: "text-emerald-400", bg: "bg-emerald-500/15", border: "border-emerald-500/30", glow: "shadow-emerald-500/25", stroke: "#34d399", trail: "rgba(52,211,153,0.15)", label: "Casi completa", accent: "52,211,153" };
    if (pct >= 70) return { bar: "from-violet-500 to-purple-400", text: "text-violet-400", bg: "bg-violet-500/15", border: "border-violet-500/30", glow: "shadow-violet-500/25", stroke: "#a78bfa", trail: "rgba(167,139,250,0.15)", label: "Avanzada", accent: "167,139,250" };
    if (pct >= 50) return { bar: "from-sky-500 to-cyan-400", text: "text-sky-400", bg: "bg-sky-500/15", border: "border-sky-500/30", glow: "shadow-sky-500/25", stroke: "#38bdf8", trail: "rgba(56,189,248,0.15)", label: "Media", accent: "56,189,248" };
    if (pct >= 30) return { bar: "from-amber-500 to-yellow-400", text: "text-amber-400", bg: "bg-amber-500/15", border: "border-amber-500/30", glow: "shadow-amber-500/25", stroke: "#fbbf24", trail: "rgba(251,191,36,0.15)", label: "Parcial", accent: "251,191,36" };
    if (pct >= 10) return { bar: "from-orange-500 to-orange-400", text: "text-orange-400", bg: "bg-orange-500/15", border: "border-orange-500/30", glow: "shadow-orange-500/25", stroke: "#fb923c", trail: "rgba(251,146,60,0.15)", label: "Inicial", accent: "251,146,60" };
    return { bar: "from-rose-500 to-pink-400", text: "text-rose-400", bg: "bg-rose-500/15", border: "border-rose-500/30", glow: "shadow-rose-500/25", stroke: "#fb7185", trail: "rgba(251,113,133,0.15)", label: "Recién empezada", accent: "251,113,133" };
}

// ----------------------------
// CIRCULAR PROGRESS GAUGE (SVG)
// ----------------------------
function CircularProgress({ pct, colors, size = 52 }) {
    const strokeWidth = 3.5;
    const radius = (size - strokeWidth) / 2;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference - (pct / 100) * circumference;

    return (
        <div className="relative" style={{ width: size, height: size }}>
            <svg width={size} height={size} className="-rotate-90">
                {/* Trail */}
                <circle
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    fill="none"
                    stroke={colors.trail}
                    strokeWidth={strokeWidth}
                />
                {/* Progress arc */}
                <motion.circle
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    fill="none"
                    stroke={colors.stroke}
                    strokeWidth={strokeWidth}
                    strokeLinecap="round"
                    strokeDasharray={circumference}
                    initial={{ strokeDashoffset: circumference }}
                    animate={{ strokeDashoffset: offset }}
                    transition={{ duration: 1.2, ease: "easeOut", delay: 0.3 }}
                    style={{ filter: `drop-shadow(0 0 4px ${colors.stroke}60)` }}
                />
            </svg>
            {/* Center text */}
            <div className="absolute inset-0 flex items-center justify-center">
                <span className={`text-[11px] font-black ${colors.text}`}>{pct}%</span>
            </div>
        </div>
    );
}

// ----------------------------
// STAT CARD (same as History)
// ----------------------------
function StatCard({ label, value, icon: Icon, colorClass = "text-white", loading = false }) {
    return (
        <div className="flex-1 lg:flex-none lg:min-w-[120px] bg-zinc-900/50 border border-white/5 rounded-xl md:rounded-2xl px-4 py-3 md:px-5 md:py-4 flex flex-col items-center justify-center gap-1 backdrop-blur-sm transition hover:bg-zinc-900/70">
            <div className={`p-1.5 md:p-2 rounded-full bg-white/5 mb-1 ${colorClass}`}>
                <Icon className="w-4 h-4 md:w-5 md:h-5" />
            </div>
            <div className="text-xl md:text-2xl lg:text-3xl font-black text-white tracking-tight">
                {loading ? (
                    <span className="inline-block h-6 md:h-8 w-10 md:w-14 rounded-lg bg-white/10 animate-pulse" />
                ) : (
                    value
                )}
            </div>
            <div className="text-[9px] md:text-[10px] uppercase font-bold text-zinc-500 tracking-wider text-center leading-tight">
                {label}
            </div>
        </div>
    );
}

// ----------------------------
// INLINE DROPDOWN (same as History with emerald accent)
// ----------------------------
function InlineDropdown({ label, valueLabel, icon: Icon, children }) {
    const [open, setOpen] = useState(false);
    const ref = useRef(null);

    useEffect(() => {
        if (!open) return;
        const onDown = (e) => {
            if (ref.current && !ref.current.contains(e.target)) setOpen(false);
        };
        document.addEventListener("pointerdown", onDown);
        return () => document.removeEventListener("pointerdown", onDown);
    }, [open]);

    return (
        <div ref={ref} className="relative w-full lg:w-auto lg:shrink-0">
            <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                className="h-11 w-full inline-flex items-center justify-between gap-3 px-4 rounded-xl bg-zinc-900 border border-zinc-800 hover:border-zinc-600 transition text-sm text-zinc-300 lg:min-w-[140px]"
            >
                <div className="flex items-center gap-2">
                    {Icon && <Icon className="w-4 h-4 text-emerald-500" />}
                    <span className="text-zinc-500 font-bold text-xs uppercase tracking-wider">
                        {label}:
                    </span>
                    <span className="font-semibold text-white truncate">
                        {valueLabel}
                    </span>
                </div>
                <ChevronDown
                    className={`w-3.5 h-3.5 text-zinc-500 transition-transform ${open ? "rotate-180" : ""}`}
                />
            </button>

            <AnimatePresence>
                {open && (
                    <motion.div
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 8 }}
                        className="absolute left-0 top-full z-[100] mt-2 w-48 rounded-xl border border-zinc-800 bg-[#121212] shadow-2xl overflow-hidden p-1"
                    >
                        {children({ close: () => setOpen(false) })}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

function DropdownItem({ active, onClick, children }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={`w-full px-3 py-2 rounded-lg text-left text-sm transition flex items-center justify-between
        ${active ? "bg-zinc-800 text-white" : "text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200"}`}
        >
            <span className="font-medium">{children}</span>
            {active && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />}
        </button>
    );
}

// ----------------------------
// IN-PROGRESS CARD
// ----------------------------
const InProgressCard = memo(function InProgressCard({ item, index = 0, viewMode = "cards" }) {
    const title = item.title_es || item.title || "Sin título";
    const href = item.detailsHref || `/details/tv/${item.tmdbId}`;
    const posterSrc = item.poster_path
        ? `https://image.tmdb.org/t/p/w342${item.poster_path}`
        : null;
    const backdropSrc = item.backdrop_path
        ? `https://image.tmdb.org/t/p/w780${item.backdrop_path}`
        : null;
    const colors = getProgressColor(item.pct);
    const nextEpCode = item.nextEpisode ? formatEpCode(item.nextEpisode.season, item.nextEpisode.number) : null;
    const lastEpCode = item.lastEpisode ? formatEpCode(item.lastEpisode.season, item.lastEpisode.number) : null;
    const lastWatched = formatLastWatched(item.lastWatchedAt);
    const remaining = item.aired - item.completed;

    const animDelay = Math.min(index * 0.06, 0.5);

    if (viewMode === "compact") {
        return (
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.35, delay: animDelay, ease: "easeOut" }}
            >
                <Link href={href} className="block bg-zinc-900/30 border border-white/5 rounded-xl hover:border-emerald-500/30 hover:bg-zinc-900/60 transition-colors group overflow-hidden">
                    <div className="relative flex items-center gap-2 sm:gap-5 p-1.5 sm:p-4">
                        {/* Backdrop image - same size as History list view */}
                        <div className="w-[140px] sm:w-[210px] aspect-video rounded-lg overflow-hidden relative shadow-md border border-white/5 bg-zinc-900 shrink-0">
                            {backdropSrc ? (
                                <img
                                    src={backdropSrc}
                                    alt={title}
                                    className="block w-full h-full object-cover"
                                    loading="lazy"
                                />
                            ) : posterSrc ? (
                                <img
                                    src={posterSrc}
                                    alt={title}
                                    className="block w-full h-full object-cover blur-sm opacity-60"
                                    loading="lazy"
                                />
                            ) : (
                                <div className="w-full h-full flex items-center justify-center bg-zinc-800">
                                    <Tv className="w-8 h-8 text-zinc-700" />
                                </div>
                            )}
                        </div>

                        {/* Info - right side */}
                        <div className="flex-1 min-w-0 flex flex-col justify-center gap-1.5">
                            <h4 className="text-white font-bold text-base leading-tight truncate group-hover:text-emerald-300 transition-colors">{title}</h4>

                            <div className="flex items-center gap-2 text-xs text-zinc-500 flex-wrap">
                                <span className={`font-bold px-1.5 py-0.5 rounded text-[10px] ${colors.bg} ${colors.text}`}>{item.pct}%</span>
                                <span>{item.completed}/{item.aired} episodios</span>
                                {nextEpCode && (
                                    <>
                                        <span>•</span>
                                        <span className="flex items-center gap-1">
                                            <Play className="w-3 h-3 text-emerald-400" fill="currentColor" />
                                            <span className="text-zinc-300 font-semibold">{nextEpCode}</span>
                                        </span>
                                    </>
                                )}
                            </div>

                            {/* Progress bar */}
                            <div className="h-1.5 w-full max-w-xs rounded-full bg-zinc-800 overflow-hidden relative">
                                <motion.div
                                    className={`h-full rounded-full bg-gradient-to-r ${colors.bar} relative overflow-hidden`}
                                    initial={{ width: 0 }}
                                    animate={{ width: `${item.pct}%` }}
                                    transition={{ duration: 0.8, delay: animDelay + 0.2, ease: "easeOut" }}
                                >
                                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-[shimmer_2s_infinite]" style={{ animationDelay: `${animDelay}s` }} />
                                </motion.div>
                            </div>

                            <div className="text-xs text-zinc-400 flex items-center gap-1.5 font-medium">
                                <Clock className="w-3 h-3" /> {lastWatched}
                                {remaining > 0 && (
                                    <>
                                        <span className="text-zinc-600">•</span>
                                        <span className="text-zinc-500">{remaining} eps restantes</span>
                                    </>
                                )}
                            </div>
                        </div>
                    </div>
                </Link>
            </motion.div>
        );
    }

    // ==== CARDS VIEW (default) ====
    return (
        <motion.div
            initial={{ opacity: 0, y: 30, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.4, delay: animDelay, ease: [0.25, 0.46, 0.45, 0.94] }}
        >
            <Link href={href} className="block group">
                <div
                    className="relative rounded-2xl overflow-hidden border border-white/5 bg-zinc-900/60 hover:bg-zinc-900/80 transition-all duration-300"
                    onMouseEnter={(e) => { e.currentTarget.style.borderColor = `rgba(${colors.accent}, 0.3)`; e.currentTarget.style.boxShadow = `0 20px 25px -5px rgba(${colors.accent}, 0.15), 0 8px 10px -6px rgba(${colors.accent}, 0.1)`; }}
                    onMouseLeave={(e) => { e.currentTarget.style.borderColor = ''; e.currentTarget.style.boxShadow = ''; }}
                >
                    {/* Backdrop hero */}
                    <div className="relative aspect-video overflow-hidden">
                        {backdropSrc ? (
                            <img
                                src={backdropSrc}
                                alt={title}
                                className="block w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                                loading="lazy"
                            />
                        ) : posterSrc ? (
                            <img
                                src={posterSrc}
                                alt={title}
                                className="block w-full h-full object-cover blur-sm opacity-50 transition-transform duration-500 group-hover:scale-105"
                                loading="lazy"
                            />
                        ) : (
                            <div className="w-full h-full bg-gradient-to-br from-zinc-800 to-zinc-900 flex items-center justify-center">
                                <Tv className="w-12 h-12 text-zinc-700" />
                            </div>
                        )}

                        {/* Gradient overlay - stronger at top for badge readability */}
                        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-black/30" />
                        <div className="absolute top-0 left-0 right-0 h-20 bg-gradient-to-b from-black/60 to-transparent" />

                        {/* Progress circular gauge badge - solid dark bg for readability */}
                        <div className="absolute top-2.5 right-2.5">
                            <div
                                className="rounded-full p-1"
                                style={{ background: 'rgba(0,0,0,0.75)', boxShadow: '0 4px 12px rgba(0,0,0,0.5)' }}
                            >
                                <CircularProgress pct={item.pct} colors={colors} size={48} />
                            </div>
                        </div>

                        {/* Next episode badge - solid dark bg */}
                        {nextEpCode && (
                            <div
                                className="absolute top-3 left-3 px-2.5 py-1.5 rounded-lg flex items-center gap-1.5"
                                style={{ background: 'rgba(0,0,0,0.75)', boxShadow: '0 4px 12px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.08)' }}
                            >
                                <Play className="w-3 h-3 text-emerald-400" fill="currentColor" />
                                <span className="text-[11px] font-bold text-white">{nextEpCode}</span>
                            </div>
                        )}

                        {/* Bottom info on backdrop */}
                        <div className="absolute bottom-0 left-0 right-0 p-4">
                            <h3 className="text-white font-black text-lg lg:text-xl leading-tight line-clamp-1 group-hover:text-emerald-200 transition-colors">
                                {title}
                            </h3>
                            {item.year && (
                                <div className="flex items-center gap-2 mt-1">
                                    <span className="text-xs text-zinc-400">{item.year}</span>
                                    {item.genres && item.genres.length > 0 && (
                                        <>
                                            <span className="text-zinc-600">·</span>
                                            <span className="text-xs text-zinc-500">{item.genres.slice(0, 2).join(", ")}</span>
                                        </>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Progress section */}
                    <div className="p-4 space-y-3">
                        {/* Progress bar - thicker with shimmer + color label */}
                        <div>
                            <div className="flex items-center justify-between mb-1.5">
                                <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">Progreso</span>
                                <span className="text-[11px] text-zinc-500">{item.completed} de {item.aired} episodios</span>
                            </div>
                            <div className="h-2.5 w-full rounded-full bg-zinc-800/80 overflow-hidden relative">
                                <motion.div
                                    className={`h-full rounded-full bg-gradient-to-r ${colors.bar} relative overflow-hidden`}
                                    initial={{ width: 0 }}
                                    animate={{ width: `${item.pct}%` }}
                                    transition={{ duration: 1, delay: animDelay + 0.3, ease: "easeOut" }}
                                    style={{ boxShadow: `0 0 8px ${colors.stroke}40` }}
                                >
                                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/25 to-transparent animate-[shimmer_2s_infinite]" style={{ animationDelay: `${animDelay}s` }} />
                                </motion.div>
                            </div>
                        </div>

                        {/* Episode info row */}
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                {lastEpCode && (
                                    <div className="flex items-center gap-1.5">
                                        <Eye className="w-3 h-3 text-zinc-500" />
                                        <span className="text-[11px] text-zinc-400">
                                            Último: <span className="text-white font-semibold">{lastEpCode}</span>
                                        </span>
                                    </div>
                                )}
                                {remaining > 0 && (
                                    <div className="flex items-center gap-1.5">
                                        <Layers className="w-3 h-3 text-zinc-500" />
                                        <span className="text-[11px] text-zinc-400">
                                            Faltan: <span className="text-white font-semibold">{remaining}</span>
                                        </span>
                                    </div>
                                )}
                            </div>

                            <div className="flex items-center gap-1.5">
                                <Clock className="w-3 h-3 text-zinc-600" />
                                <span className="text-[10px] text-zinc-500">{lastWatched}</span>
                            </div>
                        </div>
                    </div>
                </div>
            </Link>
        </motion.div>
    );
});

// ----------------------------
// SKELETON CARD
// ----------------------------
function SkeletonCard({ viewMode = "cards" }) {
    if (viewMode === "compact") {
        return (
            <div className="flex items-center gap-3 sm:gap-4 p-2 sm:p-3 rounded-xl bg-zinc-900/40 border border-white/5 animate-pulse">
                <div className="w-[52px] sm:w-[60px] aspect-[2/3] rounded-lg bg-zinc-800 shrink-0" />
                <div className="flex-1 min-w-0 space-y-2">
                    <div className="h-4 w-3/4 bg-zinc-800 rounded" />
                    <div className="h-2.5 w-1/2 bg-zinc-800 rounded" />
                    <div className="h-1.5 w-full bg-zinc-800 rounded-full" />
                </div>
            </div>
        );
    }

    return (
        <div className="rounded-2xl overflow-hidden border border-white/5 bg-zinc-900/60 animate-pulse">
            <div className="aspect-video bg-zinc-800" />
            <div className="p-4 space-y-3">
                <div className="space-y-1.5">
                    <div className="h-2 bg-zinc-800 rounded-full" />
                </div>
                <div className="flex justify-between">
                    <div className="h-3 w-1/3 bg-zinc-800 rounded" />
                    <div className="h-3 w-1/4 bg-zinc-800 rounded" />
                </div>
            </div>
        </div>
    );
}

// ----------------------------
// MAIN PAGE
// ----------------------------
export default function InProgressClient() {
    const [auth, setAuth] = useState({ loading: true, connected: false });
    const [loading, setLoading] = useState(false);
    const [dataLoaded, setDataLoaded] = useState(false);
    const [items, setItems] = useState([]);
    const [stats, setStats] = useState(null);
    const [showDisconnectModal, setShowDisconnectModal] = useState(false);

    // UI
    const [viewMode, setViewMode] = useState(() => {
        if (typeof window === "undefined") return "cards";
        const saved = window.localStorage.getItem("showverse:inprogress:viewMode");
        return saved === "cards" || saved === "compact" ? saved : "cards";
    });
    const [sortBy, setSortBy] = useState(() => {
        if (typeof window === "undefined") return "recent";
        const saved = window.localStorage.getItem("showverse:inprogress:sortBy");
        return saved || "recent";
    });
    const [q, setQ] = useState("");
    const [isMobile, setIsMobile] = useState(false);
    const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

    // Persist
    useEffect(() => {
        if (typeof window === "undefined") return;
        window.localStorage.setItem("showverse:inprogress:viewMode", viewMode);
    }, [viewMode]);
    useEffect(() => {
        if (typeof window === "undefined") return;
        window.localStorage.setItem("showverse:inprogress:sortBy", sortBy);
    }, [sortBy]);

    useEffect(() => {
        const mq = window.matchMedia("(max-width: 1024px)");
        const apply = () => setIsMobile(!!mq.matches);
        apply();
        mq.addEventListener?.("change", apply);
        return () => mq.removeEventListener?.("change", apply);
    }, []);

    const loadAuth = useCallback(async () => {
        try {
            const st = await traktAuthStatus();
            setAuth({ loading: false, connected: !!st?.connected });
        } catch {
            setAuth({ loading: false, connected: false });
        }
    }, []);

    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            const json = await traktGetInProgress();
            setItems(json?.items || []);
            setStats(json?.stats || null);
        } catch (e) {
            console.error("Error loading in-progress:", e);
        } finally {
            setLoading(false);
            setDataLoaded(true);
        }
    }, []);

    useEffect(() => {
        loadAuth();
    }, [loadAuth]);

    useEffect(() => {
        if (auth.connected) loadData();
    }, [auth.connected, loadData]);

    // Filter + Sort
    const filtered = useMemo(() => {
        let list = [...items];

        // Search
        if (q.trim()) {
            const query = q.trim().toLowerCase();
            list = list.filter((x) => {
                const title = (x.title_es || x.title || "").toLowerCase();
                return title.includes(query);
            });
        }

        // Sort
        switch (sortBy) {
            case "recent":
                list.sort((a, b) => new Date(b.lastWatchedAt || 0) - new Date(a.lastWatchedAt || 0));
                break;
            case "oldest":
                list.sort((a, b) => new Date(a.lastWatchedAt || 0) - new Date(b.lastWatchedAt || 0));
                break;
            case "progress-high":
                list.sort((a, b) => b.pct - a.pct);
                break;
            case "progress-low":
                list.sort((a, b) => a.pct - b.pct);
                break;
            case "alpha":
                list.sort((a, b) => (a.title_es || a.title || "").localeCompare(b.title_es || b.title || ""));
                break;
            case "episodes-left":
                list.sort((a, b) => (a.aired - a.completed) - (b.aired - b.completed));
                break;
            default:
                break;
        }

        return list;
    }, [items, q, sortBy]);

    const sortLabels = {
        recent: "Recientes",
        oldest: "Más antiguas",
        "progress-high": "Más avanzadas",
        "progress-low": "Menos avanzadas",
        alpha: "Alfabético",
        "episodes-left": "Menos eps. restantes",
    };

    const handleDisconnect = async () => {
        try {
            await traktDisconnect();
            setAuth({ loading: false, connected: false });
            setItems([]);
            setStats(null);
            window.location.href = "/";
        } catch (e) {
            console.error(e);
        }
        setShowDisconnectModal(false);
    };

    // ----------------------------
    // RENDER
    // ----------------------------

    // Loading auth
    if (auth.loading) {
        return (
            <div className="min-h-screen bg-[#050505] flex items-center justify-center">
                <Loader2 className="w-8 h-8 text-emerald-500 animate-spin" />
            </div>
        );
    }

    // Not connected state
    if (!auth.connected) {
        return (
            <div className="min-h-screen bg-[#050505] flex items-center justify-center px-4 pb-20">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-center max-w-md"
                >
                    <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                        <Tv className="w-10 h-10 text-emerald-500" />
                    </div>
                    <h2 className="text-2xl font-black text-white mb-3">Series en Progreso</h2>
                    <p className="text-zinc-400 mb-6 leading-relaxed">
                        Conecta tu cuenta de Trakt para ver las series que estás viendo actualmente con su progreso detallado.
                    </p>
                    <Link
                        href="/login"
                        className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm transition-all shadow-lg shadow-emerald-500/20 hover:shadow-emerald-500/30"
                    >
                        Conectar con Trakt
                    </Link>
                </motion.div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#050505] text-zinc-100 font-sans selection:bg-emerald-500/30">
            {/* Background ambient blobs */}
            <div className="fixed inset-0 pointer-events-none overflow-hidden">
                <div className="absolute top-[-10%] left-1/4 w-[500px] h-[500px] bg-emerald-500/5 rounded-full blur-[120px]" />
                <div className="absolute bottom-[-10%] right-1/4 w-[600px] h-[600px] bg-sky-500/5 rounded-full blur-[150px]" />
            </div>

            <div className="relative z-10 max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-8 lg:py-12">
                {/* ========== HEADER (same pattern as History, Favorites, Watchlist, Calendar) ========== */}
                <motion.header
                    className="mb-10"
                    initial={{ opacity: 0, y: -20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, ease: "easeOut" }}
                >
                    <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
                        <div>
                            <div className="flex items-center gap-3 mb-2">
                                <div className="h-px w-12 bg-emerald-500" />
                                <span className="text-emerald-400 font-bold uppercase tracking-widest text-xs">SEGUIMIENTO</span>
                            </div>
                            <div className="flex items-center gap-6">
                                <h1 className="text-4xl md:text-6xl font-black tracking-tighter text-white">
                                    En Progreso<span className="text-emerald-500">.</span>
                                </h1>

                                {/* Action buttons next to title */}
                                <div className="flex items-center gap-2">
                                    <motion.button
                                        onClick={() => loadData()}
                                        disabled={loading}
                                        className="p-3 bg-white/10 hover:bg-white/20 border border-white/20 rounded-full transition disabled:opacity-50"
                                        initial={{ opacity: 0, scale: 0.8 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        transition={{ duration: 0.4, delay: 0.3 }}
                                        whileHover={{ scale: loading ? 1 : 1.05 }}
                                        whileTap={{ scale: loading ? 1 : 0.95 }}
                                        title="Sincronizar"
                                    >
                                        <RotateCcw className={`w-5 h-5 text-white ${loading ? "animate-spin" : ""}`} />
                                    </motion.button>

                                    <motion.button
                                        onClick={() => setShowDisconnectModal(true)}
                                        disabled={loading}
                                        className="p-3 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 rounded-full transition disabled:opacity-50"
                                        initial={{ opacity: 0, scale: 0.8 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        transition={{ duration: 0.4, delay: 0.4 }}
                                        whileHover={{ scale: loading ? 1 : 1.05 }}
                                        whileTap={{ scale: loading ? 1 : 0.95 }}
                                        title="Desconectar"
                                    >
                                        <LogOut className="w-5 h-5 text-red-400" />
                                    </motion.button>
                                </div>
                            </div>
                            <p className="mt-2 text-zinc-400 max-w-lg text-lg hidden md:block">
                                Series que estás viendo actualmente con su progreso.
                            </p>
                        </div>

                        {/* Stats cards on the right (same as History) */}
                        <motion.div
                            className="flex gap-3 md:gap-4 w-full lg:w-auto justify-center lg:justify-end"
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.5, delay: 0.3 }}
                        >
                            <motion.div
                                initial={{ opacity: 0, scale: 0.9 }}
                                animate={{ opacity: 1, scale: 1 }}
                                transition={{ duration: 0.4, delay: 0.5 }}
                            >
                                <StatCard
                                    label="Series"
                                    value={stats?.total ?? 0}
                                    loading={!dataLoaded}
                                    icon={Tv}
                                    colorClass="text-emerald-400 bg-emerald-500/10"
                                />
                            </motion.div>
                            <motion.div
                                initial={{ opacity: 0, scale: 0.9 }}
                                animate={{ opacity: 1, scale: 1 }}
                                transition={{ duration: 0.4, delay: 0.6 }}
                            >
                                <StatCard
                                    label="Progreso Medio"
                                    value={`${stats?.avgProgress ?? 0}%`}
                                    loading={!dataLoaded}
                                    icon={TrendingUp}
                                    colorClass="text-purple-400 bg-purple-500/10"
                                />
                            </motion.div>
                            <motion.div
                                initial={{ opacity: 0, scale: 0.9 }}
                                animate={{ opacity: 1, scale: 1 }}
                                transition={{ duration: 0.4, delay: 0.7 }}
                            >
                                <StatCard
                                    label="Eps. Vistos"
                                    value={stats?.totalEpisodesWatched ?? 0}
                                    loading={!dataLoaded}
                                    icon={Eye}
                                    colorClass="text-sky-400 bg-sky-500/10"
                                />
                            </motion.div>
                            <motion.div
                                initial={{ opacity: 0, scale: 0.9 }}
                                animate={{ opacity: 1, scale: 1 }}
                                transition={{ duration: 0.4, delay: 0.8 }}
                            >
                                <StatCard
                                    label="Eps. Restantes"
                                    value={stats?.totalEpisodesRemaining ?? 0}
                                    loading={!dataLoaded}
                                    icon={Layers}
                                    colorClass="text-amber-400 bg-amber-500/10"
                                />
                            </motion.div>
                        </motion.div>
                    </div>
                </motion.header>

                {/* ========== FILTERS (same pattern as History) ========== */}
                <motion.div
                    ref={(el) => {
                        if (el && !el.dataset.stickySetup) {
                            el.dataset.stickySetup = 'true';
                            const observer = new IntersectionObserver(
                                ([e]) => {
                                    const isStuck = e.intersectionRatio < 1;
                                    if (isStuck) {
                                        el.classList.add('backdrop-blur-xl', 'bg-gradient-to-br', 'from-black/60', 'via-black/50', 'to-black/55');
                                    } else {
                                        el.classList.remove('backdrop-blur-xl', 'bg-gradient-to-br', 'from-black/60', 'via-black/50', 'to-black/55');
                                    }
                                },
                                { threshold: [1], rootMargin: '-65px 0px 0px 0px' }
                            );
                            observer.observe(el);
                        }
                    }}
                    className="sticky top-16 z-[60] space-y-1 mb-3 p-2 rounded-2xl transition-all duration-300"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, delay: 0.5 }}
                >
                    {/* Mobile: search + toggle */}
                    <div className="flex gap-2 lg:hidden">
                        <div className="relative flex-1">
                            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                            <input
                                value={q}
                                onChange={(e) => setQ(e.target.value)}
                                placeholder="Buscar..."
                                className="w-full h-11 bg-zinc-900 border border-zinc-800 rounded-xl pl-10 pr-10 py-2.5 text-sm text-zinc-200 focus:outline-none focus:border-emerald-500/50 transition-all placeholder:text-zinc-600"
                            />
                            {q && (
                                <button
                                    onClick={() => setQ("")}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1 hover:bg-zinc-800 rounded-md transition-colors"
                                >
                                    <X className="w-3.5 h-3.5 text-zinc-500" />
                                </button>
                            )}
                        </div>
                        <button
                            type="button"
                            onClick={() => setMobileFiltersOpen((v) => !v)}
                            className={`h-11 w-11 shrink-0 flex items-center justify-center rounded-xl border transition-all ${mobileFiltersOpen
                                ? "bg-emerald-500/20 border-emerald-500/40 text-emerald-400"
                                : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-zinc-600 hover:text-zinc-300"
                                }`}
                        >
                            <SlidersHorizontal className="w-4 h-4" />
                        </button>
                    </div>

                    {/* Mobile: collapsible filters */}
                    <AnimatePresence>
                        {mobileFiltersOpen && (
                            <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: "auto", opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.25, ease: "easeInOut" }}
                                className="lg:hidden overflow-visible"
                            >
                                <div className="space-y-3 pt-1">
                                    <div className="flex gap-2">
                                        <div className="flex-1">
                                            <InlineDropdown label="Ordenar" valueLabel={sortLabels[sortBy]} icon={ArrowUpDown}>
                                                {({ close }) => (
                                                    <>
                                                        {Object.entries(sortLabels).map(([key, label]) => (
                                                            <DropdownItem key={key} active={sortBy === key} onClick={() => { setSortBy(key); close(); }}>
                                                                {label}
                                                            </DropdownItem>
                                                        ))}
                                                    </>
                                                )}
                                            </InlineDropdown>
                                        </div>
                                        <div className="flex bg-zinc-900 rounded-xl p-1 border border-zinc-800 h-11 items-center">
                                            <button
                                                onClick={() => setViewMode("cards")}
                                                className={`h-full px-2.5 rounded-lg text-sm font-bold transition-all flex items-center justify-center ${viewMode === "cards"
                                                    ? "bg-gradient-to-br from-emerald-500 to-emerald-600 text-white shadow-lg shadow-emerald-500/20"
                                                    : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50"
                                                    }`}
                                            >
                                                <Film className="w-4 h-4" />
                                            </button>
                                            <button
                                                onClick={() => setViewMode("compact")}
                                                className={`h-full px-2.5 rounded-lg text-sm font-bold transition-all flex items-center justify-center ${viewMode === "compact"
                                                    ? "bg-gradient-to-br from-emerald-500 to-emerald-600 text-white shadow-lg shadow-emerald-500/20"
                                                    : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50"
                                                    }`}
                                            >
                                                <LayoutList className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* Desktop: Single row */}
                    <div className="hidden lg:flex gap-3">
                        <div className="relative flex-1">
                            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                            <input
                                value={q}
                                onChange={(e) => setQ(e.target.value)}
                                placeholder="Buscar por título..."
                                className="w-full h-11 bg-zinc-900 border border-zinc-800 rounded-xl pl-10 pr-10 py-2.5 text-sm text-zinc-200 focus:outline-none focus:border-emerald-500/50 transition-all placeholder:text-zinc-600"
                            />
                            {q && (
                                <button
                                    onClick={() => setQ("")}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1 hover:bg-zinc-800 rounded-md transition-colors"
                                >
                                    <X className="w-3.5 h-3.5 text-zinc-500" />
                                </button>
                            )}
                        </div>

                        <InlineDropdown label="Ordenar" valueLabel={sortLabels[sortBy]} icon={ArrowUpDown}>
                            {({ close }) => (
                                <>
                                    {Object.entries(sortLabels).map(([key, label]) => (
                                        <DropdownItem key={key} active={sortBy === key} onClick={() => { setSortBy(key); close(); }}>
                                            {label}
                                        </DropdownItem>
                                    ))}
                                </>
                            )}
                        </InlineDropdown>

                        {/* View mode */}
                        <div className="flex gap-1 bg-zinc-900 rounded-xl p-1 border border-zinc-800">
                            <button
                                onClick={() => setViewMode("cards")}
                                className={`p-2 rounded-lg transition ${viewMode === "cards"
                                    ? "bg-gradient-to-br from-emerald-500 to-emerald-600 text-white shadow-lg shadow-emerald-500/20"
                                    : "text-zinc-500 hover:text-white hover:bg-zinc-800"
                                    }`}
                                title="Tarjetas"
                            >
                                <Film className="w-4 h-4" />
                            </button>
                            <button
                                onClick={() => setViewMode("compact")}
                                className={`p-2 rounded-lg transition ${viewMode === "compact"
                                    ? "bg-gradient-to-br from-emerald-500 to-emerald-600 text-white shadow-lg shadow-emerald-500/20"
                                    : "text-zinc-500 hover:text-white hover:bg-zinc-800"
                                    }`}
                                title="Compacto"
                            >
                                <LayoutList className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                </motion.div>

                {/* ========== CONTENT ========== */}

                {/* Loading state */}
                {loading && (
                    <div className={viewMode === "cards"
                        ? "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 lg:gap-6"
                        : "space-y-2"
                    }>
                        {Array.from({ length: 6 }).map((_, i) => (
                            <SkeletonCard key={i} viewMode={viewMode} />
                        ))}
                    </div>
                )}

                {/* Empty state */}
                {!loading && filtered.length === 0 && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="flex flex-col items-center justify-center py-20 text-center"
                    >
                        <div className="w-16 h-16 mb-4 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center">
                            <Tv className="w-8 h-8 text-zinc-600" />
                        </div>
                        <h3 className="text-lg font-bold text-zinc-400 mb-2">
                            {q ? "Sin resultados" : "No tienes series en progreso"}
                        </h3>
                        <p className="text-sm text-zinc-600 max-w-sm">
                            {q
                                ? `No se encontraron series que coincidan con "${q}"`
                                : "Empieza a ver una serie y márcala en Trakt para verla aquí."
                            }
                        </p>
                    </motion.div>
                )}

                {/* Items */}
                {!loading && filtered.length > 0 && (
                    <AnimatePresence mode="popLayout">
                        {viewMode === "cards" ? (
                            <motion.div
                                key="cards-grid"
                                className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 lg:gap-6"
                                layout
                            >
                                {filtered.map((item, idx) => (
                                    <InProgressCard
                                        key={item.tmdbId}
                                        item={item}
                                        index={idx}
                                        viewMode="cards"
                                    />
                                ))}
                            </motion.div>
                        ) : (
                            <motion.div
                                key="compact-list"
                                className="space-y-2"
                                layout
                            >
                                {filtered.map((item, idx) => (
                                    <InProgressCard
                                        key={item.tmdbId}
                                        item={item}
                                        index={idx}
                                        viewMode="compact"
                                    />
                                ))}
                            </motion.div>
                        )}
                    </AnimatePresence>
                )}
            </div>

            {/* ========== DISCONNECT MODAL ========== */}
            <AnimatePresence>
                {showDisconnectModal && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center px-4"
                        onClick={() => setShowDisconnectModal(false)}
                    >
                        <motion.div
                            initial={{ scale: 0.95, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.95, opacity: 0 }}
                            className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 max-w-sm w-full text-center"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <LogOut className="w-10 h-10 text-red-500 mx-auto mb-4" />
                            <h3 className="text-lg font-bold text-white mb-2">¿Desconectar Trakt?</h3>
                            <p className="text-sm text-zinc-400 mb-6">Se eliminará la conexión con tu cuenta de Trakt.</p>
                            <div className="flex gap-3">
                                <button
                                    onClick={() => setShowDisconnectModal(false)}
                                    className="flex-1 py-2.5 rounded-xl bg-zinc-800 text-white font-semibold text-sm hover:bg-zinc-700 transition"
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={handleDisconnect}
                                    className="flex-1 py-2.5 rounded-xl bg-red-600 text-white font-semibold text-sm hover:bg-red-500 transition"
                                >
                                    Desconectar
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
