"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import {
  Film, Tv, Clock, Star, Heart, Users, BookMarked, Trophy,
  Calendar, MapPin, ExternalLink, Play, Eye, TrendingUp,
  Activity, Library, ChevronRight, UserX, Zap, Timer,
  MessageSquare,
} from "lucide-react";

// ─── helpers ────────────────────────────────────────────────────────────────
const tmdbImg = (path, size = "w342") =>
  path ? `https://image.tmdb.org/t/p/${size}${path}` : null;

const fmtDate = (iso) => {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" });
};

const fmtDateShort = (iso) => {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("es-ES", { day: "numeric", month: "short" });
};

const fmtMinutes = (mins) => {
  if (!mins) return "0h";
  const d = Math.floor(mins / 1440);
  const h = Math.floor((mins % 1440) / 60);
  if (d > 0) return `${d}d ${h}h`;
  return `${h}h ${mins % 60}m`;
};

const starColor = (r) => {
  if (r >= 9) return "#f59e0b";
  if (r >= 7) return "#10b981";
  if (r >= 5) return "#6366f1";
  return "#ef4444";
};

// ─── Color tokens matching StatsClient ──────────────────────────────────────
const COLOR_STYLES = {
  cyan:   { iconBg: "bg-cyan-500/10",   iconText: "text-cyan-500",   ring: "ring-cyan-500/20",   glow: "bg-cyan-500/20" },
  blue:   { iconBg: "bg-blue-500/10",   iconText: "text-blue-500",   ring: "ring-blue-500/20",   glow: "bg-blue-500/20" },
  purple: { iconBg: "bg-purple-500/10", iconText: "text-purple-500", ring: "ring-purple-500/20", glow: "bg-purple-500/20" },
  pink:   { iconBg: "bg-pink-500/10",   iconText: "text-pink-500",   ring: "ring-pink-500/20",   glow: "bg-pink-500/20" },
  emerald:{ iconBg: "bg-emerald-500/10",iconText: "text-emerald-500",ring: "ring-emerald-500/20",glow: "bg-emerald-500/20" },
  yellow: { iconBg: "bg-yellow-500/10", iconText: "text-yellow-500", ring: "ring-yellow-500/20", glow: "bg-yellow-500/20" },
  orange: { iconBg: "bg-orange-500/10", iconText: "text-orange-500", ring: "ring-orange-500/20", glow: "bg-orange-500/20" },
  indigo: { iconBg: "bg-indigo-500/10", iconText: "text-indigo-500", ring: "ring-indigo-500/20", glow: "bg-indigo-500/20" },
  rose:   { iconBg: "bg-rose-500/10",   iconText: "text-rose-500",   ring: "ring-rose-500/20",   glow: "bg-rose-500/20" },
  teal:   { iconBg: "bg-teal-500/10",   iconText: "text-teal-500",   ring: "ring-teal-500/20",   glow: "bg-teal-500/20" },
};

// ─── KPI Card — identical to StatsClient ────────────────────────────────────
function KPICard({ title, value, subtitle, icon: Icon, color, delay = 0 }) {
  const s = COLOR_STYLES[color] || COLOR_STYLES.indigo;
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay, duration: 0.5 }}
      className="relative overflow-hidden p-6 rounded-3xl bg-zinc-900/50 border border-white/5 backdrop-blur-xl group hover:bg-zinc-900/80 transition-all duration-300"
    >
      <div className={`absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity ${s.iconText}`}>
        <Icon className="w-24 h-24 transform rotate-12 -translate-y-4 translate-x-4" />
      </div>
      <div className="relative z-10 flex flex-col h-full justify-between">
        <div className="flex items-center gap-3 mb-4">
          <div className={`p-2.5 rounded-xl ${s.iconBg} ${s.iconText} ring-1 ${s.ring}`}>
            <Icon className="w-6 h-6" />
          </div>
          <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-wider">{title}</h3>
        </div>
        <div>
          <div className="text-4xl font-black text-white tracking-tight leading-none mb-1">{value}</div>
          {subtitle && <div className="text-sm font-medium text-zinc-500">{subtitle}</div>}
        </div>
      </div>
      <div className={`absolute -bottom-10 -left-10 w-32 h-32 rounded-full blur-3xl pointer-events-none ${s.glow} group-hover:opacity-30 transition-all`} />
    </motion.div>
  );
}

