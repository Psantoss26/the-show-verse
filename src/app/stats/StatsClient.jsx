"use client";

import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  BarChart3,
  Calendar as CalendarIcon,
  Clock,
  Film,
  Tv,
  TrendingUp,
  Award,
  Sparkles,
  Activity,
  PieChart as PieChartIcon,
  Star,
  Heart,
  Users,
  Trophy,
  Target,
  ArrowUp,
  ArrowDown,
  Timer,
  Share2,
  Library,
  MessageSquare,
  LogIn
} from "lucide-react";
import Link from "next/link";
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
  background: "#18181b", // zinc-900
};

const CHART_THEME = {
  background: "transparent",
  text: "#a1a1aa", // zinc-400
  grid: "#27272a", // zinc-800
  tooltipBg: "#18181b",
  tooltipBorder: "#27272a",
};

const COLOR_STYLES = {
  emerald: { iconBg: "bg-emerald-500/10", iconText: "text-emerald-500", ring: "ring-emerald-500/20", glow: "bg-emerald-500/20", groupGlow: "group-hover:bg-emerald-500/30" },
  blue: { iconBg: "bg-blue-500/10", iconText: "text-blue-500", ring: "ring-blue-500/20", glow: "bg-blue-500/20", groupGlow: "group-hover:bg-blue-500/30" },
  purple: { iconBg: "bg-purple-500/10", iconText: "text-purple-500", ring: "ring-purple-500/20", glow: "bg-purple-500/20", groupGlow: "group-hover:bg-purple-500/30" },
  yellow: { iconBg: "bg-yellow-500/10", iconText: "text-yellow-500", ring: "ring-yellow-500/20", glow: "bg-yellow-500/20", groupGlow: "group-hover:bg-yellow-500/30" },
  pink: { iconBg: "bg-pink-500/10", iconText: "text-pink-500", ring: "ring-pink-500/20", glow: "bg-pink-500/20", groupGlow: "group-hover:bg-pink-500/30" },
  orange: { iconBg: "bg-orange-500/10", iconText: "text-orange-500", ring: "ring-orange-500/20", glow: "bg-orange-500/20", groupGlow: "group-hover:bg-orange-500/30" },
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
      total: 0
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

const processGenreDistribution = (historyData) => {
  const counts = {};
  historyData.forEach((item) => {
    const genres = item.movie?.genres || item.show?.genres || [];
    genres.forEach((g) => {
      counts[g] = (counts[g] || 0) + 1;
    });
  });

  return Object.entries(counts)
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
  const counts = days.map(day => ({ name: day, value: 0 }));

  historyData.forEach(item => {
    const d = new Date(item.watched_at);
    counts[d.getDay()].value++;
  });
  return counts;
};

const processHourOfDay = (historyData) => {
  const counts = Array.from({ length: 24 }, (_, i) => ({ name: `${i}h`, value: 0 }));
  historyData.forEach(item => {
    const d = new Date(item.watched_at);
    counts[d.getHours()].value++;
  });
  return counts;
};

// -----------------------------------------------------------------------------
// COMPONENTS
// -----------------------------------------------------------------------------

function KPICard({ title, value, subtitle, icon: Icon, color, delay = 0 }) {
  const styles = COLOR_STYLES[color] || COLOR_STYLES.emerald;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.5 }}
      className="relative overflow-hidden p-6 rounded-3xl bg-zinc-900/50 border border-white/5 backdrop-blur-xl group hover:bg-zinc-900/80 transition-all duration-300"
    >
      <div className={`absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity ${styles.iconText}`}>
        <Icon className="w-24 h-24 transform rotate-12 -translate-y-4 translate-x-4" />
      </div>

      <div className="relative z-10 flex flex-col h-full justify-between">
        <div className="flex items-center gap-3 mb-4">
          <div className={`p-2.5 rounded-xl ${styles.iconBg} ${styles.iconText} ring-1 ${styles.ring}`}>
            <Icon className="w-6 h-6" />
          </div>
          <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-wider">{title}</h3>
        </div>

        <div>
          <div className="text-4xl font-black text-white tracking-tight leading-none mb-1">
            {value}
          </div>
          {subtitle && (
            <div className="text-sm font-medium text-zinc-500">
              {subtitle}
            </div>
          )}
        </div>
      </div>

      {/* Decorative gradient glow */}
      <div className={`absolute -bottom-10 -left-10 w-32 h-32 rounded-full blur-3xl pointer-events-none transition-all ${styles.glow} ${styles.groupGlow}`} />
    </motion.div>
  );
}

