"use client";
import { Children, useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import { Film, Tv, Clock, Star, Users, BookMarked, Trophy, Calendar, MapPin, ExternalLink, Activity, Library, ChevronRight, Timer, MessageSquare, Heart } from "lucide-react";
import { PosterCard, RankedPosterCard, WatchlistCard, PersonCard } from "./ProfileCards";

const fmtDate = (iso) => iso ? new Date(iso).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" }) : "—";
const fmtMinutes = (m) => { if (!m) return "0h"; const d = Math.floor(m/1440), h = Math.floor((m%1440)/60); return d > 0 ? `${d}d ${h}h` : `${h}h ${m%60}m`; };

const COLORS = {
  cyan:   { bg:"bg-cyan-500/10",   text:"text-cyan-500",   ring:"ring-cyan-500/20",   glow:"bg-cyan-500/20" },
  blue:   { bg:"bg-blue-500/10",   text:"text-blue-500",   ring:"ring-blue-500/20",   glow:"bg-blue-500/20" },
  purple: { bg:"bg-purple-500/10", text:"text-purple-500", ring:"ring-purple-500/20", glow:"bg-purple-500/20" },
  pink:   { bg:"bg-pink-500/10",   text:"text-pink-500",   ring:"ring-pink-500/20",   glow:"bg-pink-500/20" },
  emerald:{ bg:"bg-emerald-500/10",text:"text-emerald-500",ring:"ring-emerald-500/20",glow:"bg-emerald-500/20" },
  yellow: { bg:"bg-yellow-500/10", text:"text-yellow-500", ring:"ring-yellow-500/20", glow:"bg-yellow-500/20" },
  orange: { bg:"bg-orange-500/10", text:"text-orange-500", ring:"ring-orange-500/20", glow:"bg-orange-500/20" },
  indigo: { bg:"bg-indigo-500/10", text:"text-indigo-500", ring:"ring-indigo-500/20", glow:"bg-indigo-500/20" },
  rose:   { bg:"bg-rose-500/10",   text:"text-rose-500",   ring:"ring-rose-500/20",   glow:"bg-rose-500/20" },
};

function KPICard({ title, value, subtitle, icon: Icon, color, delay = 0 }) {
  const s = COLORS[color] || COLORS.indigo;
  return (
    <motion.div initial={{ opacity:0, y:20 }} animate={{ opacity:1, y:0 }} transition={{ delay, duration:0.5 }}
      className="relative overflow-hidden p-6 rounded-3xl bg-zinc-900/50 border border-white/5 backdrop-blur-xl group hover:bg-zinc-900/80 transition-all duration-300">
      <div className={`absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity ${s.text}`}>
        <Icon className="w-24 h-24 transform rotate-12 -translate-y-4 translate-x-4" />
      </div>
      <div className="relative z-10 flex flex-col h-full justify-between">
        <div className="flex items-center gap-3 mb-4">
          <div className={`p-2.5 rounded-xl ${s.bg} ${s.text} ring-1 ${s.ring}`}><Icon className="w-6 h-6" /></div>
          <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-wider">{title}</h3>
        </div>
        <div>
          <div className="text-4xl font-black text-white tracking-tight leading-none mb-1">{value}</div>
          {subtitle && <div className="text-sm font-medium text-zinc-500">{subtitle}</div>}
        </div>
      </div>
      <div className={`absolute -bottom-10 -left-10 w-32 h-32 rounded-full blur-3xl pointer-events-none ${s.glow} opacity-20 group-hover:opacity-30 transition-all`} />
    </motion.div>
  );
}

function SectionTitle({ icon: Icon, title, subtitle, color = "indigo", href }) {
  const s = COLORS[color] || COLORS.indigo;
  return (
    <div className="flex items-center justify-between gap-3 mb-6">
      <div className="flex items-center gap-3">
        <div className={`p-2 rounded-lg border ${s.bg} border-white/10 ${s.text}`}><Icon className="w-5 h-5" /></div>
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

const starColor = (r) => r >= 9 ? "#f59e0b" : r >= 7 ? "#10b981" : r >= 5 ? "#6366f1" : "#ef4444";

function ProfileCarousel({ children }) {
  const scrollerRef = useRef(null);
  const [isHoveredRow, setIsHoveredRow] = useState(false);
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(false);
  const slides = Children.toArray(children);

  const updateNav = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const maxScrollLeft = Math.max(el.scrollWidth - el.clientWidth, 0);
    setCanPrev(el.scrollLeft > 1);
    setCanNext(el.scrollLeft < maxScrollLeft - 1);
  }, []);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return undefined;

    const refresh = () => updateNav();
    const raf = requestAnimationFrame(refresh);
    const timeout = window.setTimeout(refresh, 250);
    const resizeObserver = new ResizeObserver(refresh);
    resizeObserver.observe(el);

    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(timeout);
      resizeObserver.disconnect();
    };
  }, [slides.length, updateNav]);

  const handlePrevClick = useCallback(
    (e) => {
      e.preventDefault();
      e.stopPropagation();
      const el = scrollerRef.current;
      if (!el) return;
      el.scrollBy({ left: -Math.round(el.clientWidth * 0.85), behavior: "smooth" });
    },
    [],
  );

  const handleNextClick = useCallback(
    (e) => {
      e.preventDefault();
      e.stopPropagation();
      const el = scrollerRef.current;
      if (!el) return;
      el.scrollBy({ left: Math.round(el.clientWidth * 0.85), behavior: "smooth" });
    },
    [],
  );

  const showPrev = isHoveredRow && canPrev;
  const showNext = isHoveredRow && canNext;

  return (
    <div
      className="relative"
      onMouseEnter={() => setIsHoveredRow(true)}
      onMouseLeave={() => setIsHoveredRow(false)}
    >
      <div
        ref={scrollerRef}
        onScroll={updateNav}
        className="no-scrollbar flex gap-3 overflow-x-auto overflow-y-hidden pb-2 scroll-smooth overscroll-x-contain sm:gap-3.5 md:gap-4 lg:gap-[18px] xl:gap-5"
        style={{ scrollbarWidth: "none" }}
      >
        {slides.map((child, idx) => (
          <div
            key={child?.key || idx}
            className="relative min-w-0 flex-none basis-[calc((100%_-_24px)/3)] sm:basis-[calc((100%_-_42px)/4)] md:basis-[calc((100%_-_64px)/5)] lg:basis-[calc((100%_-_72px)/5)] xl:basis-[calc((100%_-_80px)/5)]"
          >
            {child}
          </div>
        ))}
      </div>

      <AnimatePresence>
        {showPrev && (
          <motion.button
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            type="button"
            onClick={handlePrevClick}
            className="absolute inset-y-0 left-0 z-30 hidden w-24 items-center justify-start bg-gradient-to-r from-black/90 via-black/70 to-transparent text-white transition-all duration-300 hover:from-black/95 hover:via-black/80 pointer-events-auto sm:flex group/nav"
            aria-label="Anterior"
          >
            <motion.span
              className="ml-5 text-4xl font-bold drop-shadow-[0_0_12px_rgba(0,0,0,0.95)] transition-transform group-hover/nav:scale-110"
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
            className="absolute inset-y-0 right-0 z-30 hidden w-24 items-center justify-end bg-gradient-to-l from-black/90 via-black/70 to-transparent text-white transition-all duration-300 hover:from-black/95 hover:via-black/80 pointer-events-auto sm:flex group/nav"
            aria-label="Siguiente"
          >
            <motion.span
              className="mr-5 text-4xl font-bold drop-shadow-[0_0_12px_rgba(0,0,0,0.95)] transition-transform group-hover/nav:scale-110"
              whileHover={{ x: 4 }}
            >
              ›
            </motion.span>
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}

function NotConnected() {
  return (
    <div className="min-h-screen bg-[#0a0a0a] text-zinc-100 pb-20">
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-0 w-[500px] h-[500px] bg-blue-500/10 rounded-full blur-[120px] mix-blend-screen" />
        <div className="absolute bottom-0 right-0 w-[500px] h-[500px] bg-purple-500/10 rounded-full blur-[120px] mix-blend-screen" />
      </div>
      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <motion.div initial={{ opacity:0, y:-20 }} animate={{ opacity:1, y:0 }} className="mb-8">
          <div className="flex items-center gap-3 mb-2"><div className="h-px w-12 bg-indigo-500" /><span className="text-indigo-400 font-bold uppercase tracking-widest text-xs">Tu cuenta</span></div>
          <h1 className="text-4xl md:text-6xl font-black tracking-tighter text-white">Perfil<span className="text-indigo-500">.</span></h1>
        </motion.div>
        <div className="flex items-center justify-center py-24">
          <div className="max-w-md w-full flex flex-col items-center py-12 bg-zinc-900/20 border border-white/5 rounded-3xl text-center px-4 border-dashed">
            <img src="/logo-Trakt.png" alt="Trakt" className="w-24 h-24 object-contain shadow-lg shadow-red-500/20 rounded-2xl mb-6" />
            <h2 className="text-2xl font-bold text-white mb-2">Conecta tu cuenta de Trakt</h2>
            <p className="text-zinc-400 max-w-sm mb-8 text-sm">Para ver tu perfil y estadísticas necesitas iniciar sesión con Trakt.</p>
            <button onClick={() => window.location.assign("/api/trakt/auth/start?next=/profile")} className="px-8 py-3 bg-white text-black font-bold rounded-xl hover:bg-zinc-200 transition shadow-lg">Conectar ahora</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Skeleton() {
  return (
    <div className="min-h-screen bg-[#0a0a0a] animate-pulse">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
        <div className="h-16 w-64 rounded-2xl bg-zinc-800" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">{[...Array(4)].map((_, i) => <div key={i} className="h-32 rounded-3xl bg-zinc-900" />)}</div>
        <div className="h-48 rounded-3xl bg-zinc-900" />
        <div className="h-48 rounded-3xl bg-zinc-900" />
      </div>
    </div>
  );
}

export default function ProfileClient() {
  // Phase 1: user info only (fast — 1 API call)
  const [user, setUser] = useState(null);
  // Phase 2: full data
  const [data, setData] = useState(null);
  const [notConnected, setNotConnected] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let ignore = false;

    async function loadProfile() {
      // ── Phase 1: fetch user only (~1 Trakt call, very fast) ──────────
      try {
        const res = await fetch("/api/trakt/profile?userOnly=1", { cache: "no-store" });
        if (res.status === 401) { if (!ignore) setNotConnected(true); return; }
        if (res.ok) {
          const j = await res.json();
          if (!ignore) setUser(j?.user ?? null);
        }
      } catch { /* skip — phase 2 will set error if needed */ }

      // ── Phase 2: fetch full profile in background ─────────────────────
      try {
        const res = await fetch("/api/trakt/profile", { cache: "no-store" });
        if (res.status === 401) { if (!ignore) setNotConnected(true); return; }
        if (res.ok) {
          const j = await res.json();
          if (!ignore) { setData(j); setUser(j?.user ?? null); }
        } else {
          const j = await res.json().catch(() => ({}));
          if (!ignore) setError(j?.error || "Error");
        }
      } catch { if (!ignore) setError("Error de red"); }
    }

    loadProfile();
    return () => { ignore = true; };
  }, []);

  // Show skeleton only before ANY data (user or full) is available
  const loading = !user && !notConnected && !error;
  if (notConnected) return <NotConnected />;

  const { user = {}, stats, recentHistory = [], recentRatings = [], watchlist = [], topMovies = [], topShows = [], topActors = [], topDirectors = [], collectionCount = 0 } = data || {};
  const s = stats || {};
  const movies = s.movies || {};
  const episodes = s.episodes || {};
  const shows = s.shows || {};
  const ratings = s.ratings || {};
  const totalMins = (movies.minutes || 0) + (episodes.minutes || 0);
  const totalHours = Math.round(totalMins / 60);
  const totalComments = (movies.comments || 0) + (shows.comments || 0) + (episodes.comments || 0);

  const avgRating = (() => {
    const dist = ratings.distribution || {};
    let total = 0, count = 0;
    Object.entries(dist).forEach(([r, c]) => { total += Number(r) * c; count += c; });
    return count > 0 ? (total / count).toFixed(1) : "—";
  })();

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-zinc-100 pb-20 selection:bg-indigo-500/30">
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-0 w-[500px] h-[500px] bg-blue-500/10 rounded-full blur-[120px] mix-blend-screen" />
        <div className="absolute bottom-0 right-0 w-[500px] h-[500px] bg-purple-500/10 rounded-full blur-[120px] mix-blend-screen" />
      </div>

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">

        {/* Header */}
        <motion.div initial={{ opacity:0, y:-20 }} animate={{ opacity:1, y:0 }}
          className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-10">
          <div>
            <div className="flex items-center gap-3 mb-2"><div className="h-px w-12 bg-indigo-500" /><span className="text-indigo-400 font-bold uppercase tracking-widest text-xs">Tu cuenta</span></div>
            <h1 className="text-4xl md:text-6xl font-black tracking-tighter text-white">Perfil<span className="text-indigo-500">.</span></h1>
            <p className="mt-2 text-zinc-400 max-w-lg text-lg hidden md:block">Tu actividad y estadísticas en Trakt.</p>
          </div>
          {/* User card */}
          <motion.div initial={{ opacity:0, scale:0.95 }} animate={{ opacity:1, scale:1 }} transition={{ delay:0.1 }}
            className="flex items-center gap-4 p-4 rounded-2xl bg-zinc-900/50 border border-white/5 backdrop-blur-xl">
            <div className="w-20 h-20 rounded-2xl overflow-hidden flex-shrink-0 ring-2 ring-indigo-500/30 shadow-2xl shadow-indigo-500/10">
              {user.avatarUrl
                ? <img src={user.avatarUrl} alt={user.name} className="w-full h-full object-cover" />
                : <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-indigo-600 to-purple-700"><span className="text-3xl font-black text-white">{(user.name || user.username || "?")[0].toUpperCase()}</span></div>
              }
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-0.5">
                <p className="text-xl font-black text-white truncate">{user.name || user.username}</p>
                {user.vip && <span className="px-2 py-0.5 text-[10px] font-black uppercase rounded-full bg-yellow-500/20 text-yellow-400 border border-yellow-500/30">VIP</span>}
              </div>
              <p className="text-zinc-500 text-sm">@{user.username}</p>
              <div className="flex items-center gap-3 mt-1 text-xs text-zinc-500 flex-wrap">
                {user.location && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{user.location}</span>}
                {user.joined_at && <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />Desde {fmtDate(user.joined_at)}</span>}
                <span className="flex items-center gap-1"><Users className="w-3 h-3" /><span className="text-white font-bold">{user.followers}</span> seg. · <span className="text-white font-bold">{user.following}</span> sig.</span>
              </div>
              {user.about && <p className="mt-1 text-xs text-zinc-400 line-clamp-1 max-w-xs">{user.about}</p>}
            </div>
            {user.traktUrl && (
              <a href={user.traktUrl} target="_blank" rel="noopener noreferrer" className="flex-shrink-0 flex items-center gap-1 px-3 py-2 rounded-xl bg-zinc-800 border border-white/10 text-xs font-bold hover:bg-zinc-700 transition-all ml-2">
                <img src="/logo-Trakt.png" alt="Trakt" className="w-4 h-4 rounded" />Trakt <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </motion.div>
        </motion.div>

        {/* KPI Cards */}
        {stats && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <KPICard title="Tiempo Total" value={`${Math.floor(totalHours/24)}d ${totalHours%24}h`} subtitle={`${totalHours.toLocaleString()} horas`} icon={Timer} color="cyan" delay={0.1} />
            <KPICard title="Películas" value={(movies.watched||0).toLocaleString()} subtitle={`${(movies.plays||0).toLocaleString()} plays`} icon={Film} color="blue" delay={0.2} />
            <KPICard title="Episodios" value={(episodes.watched||0).toLocaleString()} subtitle={`${(shows.watched||0).toLocaleString()} series`} icon={Tv} color="purple" delay={0.3} />
            <KPICard title="Colección" value={collectionCount.toLocaleString()} subtitle="Películas guardadas" icon={Library} color="orange" delay={0.4} />
          </div>
        )}

        {/* Mini stats */}
        {stats && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
            {[
              { icon:Star,         label:"Valoraciones",  value:ratings.total||0 },
              { icon:MessageSquare,label:"Comentarios",   value:totalComments },
              { icon:Users,        label:"Seguidores",    value:user.followers||0 },
              { icon:Heart,        label:"Siguiendo",     value:user.following||0 },
            ].map(({ icon:Icon, label, value }) => (
              <div key={label} className="bg-zinc-900/30 rounded-2xl p-4 flex items-center gap-3 border border-white/5 hover:bg-zinc-900/60 transition-colors">
                <div className="p-2 bg-indigo-500/10 rounded-lg text-indigo-500"><Icon className="w-5 h-5" /></div>
                <div><div className="text-xl font-bold">{value.toLocaleString()}</div><div className="text-xs text-zinc-500 uppercase font-bold">{label}</div></div>
              </div>
            ))}
          </div>
        )}

        {/* Rating distribution */}
        {ratings?.distribution && Object.keys(ratings.distribution).length > 0 && (
          <motion.div initial={{ opacity:0, scale:0.95 }} animate={{ opacity:1, scale:1 }} transition={{ delay:0.2 }}
            className="bg-zinc-900/50 border border-white/5 rounded-3xl p-6 backdrop-blur-xl relative overflow-hidden mb-6">
            <div className="absolute top-0 right-0 w-64 h-64 bg-yellow-500/5 rounded-full blur-3xl pointer-events-none" />
            <SectionTitle icon={Star} title="Distribución de valoraciones" subtitle={`${ratings.total} valoraciones · media ${avgRating}/10`} color="yellow" />
            <div className="flex items-end gap-1.5 h-20">
              {[1,2,3,4,5,6,7,8,9,10].map((r) => {
                const count = ratings.distribution?.[r] || 0;
                const max = Math.max(...Object.values(ratings.distribution || {}), 1);
                return (
                  <div key={r} className="flex-1 flex flex-col items-center gap-1">
                    <div className="w-full flex items-end justify-center" style={{ height:60 }}>
                      <div className="w-full rounded-t-md transition-all duration-700" style={{ height:`${Math.max((count/max)*100,2)}%`, background:starColor(r), opacity:count>0?0.85:0.15 }} />
                    </div>
                    <span className="text-[10px] text-zinc-500 font-bold">{r}</span>
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}

        {/* Recent History */}
        {recentHistory.length > 0 && (
          <motion.div initial={{ opacity:0, scale:0.95 }} animate={{ opacity:1, scale:1 }} transition={{ delay:0.25 }}
            className="bg-zinc-900/50 border border-white/5 rounded-3xl p-6 backdrop-blur-xl relative mb-6">
            <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none" />
            <SectionTitle icon={Activity} title="Vistos recientemente" subtitle="Tus últimas visualizaciones" color="emerald" href="/history" />
            <ProfileCarousel>
              {recentHistory.map((item, i) => <PosterCard key={i} item={item} dateField="watched_at" accentColor="emerald" />)}
            </ProfileCarousel>
          </motion.div>
        )}

        {/* Recent Ratings */}
        {recentRatings.length > 0 && (
          <motion.div initial={{ opacity:0, scale:0.95 }} animate={{ opacity:1, scale:1 }} transition={{ delay:0.3 }}
            className="bg-zinc-900/50 border border-white/5 rounded-3xl p-6 backdrop-blur-xl relative mb-6">
            <div className="absolute top-0 right-0 w-64 h-64 bg-yellow-500/5 rounded-full blur-3xl pointer-events-none" />
            <SectionTitle icon={Star} title="Últimas valoraciones" subtitle="Lo que has puntuado recientemente" color="yellow" href="/stats" />
            <ProfileCarousel>
              {recentRatings.map((item, i) => <PosterCard key={i} item={item} showRating dateField="rated_at" />)}
            </ProfileCarousel>
          </motion.div>
        )}

        {/* Top Movies */}
        {topMovies.length > 0 && (
          <motion.div initial={{ opacity:0, x:-20 }} animate={{ opacity:1, x:0 }} transition={{ delay:0.35 }} className="mb-6">
            <SectionTitle icon={Film} title="Películas Top" subtitle="Las que más has visto" color="blue" />
            <ProfileCarousel>
              {topMovies.slice(0, 6).map((item, i) => <RankedPosterCard key={item.movie?.ids?.tmdb||i} item={item} rank={i+1} type="movie" accentColor="blue" />)}
            </ProfileCarousel>
          </motion.div>
        )}

        {/* Top Shows */}
        {topShows.length > 0 && (
          <motion.div initial={{ opacity:0, x:20 }} animate={{ opacity:1, x:0 }} transition={{ delay:0.4 }} className="mb-6">
            <SectionTitle icon={Tv} title="Series Top" subtitle="Tus maratones favoritos" color="purple" />
            <ProfileCarousel>
              {topShows.slice(0, 6).map((item, i) => <RankedPosterCard key={item.show?.ids?.tmdb||i} item={item} rank={i+1} type="show" accentColor="purple" />)}
            </ProfileCarousel>
          </motion.div>
        )}

        {/* Top Actors */}
        {topActors.length > 0 && (
          <motion.div initial={{ opacity:0, y:20 }} animate={{ opacity:1, y:0 }} transition={{ delay:0.65 }}
            className="bg-zinc-900/50 border border-white/5 rounded-3xl p-6 backdrop-blur-xl mb-6">
            <SectionTitle icon={Users} title="Actores Favoritos" subtitle="Las caras que más ves" color="yellow" />
            <ProfileCarousel>
              {topActors.map((p) => <PersonCard key={p.id} person={p} accentColor="yellow" />)}
            </ProfileCarousel>
          </motion.div>
        )}

        {/* Top Directors */}
        {topDirectors.length > 0 && (
          <motion.div initial={{ opacity:0, y:20 }} animate={{ opacity:1, y:0 }} transition={{ delay:0.7 }}
            className="bg-zinc-900/50 border border-white/5 rounded-3xl p-6 backdrop-blur-xl mb-6">
            <SectionTitle icon={Film} title="Directores Favoritos" subtitle="Los cineastas que más sigues" color="rose" />
            <ProfileCarousel>
              {topDirectors.map((p) => <PersonCard key={p.id} person={p} accentColor="rose" />)}
            </ProfileCarousel>
          </motion.div>
        )}

        {/* Watchlist */}
        {watchlist.length > 0 && (
          <motion.div initial={{ opacity:0, scale:0.95 }} animate={{ opacity:1, scale:1 }} transition={{ delay:0.4 }}
            className="bg-zinc-900/50 border border-white/5 rounded-3xl p-6 backdrop-blur-xl relative mb-6">
            <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/5 rounded-full blur-3xl pointer-events-none" />
            <SectionTitle icon={BookMarked} title="Watchlist" subtitle="Títulos que quieres ver" color="indigo" href="/watchlist" />
            <ProfileCarousel>
              {watchlist.map((item, i) => <WatchlistCard key={i} item={item} />)}
            </ProfileCarousel>
          </motion.div>
        )}

        {error && <div className="mt-6 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm text-center">{error}</div>}
      </div>
    </div>
  );
}