// ─── Section title — identical to StatsClient ───────────────────────────────
function SectionTitle({ icon: Icon, title, subtitle, color = "indigo", href }) {
  const s = COLOR_STYLES[color] || COLOR_STYLES.indigo;
  return (
    <div className="flex items-center justify-between gap-3 mb-6">
      <div className="flex items-center gap-3">
        <div className={`p-2 rounded-lg border ${s.iconBg} border-white/10 ${s.iconText}`}>
          <Icon className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-white">{title}</h2>
          {subtitle && <p className="text-sm text-zinc-500">{subtitle}</p>}
        </div>
      </div>
      {href && (
        <Link href={href} className="flex items-center gap-1 text-xs text-zinc-500 hover:text-white transition-colors">
          Ver todo <ChevronRight className="w-3 h-3" />
        </Link>
      )}
    </div>
  );
}

// ─── Mini stat chip ──────────────────────────────────────────────────────────
function MiniStat({ icon: Icon, label, value }) {
  return (
    <div className="bg-zinc-900/30 rounded-2xl p-4 flex items-center gap-3 border border-white/5 hover:bg-zinc-900/60 transition-colors">
      <div className="p-2 bg-indigo-500/10 rounded-lg text-indigo-500"><Icon className="w-5 h-5" /></div>
      <div>
        <div className="text-xl font-bold">{value}</div>
        <div className="text-xs text-zinc-500 uppercase font-bold">{label}</div>
      </div>
    </div>
  );
}

// ─── Poster card (horizontal scroll) ────────────────────────────────────────
function PosterCard({ item, showRating, dateField = "watched_at" }) {
  const [err, setErr] = useState(false);
  const src = tmdbImg(item.poster_path, "w185");
  return (
    <Link href={item.detailsHref || "#"} className="group flex-shrink-0 w-28">
      <div className="aspect-[2/3] rounded-xl overflow-hidden bg-zinc-800 border border-white/5 group-hover:border-white/20 group-hover:scale-105 transition-all duration-300 relative">
        {src && !err
          ? <img src={src} alt={item.title} className="w-full h-full object-cover" onError={() => setErr(true)} />
          : <div className="w-full h-full flex items-center justify-center">{item.type === "movie" ? <Film className="w-8 h-8 text-zinc-600" /> : <Tv className="w-8 h-8 text-zinc-600" />}</div>
        }
        {showRating && item.rating && (
          <div className="absolute top-1.5 right-1.5 w-7 h-7 rounded-full flex items-center justify-center text-xs font-black text-white shadow-lg" style={{ background: starColor(item.rating) }}>
            {item.rating}
          </div>
        )}
      </div>
      <div className="mt-1.5 px-0.5">
        <p className="text-xs font-semibold text-white truncate">{item.title}</p>
        <p className="text-[10px] text-zinc-500">{fmtDateShort(item[dateField])}</p>
        {item.episode && <p className="text-[10px] text-zinc-500">T{item.episode.season}·E{item.episode.number}</p>}
      </div>
    </Link>
  );
}