function SectionTitle({ icon: Icon, title, subtitle }) {
  return (
    <div className="flex items-center gap-3 mb-6">
      <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-500">
        <Icon className="w-5 h-5" />
      </div>
      <div>
        <h2 className="text-xl font-bold text-white">{title}</h2>
        {subtitle && <p className="text-sm text-zinc-500">{subtitle}</p>}
      </div>
    </div>
  );
}

function CustomTooltip({ active, payload, label }) {
  if (active && payload && payload.length) {
    return (
      <div className="bg-zinc-950/90 border border-white/10 rounded-xl p-3 shadow-xl backdrop-blur-md z-50">
        <p className="font-bold text-white mb-2 text-sm">{label}</p>
        <div className="space-y-1">
          {payload.map((p, idx) => (
            <div key={idx} className="flex items-center justify-between gap-4 text-xs">
              <span className="flex items-center gap-2" style={{ color: p.color }}>
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color }} />
                {p.name}
              </span>
              <span className="font-mono font-bold text-zinc-300">
                {p.value.toLocaleString()}
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  }
  return null;
}

// -----------------------------------------------------------------------------
// MAIN COMPONENT
// -----------------------------------------------------------------------------
export default function StatsClient() {
  const [loading, setLoading] = useState(true);
  const [notConnected, setNotConnected] = useState(false);
  const [data, setData] = useState(null);
  const [viewMode, setViewMode] = useState("overview"); // overview | patterns | yearly

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await fetch("/api/trakt/user-stats", { cache: "no-store" });
        if (res.status === 401) {
          setNotConnected(true);
          setLoading(false);
          return;
        }
        if (res.ok) {
          const json = await res.json();
          setData(json);
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

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
    const genreData = processGenreDistribution(history);
    const ratingData = processRatings(tStats.ratings?.distribution || {});
    const dayOfWeekData = processDayOfWeek(history);
    const hourOfDayData = processHourOfDay(history);

    const timeDistribution = [
      { name: "Películas", value: movies.minutes || 0, color: COLORS.blue },
      { name: "Series", value: episodes.minutes || 0, color: COLORS.purple },
    ];

    const totalComments = (movies.comments || 0) + (showStats.comments || 0) + (seasons.comments || 0) + (episodes.comments || 0);
    const totalCollected = (movies.collected || 0) + (showStats.collected || 0) + (episodes.collected || 0);

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
      totalComments,
      totalCollected,
      monthlyData,
      genreData,
      ratingData,
      dayOfWeekData,
      hourOfDayData,
      timeDistribution,
      topMovies: (data.watchedMovies || []).sort((a, b) => b.plays - a.plays).slice(0, 5),
      topShows: (data.watchedShows || []).sort((a, b) => b.plays - a.plays).slice(0, 5),
      years: [...new Set(history.map(h => new Date(h.watched_at).getFullYear()))].sort((a, b) => b - a),
      topActors: (data.topActors || []).slice(0, 6)
    };
  }, [data]);

  if (loading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-[#0a0a0a]">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 rounded-full border-4 border-emerald-500/20 border-t-emerald-500 animate-spin" />
          <p className="text-emerald-500/60 font-medium animate-pulse">Cargando datos...</p>
        </div>
      </div>
    );
  }

  // Not Connected State
  if (notConnected) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#0a0a0a] text-white p-4">
        <div className="max-w-md w-full bg-zinc-900 border border-white/10 rounded-3xl p-8 text-center backdrop-blur-xl">
          <div className="w-20 h-20 bg-emerald-500/10 rounded-full flex items-center justify-center mx-auto mb-6 ring-1 ring-emerald-500/20">
            <Activity className="w-10 h-10 text-emerald-500" />
          </div>
          <h2 className="text-3xl font-black text-white mb-3">Conecta tu cuenta</h2>
          <p className="text-zinc-400 mb-8 leading-relaxed">
            Para ver tus estadísticas personales, historial detallado y patrones de visualización, necesitas conectar tu cuenta de Trakt.
          </p>
          <Link
            href="/settings"
            className="block w-full py-4 px-6 bg-emerald-500 hover:bg-emerald-400 text-black font-bold rounded-xl transition-all transform hover:scale-[1.02] shadow-xl shadow-emerald-500/20"
          >
            Ir a Configuración
          </Link>
        </div>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#0a0a0a] text-white">
        <p>No se pudieron cargar las estadísticas.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-zinc-100 pb-20 selection:bg-emerald-500/30">
      {/* Background Ambience */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-0 w-[500px] h-[500px] bg-emerald-500/10 rounded-full blur-[120px] mix-blend-screen" />
        <div className="absolute bottom-0 right-0 w-[500px] h-[500px] bg-purple-500/10 rounded-full blur-[120px] mix-blend-screen" />
      </div>

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">

        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-12"
        >
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="h-px w-12 bg-emerald-500" />
              <span className="text-emerald-500 font-bold uppercase tracking-widest text-xs">Tu Perfil</span>
            </div>
            <h1 className="text-4xl md:text-6xl font-black tracking-tighter text-white">
              Estadísticas
              <span className="text-emerald-500">.</span>
            </h1>
            <p className="mt-2 text-zinc-400 max-w-lg text-lg">
              {stats.raw.movies.watched > 0 ? "¡Vaya ritmo llevas!" : "Empieza a marcar lo que ves."}
            </p>
          </div>

          <div className="flex p-1.5 bg-zinc-900/80 backdrop-blur-md rounded-2xl border border-white/5 overflow-x-auto">
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
                    className="absolute inset-0 bg-emerald-500 rounded-xl"
                    transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                  />
                )}
                <span className="relative z-10 flex items-center gap-2">
                  <tab.icon className="w-4 h-4" />
                  {tab.label}
                </span>
              </button>
            ))}
          </div>
        </motion.div>

        <AnimatePresence mode="wait">
          {viewMode === "overview" && (
            <motion.div
              key="overview"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.5 }}
              className="space-y-8"
            >
              {/* KPIs */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <KPICard
                  title="Tiempo Total"
                  value={`${stats.totalDays}d ${stats.totalHours % 24}h`}
                  subtitle={`${stats.totalHours.toLocaleString()} horas`}
                  icon={Timer}
                  color="emerald"
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
                  subtitle={`${stats.raw.shows.watched.toLocaleString()} series`}
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

              {/* Secondary KPIs */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-zinc-900/30 rounded-2xl p-4 flex items-center gap-3 border border-white/5">
                  <div className="p-2 bg-yellow-500/10 rounded-lg text-yellow-500"><Star className="w-5 h-5" /></div>
                  <div>
                    <div className="text-xl font-bold">{stats.ratings.total}</div>
                    <div className="text-xs text-zinc-500 uppercase font-bold">Valoraciones</div>
                  </div>
                </div>
                <div className="bg-zinc-900/30 rounded-2xl p-4 flex items-center gap-3 border border-white/5">
                  <div className="p-2 bg-pink-500/10 rounded-lg text-pink-500"><MessageSquare className="w-5 h-5" /></div>
                  <div>
                    <div className="text-xl font-bold">{stats.totalComments}</div>
                    <div className="text-xs text-zinc-500 uppercase font-bold">Comentarios</div>
                  </div>
                </div>
                <div className="bg-zinc-900/30 rounded-2xl p-4 flex items-center gap-3 border border-white/5">
                  <div className="p-2 bg-blue-500/10 rounded-lg text-blue-500"><Users className="w-5 h-5" /></div>
                  <div>
                    <div className="text-xl font-bold">{stats.network.followers}</div>
                    <div className="text-xs text-zinc-500 uppercase font-bold">Seguidores</div>
                  </div>
                </div>
                <div className="bg-zinc-900/30 rounded-2xl p-4 flex items-center gap-3 border border-white/5">
                  <div className="p-2 bg-red-500/10 rounded-lg text-red-500"><Heart className="w-5 h-5" /></div>
                  <div>
                    <div className="text-xl font-bold">{stats.network.friends}</div>
                    <div className="text-xs text-zinc-500 uppercase font-bold">Amigos</div>
                  </div>
                </div>
              </div>

              {/* Main Charts Row */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                {/* Activity Chart - Spans 2 cols */}
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.2 }}
                  className="lg:col-span-2 bg-zinc-900/50 border border-white/5 rounded-3xl p-6 backdrop-blur-xl relative overflow-hidden"
                >
                  <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none" />
                  <SectionTitle icon={Activity} title="Actividad Mensual" subtitle="Visualizaciones en el último año" />

                  <div className="h-[300px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={stats.monthlyData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                        <defs>
                          <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor={COLORS.emerald} stopOpacity={0.3} />
                            <stop offset="95%" stopColor={COLORS.emerald} stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={CHART_THEME.grid} />
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
                        <Tooltip content={<CustomTooltip />} cursor={{ stroke: 'rgba(255,255,255,0.1)', strokeWidth: 2 }} />
                        <Area
                          type="monotone"
                          dataKey="total"
                          name="Total"
                          stroke={COLORS.emerald}
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
                  <SectionTitle icon={Clock} title="Tiempo" />
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
                            <Cell key={`cell-${index}`} fill={entry.color} stroke="rgba(0,0,0,0)" />
                          ))}
                        </Pie>
                        <Tooltip content={<CustomTooltip />} />
                        <Legend verticalAlign="bottom" height={36} iconType="circle" />
                      </PieChart>
                    </ResponsiveContainer>
                    {/* Center Text */}
                    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none pb-8">
                      <span className="text-3xl font-black text-white">{stats.totalDays}</span>
                      <span className="text-xs uppercase font-bold text-zinc-500 tracking-widest">Días</span>
                    </div>
                  </div>
                </motion.div>
              </div>

              {/* Top Content Row */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Top Movies */}
                <motion.div
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.7 }}
                  className="bg-zinc-900/50 border border-white/5 rounded-3xl p-6"
                >
                  <SectionTitle icon={Film} title="Películas Top" subtitle="Las que más has visto" />
                  <div className="space-y-3">
                    {stats.topMovies.map((item, idx) => (
                      <Link key={idx} href={`/details/movie/${item.movie.ids.tmdb}`} className="flex items-center gap-4 p-3 rounded-xl hover:bg-white/5 transition group">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-black text-sm ${idx === 0 ? 'bg-yellow-500 text-black' : 'bg-white/10 text-zinc-400'}`}>
                          {idx + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <h4 className="font-bold text-zinc-200 truncate group-hover:text-emerald-400 transition">{item.movie.title}</h4>
                          <p className="text-xs text-zinc-500">{item.plays} reproducciones</p>
                        </div>
                        <div className="opacity-0 group-hover:opacity-100 transition text-emerald-500">
                          <ArrowUp className="w-4 h-4 rotate-45" />
                        </div>
                      </Link>
                    ))}
                  </div>
                </motion.div>

                {/* Top Shows */}
                <motion.div
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.7 }}
                  className="bg-zinc-900/50 border border-white/5 rounded-3xl p-6"
                >
                  <SectionTitle icon={Tv} title="Series Top" subtitle="Tus maratones favoritos" />
                  <div className="space-y-3">
                    {stats.topShows.map((item, idx) => (
                      <Link key={idx} href={`/details/tv/${item.show.ids.tmdb}`} className="flex items-center gap-4 p-3 rounded-xl hover:bg-white/5 transition group">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-black text-sm ${idx === 0 ? 'bg-purple-500 text-black' : 'bg-white/10 text-zinc-400'}`}>
                          {idx + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <h4 className="font-bold text-zinc-200 truncate group-hover:text-purple-400 transition">{item.show.title}</h4>
                          <p className="text-xs text-zinc-500">{item.plays} vistos</p>
                        </div>
                        <div className="opacity-0 group-hover:opacity-100 transition text-purple-500">
                          <ArrowUp className="w-4 h-4 rotate-45" />
                        </div>
                      </Link>
                    ))}
                  </div>
                </motion.div>
              </div>

              {/* Top People Row */}
              {stats.topActors.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.65 }}
                  className="bg-zinc-900/50 border border-white/5 rounded-3xl p-6 backdrop-blur-xl"
                >
                  <SectionTitle icon={Users} title="Actores Favoritos" subtitle="Las caras que más ves" />
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-4">
                    {stats.topActors.map((person, idx) => (
                      <Link key={person.id} href={`/details/person/${person.id}`} className="group relative">
                        <div className="aspect-[2/3] rounded-xl overflow-hidden bg-zinc-800 mb-2 border border-white/5 group-hover:border-emerald-500/50 transition-all duration-300">
                          {person.profile_path ? (
                            <img
                              src={`https://image.tmdb.org/t/p/w342${person.profile_path}`}
                              alt={person.name}
                              className="w-full h-full object-cover group-hover:scale-110 transition duration-500"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center bg-zinc-800 text-zinc-600">
                              <Users className="w-8 h-8" />
                            </div>
                          )}
                          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-60 group-hover:opacity-80 transition" />
                          <div className="absolute bottom-0 left-0 right-0 p-2">
                            <p className="text-white text-xs font-bold leading-tight truncate">{person.name}</p>
                            <p className="text-emerald-400 text-[10px] font-medium">{person.count} pelis</p>
                          </div>
                        </div>
                      </Link>
                    ))}
                  </div>
                </motion.div>
              )}

            </motion.div>
          )}

          {viewMode === "patterns" && (
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
                  <SectionTitle icon={Clock} title="Hora del Día" subtitle="¿Cuándo ves más contenido?" />
                  <div className="h-[300px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={stats.hourOfDayData}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={CHART_THEME.grid} />
                        <XAxis dataKey="name" stroke={CHART_THEME.text} tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                        <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.05)' }} />
                        <Bar dataKey="value" fill={COLORS.purple} radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Day of Week */}
                <div className="bg-zinc-900/50 border border-white/5 rounded-3xl p-6 backdrop-blur-xl">
                  <SectionTitle icon={CalendarIcon} title="Día de la Semana" subtitle="Tus días más activos" />
                  <div className="h-[300px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={stats.dayOfWeekData}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={CHART_THEME.grid} />
                        <XAxis dataKey="name" stroke={CHART_THEME.text} tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                        <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.05)' }} />
                        <Bar dataKey="value" fill={COLORS.emerald} radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>

              {/* Genres & Ratings row */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Genres - Radar */}
                <motion.div
                  className="bg-zinc-900/50 border border-white/5 rounded-3xl p-6 backdrop-blur-xl"
                >
                  <SectionTitle icon={Target} title="Gustos por Género" subtitle="Tus categorías más frecuentes" />
                  <div className="h-[300px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <RadarChart cx="50%" cy="50%" outerRadius="70%" data={stats.genreData}>
                        <PolarGrid stroke={CHART_THEME.grid} />
                        <PolarAngleAxis dataKey="name" tick={{ fill: CHART_THEME.text, fontSize: 10 }} />
                        <PolarRadiusAxis angle={30} domain={[0, 'auto']} tick={false} axisLine={false} />
                        <Radar
                          name="Géneros"
                          dataKey="value"
                          stroke={COLORS.blue}
                          fill={COLORS.blue}
                          fillOpacity={0.4}
                        />
                        <Tooltip content={<CustomTooltip />} />
                      </RadarChart>
                    </ResponsiveContainer>
                  </div>
                </motion.div>

                {/* Ratings - Bar */}
                <motion.div
                  className="bg-zinc-900/50 border border-white/5 rounded-3xl p-6 backdrop-blur-xl"
                >
                  <SectionTitle icon={Award} title="Tus Puntuaciones" subtitle="Distribución de ratings (1-10)" />
                  <div className="h-[300px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={stats.ratingData} barSize={20}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={CHART_THEME.grid} />
                        <XAxis
                          dataKey="name"
                          stroke={CHART_THEME.text}
                          tick={{ fill: CHART_THEME.text, fontSize: 12 }}
                          axisLine={false}
                          tickLine={false}
                        />
                        <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.05)' }} />
                        <Bar dataKey="value" name="Votos" radius={[4, 4, 0, 0]}>
                          {stats.ratingData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={index > 6 ? COLORS.emerald : index > 4 ? COLORS.yellow : COLORS.red} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </motion.div>
              </div>
            </motion.div>
          )}

          {viewMode === "yearly" && (
            <motion.div
              key="yearly"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.05 }}
              transition={{ duration: 0.4 }}
              className="flex flex-col items-center justify-center py-20 text-center"
            >
              <div className="w-24 h-24 bg-zinc-900 rounded-full border border-white/10 flex items-center justify-center mb-6 relative">
                <div className="absolute inset-0 bg-emerald-500/20 rounded-full blur-xl animate-pulse" />
                <CalendarIcon className="w-10 h-10 text-zinc-400" />
              </div>
              <h2 className="text-3xl font-bold text-white mb-2">Histórico Detallado</h2>
              <p className="text-zinc-500 max-w-md mx-auto mb-8">
                Estamos preparando una vista cronológica completa para que explores tu historia año por año con un nivel de detalle increíble.
              </p>
              <div className="flex gap-2">
                {stats.years.slice(0, 5).map(year => (
                  <span key={year} className="px-4 py-2 rounded-lg bg-zinc-900 border border-white/10 text-zinc-400 font-mono text-sm">
                    {year}
                  </span>
                ))}
                {stats.years.length > 5 && <span className="px-4 py-2 text-zinc-600">...</span>}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

      </div>
    </div>
  );
}
