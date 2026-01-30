"use client";

import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  BarChart3,
  Calendar,
  Clock,
  Film,
  Tv,
  TrendingUp,
  Award,
  Sparkles,
  Activity,
  PieChart,
  Play,
  Star,
  Heart,
  Eye,
  Users,
  Trophy,
  Target,
} from "lucide-react";
import Link from "next/link";

export default function StatsClient() {
  const [loading, setLoading] = useState(true);
  const [traktStats, setTraktStats] = useState(null);
  const [watchedMovies, setWatchedMovies] = useState([]);
  const [watchedShows, setWatchedShows] = useState([]);
  const [historyData, setHistoryData] = useState([]);
  const [topActors, setTopActors] = useState([]);
  const [topDirectors, setTopDirectors] = useState([]);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [viewMode, setViewMode] = useState("overview");

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/trakt/user-stats", {
        cache: "no-store",
      });

      if (res.ok) {
        const data = await res.json();
        setTraktStats(data.stats);
        setWatchedMovies(data.watchedMovies || []);
        setWatchedShows(data.watchedShows || []);
        setHistoryData(data.history || []);
        setTopActors(data.topActors || []);
        setTopDirectors(data.topDirectors || []);
      }
    } catch (err) {
      console.error("Error loading stats:", err);
    } finally {
      setLoading(false);
    }
  };

  const stats = useMemo(() => {
    if (!traktStats) return null;

    const movies = traktStats.movies || {};
    const shows = traktStats.shows || {};
    const episodes = traktStats.episodes || {};
    const network = traktStats.network || {};
    const ratings = traktStats.ratings || {};

    const moviesMinutes = movies.minutes || 0;
    const episodesMinutes = episodes.minutes || 0;
    const totalMinutes = moviesMinutes + episodesMinutes;
    const totalHours = Math.round(totalMinutes / 60);
    const totalDays = Math.round(totalHours / 24);

    const topMovies = [...watchedMovies]
      .sort((a, b) => b.plays - a.plays)
      .slice(0, 10);

    const topShows = [...watchedShows]
      .sort((a, b) => b.plays - a.plays)
      .slice(0, 10);

    const genreCount = {};
    historyData.forEach((item) => {
      const genres = item.movie?.genres || item.show?.genres || [];
      genres.forEach((genre) => {
        genreCount[genre] = (genreCount[genre] || 0) + 1;
      });
    });
    const topGenres = Object.entries(genreCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    const decadeCount = {};
    historyData.forEach((item) => {
      const year = item.movie?.year || item.show?.year;
      if (year) {
        const decade = Math.floor(year / 10) * 10;
        decadeCount[decade] = (decadeCount[decade] || 0) + 1;
      }
    });
    const topDecades = Object.entries(decadeCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    const monthlyActivity = {};
    const now = new Date();
    for (let i = 11; i >= 0; i--) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      monthlyActivity[key] = 0;
    }

    historyData.forEach((item) => {
      const watchedDate = new Date(item.watched_at);
      const key = `${watchedDate.getFullYear()}-${String(watchedDate.getMonth() + 1).padStart(2, "0")}`;
      if (monthlyActivity.hasOwnProperty(key)) {
        monthlyActivity[key]++;
      }
    });

    const years = [
      ...new Set(
        historyData.map((item) => new Date(item.watched_at).getFullYear()),
      ),
    ].sort((a, b) => b - a);

    return {
      moviesWatched: movies.watched || 0,
      moviesPlays: movies.plays || 0,
      moviesMinutes: moviesMinutes,
      showsWatched: shows.watched || 0,
      episodesWatched: episodes.watched || 0,
      episodesPlays: episodes.plays || 0,
      episodesMinutes: episodesMinutes,
      totalMinutes,
      totalHours,
      totalDays,
      friends: network.friends || 0,
      followers: network.followers || 0,
      following: network.following || 0,
      ratingsTotal: ratings.total || 0,
      ratingsDistribution: ratings.distribution || {},
      topMovies,
      topShows,
      topGenres,
      topDecades,
      monthlyActivity,
      years,
    };
  }, [traktStats, watchedMovies, watchedShows, historyData]);

  const yearStats = useMemo(() => {
    if (!historyData.length || !selectedYear) return null;

    const yearData = historyData.filter(
      (item) => new Date(item.watched_at).getFullYear() === selectedYear,
    );

    const movies = yearData.filter((item) => item.type === "movie");
    const episodes = yearData.filter((item) => item.type === "episode");

    return {
      total: yearData.length,
      movies: movies.length,
      episodes: episodes.length,
      shows: new Set(episodes.map((ep) => ep.show?.ids?.trakt).filter(Boolean))
        .size,
    };
  }, [historyData, selectedYear]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-white/20 border-t-emerald-500 rounded-full animate-spin mx-auto mb-4" />
          <p className="text-white/60">Cargando estadísticas de Trakt...</p>
        </div>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <div className="text-center">
          <Activity className="w-16 h-16 text-white/20 mx-auto mb-4" />
          <p className="text-white/60">No hay datos disponibles</p>
          <p className="text-white/40 text-sm mt-2">
            Conecta tu cuenta de Trakt para ver tus estadísticas
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white pb-20">
      <div className="fixed inset-0 bg-gradient-to-b from-emerald-950/20 via-transparent to-transparent pointer-events-none" />

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 lg:py-12">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-10"
        >
          <div className="flex items-center gap-4 mb-2">
            <div className="p-3 bg-emerald-500/10 rounded-2xl border border-emerald-500/20">
              <BarChart3 className="w-8 h-8 text-emerald-500" />
            </div>
            <div>
              <h1 className="text-4xl font-black tracking-tight">
                Estadísticas
              </h1>
              <p className="text-neutral-400 mt-1">
                Datos oficiales de Trakt personalizados
              </p>
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="flex gap-2 mb-8 overflow-x-auto pb-2"
        >
          {[
            { id: "overview", label: "General", icon: PieChart },
            { id: "yearly", label: "Por Año", icon: Calendar },
            { id: "wrapped", label: "Wrapped", icon: Sparkles },
          ].map((mode) => (
            <button
              key={mode.id}
              onClick={() => setViewMode(mode.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl font-semibold transition-all ${
                viewMode === mode.id
                  ? "bg-emerald-500 text-black"
                  : "bg-white/5 text-white/60 hover:bg-white/10 hover:text-white"
              }`}
            >
              <mode.icon className="w-4 h-4" />
              {mode.label}
            </button>
          ))}
        </motion.div>

        <AnimatePresence mode="wait">
          {viewMode === "overview" && (
            <motion.div
              key="overview"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-8"
            >
              {/* Stats Cards Grid */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <StatCard
                  icon={Clock}
                  label="Tiempo Total"
                  value={`${stats.totalDays}d ${stats.totalHours % 24}h`}
                  subtitle={`${stats.totalHours.toLocaleString()} horas`}
                  color="emerald"
                />
                <StatCard
                  icon={Film}
                  label="Películas"
                  value={stats.moviesWatched.toLocaleString()}
                  subtitle={`${stats.moviesPlays.toLocaleString()} reproducciones`}
                  color="blue"
                />
                <StatCard
                  icon={Tv}
                  label="Episodios"
                  value={stats.episodesWatched.toLocaleString()}
                  subtitle={`${stats.showsWatched} series`}
                  color="purple"
                />
                <StatCard
                  icon={Star}
                  label="Valoraciones"
                  value={stats.ratingsTotal.toLocaleString()}
                  subtitle="ratings dados"
                  color="yellow"
                />
              </div>

              {/* Social Stats */}
              <div className="grid grid-cols-3 gap-4">
                <StatCard
                  icon={Users}
                  label="Seguidores"
                  value={stats.followers.toLocaleString()}
                  color="pink"
                />
                <StatCard
                  icon={Heart}
                  label="Siguiendo"
                  value={stats.following.toLocaleString()}
                  color="red"
                />
                <StatCard
                  icon={Users}
                  label="Amigos"
                  value={stats.friends.toLocaleString()}
                  color="amber"
                />
              </div>

              {/* Time Breakdown */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-white/5 rounded-2xl p-6 border border-white/10">
                  <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
                    <Film className="w-5 h-5 text-blue-500" />
                    Tiempo en Películas
                  </h3>
                  <div className="space-y-2">
                    <div className="flex justify-between items-baseline">
                      <span className="text-3xl font-black">
                        {Math.round(stats.moviesMinutes / 60)} h
                      </span>
                      <span className="text-white/60">
                        {stats.moviesMinutes.toLocaleString()} minutos
                      </span>
                    </div>
                    <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{
                          width: `${(stats.moviesMinutes / stats.totalMinutes) * 100}%`,
                        }}
                        transition={{ duration: 1 }}
                        className="h-full bg-gradient-to-r from-blue-500 to-blue-400"
                      />
                    </div>
                    <p className="text-white/40 text-sm">
                      {Math.round(
                        (stats.moviesMinutes / stats.totalMinutes) * 100,
                      )}
                      % del tiempo total
                    </p>
                  </div>
                </div>

                <div className="bg-white/5 rounded-2xl p-6 border border-white/10">
                  <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
                    <Tv className="w-5 h-5 text-purple-500" />
                    Tiempo en Series
                  </h3>
                  <div className="space-y-2">
                    <div className="flex justify-between items-baseline">
                      <span className="text-3xl font-black">
                        {Math.round(stats.episodesMinutes / 60)} h
                      </span>
                      <span className="text-white/60">
                        {stats.episodesMinutes.toLocaleString()} minutos
                      </span>
                    </div>
                    <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{
                          width: `${(stats.episodesMinutes / stats.totalMinutes) * 100}%`,
                        }}
                        transition={{ duration: 1 }}
                        className="h-full bg-gradient-to-r from-purple-500 to-purple-400"
                      />
                    </div>
                    <p className="text-white/40 text-sm">
                      {Math.round(
                        (stats.episodesMinutes / stats.totalMinutes) * 100,
                      )}
                      % del tiempo total
                    </p>
                  </div>
                </div>
              </div>

              {/* Top Movies */}
              {stats.topMovies.length > 0 && (
                <div className="bg-white/5 rounded-2xl p-6 border border-white/10">
                  <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                    <Trophy className="w-5 h-5 text-yellow-500" />
                    Películas Más Vistas
                  </h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {stats.topMovies.map((item, index) => (
                      <Link
                        key={item.movie.ids.trakt}
                        href={`/details/movie/${item.movie.ids.tmdb}`}
                        className="flex items-center gap-3 p-3 bg-white/5 rounded-xl hover:bg-white/10 transition group"
                      >
                        <div className="flex-shrink-0 w-8 h-8 bg-gradient-to-br from-yellow-500 to-orange-500 rounded-full flex items-center justify-center font-black">
                          {index + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold truncate group-hover:text-emerald-400 transition">
                            {item.movie.title}
                          </p>
                          <p className="text-white/60 text-sm">
                            {item.plays}{" "}
                            {item.plays === 1
                              ? "reproducción"
                              : "reproducciones"}
                          </p>
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              )}

              {/* Top Shows */}
              {stats.topShows.length > 0 && (
                <div className="bg-white/5 rounded-2xl p-6 border border-white/10">
                  <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                    <Trophy className="w-5 h-5 text-purple-500" />
                    Series Más Vistas
                  </h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {stats.topShows.map((item, index) => (
                      <Link
                        key={item.show.ids.trakt}
                        href={`/details/tv/${item.show.ids.tmdb}`}
                        className="flex items-center gap-3 p-3 bg-white/5 rounded-xl hover:bg-white/10 transition group"
                      >
                        <div className="flex-shrink-0 w-8 h-8 bg-gradient-to-br from-purple-500 to-pink-500 rounded-full flex items-center justify-center font-black">
                          {index + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold truncate group-hover:text-emerald-400 transition">
                            {item.show.title}
                          </p>
                          <p className="text-white/60 text-sm">
                            {item.plays} episodios •{" "}
                            {item.show.aired_episodes || 0} totales
                          </p>
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              )}

              {/* Top Genres */}
              {stats.topGenres.length > 0 && (
                <div className="bg-white/5 rounded-2xl p-6 border border-white/10">
                  <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                    <Award className="w-5 h-5 text-yellow-500" />
                    Géneros Favoritos
                  </h2>
                  <div className="space-y-3">
                    {stats.topGenres.map(([genre, count], index) => (
                      <div key={genre}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-semibold capitalize">
                            {genre}
                          </span>
                          <span className="text-white/60">{count} títulos</span>
                        </div>
                        <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{
                              width: `${(count / stats.topGenres[0][1]) * 100}%`,
                            }}
                            transition={{ duration: 1, delay: index * 0.1 }}
                            className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Top Actors */}
              {topActors.length > 0 && (
                <div className="bg-white/5 rounded-2xl p-6 border border-white/10">
                  <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
                    <Users className="w-5 h-5 text-blue-500" />
                    Actores Más Vistos
                  </h2>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                    {topActors.slice(0, 6).map((actor, index) => (
                      <motion.div
                        key={actor.id}
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: index * 0.05 }}
                        className="group relative"
                      >
                        <Link
                          href={`/details/person/${actor.id}`}
                          onClick={() => window.scrollTo(0, 0)}
                        >
                          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-b from-white/10 to-white/5 border border-white/10 hover:border-blue-500/50 transition-all duration-300 hover:shadow-[0_0_30px_rgba(59,130,246,0.3)] hover:scale-105 cursor-pointer">
                            <div className="aspect-[2/3] relative">
                              {actor.profile_path ? (
                                <img
                                  src={`https://image.tmdb.org/t/p/w342${actor.profile_path}`}
                                  alt={actor.name}
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <div className="w-full h-full bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center">
                                  <Users className="w-12 h-12 text-white/80" />
                                </div>
                              )}
                              {/* Overlay gradient */}
                              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                            </div>

                            {/* Nombre */}
                            <div className="absolute bottom-0 left-0 right-0 p-3">
                              <p className="font-bold text-sm text-white drop-shadow-lg line-clamp-2 leading-tight">
                                {actor.name}
                              </p>
                              <p className="text-white/80 text-xs mt-0.5">
                                {actor.count}{" "}
                                {actor.count === 1 ? "película" : "películas"}
                              </p>
                            </div>
                          </div>
                        </Link>
                      </motion.div>
                    ))}
                  </div>
                </div>
              )}

              {/* Top Directors */}
              {topDirectors.length > 0 && (
                <div className="bg-white/5 rounded-2xl p-6 border border-white/10">
                  <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
                    <Award className="w-5 h-5 text-purple-500" />
                    Directores Favoritos
                  </h2>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                    {topDirectors.slice(0, 4).map((director, index) => (
                      <motion.div
                        key={director.id}
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: index * 0.05 }}
                        className="group relative"
                      >
                        <Link
                          href={`/details/person/${director.id}`}
                          onClick={() => window.scrollTo(0, 0)}
                        >
                          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-b from-white/10 to-white/5 border border-white/10 hover:border-purple-500/50 transition-all duration-300 hover:shadow-[0_0_30px_rgba(168,85,247,0.3)] hover:scale-105 cursor-pointer">
                            <div className="aspect-[2/3] relative">
                              {director.profile_path ? (
                                <img
                                  src={`https://image.tmdb.org/t/p/w342${director.profile_path}`}
                                  alt={director.name}
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <div className="w-full h-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
                                  <Award className="w-12 h-12 text-white/80" />
                                </div>
                              )}
                              {/* Overlay gradient */}
                              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                            </div>

                            {/* Nombre */}
                            <div className="absolute bottom-0 left-0 right-0 p-3">
                              <p className="font-bold text-sm text-white drop-shadow-lg line-clamp-2 leading-tight">
                                {director.name}
                              </p>
                              <p className="text-white/80 text-xs mt-0.5">
                                {director.count}{" "}
                                {director.count === 1
                                  ? "película"
                                  : "películas"}
                              </p>
                            </div>
                          </div>
                        </Link>
                      </motion.div>
                    ))}
                  </div>
                </div>
              )}

              {/* Top Decades */}
              {stats.topDecades.length > 0 && (
                <div className="bg-white/5 rounded-2xl p-6 border border-white/10">
                  <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                    <Calendar className="w-5 h-5 text-blue-500" />
                    Décadas Favoritas
                  </h2>
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                    {stats.topDecades.map(([decade, count]) => (
                      <div
                        key={decade}
                        className="bg-white/5 rounded-xl p-4 text-center border border-white/10 hover:bg-white/10 transition"
                      >
                        <div className="text-2xl font-black">{decade}s</div>
                        <div className="text-white/60 text-sm mt-1">
                          {count} títulos
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Monthly Activity */}
              <div className="bg-white/5 rounded-2xl p-6 border border-white/10">
                <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-purple-500" />
                  Actividad (Últimos 12 Meses)
                </h2>
                <div className="relative" style={{ height: "240px" }}>
                  <div className="flex items-end justify-between gap-2 h-48 relative">
                    {Object.entries(stats.monthlyActivity).map(
                      ([month, count]) => {
                        const maxCount = Math.max(
                          ...Object.values(stats.monthlyActivity),
                        );
                        const heightPx =
                          maxCount > 0 ? (count / maxCount) * 192 : 4;
                        const [year, monthNum] = month.split("-");
                        const monthName = new Date(
                          year,
                          parseInt(monthNum) - 1,
                        ).toLocaleDateString("es", { month: "short" });

                        return (
                          <div
                            key={month}
                            className="flex-1 flex flex-col-reverse items-center gap-2 relative"
                            style={{ height: "100%" }}
                          >
                            <div className="flex flex-col items-center gap-2">
                              <motion.div
                                initial={{ height: 0 }}
                                animate={{ height: `${heightPx}px` }}
                                transition={{
                                  duration: 0.5,
                                  delay:
                                    Object.keys(stats.monthlyActivity).indexOf(
                                      month,
                                    ) * 0.05,
                                }}
                                className="w-full bg-gradient-to-t from-emerald-500 to-emerald-400 rounded-t-lg relative"
                                style={{ minHeight: "4px" }}
                                title={`${count} visualizaciones`}
                              >
                                {count > 0 && (
                                  <div className="absolute -top-6 left-1/2 -translate-x-1/2 text-xs font-bold text-white/80 whitespace-nowrap">
                                    {count}
                                  </div>
                                )}
                              </motion.div>
                              <span className="text-[10px] text-white/40 uppercase font-bold">
                                {monthName}
                              </span>
                            </div>
                          </div>
                        );
                      },
                    )}
                  </div>
                </div>
              </div>

              {/* Ratings Distribution */}
              {stats.ratingsTotal > 0 && (
                <div className="bg-white/5 rounded-2xl p-6 border border-white/10">
                  <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                    <Star className="w-5 h-5 text-yellow-500" />
                    Distribución de Ratings
                  </h2>
                  <div className="space-y-2">
                    {Object.entries(stats.ratingsDistribution)
                      .sort((a, b) => parseInt(b[0]) - parseInt(a[0]))
                      .map(([rating, count]) => {
                        const percentage = (count / stats.ratingsTotal) * 100;
                        return (
                          <div key={rating} className="flex items-center gap-3">
                            <span className="w-12 font-bold text-right">
                              {rating} ⭐
                            </span>
                            <div className="flex-1 relative">
                              <div className="h-8 bg-white/10 rounded-lg overflow-hidden">
                                <motion.div
                                  initial={{ width: 0 }}
                                  animate={{ width: `${percentage}%` }}
                                  transition={{ duration: 1 }}
                                  className="h-full bg-gradient-to-r from-yellow-500 to-orange-500"
                                />
                              </div>
                              {count > 0 && (
                                <div className="absolute inset-0 flex items-center justify-start pl-3">
                                  <span className="text-xs font-bold text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
                                    {count}
                                  </span>
                                </div>
                              )}
                            </div>
                            <span className="w-16 text-white/60 text-sm text-right">
                              {percentage.toFixed(1)}%
                            </span>
                          </div>
                        );
                      })}
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {viewMode === "yearly" && (
            <motion.div
              key="yearly"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-6"
            >
              <div className="flex gap-2 overflow-x-auto pb-2">
                {stats.years.map((year) => (
                  <button
                    key={year}
                    onClick={() => setSelectedYear(year)}
                    className={`px-4 py-2 rounded-xl font-bold transition whitespace-nowrap ${
                      selectedYear === year
                        ? "bg-emerald-500 text-black"
                        : "bg-white/5 text-white/60 hover:bg-white/10"
                    }`}
                  >
                    {year}
                  </button>
                ))}
              </div>

              {yearStats && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <StatCard
                    icon={Activity}
                    label="Total"
                    value={yearStats.total.toLocaleString()}
                    color="emerald"
                  />
                  <StatCard
                    icon={Film}
                    label="Películas"
                    value={yearStats.movies.toLocaleString()}
                    color="blue"
                  />
                  <StatCard
                    icon={Tv}
                    label="Episodios"
                    value={yearStats.episodes.toLocaleString()}
                    color="purple"
                  />
                  <StatCard
                    icon={Tv}
                    label="Series"
                    value={yearStats.shows.toLocaleString()}
                    color="pink"
                  />
                </div>
              )}

              <div className="bg-white/5 rounded-2xl p-8 border border-white/10 text-center">
                <Target className="w-16 h-16 text-emerald-500 mx-auto mb-4" />
                <h3 className="text-2xl font-bold mb-2">
                  Análisis detallado por año
                </h3>
                <p className="text-white/60">
                  Gráficos mensuales y comparativas próximamente
                </p>
              </div>
            </motion.div>
          )}

          {viewMode === "wrapped" && (
            <motion.div
              key="wrapped"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-6"
            >
              <div className="bg-gradient-to-br from-purple-500/20 to-pink-500/20 rounded-2xl p-8 border border-white/10 text-center">
                <Sparkles className="w-16 h-16 text-yellow-500 mx-auto mb-4 animate-pulse" />
                <h3 className="text-3xl font-black mb-2">
                  Wrapped {new Date().getFullYear()}
                </h3>
                <p className="text-white/60 mb-6">
                  Tu resumen anual personalizado estilo Spotify
                </p>
                <div className="text-white/40 text-sm">
                  🎬 Próximamente: slides interactivos con tus mejores momentos
                  del año
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, subtitle, color = "emerald" }) {
  const colorClasses = {
    emerald: "from-emerald-500/20 to-emerald-600/20 border-emerald-500/30",
    blue: "from-blue-500/20 to-blue-600/20 border-blue-500/30",
    purple: "from-purple-500/20 to-purple-600/20 border-purple-500/30",
    pink: "from-pink-500/20 to-pink-600/20 border-pink-500/30",
    yellow: "from-yellow-500/20 to-yellow-600/20 border-yellow-500/30",
    red: "from-red-500/20 to-red-600/20 border-red-500/30",
    amber: "from-amber-500/20 to-amber-600/20 border-amber-500/30",
  };

  const iconColorClasses = {
    emerald: "text-emerald-400",
    blue: "text-blue-400",
    purple: "text-purple-400",
    pink: "text-pink-400",
    yellow: "text-yellow-400",
    red: "text-red-400",
    amber: "text-amber-400",
  };

  return (
    <motion.div
      whileHover={{ scale: 1.02 }}
      className={`bg-gradient-to-br ${colorClasses[color]} rounded-2xl p-6 border`}
    >
      <Icon className={`w-6 h-6 ${iconColorClasses[color]} mb-3`} />
      <div className="text-3xl font-black mb-1">{value}</div>
      <div className="text-white/60 text-sm font-semibold">{label}</div>
      {subtitle && <div className="text-white/40 text-xs mt-1">{subtitle}</div>}
    </motion.div>
  );
}