// ─── Not connected (same pattern as StatsClient) ────────────────────────────
function NotConnected() {
  return (
    <div className="min-h-screen bg-[#0a0a0a] text-zinc-100 pb-20">
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-0 w-[500px] h-[500px] bg-blue-500/10 rounded-full blur-[120px] mix-blend-screen" />
        <div className="absolute bottom-0 right-0 w-[500px] h-[500px] bg-purple-500/10 rounded-full blur-[120px] mix-blend-screen" />
      </div>
      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="h-px w-12 bg-indigo-500" />
            <span className="text-indigo-400 font-bold uppercase tracking-widest text-xs">Tu cuenta</span>
          </div>
          <h1 className="text-4xl md:text-6xl font-black tracking-tighter text-white">
            Perfil<span className="text-indigo-500">.</span>
          </h1>
        </motion.div>
        <div className="flex items-center justify-center py-12 lg:py-24">
          <div className="max-w-md w-full flex flex-col items-center justify-center py-12 bg-zinc-900/20 border border-white/5 rounded-3xl text-center px-4 border-dashed">
            <div className="mb-6">
              <img src="/logo-Trakt.png" alt="Trakt" className="w-24 h-24 object-contain shadow-lg shadow-red-500/20 rounded-2xl" />
            </div>
            <h2 className="text-2xl font-bold text-white mb-2">Conecta tu cuenta de Trakt</h2>
            <p className="text-zinc-400 max-w-sm mb-8 text-sm">
              Para ver tu perfil, historial y estadísticas necesitas iniciar sesión con Trakt.
            </p>
            <button
              onClick={() => window.location.assign("/api/trakt/auth/start?next=/profile")}
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

// ─── Skeleton ────────────────────────────────────────────────────────────────
function Skeleton() {
  return (
    <div className="min-h-screen bg-[#0a0a0a] animate-pulse">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
        <div className="h-8 w-48 rounded-xl bg-zinc-800" />
        <div className="flex items-center gap-6">
          <div className="w-32 h-32 rounded-3xl bg-zinc-800" />
          <div className="space-y-3">
            <div className="h-7 w-52 rounded-xl bg-zinc-800" />
            <div className="h-4 w-36 rounded-lg bg-zinc-800/60" />
          </div>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(8)].map((_, i) => <div key={i} className="h-32 rounded-3xl bg-zinc-900" />)}
        </div>
      </div>
    </div>
  );
}

