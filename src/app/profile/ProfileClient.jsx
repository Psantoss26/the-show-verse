"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import {
  Film, Tv, Clock, Star, Heart, Users, BookMarked, Trophy,
  Calendar, MapPin, ExternalLink, Play, Eye, TrendingUp,
  Activity, Library, ChevronRight, Loader2, UserX, Zap,
} from "lucide-react";

// ─── helpers ────────────────────────────────────────────────────────────────
const tmdbImg = (path, size = "w342") =>
  path ? `https://image.tmdb.org/t/p/${size}${path}` : null;

const fmtDate = (iso) => {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("es-ES", {
    day: "numeric", month: "short", year: "numeric",
  });
};

const fmtDateShort = (iso) => {
  if (!iso) return "—";
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

// ─── sub-components ─────────────────────────────────────────────────────────

function StatPill({ icon: Icon, label, value, color = "#6366f1" }) {
  return (
    <div className="flex flex-col items-center gap-1 p-4 rounded-2xl bg-white/5 border border-white/5 hover:bg-white/10 transition-all">
      <div className="p-2 rounded-xl" style={{ background: `${color}20` }}>
        <Icon className="w-5 h-5" style={{ color }} />
      </div>
      <span className="text-xl font-black text-white">{value ?? "—"}</span>
      <span className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold">{label}</span>
    </div>
  );
}

function SectionHeader({ icon: Icon, title, href, color = "#6366f1" }) {
  return (
    <div className="flex items-center justify-between mb-4">
      <div className="flex items-center gap-2">
        <div className="p-1.5 rounded-lg" style={{ background: `${color}20` }}>
          <Icon className="w-4 h-4" style={{ color }} />
        </div>
        <h2 className="text-base font-bold text-white">{title}</h2>
      </div>
      {href && (
        <Link href={href} className="flex items-center gap-1 text-xs text-zinc-500 hover:text-white transition-colors">
          Ver todo <ChevronRight className="w-3 h-3" />
        </Link>
      )}
    </div>
  );
}

function PosterCard({ item, showRating = false, showDate = false, dateField = "watched_at" }) {
  const [imgErr, setImgErr] = useState(false);
  const src = tmdbImg(item.poster_path, "w185");
  const href = item.detailsHref || "#";

  return (
    <Link href={href} className="group flex-shrink-0 w-28 relative">
      <div className="aspect-[2/3] rounded-xl overflow-hidden bg-zinc-800 border border-white/5 group-hover:border-white/20 transition-all group-hover:scale-105 duration-300">
        {src && !imgErr ? (
          <img src={src} alt={item.title} className="w-full h-full object-cover" onError={() => setImgErr(true)} />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            {item.type === "movie" ? <Film className="w-8 h-8 text-zinc-600" /> : <Tv className="w-8 h-8 text-zinc-600" />}
          </div>
        )}
        {showRating && item.rating && (
          <div className="absolute top-1.5 right-1.5 w-7 h-7 rounded-full flex items-center justify-center text-xs font-black text-white shadow-lg"
            style={{ background: starColor(item.rating) }}>
            {item.rating}
          </div>
        )}
      </div>
      <div className="mt-1.5 px-0.5">
        <p className="text-xs font-semibold text-white truncate leading-tight">{item.title}</p>
        {showDate && (
          <p className="text-[10px] text-zinc-500 mt-0.5">{fmtDateShort(item[dateField])}</p>
        )}
        {item.episode && (
          <p className="text-[10px] text-zinc-500 truncate">
            T{item.episode.season}E{item.episode.number}
          </p>
        )}
      </div>
    </Link>
  );
}

function HorizontalScroll({ children }) {
  return (
    <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-none" style={{ scrollbarWidth: "none" }}>
      {children}
    </div>
  );
}

function NotConnected() {
  return (
    <div className="min-h-screen bg-[#0a0a0a] flex flex-col items-center justify-center p-8">
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-indigo-600/10 rounded-full blur-[120px]" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-purple-600/10 rounded-full blur-[120px]" />
      </div>
      <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }}
        className="relative z-10 max-w-md w-full text-center">
        <div className="w-20 h-20 rounded-2xl bg-zinc-900 border border-white/10 flex items-center justify-center mx-auto mb-6">
          <UserX className="w-10 h-10 text-zinc-500" />
        </div>
        <h1 className="text-3xl font-black text-white mb-3">Conecta tu cuenta</h1>
        <p className="text-zinc-400 mb-8 text-sm leading-relaxed">
          Para ver tu perfil, historial y estadísticas personalizadas necesitas conectar tu cuenta de Trakt.
        </p>
        <button
          onClick={() => window.location.assign("/api/trakt/auth/start?next=/profile")}
          className="inline-flex items-center gap-2 px-8 py-3 bg-white text-black font-bold rounded-2xl hover:bg-zinc-200 transition-all shadow-lg shadow-white/10">
          <Zap className="w-4 h-4" /> Conectar Trakt
        </button>
        <p className="text-xs text-zinc-600 mt-6">También necesitas iniciar sesión con TMDb para ver tu avatar</p>
      </motion.div>
    </div>
  );
}

