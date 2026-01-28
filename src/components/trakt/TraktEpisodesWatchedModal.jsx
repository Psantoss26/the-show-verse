"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  Check,
  Eye,
  EyeOff,
  Loader2,
  X,
  Search,
  List,
  Table2,
  Filter,
  ChevronRight,
  Tv,
  Plus,
  History,
  ChevronDown,
} from "lucide-react";

const TMDB_API_KEY = process.env.NEXT_PUBLIC_TMDB_API_KEY;

const pad2 = (n) => String(n).padStart(2, "0");

const toLocalDatetimeInput = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(
    d.getMinutes(),
  )}`;
};

const fromLocalDatetimeInput = (value) => {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
};

const formatDate = (iso) => {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("es-ES", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return iso;
  }
};

const formatDateTime = (iso) => {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("es-ES", {
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
};

const seasonLabelText = (sn, name) => {
  if (name) return name;
  return sn === 0 ? "Especiales" : `Temporada ${sn}`;
};

const MAX_EPISODES_RENDER = 120;
const MOVIE_BUSY_KEY = "MOVIE";
const SHOW_BUSY_KEY = "SHOW";

export default function TraktEpisodesWatchedModal({
  open,
  onClose,

  mediaType = "tv",
  tmdbId,
  title,

  connected,

  seasons = [],
  watchedBySeason = {},

  // ✅ NUEVO (rewatch / vistas)
  showPlays = [], // array de plays (strings ISO o { watched_at })
  showReleaseDate = null, // ISO fecha estreno (opcional)
  onAddShowPlay, // (watchedAtIsoOrNull, meta) => Promise
  activeView, // 'global' o ISO del play (ej: '2024-01-01T12:00:00.000Z')
  onChangeView, // (viewId) => void
  watchedBySeasonRewatch = {}, // watchedBySeason del rewatch seleccionado (según activeView)
  onToggleEpisodeRewatch, // (viewId, seasonNumber, episodeNumber) o (season, episode, viewId)
  onCreateRewatchRun, // (startedAtIso) => Promise  (opcional, si quieres crear la vista rewatch en backend)

  busyKey = "",
  onToggleEpisodeWatched,

  movieWatchedAt = null,
  onToggleMovieWatched,

  onToggleShowWatched, // marcar serie completa (global)
}) {
  const [activeSeason, setActiveSeason] = useState(null);
  const [displaySeason, setDisplaySeason] = useState(null);
  const [onlyUnwatched, setOnlyUnwatched] = useState(false);
  const [viewMode, setViewMode] = useState("list");
  const [query, setQuery] = useState("");
  const [expandedSeason, setExpandedSeason] = useState({});
  const [seasonCache, setSeasonCache] = useState({});
  const [movieEditValue, setMovieEditValue] = useState("");
  const [showError, setShowError] = useState("");

  // ✅ local view fallback si el padre no controla activeView/onChangeView
  const [localView, setLocalView] = useState("global");

  // ✅ Modales extra
  const [addPlayOpen, setAddPlayOpen] = useState(false);
  const [addPlayPreset, setAddPlayPreset] = useState("just_finished"); // just_finished | release_date | unknown | other_date
  const [addPlayOtherValue, setAddPlayOtherValue] = useState(
    toLocalDatetimeInput(new Date().toISOString()),
  );
  const [addPlayBusy, setAddPlayBusy] = useState(false);
  const [addPlayError, setAddPlayError] = useState("");

  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyQuery, setHistoryQuery] = useState("");
  const [historyLimit, setHistoryLimit] = useState(60);

  // ✅ optimistic plays para que el dropdown/historial no “parpadee”
  const [optimisticPlays, setOptimisticPlays] = useState([]); // array de ISO strings

  const panelRef = useRef(null);

  const isMovie = mediaType === "movie";
  const isConnected =
    typeof connected === "object" ? !!connected?.connected : !!connected;

  const movieWatched = !!movieWatchedAt;
  const busyMovie = busyKey === MOVIE_BUSY_KEY;
  const busyShow = busyKey === SHOW_BUSY_KEY;

  const hasShowHandler = typeof onToggleShowWatched === "function";
  const hasAddPlayHandler = typeof onAddShowPlay === "function";

  const effectiveViewId = useMemo(() => {
    const v =
      typeof activeView === "string" && activeView ? activeView : localView;
    return v || "global";
  }, [activeView, localView]);

  const isRewatchView = effectiveViewId !== "global";

  const changeView = useCallback(
    (next) => {
      const v = next || "global";
      setShowError("");
      if (typeof onChangeView === "function") {
        onChangeView(v);
      } else {
        setLocalView(v);
      }
    },
    [onChangeView],
  );

  // ✅ Filtramos temporadas: > 0 (NO especiales)
  const usableSeasons = useMemo(() => {
    const list = Array.isArray(seasons) ? seasons : [];
    return [...list]
      .filter(
        (s) => s && typeof s.season_number === "number" && s.season_number > 0,
      )
      .sort((a, b) => (a.season_number ?? 0) - (b.season_number ?? 0));
  }, [seasons]);

  // ✅ watchedBySeason “activo” según vista (global o rewatch)
  const watchedBySeasonActive = useMemo(() => {
    if (!isRewatchView) return watchedBySeason || {};
    return watchedBySeasonRewatch || {};
  }, [isRewatchView, watchedBySeason, watchedBySeasonRewatch]);

  // ✅ plays normalizados + optimistic
  const normalizedPlays = useMemo(() => {
    const base = Array.isArray(showPlays) ? showPlays : [];
    const out = [];

    base.forEach((p) => {
      if (!p) return;
      if (typeof p === "string") out.push(p);
      else if (typeof p === "object") {
        const iso = p.watched_at || p.watchedAt || p.date || null;
        if (iso) out.push(iso);
      }
    });
    (Array.isArray(optimisticPlays) ? optimisticPlays : []).forEach((iso) => {
      if (iso) out.push(iso);
    });

    // uniq + sort desc
    const uniq = Array.from(new Set(out.filter(Boolean)));
    uniq.sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
    return uniq;
  }, [showPlays, optimisticPlays]);

  const filteredHistory = useMemo(() => {
    const q = (historyQuery || "").trim().toLowerCase();
    if (!q) return normalizedPlays;
    return normalizedPlays.filter((iso) =>
      formatDateTime(iso).toLowerCase().includes(q),
    );
  }, [normalizedPlays, historyQuery]);

  const visibleHistory = useMemo(
    () => filteredHistory.slice(0, historyLimit),
    [filteredHistory, historyLimit],
  );

  // Progreso (por vista actual)
  const totals = useMemo(() => {
    const totalEpisodes = usableSeasons.reduce(
      (acc, s) => acc + Math.max(0, s.episode_count || 0),
      0,
    );
    const watchedEpisodes = usableSeasons.reduce((acc, s) => {
      const sn = s.season_number;
      const arr = watchedBySeasonActive?.[sn];
      return acc + (Array.isArray(arr) ? arr.length : 0);
    }, 0);
    return { totalEpisodes, watchedEpisodes };
  }, [usableSeasons, watchedBySeasonActive]);

  const progressPct = useMemo(() => {
    if (!totals.totalEpisodes) return 0;
    return Math.min(
      100,
      Math.max(
        0,
        Math.round((totals.watchedEpisodes / totals.totalEpisodes) * 100),
      ),
    );
  }, [totals]);

  const showCompleted = useMemo(() => {
    return (
      totals.totalEpisodes > 0 && totals.watchedEpisodes >= totals.totalEpisodes
    );
  }, [totals]);

  // ✅ marcar serie completa SOLO en global
  const canToggleShow =
    isConnected && !isRewatchView && usableSeasons.length > 0 && !busyShow;

  const tmdbImg = (path, size = "w300") =>
    path ? `https://image.tmdb.org/t/p/${size}${path}` : null;

  // Init
  useEffect(() => {
    if (!open) return;
    setShowError("");
    setAddPlayError("");
    setAddPlayBusy(false);
    setAddPlayOpen(false);
    setHistoryOpen(false);
    setHistoryQuery("");
    setHistoryLimit(60);

    if (typeof onChangeView !== "function") setLocalView("global");

    if (isMovie) {
      const fallbackIso = movieWatchedAt || new Date().toISOString();
      setMovieEditValue(toLocalDatetimeInput(fallbackIso));
      setQuery("");
      return;
    }

    const first =
      usableSeasons.find((s) => (s?.season_number ?? 0) >= 1) ||
      usableSeasons[0] ||
      null;
    const sn = first?.season_number ?? null;
    setActiveSeason(sn);
    setDisplaySeason(sn);
    setOnlyUnwatched(false);
    setViewMode("list");
    setQuery("");
  }, [open, usableSeasons, isMovie, movieWatchedAt, onChangeView]);

  // Shortcuts & Lock Scroll
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  const loadSeason = useCallback(
    async (sn) => {
      if (!TMDB_API_KEY || !tmdbId || sn == null) return;
      if (
        Array.isArray(seasonCache?.[sn]?.episodes) ||
        seasonCache?.[sn]?.loading
      )
        return;

      setSeasonCache((p) => ({
        ...p,
        [sn]: { ...(p?.[sn] || {}), loading: true, error: "" },
      }));

      try {
        const res = await fetch(
          `https://api.themoviedb.org/3/tv/${tmdbId}/season/${sn}?api_key=${TMDB_API_KEY}&language=es-ES`,
        );
        const json = await res.json();
        if (!res.ok)
          throw new Error(json?.status_message || "Error cargando temporada");
        setSeasonCache((p) => ({
          ...p,
          [sn]: { loading: false, error: "", episodes: json.episodes || [] },
        }));
      } catch (e) {
        setSeasonCache((p) => ({
          ...p,
          [sn]: { loading: false, error: e?.message || "Error", episodes: [] },
        }));
      }
    },
    [tmdbId, seasonCache],
  );

  // Auto-load season
  useEffect(() => {
    if (!open || isMovie || viewMode !== "list" || activeSeason == null) return;
    loadSeason(activeSeason);
  }, [open, isMovie, viewMode, activeSeason, tmdbId, loadSeason]);

  useEffect(() => {
    if (!open || isMovie || viewMode !== "list" || activeSeason == null) return;
    if (Array.isArray(seasonCache?.[activeSeason]?.episodes))
      setDisplaySeason(activeSeason);
  }, [open, isMovie, viewMode, activeSeason, seasonCache]);

  const selectedSeasonObj = useMemo(
    () => usableSeasons.find((s) => s?.season_number === activeSeason) || null,
    [usableSeasons, activeSeason],
  );

  const selectedSn = selectedSeasonObj?.season_number ?? null;
  const displaySn = displaySeason ?? activeSeason ?? null;
  const displayCache = displaySn != null ? seasonCache?.[displaySn] : null;
  const episodes = Array.isArray(displayCache?.episodes)
    ? displayCache.episodes
    : [];
  const watchedSet = useMemo(
    () => new Set(watchedBySeasonActive?.[displaySn] || []),
    [watchedBySeasonActive, displaySn],
  );

  const loadingSeason = seasonCache?.[selectedSn]?.loading;
  const isSwitching = selectedSn !== displaySn && loadingSeason;

  const filteredEpisodes = useMemo(() => {
    const q2 = (query || "").trim().toLowerCase();
    let base = episodes;
    if (onlyUnwatched)
      base = base.filter((ep) => !watchedSet.has(ep.episode_number));
    if (!q2) return base;
    return base.filter(
      (ep) =>
        (ep.name || "").toLowerCase().includes(q2) ||
        String(ep.episode_number) === q2,
    );
  }, [episodes, onlyUnwatched, watchedSet, query]);

  const seasonsFilteredForTable = useMemo(() => {
    const q2 = (query || "").trim().toLowerCase();
    if (!q2) return usableSeasons;
    return usableSeasons.filter((s) =>
      seasonLabelText(s.season_number, s.name).toLowerCase().includes(q2),
    );
  }, [usableSeasons, query]);

  const onClickToggleShow = async () => {
    setShowError("");
    if (!canToggleShow) return;

    if (!hasShowHandler) {
      setShowError(
        "Falta implementar/pasar onToggleShowWatched desde DetailsClient.jsx",
      );
      return;
    }

    try {
      await onToggleShowWatched(
        showCompleted ? null : new Date().toISOString(),
      );
    } catch (e) {
      setShowError(e?.message || "Error al actualizar la serie");
    }
  };

  const resolvePlayDate = () => {
    if (addPlayPreset === "just_finished") return new Date().toISOString();
    if (addPlayPreset === "unknown") return null;
    if (addPlayPreset === "release_date") {
      if (!showReleaseDate) return null;
      const d = new Date(showReleaseDate);
      if (Number.isNaN(d.getTime())) return null;
      return d.toISOString();
    }
    if (addPlayPreset === "other_date")
      return fromLocalDatetimeInput(addPlayOtherValue);
    return new Date().toISOString();
  };

  const onConfirmAddPlay = async () => {
    setAddPlayError("");
    setShowError("");

    if (!isConnected) {
      setAddPlayError("Conecta Trakt para añadir visionados.");
      return;
    }
    if (!hasAddPlayHandler) {
      setAddPlayError("Falta pasar onAddShowPlay desde DetailsClient.jsx");
      return;
    }

    const watchedAt = resolvePlayDate();

    if (addPlayPreset === "other_date" && !watchedAt) {
      setAddPlayError("Elige una fecha válida.");
      return;
    }
    if (addPlayPreset === "release_date" && !showReleaseDate) {
      setAddPlayError("No tengo la fecha de estreno de la serie.");
      return;
    }

    setAddPlayBusy(true);
    try {
      await onAddShowPlay(watchedAt, { preset: addPlayPreset });

      // ✅ Si hay fecha, la usamos como “id” del rewatch y cambiamos a esa vista
      if (watchedAt) {
        setOptimisticPlays((prev) => {
          const arr = Array.isArray(prev) ? prev : [];
          if (arr.includes(watchedAt)) return arr;
          return [watchedAt, ...arr];
        });

        // opcional: crear “run” en backend si lo usas así
        if (typeof onCreateRewatchRun === "function") {
          await onCreateRewatchRun(watchedAt);
        }

        changeView(watchedAt);
      }

      setAddPlayOpen(false);
    } catch (e) {
      setAddPlayError(e?.message || "Error al añadir visionado");
    } finally {
      setAddPlayBusy(false);
    }
  };

  const toggleEpisode = async (sn, en) => {
    setShowError("");
    if (!isConnected) return;

    try {
      if (!isRewatchView) {
        if (typeof onToggleEpisodeWatched !== "function") {
          throw new Error(
            "Falta pasar onToggleEpisodeWatched desde DetailsClient.jsx",
          );
        }
        await onToggleEpisodeWatched(sn, en);
        return;
      }

      // Rewatch
      if (typeof onToggleEpisodeRewatch !== "function") {
        throw new Error(
          "Falta pasar onToggleEpisodeRewatch para marcar episodios en rewatch.",
        );
      }

      // ✅ soporta ambas firmas comunes:
      // (viewId, sn, en)  OR  (sn, en, viewId)
      if (onToggleEpisodeRewatch.length >= 3) {
        await onToggleEpisodeRewatch(effectiveViewId, sn, en);
      } else {
        await onToggleEpisodeRewatch(sn, en, effectiveViewId);
      }
    } catch (e) {
      setShowError(e?.message || "Error al actualizar el episodio");
    }
  };

  if (!open) return null;

  const PanelClass =
    "fixed inset-0 sm:static w-full h-[100dvh] sm:h-[85vh] sm:max-w-5xl bg-[#0b0b0b] sm:rounded-3xl sm:border sm:border-white/10 sm:shadow-2xl overflow-hidden flex flex-col z-[10060] sm:z-auto pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] sm:py-0";

  const ButtonBase =
    "inline-flex items-center justify-center gap-2 rounded-xl text-sm font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed";

  // --- MOVIE RENDER ---
  if (isMovie) {
    return (
      <div className="fixed inset-0 z-[99999] flex items-center justify-center sm:p-4">
        <div
          className="absolute inset-0 bg-black/80 backdrop-blur-sm"
          onClick={onClose}
        />

        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className={`${PanelClass} sm:max-w-lg sm:h-auto`}
        >
          <div className="p-5 border-b border-white/10 flex justify-between items-start gap-4 bg-[#0b0b0b]">
            <div>
              <h3 className="text-xl font-black text-white">Marcar película</h3>
              <p className="text-sm text-zinc-400 mt-0.5 line-clamp-1">
                {title}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-full bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="p-6 space-y-6">
            {!isConnected ? (
              <div className="text-center py-8">
                <p className="text-zinc-300 font-medium mb-4">
                  Conecta Trakt para gestionar tu historial.
                </p>
                <Link
                  href="/trakt"
                  className={`${ButtonBase} px-6 py-2.5 bg-emerald-600 text-white hover:bg-emerald-500`}
                >
                  Ir a Conectar
                </Link>
              </div>
            ) : (
              <>
                <div>
                  <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2">
                    Fecha y hora (opcional)
                  </label>
                  <input
                    type="datetime-local"
                    value={movieEditValue}
                    onChange={(e) => setMovieEditValue(e.target.value)}
                    className="w-full bg-zinc-900/50 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none transition"
                  />
                  {movieWatchedAt && (
                    <p className="mt-2 text-xs text-emerald-400">
                      Visto el: {new Date(movieWatchedAt).toLocaleString()}
                    </p>
                  )}
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={onClose}
                    className={`${ButtonBase} flex-1 py-3 bg-zinc-800 text-zinc-300 hover:bg-zinc-700`}
                  >
                    Cancelar
                  </button>

                  {movieWatched ? (
                    <button
                      type="button"
                      onClick={() => !busyMovie && onToggleMovieWatched?.(null)}
                      disabled={busyMovie}
                      className={`${ButtonBase} flex-1 py-3 bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20`}
                    >
                      {busyMovie ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <EyeOff className="w-4 h-4" />
                      )}
                      Quitar de vistos
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() =>
                        !busyMovie &&
                        onToggleMovieWatched?.(
                          fromLocalDatetimeInput(movieEditValue) ||
                            new Date().toISOString(),
                        )
                      }
                      disabled={busyMovie}
                      className={`${ButtonBase} flex-1 py-3 bg-emerald-600 text-white hover:bg-emerald-500 shadow-lg shadow-emerald-900/20`}
                    >
                      {busyMovie ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                      Marcar como visto
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </motion.div>
      </div>
    );
  }

  // --- TV RENDER ---
  return (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center sm:p-4">
      <div
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        onClick={onClose}
      />

      <motion.div
        ref={panelRef}
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.98 }}
        transition={{ duration: 0.2 }}
        className={PanelClass}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/5 bg-[#0b0b0b] shrink-0 z-30">
          <div className="min-w-0 pr-4">
            <h2 className="text-lg sm:text-xl font-black text-white truncate leading-tight">
              Episodios vistos
            </h2>
            <p className="text-xs sm:text-sm text-zinc-400 truncate">{title}</p>

            {totals.totalEpisodes > 0 && (
              <div className="flex items-center gap-3 mt-2">
                <div className="h-1.5 w-28 bg-white/10 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${isRewatchView ? "bg-purple-500" : "bg-emerald-500"}`}
                    style={{ width: `${progressPct}%` }}
                  />
                </div>
                <span className="text-[10px] font-bold text-zinc-300">
                  {progressPct}%
                </span>

                <span
                  className={`text-[10px] font-black px-2 py-0.5 rounded-full border ${
                    isRewatchView
                      ? "bg-purple-500/10 text-purple-200 border-purple-500/20"
                      : "bg-white/5 text-zinc-200 border-white/10"
                  }`}
                  title={
                    isRewatchView
                      ? "Vista rewatch (independiente)"
                      : "Vista global"
                  }
                >
                  {isRewatchView
                    ? `Rewatch · ${formatDate(effectiveViewId)}`
                    : "Global"}
                </span>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2.5 rounded-full bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Toolbar */}
        <div className="px-5 py-3 border-b border-white/5 flex flex-col gap-3 bg-[#0b0b0b] shrink-0 z-20">
          <div className="flex flex-col lg:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={
                  viewMode === "list"
                    ? "Buscar episodio..."
                    : "Buscar temporada..."
                }
                className="w-full bg-zinc-900/50 border border-white/10 rounded-xl pl-9 pr-4 py-2 text-sm text-zinc-200 focus:outline-none focus:border-emerald-500/50 transition"
              />
            </div>

            {/* Selector de vista: Global / Rewatch por fecha (plays) */}
            <div className="relative shrink-0">
              <select
                value={effectiveViewId}
                onChange={(e) => changeView(e.target.value)}
                className="h-[38px] pl-3 pr-9 rounded-xl border text-xs font-black bg-zinc-900 border-white/10 text-zinc-200 hover:bg-zinc-800 transition outline-none"
                title="Cambiar vista (Global o Rewatch por visionado)"
                disabled={!isConnected}
              >
                <option value="global">Global (Trakt)</option>
                {normalizedPlays.map((iso) => (
                  <option key={iso} value={iso}>
                    {`Rewatch · ${formatDateTime(iso)}`}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
            </div>

            {/* Botones extra */}
            <div className="flex gap-2 shrink-0 overflow-x-auto no-scrollbar">
              <div className="flex bg-zinc-900 rounded-xl p-1 border border-white/5">
                <button
                  type="button"
                  onClick={() => setViewMode("list")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition ${
                    viewMode === "list"
                      ? "bg-zinc-700 text-white shadow"
                      : "text-zinc-400 hover:text-white"
                  }`}
                >
                  <List className="w-3.5 h-3.5" /> Lista
                </button>

                <button
                  type="button"
                  onClick={() => setViewMode("table")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition ${
                    viewMode === "table"
                      ? "bg-zinc-700 text-white shadow"
                      : "text-zinc-400 hover:text-white"
                  }`}
                >
                  <Table2 className="w-3.5 h-3.5" /> Tabla
                </button>
              </div>

              <button
                type="button"
                onClick={() => setOnlyUnwatched(!onlyUnwatched)}
                className={`px-3 py-1.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition whitespace-nowrap ${
                  onlyUnwatched
                    ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                    : "bg-zinc-900 border-white/5 text-zinc-400 hover:bg-zinc-800"
                }`}
              >
                <Filter className="w-3.5 h-3.5" />{" "}
                {onlyUnwatched ? "No vistos" : "Todos"}
              </button>

              {/* ✅ NUEVO: Añadir visionado */}
              <button
                type="button"
                disabled={!isConnected}
                onClick={() => {
                  setAddPlayError("");
                  setAddPlayPreset("just_finished");
                  setAddPlayOtherValue(
                    toLocalDatetimeInput(new Date().toISOString()),
                  );
                  setAddPlayOpen(true);
                }}
                className={`px-3 py-1.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition whitespace-nowrap ${
                  !isConnected
                    ? "opacity-50 cursor-not-allowed bg-zinc-900 border-white/10 text-zinc-500"
                    : "bg-zinc-900 border-white/10 text-zinc-200 hover:bg-zinc-800"
                }`}
                title={
                  !isConnected
                    ? "Conecta Trakt"
                    : "Añadir un visionado y crear/switch a su rewatch"
                }
              >
                <Plus className="w-3.5 h-3.5" />
                Añadir visionado
              </button>

              {/* ✅ NUEVO: Historial */}
              <button
                type="button"
                disabled={!isConnected || normalizedPlays.length === 0}
                onClick={() => {
                  setHistoryQuery("");
                  setHistoryLimit(60);
                  setHistoryOpen(true);
                }}
                className={`px-3 py-1.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition whitespace-nowrap ${
                  !isConnected || normalizedPlays.length === 0
                    ? "opacity-50 cursor-not-allowed bg-white/5 border-white/10 text-zinc-500"
                    : "bg-white/5 border-white/10 text-zinc-200 hover:bg-white/10"
                }`}
                title={
                  !isConnected
                    ? "Conecta Trakt"
                    : normalizedPlays.length === 0
                      ? "Sin visionados"
                      : "Ver todos los visionados"
                }
              >
                <History className="w-3.5 h-3.5 text-emerald-400" />
                Historial
                {isConnected && normalizedPlays.length > 0 && (
                  <span className="ml-1 text-[10px] font-black px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-zinc-200">
                    {normalizedPlays.length}
                  </span>
                )}
              </button>

              {/* ✅ SERIE COMPLETA (global) */}
              <button
                type="button"
                disabled={!canToggleShow}
                onClick={onClickToggleShow}
                className={`px-3 py-1.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition whitespace-nowrap
                  ${
                    showCompleted
                      ? "bg-red-500/10 border-red-500/30 text-red-300 hover:bg-red-500/20"
                      : "bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20"
                  }
                  ${!canToggleShow ? "opacity-50 cursor-not-allowed" : ""}`}
                title={
                  !isConnected
                    ? "Conecta Trakt"
                    : isRewatchView
                      ? "En rewatch no se usa “marcar serie completa”"
                      : usableSeasons.length === 0
                        ? "Sin temporadas disponibles"
                        : undefined
                }
              >
                {busyShow ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : showCompleted ? (
                  <EyeOff className="w-3.5 h-3.5" />
                ) : (
                  <Eye className="w-3.5 h-3.5" />
                )}
                {showCompleted ? "Quitar serie" : "Marcar serie"}
              </button>
            </div>
          </div>

          {!!showError && (
            <div className="text-xs text-red-300 font-medium">{showError}</div>
          )}
        </div>

        {/* Content Area */}
        <div className="flex-1 min-h-0 flex flex-col md:flex-row overflow-hidden relative">
          {!isConnected ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
              <p className="text-zinc-400 mb-4">
                Debes conectar Trakt para gestionar el progreso.
              </p>
              <Link
                href="/trakt"
                className={`${ButtonBase} px-6 py-2.5 bg-emerald-600 text-white hover:bg-emerald-500`}
              >
                Conectar Trakt
              </Link>
            </div>
          ) : viewMode === "list" ? (
            <>
              {/* Sidebar Temporadas (Desktop) */}
              <div className="hidden md:flex w-64 flex-col border-r border-white/5 bg-zinc-900/20 overflow-y-auto sv-scroll">
                <div className="p-3 space-y-1">
                  {usableSeasons.map((s) => {
                    const sn = s.season_number;
                    const watched = (watchedBySeasonActive?.[sn] || []).length;
                    const total = s.episode_count || 0;
                    const active = sn === activeSeason;

                    return (
                      <button
                        key={sn}
                        type="button"
                        onClick={() => {
                          setActiveSeason(sn);
                          if (Array.isArray(seasonCache?.[sn]?.episodes))
                            setDisplaySeason(sn);
                        }}
                        className={`w-full text-left px-4 py-3 rounded-xl transition-all flex justify-between items-center group ${
                          active
                            ? isRewatchView
                              ? "bg-purple-500/10 border border-purple-500/20"
                              : "bg-emerald-500/10 border border-emerald-500/20"
                            : "hover:bg-white/5 border border-transparent"
                        }`}
                      >
                        <div>
                          <div
                            className={`text-sm font-bold ${
                              active
                                ? isRewatchView
                                  ? "text-purple-200"
                                  : "text-emerald-400"
                                : "text-zinc-300 group-hover:text-white"
                            }`}
                          >
                            {seasonLabelText(sn, s.name)}
                          </div>
                          <div className="text-[10px] text-zinc-500 mt-0.5">
                            {watched} / {total} vistos
                          </div>
                        </div>
                        <ChevronRight
                          className={`w-4 h-4 ${
                            active
                              ? isRewatchView
                                ? "text-purple-400"
                                : "text-emerald-500"
                              : "text-zinc-600"
                          }`}
                        />
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Mobile Season Selector */}
              <div className="md:hidden w-full overflow-x-auto no-scrollbar border-b border-white/5 bg-zinc-900/20 shrink-0">
                <div className="flex gap-2 p-3 min-w-max">
                  {usableSeasons.map((s) => {
                    const sn = s.season_number;
                    const active = sn === activeSeason;
                    return (
                      <button
                        key={sn}
                        type="button"
                        onClick={() => {
                          setActiveSeason(sn);
                          if (Array.isArray(seasonCache?.[sn]?.episodes))
                            setDisplaySeason(sn);
                        }}
                        className={`px-4 py-2 rounded-lg text-xs font-bold whitespace-nowrap border transition-all ${
                          active
                            ? isRewatchView
                              ? "bg-purple-400 text-black border-purple-400 shadow-lg shadow-purple-500/20"
                              : "bg-emerald-500 text-black border-emerald-500 shadow-lg shadow-emerald-500/20"
                            : "bg-zinc-800 border-zinc-700 text-zinc-400 hover:bg-zinc-700 hover:text-white"
                        }`}
                      >
                        {`T${sn}`}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Episodes List */}
              <div className="flex-1 overflow-y-auto no-scrollbar p-3 sm:p-4 pb-20 sm:pb-4 relative scroll-smooth">
                {isSwitching && (
                  <div className="absolute inset-0 bg-black/50 z-10 flex items-center justify-center backdrop-blur-[1px]">
                    <Loader2
                      className={`w-8 h-8 animate-spin ${isRewatchView ? "text-purple-400" : "text-emerald-500"}`}
                    />
                  </div>
                )}

                <div className="space-y-3">
                  {filteredEpisodes.length === 0 && !loadingSeason ? (
                    <div className="text-center py-12 text-zinc-500 text-sm">
                      No hay episodios que coincidan.
                    </div>
                  ) : (
                    filteredEpisodes.map((ep) => {
                      const sn = displaySn;
                      const en = ep.episode_number;
                      const key = `S${sn}E${en}`;
                      const busy = busyKey === key;

                      const watched = watchedSet.has(en);
                      const img = tmdbImg(ep.still_path);

                      return (
                        <div
                          key={en}
                          className="group flex gap-3 sm:gap-4 p-2 sm:p-3 rounded-xl bg-zinc-900/30 border border-white/5 hover:bg-zinc-800/50 hover:border-white/10 transition"
                        >
                          <div className="w-24 sm:w-32 aspect-video bg-zinc-800 rounded-lg overflow-hidden shrink-0 relative">
                            {img ? (
                              <img
                                src={img}
                                alt=""
                                className="w-full h-full object-cover"
                                loading="lazy"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center">
                                <Tv className="w-6 h-6 text-zinc-700" />
                              </div>
                            )}

                            {watched && (
                              <div
                                className={`absolute inset-0 flex items-center justify-center backdrop-blur-[1px] ${
                                  isRewatchView
                                    ? "bg-purple-500/20"
                                    : "bg-emerald-500/20"
                                }`}
                              >
                                <Check
                                  className={`w-8 h-8 drop-shadow-md ${isRewatchView ? "text-purple-200" : "text-emerald-400"}`}
                                />
                              </div>
                            )}
                          </div>

                          <div className="flex-1 min-w-0 flex flex-col justify-center gap-1">
                            <div className="flex justify-between items-start gap-2">
                              <div className="min-w-0">
                                <h4 className="text-sm font-bold text-white truncate pr-2">
                                  {en}. {ep.name || `Episodio ${en}`}
                                </h4>
                                <p className="text-xs text-zinc-500 mt-0.5">
                                  {formatDate(ep.air_date)}
                                </p>
                              </div>

                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => toggleEpisode(sn, en)}
                                className={`p-2 rounded-lg transition shrink-0 ${
                                  watched
                                    ? isRewatchView
                                      ? "text-purple-200 bg-purple-500/10 hover:bg-purple-500/20"
                                      : "text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20"
                                    : "text-zinc-500 hover:text-white hover:bg-white/10"
                                }`}
                                title={
                                  isRewatchView
                                    ? watched
                                      ? "Quitar de vistos (este rewatch)"
                                      : "Marcar como visto (este rewatch)"
                                    : watched
                                      ? "Quitar de vistos"
                                      : "Marcar como visto"
                                }
                              >
                                {busy ? (
                                  <Loader2 className="w-5 h-5 animate-spin" />
                                ) : watched ? (
                                  <EyeOff className="w-5 h-5" />
                                ) : (
                                  <Eye className="w-5 h-5" />
                                )}
                              </button>
                            </div>

                            <p className="text-xs sm:text-sm text-zinc-400 line-clamp-2 leading-relaxed max-h-[2.8rem] overflow-hidden hidden sm:block">
                              {ep.overview}
                            </p>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </>
          ) : (
            // TABLE MODE
            <div className="flex-1 overflow-y-auto no-scrollbar p-4 space-y-4 pb-20 sm:pb-4">
              {seasonsFilteredForTable.map((s) => {
                const sn = s.season_number;
                const total = s.episode_count || 0;
                const watchedArr = watchedBySeasonActive?.[sn] || [];
                const watchedSetLocal = new Set(watchedArr);
                const watchedCount = watchedArr.length;

                if (onlyUnwatched && watchedCount >= total) return null;

                const nums = Array.from(
                  {
                    length: Math.min(
                      total,
                      expandedSeason[sn] ? total : MAX_EPISODES_RENDER,
                    ),
                  },
                  (_, i) => i + 1,
                );
                const hasMore =
                  total > MAX_EPISODES_RENDER && !expandedSeason[sn];
                const remaining = total - MAX_EPISODES_RENDER;

                return (
                  <div
                    key={sn}
                    className="bg-zinc-900/30 border border-white/5 rounded-2xl p-4"
                  >
                    <div className="flex justify-between items-center mb-3">
                      <h4 className="text-sm font-bold text-white">
                        {seasonLabelText(sn, s.name)}
                      </h4>
                      <span className="text-xs font-medium text-zinc-500 bg-zinc-900 px-2 py-1 rounded-md border border-white/5">
                        {watchedCount}/{total}
                      </span>
                    </div>

                    <div className="flex flex-wrap gap-1.5">
                      {nums.map((en) => {
                        const w = watchedSetLocal.has(en);
                        const key = `S${sn}E${en}`;
                        const busy = busyKey === key;

                        return (
                          <button
                            key={en}
                            type="button"
                            disabled={busy}
                            onClick={() => toggleEpisode(sn, en)}
                            className={`w-9 h-9 rounded-lg text-xs font-bold flex items-center justify-center transition border ${
                              w
                                ? isRewatchView
                                  ? "bg-purple-600 border-purple-500 text-white"
                                  : "bg-emerald-600 border-emerald-500 text-white"
                                : "bg-zinc-800 border-zinc-700 text-zinc-400 hover:bg-zinc-700 hover:text-white"
                            } ${busy ? "opacity-50" : ""}`}
                            title={
                              isRewatchView
                                ? w
                                  ? "Quitar (rewatch)"
                                  : "Marcar (rewatch)"
                                : w
                                  ? "Quitar de vistos"
                                  : "Marcar como visto"
                            }
                          >
                            {busy ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              en
                            )}
                          </button>
                        );
                      })}

                      {hasMore && (
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedSeason((p) => ({ ...p, [sn]: true }))
                          }
                          className="px-3 h-9 rounded-lg bg-zinc-800 border border-zinc-700 text-xs font-bold text-zinc-400 hover:text-white"
                        >
                          +{remaining}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ===== Modal: Añadir visionado ===== */}
        <AnimatePresence>
          {addPlayOpen && (
            <motion.div
              className="absolute inset-0 z-[200] flex items-center justify-center p-4"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => !addPlayBusy && setAddPlayOpen(false)}
            >
              <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" />
              <motion.div
                initial={{ opacity: 0, y: 10, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 10, scale: 0.98 }}
                transition={{ duration: 0.18 }}
                onClick={(e) => e.stopPropagation()}
                className="relative w-full max-w-lg rounded-3xl border border-white/10 bg-[#0b0b0b] shadow-2xl overflow-hidden"
              >
                <div className="p-5 border-b border-white/10 flex items-start justify-between gap-4">
                  <div>
                    <h3 className="text-lg font-black text-white">
                      Añadir visionado
                    </h3>
                    <p className="text-xs text-zinc-400 mt-1">
                      Añade un play. Si tiene fecha, podrás seleccionar ese
                      rewatch y marcar episodios de forma independiente.
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={addPlayBusy}
                    onClick={() => setAddPlayOpen(false)}
                    className="p-2 rounded-full bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white transition disabled:opacity-50"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="p-5 space-y-4">
                  <div className="text-[11px] font-black text-zinc-400 uppercase tracking-wider">
                    Fecha del play
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {[
                      { id: "just_finished", label: "Just finished" },
                      {
                        id: "release_date",
                        label: "Release date",
                        disabled: !showReleaseDate,
                      },
                      { id: "unknown", label: "Unknown date" },
                      { id: "other_date", label: "Other date" },
                    ].map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        disabled={addPlayBusy || opt.disabled}
                        onClick={() => setAddPlayPreset(opt.id)}
                        className={`px-3 py-2 rounded-xl border text-xs font-black transition
                          ${
                            addPlayPreset === opt.id
                              ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
                              : "bg-zinc-900 border-white/10 text-zinc-300 hover:bg-zinc-800"
                          }
                          ${opt.disabled ? "opacity-40 cursor-not-allowed" : ""}`}
                        title={
                          opt.id === "release_date" && !showReleaseDate
                            ? "Falta showReleaseDate"
                            : undefined
                        }
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>

                  {addPlayPreset === "other_date" && (
                    <div className="mt-2">
                      <label className="block text-[11px] font-bold text-zinc-500 mb-2">
                        Elige fecha y hora
                      </label>
                      <input
                        type="datetime-local"
                        value={addPlayOtherValue}
                        onChange={(e) => setAddPlayOtherValue(e.target.value)}
                        disabled={addPlayBusy}
                        className="w-full bg-zinc-900/50 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:border-emerald-500/50 outline-none transition"
                      />
                    </div>
                  )}

                  {!!addPlayError && (
                    <div className="text-xs text-red-300 font-medium">
                      {addPlayError}
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                    <button
                      type="button"
                      disabled={addPlayBusy}
                      onClick={() => setAddPlayOpen(false)}
                      className="py-3 rounded-2xl font-black text-sm transition bg-zinc-900 border border-white/10 text-zinc-200 hover:bg-zinc-800 disabled:opacity-50"
                    >
                      Cancelar
                    </button>

                    <button
                      type="button"
                      disabled={addPlayBusy}
                      onClick={onConfirmAddPlay}
                      className="py-3 rounded-2xl font-black text-sm transition flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-50"
                    >
                      {addPlayBusy ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Plus className="w-4 h-4" />
                      )}
                      Añadir
                    </button>
                  </div>

                  <div className="text-[11px] text-zinc-500 leading-relaxed">
                    <span className="text-zinc-300 font-semibold">Tip:</span> Si
                    añades una fecha, aparecerá como “Rewatch · fecha” en el
                    selector de vista.
                  </div>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ===== Modal: Historial de visionados ===== */}
        <AnimatePresence>
          {historyOpen && (
            <motion.div
              className="absolute inset-0 z-[210] flex items-center justify-center p-4"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setHistoryOpen(false)}
            >
              <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" />
              <motion.div
                initial={{ opacity: 0, y: 10, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 10, scale: 0.98 }}
                transition={{ duration: 0.18 }}
                onClick={(e) => e.stopPropagation()}
                className="relative w-full max-w-2xl rounded-3xl border border-white/10 bg-[#0b0b0b] shadow-2xl overflow-hidden"
              >
                <div className="p-5 border-b border-white/10 flex items-start justify-between gap-4">
                  <div>
                    <h3 className="text-lg font-black text-white">
                      Historial de visionados
                    </h3>
                    <p className="text-xs text-zinc-400 mt-1">
                      Plays registrados para esta serie (
                      {normalizedPlays.length}).
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setHistoryOpen(false)}
                    className="p-2 rounded-full bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white transition"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="p-5 space-y-4">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                    <input
                      value={historyQuery}
                      onChange={(e) => {
                        setHistoryQuery(e.target.value);
                        setHistoryLimit(60);
                      }}
                      placeholder="Buscar por fecha/hora..."
                      className="w-full bg-zinc-900/50 border border-white/10 rounded-xl pl-9 pr-4 py-2 text-sm text-zinc-200 focus:outline-none focus:border-emerald-500/50 transition"
                    />
                  </div>

                  <div className="max-h-[55vh] overflow-y-auto sv-scroll space-y-2 pr-1">
                    {visibleHistory.length === 0 ? (
                      <div className="text-center py-10 text-zinc-500 text-sm">
                        No hay resultados.
                      </div>
                    ) : (
                      visibleHistory.map((iso) => (
                        <div
                          key={iso}
                          className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3"
                        >
                          <div className="min-w-0">
                            <div className="text-sm font-extrabold text-white truncate">
                              {formatDate(iso)}
                            </div>
                            <div className="text-xs text-zinc-400 mt-0.5">
                              {formatDateTime(iso)}
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() => {
                              changeView(iso);
                              setHistoryOpen(false);
                            }}
                            className="shrink-0 px-3 py-2 rounded-xl border text-xs font-black bg-purple-500/10 border-purple-500/20 text-purple-200 hover:bg-purple-500/15 transition"
                            title="Abrir esta vista rewatch"
                          >
                            Abrir rewatch
                          </button>
                        </div>
                      ))
                    )}

                    {visibleHistory.length < filteredHistory.length && (
                      <button
                        type="button"
                        onClick={() => setHistoryLimit((n) => n + 60)}
                        className="w-full mt-2 py-3 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 text-white font-black text-sm transition"
                      >
                        Mostrar más (
                        {filteredHistory.length - visibleHistory.length})
                      </button>
                    )}
                  </div>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