// ─── Main ────────────────────────────────────────────────────────────────────
export default function ProfileClient() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notConnected, setNotConnected] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let ignore = false;
    (async () => {
      try {
        const res = await fetch("/api/trakt/profile", { cache: "no-store" });
        if (res.status === 401) { if (!ignore) setNotConnected(true); return; }
        if (res.ok) { const j = await res.json(); if (!ignore) setData(j); }
        else { const j = await res.json().catch(() => ({})); if (!ignore) setError(j?.error || "Error"); }
      } catch { if (!ignore) setError("Error de red"); }
      finally { if (!ignore) setLoading(false); }
    })();
    return () => { ignore = true; };
  }, []);

  if (loading) return <Skeleton />;
  if (notConnected) return <NotConnected />;

  const { user = {}, stats, recentHistory = [], recentRatings = [], watchlist = [], collectionCount = 0 } = data || {};
  const s = stats || {};
  const movies = s.movies || {};
  const episodes = s.episodes || {};
  const shows = s.shows || {};
  const seasons = s.seasons || {};
  const ratings = s.ratings || {};
  const network = s.network || {};

  const totalMins = (movies.minutes || 0) + (episodes.minutes || 0);
  const totalHours = Math.round(totalMins / 60);

  const avgRating = (() => {
    const dist = ratings.distribution || {};
    let total = 0, count = 0;
    Object.entries(dist).forEach(([r, c]) => { total += Number(r) * c; count += c; });
    return count > 0 ? (total / count).toFixed(1) : "—";
  })();

  const totalComments = (movies.comments || 0) + (shows.comments || 0) + (seasons.comments || 0) + (episodes.comments || 0);

  // Avatar URL — use Trakt avatar
  const avatarUrl = user?.avatarUrl || null;

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-zinc-100 pb-20 selection:bg-indigo-500/30">
      {/* Background Ambience */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-0 w-[500px] h-[500px] bg-blue-500/10 rounded-full blur-[120px] mix-blend-screen" />
        <div className="absolute bottom-0 right-0 w-[500px] h-[500px] bg-purple-500/10 rounded-full blur-[120px] mix-blend-screen" />
      </div>

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">

        {/* ── HEADER (same pattern as Stats) ── */}
        <motion.div
          initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}
          className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-10"
        >
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="h-px w-12 bg-indigo-500" />
              <span className="text-indigo-400 font-bold uppercase tracking-widest text-xs">Tu cuenta</span>
            </div>
            <h1 className="text-4xl md:text-6xl font-black tracking-tighter text-white">
              Perfil<span className="text-indigo-500">.</span>
            </h1>
            <p className="mt-2 text-zinc-400 max-w-lg text-lg hidden md:block">
              Tu actividad y estadísticas en Trakt.
            </p>
          </div>

          {/* User card — avatar BIG, no separate banner */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.1 }}
            className="flex items-center gap-4 p-4 rounded-2xl bg-zinc-900/50 border border-white/5 backdrop-blur-xl"
          >
            {/* Avatar grande */}
            <div className="w-20 h-20 rounded-2xl overflow-hidden flex-shrink-0 ring-2 ring-indigo-500/30">
              {avatarUrl
                ? <img src={avatarUrl} alt={user.name} className="w-full h-full object-cover" />
                : (
                  <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-indigo-600 to-purple-700">
                    <span className="text-3xl font-black text-white">
                      {(user.name || user.username || "?")[0].toUpperCase()}
                    </span>
                  </div>
                )
              }
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-xl font-black text-white truncate">{user.name || user.username}</p>
                {user.vip && <span className="px-2 py-0.5 text-[10px] font-black uppercase rounded-full bg-yellow-500/20 text-yellow-400 border border-yellow-500/30">VIP</span>}
              </div>
              <p className="text-zinc-500 text-sm">@{user.username}</p>
              <div className="flex items-center gap-3 mt-1 text-xs text-zinc-500 flex-wrap">
                {user.location && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{user.location}</span>}
                {user.joined_at && <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />Desde {fmtDate(user.joined_at)}</span>}
                <span className="flex items-center gap-1">
                  <Users className="w-3 h-3" />
                  <span className="text-white font-bold">{user.followers}</span> seg. ·
                  <span className="text-white font-bold">{user.following}</span> sig.
                </span>
              </div>
              {user.about && <p className="mt-1 text-xs text-zinc-400 line-clamp-1 max-w-xs">{user.about}</p>}
            </div>
            {user.traktUrl && (
              <a href={user.traktUrl} target="_blank" rel="noopener noreferrer"
                className="flex-shrink-0 flex items-center gap-1 px-3 py-2 rounded-xl bg-zinc-800 border border-white/10 text-xs font-bold hover:bg-zinc-700 transition-all ml-2">
                <img src="/logo-Trakt.png" alt="Trakt" className="w-4 h-4 rounded" />
                Trakt <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </motion.div>
        </motion.div>

        {/* ── KPI Cards ── */}
        {stats && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <KPICard title="Tiempo Total" value={`${Math.floor(totalHours / 24)}d ${totalHours % 24}h`} subtitle={`${totalHours.toLocaleString()} horas`} icon={Timer} color="cyan" delay={0.1} />
            <KPICard title="Películas" value={(movies.watched || 0).toLocaleString()} subtitle={`${(movies.plays || 0).toLocaleString()} plays`} icon={Film} color="blue" delay={0.2} />
            <KPICard title="Episodios" value={(episodes.watched || 0).toLocaleString()} subtitle={`${(shows.watched || 0).toLocaleString()} series`} icon={Tv} color="purple" delay={0.3} />
            <KPICard title="Colección" value={collectionCount.toLocaleString()} subtitle="Películas guardadas" icon={Library} color="orange" delay={0.4} />
          </div>
        )}

        {/* ── Secondary mini-stats ── */}
        {stats && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <MiniStat icon={Star} label="Valoraciones" value={ratings.total || 0} />
            <MiniStat icon={MessageSquare} label="Comentarios" value={totalComments} />
            <MiniStat icon={Users} label="Seguidores" value={network.followers || user.followers || 0} />
            <MiniStat icon={Heart} label="Amigos" value={network.friends || user.following || 0} />
          </div>
        )}

        {/* ── Rating distribution ── */}
        {ratings?.distribution && Object.keys(ratings.distribution).length > 0 && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.2 }}
            className="bg-zinc-900/50 border border-white/5 rounded-3xl p-6 backdrop-blur-xl relative overflow-hidden mb-6"
          >
            <div className="absolute top-0 right-0 w-64 h-64 bg-yellow-500/5 rounded-full blur-3xl pointer-events-none" />
            <SectionTitle icon={Star} title="Distribución de valoraciones" subtitle={`${ratings.total} valoraciones · media ${avgRating}/10`} color="yellow" />
            <div className="flex items-end gap-1.5 h-20">
              {[1,2,3,4,5,6,7,8,9,10].map((r) => {
                const count = ratings.distribution?.[r] || 0;
                const max = Math.max(...Object.values(ratings.distribution || {}), 1);
                const pct = (count / max) * 100;
                return (
                  <div key={r} className="flex-1 flex flex-col items-center gap-1">
                    <div className="w-full flex items-end justify-center" style={{ height: 60 }}>
                      <div className="w-full rounded-t-md transition-all duration-700"
                        style={{ height: `${Math.max(pct, 2)}%`, background: starColor(r), opacity: count > 0 ? 0.85 : 0.15 }} />
                    </div>
                    <span className="text-[10px] text-zinc-500 font-bold">{r}</span>
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}

        {/* ── Recent History ── */}
        {recentHistory.length > 0 && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.25 }}
            className="bg-zinc-900/50 border border-white/5 rounded-3xl p-6 backdrop-blur-xl relative overflow-hidden mb-6"
          >
            <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none" />
            <SectionTitle icon={Activity} title="Vistos recientemente" subtitle="Tus últimas visualizaciones" color="emerald" href="/history" />
            <div className="flex gap-3 overflow-x-auto pb-2 no-scrollbar">
              {recentHistory.map((item, i) => <PosterCard key={i} item={item} dateField="watched_at" />)}
            </div>
          </motion.div>
        )}

        {/* ── Recent Ratings ── */}
        {recentRatings.length > 0 && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.3 }}
            className="bg-zinc-900/50 border border-white/5 rounded-3xl p-6 backdrop-blur-xl relative overflow-hidden mb-6"
          >
            <div className="absolute top-0 right-0 w-64 h-64 bg-yellow-500/5 rounded-full blur-3xl pointer-events-none" />
            <SectionTitle icon={Star} title="Últimas valoraciones" subtitle="Lo que has puntuado recientemente" color="yellow" href="/stats" />
            <div className="flex gap-3 overflow-x-auto pb-2 no-scrollbar">
              {recentRatings.map((item, i) => <PosterCard key={i} item={item} showRating dateField="rated_at" />)}
            </div>
          </motion.div>
        )}

        {/* ── Watchlist ── */}
        {watchlist.length > 0 && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.35 }}
            className="bg-zinc-900/50 border border-white/5 rounded-3xl p-6 backdrop-blur-xl relative overflow-hidden"
          >
            <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/5 rounded-full blur-3xl pointer-events-none" />
            <SectionTitle icon={BookMarked} title="Watchlist" subtitle="Títulos que quieres ver" color="indigo" href="/watchlist" />
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {watchlist.map((item, i) => {
                const src = tmdbImg(item.poster_path, "w92");
                return (
                  <Link key={i} href={item.detailsHref || "#"}
                    className="flex items-center gap-3 p-3 rounded-2xl bg-zinc-800/40 border border-white/5 hover:bg-zinc-800/80 hover:border-white/10 transition-all group">
                    <div className="w-10 h-14 rounded-lg overflow-hidden bg-zinc-700 flex-shrink-0">
                      {src ? <img src={src} alt={item.title} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center">{item.type === "movie" ? <Film className="w-4 h-4 text-zinc-500" /> : <Tv className="w-4 h-4 text-zinc-500" />}</div>}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-white truncate group-hover:text-indigo-400 transition-colors">{item.title}</p>
                      <p className="text-xs text-zinc-500">{item.year} · {item.type === "movie" ? "Película" : "Serie"}</p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-zinc-600 group-hover:text-white transition-colors flex-shrink-0" />
                  </Link>
                );
              })}
            </div>
          </motion.div>
        )}

        {error && (
          <div className="mt-6 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm text-center">{error}</div>
        )}
      </div>
    </div>
  );
}