function ProfileSkeleton() {
  return (
    <div className="min-h-screen bg-[#0a0a0a] animate-pulse">
      <div className="h-48 bg-zinc-900" />
      <div className="max-w-5xl mx-auto px-4 -mt-16 relative z-10">
        <div className="flex items-end gap-5 mb-8">
          <div className="w-32 h-32 rounded-2xl bg-zinc-800 border-4 border-zinc-900 flex-shrink-0" />
          <div className="flex-1 space-y-3 pb-2">
            <div className="h-7 w-48 rounded-xl bg-zinc-800" />
            <div className="h-4 w-64 rounded-lg bg-zinc-800/60" />
          </div>
        </div>
        <div className="grid grid-cols-4 gap-3 mb-8">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="h-24 rounded-2xl bg-zinc-900" />
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── main ────────────────────────────────────────────────────────────────────
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
        if (res.ok) {
          const json = await res.json();
          if (!ignore) setData(json);
        } else {
          const j = await res.json().catch(() => ({}));
          if (!ignore) setError(j?.error || "Error cargando perfil");
        }
      } catch (e) {
        if (!ignore) setError("Error de red");
      } finally {
        if (!ignore) setLoading(false);
      }
    })();
    return () => { ignore = true; };
  }, []);

  if (loading) return <ProfileSkeleton />;
  if (notConnected) return <NotConnected />;

  const { user, stats, recentHistory, recentRatings, watchlist, collectionCount } = data || {};
  const s = stats || {};
  const movies = s.movies || {};
  const episodes = s.episodes || {};
  const shows = s.shows || {};
  const ratings = s.ratings || {};

  const totalMins = (movies.minutes || 0) + (episodes.minutes || 0);
  const avgRating = ratings.distribution
    ? (() => {
        const dist = ratings.distribution;
        let total = 0, count = 0;
        Object.entries(dist).forEach(([r, c]) => { total += Number(r) * c; count += c; });
        return count > 0 ? (total / count).toFixed(1) : "—";
      })()
    : "—";

  // Banner from first history item with backdrop
  const bannerItem = (recentHistory || []).find(h => h.backdrop_path);
  const bannerSrc = bannerItem ? tmdbImg(bannerItem.backdrop_path, "w1280") : null;

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white pb-24 selection:bg-indigo-500/30">
      {/* Ambient BG */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute top-0 left-0 w-[600px] h-[600px] bg-indigo-600/8 rounded-full blur-[160px]" />
        <div className="absolute bottom-0 right-0 w-[500px] h-[500px] bg-purple-600/8 rounded-full blur-[140px]" />
      </div>

      {/* ── BANNER ── */}
      <div className="relative h-52 md:h-64 overflow-hidden">
        {bannerSrc ? (
          <>
            <img src={bannerSrc} alt="banner" className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-black/40 to-[#0a0a0a]" />
          </>
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-indigo-900/40 via-purple-900/30 to-zinc-900">
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,_var(--tw-gradient-stops))] from-indigo-600/20 via-transparent to-transparent" />
          </div>
        )}
      </div>

      {/* ── CONTENT ── */}
      <div className="relative z-10 max-w-5xl mx-auto px-4 sm:px-6">

        {/* ── HERO SECTION ── */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}
          className="flex flex-col sm:flex-row items-start sm:items-end gap-5 -mt-20 mb-8">
          {/* Avatar */}
          <div className="flex-shrink-0 w-32 h-32 rounded-2xl overflow-hidden border-4 border-[#0a0a0a] bg-zinc-800 shadow-2xl shadow-black/60">
            {user?.avatarUrl ? (
              <img src={user.avatarUrl} alt={user.name} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-indigo-600 to-purple-700">
                <span className="text-4xl font-black text-white">
                  {(user?.name || user?.username || "?")[0].toUpperCase()}
                </span>
              </div>
            )}
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0 sm:pb-1">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <h1 className="text-2xl md:text-3xl font-black text-white truncate">
                {user?.name || user?.username}
              </h1>
              {user?.vip && (
                <span className="px-2 py-0.5 text-[10px] font-black tracking-widest uppercase rounded-full bg-yellow-500/20 text-yellow-400 border border-yellow-500/30">
                  VIP
                </span>
              )}
              {user?.private && (
                <span className="px-2 py-0.5 text-[10px] font-black tracking-widest uppercase rounded-full bg-zinc-700 text-zinc-400">
                  Privado
                </span>
              )}
            </div>
            <p className="text-zinc-500 text-sm mb-2">@{user?.username}</p>
            <div className="flex flex-wrap items-center gap-4 text-xs text-zinc-500">
              {user?.location && (
                <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{user.location}</span>
              )}
              {user?.joined_at && (
                <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />Desde {fmtDate(user.joined_at)}</span>
              )}
              <span className="flex items-center gap-1"><Users className="w-3 h-3" />
                <span className="text-white font-bold">{user?.followers}</span> seguidores ·
                <span className="text-white font-bold">{user?.following}</span> siguiendo
              </span>
            </div>
            {user?.about && (
              <p className="mt-2 text-sm text-zinc-400 line-clamp-2 max-w-xl">{user.about}</p>
            )}
          </div>

          {/* Trakt link */}
          {user?.traktUrl && (
            <a href={user.traktUrl} target="_blank" rel="noopener noreferrer"
              className="flex-shrink-0 flex items-center gap-2 px-4 py-2 rounded-xl bg-zinc-800 border border-white/10 text-sm font-bold hover:bg-zinc-700 transition-all">
              <img src="/logo-Trakt.png" alt="Trakt" className="w-4 h-4 rounded" />
              Ver en Trakt <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </motion.div>

        {/* ── STATS GRID ── */}
        {stats && (
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
            className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3 mb-8">
            <StatPill icon={Film} label="Películas" value={(movies.watched || 0).toLocaleString()} color="#3b82f6" />
            <StatPill icon={Play} label="Plays" value={(movies.plays || 0).toLocaleString()} color="#06b6d4" />
            <StatPill icon={Tv} label="Series" value={(shows.watched || 0).toLocaleString()} color="#a855f7" />
            <StatPill icon={Eye} label="Episodios" value={(episodes.watched || 0).toLocaleString()} color="#ec4899" />
            <StatPill icon={Clock} label="Tiempo" value={fmtMinutes(totalMins)} color="#10b981" />
            <StatPill icon={Star} label="Rating Medio" value={avgRating} color="#f59e0b" />
            <StatPill icon={Library} label="Colección" value={(collectionCount || 0).toLocaleString()} color="#f97316" />
            <StatPill icon={Trophy} label="Valoraciones" value={(ratings.total || 0).toLocaleString()} color="#e879f9" />
          </motion.div>
        )}

        {/* ── RATING DISTRIBUTION ── */}
        {ratings?.distribution && Object.keys(ratings.distribution).length > 0 && (
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
            className="mb-8 p-5 rounded-2xl bg-zinc-900/50 border border-white/5 backdrop-blur-xl">
            <SectionHeader icon={Star} title="Distribución de valoraciones" color="#f59e0b" />
            <div className="flex items-end gap-1.5 h-20">
              {[1,2,3,4,5,6,7,8,9,10].map((r) => {
                const count = ratings.distribution?.[r] || 0;
                const max = Math.max(...Object.values(ratings.distribution || {}));
                const pct = max > 0 ? (count / max) * 100 : 0;
                return (
                  <div key={r} className="flex-1 flex flex-col items-center gap-1">
                    <div className="w-full flex items-end justify-center" style={{ height: 60 }}>
                      <div
                        className="w-full rounded-t-md transition-all duration-500"
                        style={{
                          height: `${Math.max(pct, 2)}%`,
                          background: starColor(r),
                          opacity: count > 0 ? 0.85 : 0.15,
                        }}
                      />
                    </div>
                    <span className="text-[10px] text-zinc-500 font-bold">{r}</span>
                  </div>
                );
              })}
            </div>
            <p className="text-xs text-zinc-600 mt-2 text-right">{ratings.total} valoraciones totales · media {avgRating}/10</p>
          </motion.div>
        )}

        {/* ── GRID MAIN ── */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">

          {/* LEFT: History + Ratings */}
          <div className="lg:col-span-3 space-y-6">

            {/* Recent history */}
            {(recentHistory || []).length > 0 && (
              <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
                className="p-5 rounded-2xl bg-zinc-900/50 border border-white/5 backdrop-blur-xl">
                <SectionHeader icon={Activity} title="Vistos recientemente" href="/history" color="#10b981" />
                <HorizontalScroll>
                  {recentHistory.map((item, i) => (
                    <PosterCard key={`${item.tmdbId}-${i}`} item={item} showDate dateField="watched_at" />
                  ))}
                </HorizontalScroll>
              </motion.div>
            )}

            {/* Recent ratings */}
            {(recentRatings || []).length > 0 && (
              <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}
                className="p-5 rounded-2xl bg-zinc-900/50 border border-white/5 backdrop-blur-xl">
                <SectionHeader icon={Star} title="Valoraciones recientes" href="/stats" color="#f59e0b" />
                <HorizontalScroll>
                  {recentRatings.map((item, i) => (
                    <PosterCard key={`${item.tmdbId}-${i}`} item={item} showRating showDate dateField="rated_at" />
                  ))}
                </HorizontalScroll>
              </motion.div>
            )}
          </div>

          {/* RIGHT: Quick stats + watchlist */}
          <div className="lg:col-span-2 space-y-6">

            {/* Watchlist */}
            {(watchlist || []).length > 0 && (
              <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
                className="p-5 rounded-2xl bg-zinc-900/50 border border-white/5 backdrop-blur-xl">
                <SectionHeader icon={BookMarked} title="Watchlist" href="/watchlist" color="#6366f1" />
                <div className="space-y-2">
                  {watchlist.slice(0, 6).map((item, i) => {
                    const src = tmdbImg(item.poster_path, "w92");
                    return (
                      <Link key={i} href={item.detailsHref || "#"}
                        className="flex items-center gap-3 p-2 rounded-xl hover:bg-white/5 transition-all group">
                        <div className="w-10 h-14 rounded-lg overflow-hidden bg-zinc-800 flex-shrink-0">
                          {src ? (
                            <img src={src} alt={item.title} className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              {item.type === "movie" ? <Film className="w-4 h-4 text-zinc-600" /> : <Tv className="w-4 h-4 text-zinc-600" />}
                            </div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-white truncate group-hover:text-indigo-400 transition-colors">{item.title}</p>
                          <p className="text-xs text-zinc-500">{item.year} · {item.type === "movie" ? "Película" : "Serie"}</p>
                        </div>
                        <ChevronRight className="w-4 h-4 text-zinc-700 group-hover:text-white transition-colors flex-shrink-0" />
                      </Link>
                    );
                  })}
                </div>
              </motion.div>
            )}

            {/* Extra stats card */}
            <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}
              className="p-5 rounded-2xl bg-zinc-900/50 border border-white/5 backdrop-blur-xl">
              <SectionHeader icon={TrendingUp} title="Más estadísticas" href="/stats" color="#a855f7" />
              <div className="space-y-3">
                {[
                  { label: "Temporadas vistas", value: (s.seasons?.watched || 0).toLocaleString(), icon: Tv, color: "#a855f7" },
                  { label: "Comentarios", value: ((movies.comments || 0) + (shows.comments || 0) + (episodes.comments || 0)).toLocaleString(), icon: Heart, color: "#ec4899" },
                  { label: "Colección (películas)", value: (collectionCount || 0).toLocaleString(), icon: Library, color: "#f97316" },
                  { label: "Plays de películas", value: (movies.plays || 0).toLocaleString(), icon: Film, color: "#3b82f6" },
                  { label: "Horas de series", value: `${Math.floor((episodes.minutes || 0) / 60)}h`, icon: Clock, color: "#10b981" },
                ].map(({ label, value, icon: Icon, color }) => (
                  <div key={label} className="flex items-center justify-between gap-3 py-1">
                    <div className="flex items-center gap-2">
                      <Icon className="w-4 h-4 flex-shrink-0" style={{ color }} />
                      <span className="text-sm text-zinc-400">{label}</span>
                    </div>
                    <span className="text-sm font-bold text-white">{value}</span>
                  </div>
                ))}
              </div>
            </motion.div>
          </div>
        </div>

        {/* Error state */}
        {error && (
          <div className="mt-6 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm text-center">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
