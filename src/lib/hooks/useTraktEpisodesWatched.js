"use client";

// /src/lib/hooks/useTraktEpisodesWatched.js
//
// Máquina de "episodios vistos" de Trakt para series, extraída VERBATIM de
// DetailsClient para que la ficha completa y la ficha rápida (DetailModal del
// dashboard) compartan EXACTAMENTE la misma lógica (una sola fuente de verdad):
//   - watchedBySeason (episodios vistos por temporada) + carga desde Trakt
//   - marcar/desmarcar episodios (con actualización optimista + rollback)
//   - serie completa (marcar todo / añadir play de serie)
//   - runs de rewatch (crear/borrar/cambiar vista) persistidos en localStorage
//   - progreso del run activo (rewatchWatchedBySeason) + historyIds por episodio
//
// Los acoplamientos que en DetailsClient tocaban OTRAS máquinas se inyectan:
//   - `connected`               ← trakt.connected (estado de conexión)
//   - `traktId`                 ← id numérico de Trakt ya resuelto (opcional)
//   - `seasons`                 ← data.seasons (temporadas de TMDb)
//   - `episodesModalOpen`       ← estado abierto del modal (refresco al abrir)
//   - `onWatchedAnyChange(has)` ← antes hacía setTrakt({ watched: has })
//   - `onStatusShouldRefresh()` ← antes llamaba a reloadTraktStatus()
//   - `initialWatchedBySeason`  ← hidratación desde el servidor (opcional)
//
// Las claves de localStorage son las MISMAS que usa DetailsClient, de modo que
// el estado de rewatch/vista es coherente entre ambas superficies.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  traktGetShowWatched,
  traktGetShowPlays,
  traktSetEpisodeWatched,
  traktAddEpisodePlay,
  traktAddShowPlay,
  traktRemoveWatchPlay,
  traktRemoveHistoryEntries,
  invalidateTraktGetCache,
} from "@/lib/api/traktClient";

const SHOW_BUSY_KEY = "SHOW";

/* ----------------------------- helpers puros ------------------------------ */

function withTimeout(promise, timeoutMs) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Timeout")), timeoutMs),
    ),
  ]);
}

function isDegradedTraktPayload(value) {
  if (!value || typeof value !== "object") return false;
  return value.degraded === true || (!!value.error && value.found !== true);
}

function normalizeWatchedBySeasonMap(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};

  return Object.entries(value).reduce((acc, [seasonKey, episodes]) => {
    const seasonNumber = Number(seasonKey);
    if (!Number.isFinite(seasonNumber)) return acc;

    const normalizedEpisodes = Array.isArray(episodes)
      ? Array.from(
          new Set(
            episodes
              .map((episode) => Number(episode))
              .filter((episode) => Number.isFinite(episode) && episode > 0),
          ),
        ).sort((a, b) => a - b)
      : [];

    acc[seasonNumber] = normalizedEpisodes;
    return acc;
  }, {});
}

function hasAnyWatchedEpisodeInMap(value) {
  return Object.values(normalizeWatchedBySeasonMap(value)).some(
    (episodes) => Array.isArray(episodes) && episodes.length > 0,
  );
}

export function getWatchedEpisodeCountForSeason(value, seasonNumber, total) {
  const normalized = normalizeWatchedBySeasonMap(value);
  const episodes = normalized?.[seasonNumber] || [];
  if (!Array.isArray(episodes) || total <= 0) return 0;

  return new Set(
    episodes.filter(
      (episode) =>
        Number.isInteger(episode) && episode >= 1 && episode <= total,
    ),
  ).size;
}

/* -------------------------------- hook ------------------------------------ */

export function useTraktEpisodesWatched({
  mediaType,
  tmdbId,
  title,
  connected = false,
  seasons = [],
  traktId = null,
  episodesModalOpen = false,
  initialWatchedBySeason = null,
  initialWatchedLoaded = false,
  onStatusShouldRefresh,
  onWatchedAnyChange,
  // Ref del id numérico de Trakt ya resuelto, COMPARTIDA con la máquina de
  // estado del consumidor (DetailsClient) para no duplicar la resolución. Si no
  // se pasa, el hook usa una ref interna sembrada desde `traktId`.
  traktResolvedIdRef: externalTraktResolvedIdRef = null,
} = {}) {
  // Alias internos para reproducir la lógica de DetailsClient sin re-escribirla.
  const id = tmdbId;
  const type = mediaType === "tv" ? "tv" : "movie";

  // Callbacks estables (evitan re-crear callbacks del hook si el consumidor
  // pasa funciones inline).
  const onStatusShouldRefreshRef = useRef(onStatusShouldRefresh);
  const onWatchedAnyChangeRef = useRef(onWatchedAnyChange);
  useEffect(() => {
    onStatusShouldRefreshRef.current = onStatusShouldRefresh;
  }, [onStatusShouldRefresh]);
  useEffect(() => {
    onWatchedAnyChangeRef.current = onWatchedAnyChange;
  }, [onWatchedAnyChange]);

  const reloadTraktStatus = useCallback(async () => {
    try {
      await onStatusShouldRefreshRef.current?.();
    } catch {}
  }, []);

  /* --------------------------- claves de storage --------------------------- */
  const rewatchStorageKey = `showverse:trakt:rewatchStartAt:${id}`;
  const rewatchRunsStorageKey = `showverse:trakt:rewatchRuns:${id}`;
  const episodesViewStorageKey = `showverse:trakt:episodesView:${id}`;

  /* -------------------------------- estado --------------------------------- */
  const [rewatchRuns, setRewatchRuns] = useState([]);
  const [activeEpisodesView, setActiveEpisodesView] = useState("global");
  const [rewatchHistoryByEpisode, setRewatchHistoryByEpisode] = useState({});

  const initialNormalized = useMemo(
    () =>
      type === "tv" && initialWatchedBySeason
        ? normalizeWatchedBySeasonMap(initialWatchedBySeason)
        : {},
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const [watchedBySeason, setWatchedBySeason] = useState(initialNormalized);
  const [watchedBySeasonLoaded, setWatchedBySeasonLoaded] = useState(
    type === "tv" && !!initialWatchedLoaded,
  );
  const [episodeBusyKey, setEpisodeBusyKey] = useState(""); // "S1E3" | "SHOW" | ""
  const [showPlays, setShowPlays] = useState([]); // Fechas ISO de cada visionado completo
  const [rewatchStartAt, setRewatchStartAt] = useState(null); // Fecha ISO de inicio del rewatch actual
  const [rewatchWatchedBySeason, setRewatchWatchedBySeason] = useState(null);

  /* --------------------------------- refs ---------------------------------- */
  const rewatchRunsRef = useRef([]);
  const activeEpisodesViewRef = useRef("global");
  const rewatchStartAtRef = useRef(null);
  const watchedBySeasonRef = useRef(initialNormalized);
  const watchedBySeasonLoadedRef = useRef(type === "tv" && !!initialWatchedLoaded);
  const watchedBySeasonRequestIdRef = useRef(0);
  const showPlaysRequestIdRef = useRef(0);
  const loadTraktShowWatchedRef = useRef(null);
  const rewatchViewCacheRef = useRef(new Map());
  const internalResolvedIdRef = useRef(traktId ?? null);
  // Ref compartida si el consumidor la aporta; si no, la interna.
  const traktResolvedIdRef = externalTraktResolvedIdRef || internalResolvedIdRef;
  const showWatchedInitiatedRef = useRef(false);

  useEffect(() => {
    if (traktId != null && !externalTraktResolvedIdRef) {
      internalResolvedIdRef.current = traktId;
    }
  }, [traktId, externalTraktResolvedIdRef]);

  useEffect(() => {
    rewatchRunsRef.current = Array.isArray(rewatchRuns) ? rewatchRuns : [];
  }, [rewatchRuns]);

  useEffect(() => {
    activeEpisodesViewRef.current = activeEpisodesView || "global";
  }, [activeEpisodesView]);

  useEffect(() => {
    rewatchStartAtRef.current = rewatchStartAt || null;
  }, [rewatchStartAt]);

  useEffect(() => {
    watchedBySeasonRef.current =
      watchedBySeason && typeof watchedBySeason === "object"
        ? watchedBySeason
        : {};
  }, [watchedBySeason]);

  useEffect(() => {
    watchedBySeasonLoadedRef.current = watchedBySeasonLoaded;
  }, [watchedBySeasonLoaded]);

  /* ------------------------ normalización + estado ------------------------- */
  const applyWatchedBySeasonState = useCallback(
    (nextValue, { loaded = true } = {}) => {
      const normalized = normalizeWatchedBySeasonMap(nextValue);
      setWatchedBySeason(normalized);
      setWatchedBySeasonLoaded(loaded);

      if (type === "tv") {
        const hasAny = hasAnyWatchedEpisodeInMap(normalized);
        onWatchedAnyChangeRef.current?.(hasAny);
      }

      return normalized;
    },
    [type],
  );

  /* --------------------------- ventanas de rewatch -------------------------- */
  const resolveRewatchWindow = useCallback((viewId, runsOverride) => {
    const resolvedViewId = viewId || "global";
    if (resolvedViewId === "global") {
      return { viewId: "global", startAt: null, endBefore: null };
    }

    const baseRuns = Array.isArray(runsOverride)
      ? runsOverride
      : rewatchRunsRef.current;
    const sortedRuns = [...baseRuns]
      .map((run) => {
        const startedAt = String(run?.startedAt || run?.id || "");
        if (!startedAt) return null;
        return {
          id: String(run?.id || startedAt),
          startedAt,
          ts: new Date(startedAt).getTime(),
        };
      })
      .filter((run) => Number.isFinite(run?.ts))
      .sort((a, b) => b.ts - a.ts);

    const exactIdx = sortedRuns.findIndex(
      (run) => run.id === resolvedViewId || run.startedAt === resolvedViewId,
    );

    if (exactIdx >= 0) {
      return {
        viewId: resolvedViewId,
        startAt: sortedRuns[exactIdx].startedAt,
        endBefore: exactIdx > 0 ? sortedRuns[exactIdx - 1].startedAt : null,
      };
    }

    const fallbackStartAt = String(resolvedViewId);
    const fallbackTs = new Date(fallbackStartAt).getTime();
    const newerRun = Number.isFinite(fallbackTs)
      ? sortedRuns
          .filter((run) => run.ts > fallbackTs)
          .sort((a, b) => a.ts - b.ts)[0] || null
      : null;

    return {
      viewId: resolvedViewId,
      startAt: fallbackStartAt,
      endBefore: newerRun?.startedAt || null,
    };
  }, []);

  const buildRewatchViewCacheKey = useCallback(
    (startAtIso = null, endBeforeIso = null) =>
      startAtIso
        ? `${String(startAtIso)}::${String(endBeforeIso || "")}`
        : "global",
    [],
  );

  const cacheRewatchViewState = useCallback(
    ({
      startAtIso = null,
      endBeforeIso = null,
      watchedBySeason: nextWatchedBySeason = {},
      historyIdsByEpisode: nextHistoryIdsByEpisode = {},
    } = {}) => {
      if (!startAtIso) return;
      const cacheKey = buildRewatchViewCacheKey(startAtIso, endBeforeIso);
      rewatchViewCacheRef.current.set(cacheKey, {
        watchedBySeason:
          nextWatchedBySeason && typeof nextWatchedBySeason === "object"
            ? nextWatchedBySeason
            : {},
        historyIdsByEpisode:
          nextHistoryIdsByEpisode && typeof nextHistoryIdsByEpisode === "object"
            ? nextHistoryIdsByEpisode
            : {},
      });
    },
    [buildRewatchViewCacheKey],
  );

  const restoreRewatchViewStateFromCache = useCallback(
    (startAtIso = null, endBeforeIso = null) => {
      if (!startAtIso) return false;
      const cacheKey = buildRewatchViewCacheKey(startAtIso, endBeforeIso);
      const cached = rewatchViewCacheRef.current.get(cacheKey);
      if (!cached) return false;

      setRewatchWatchedBySeason(
        cached?.watchedBySeason && typeof cached.watchedBySeason === "object"
          ? cached.watchedBySeason
          : {},
      );
      setRewatchHistoryByEpisode(
        cached?.historyIdsByEpisode &&
          typeof cached.historyIdsByEpisode === "object"
          ? cached.historyIdsByEpisode
          : {},
      );
      return true;
    },
    [buildRewatchViewCacheKey],
  );

  const mergeRewatchRuns = useCallback((currentRuns, incomingRuns) => {
    const normalizeRun = (run) => {
      const startedAt = String(run?.startedAt || run?.id || "");
      if (!startedAt) return null;
      return {
        id: String(run?.id || startedAt),
        startedAt,
        label: run?.label || `Rewatch · ${startedAt.slice(0, 10)}`,
        completedAt: run?.completedAt || null,
        completed: typeof run?.completed === "boolean" ? run.completed : null,
        progressCount:
          typeof run?.progressCount === "number" ? run.progressCount : null,
      };
    };

    const mergeRunData = (baseRun, overlayRun) => ({
      ...(baseRun || {}),
      ...(overlayRun || {}),
      id: String(baseRun?.id || overlayRun?.id || ""),
      startedAt: String(baseRun?.startedAt || overlayRun?.startedAt || ""),
      label:
        baseRun?.label ||
        overlayRun?.label ||
        `Rewatch · ${String(baseRun?.startedAt || overlayRun?.startedAt || "").slice(0, 10)}`,
      completedAt: overlayRun?.completedAt ?? baseRun?.completedAt ?? null,
      completed:
        typeof overlayRun?.completed === "boolean"
          ? overlayRun.completed
          : (baseRun?.completed ?? null),
      progressCount:
        overlayRun?.progressCount ?? baseRun?.progressCount ?? null,
    });

    const normalizedCurrent = (Array.isArray(currentRuns) ? currentRuns : [])
      .map(normalizeRun)
      .filter(Boolean)
      .sort(
        (a, b) =>
          new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime(),
      );
    const normalizedIncoming = (Array.isArray(incomingRuns) ? incomingRuns : [])
      .map(normalizeRun)
      .filter(Boolean)
      .sort(
        (a, b) =>
          new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime(),
      );

    const mergedById = new Map();

    for (const run of normalizedCurrent) {
      mergedById.set(run.id, run);
    }

    for (const incomingRun of normalizedIncoming) {
      const exact = mergedById.get(incomingRun.id);
      if (exact) {
        mergedById.set(incomingRun.id, mergeRunData(exact, incomingRun));
        continue;
      }

      const incomingTs = new Date(incomingRun.startedAt).getTime();
      const candidateLocal = normalizedCurrent.find((localRun, index) => {
        const localTs = new Date(localRun.startedAt).getTime();
        const newerLocalTs =
          index > 0
            ? new Date(normalizedCurrent[index - 1].startedAt).getTime()
            : Number.NaN;

        if (!Number.isFinite(incomingTs) || !Number.isFinite(localTs)) {
          return false;
        }
        if (incomingTs < localTs) return false;
        if (Number.isFinite(newerLocalTs) && incomingTs >= newerLocalTs) {
          return false;
        }
        return true;
      });

      if (candidateLocal) {
        mergedById.set(
          candidateLocal.id,
          mergeRunData(candidateLocal, incomingRun),
        );
        continue;
      }

      mergedById.set(incomingRun.id, incomingRun);
    }

    return Array.from(mergedById.values()).sort(
      (a, b) =>
        new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime(),
    );
  }, []);

  const persistRuns = useCallback(
    (nextRuns) => {
      try {
        window.localStorage.setItem(
          rewatchRunsStorageKey,
          JSON.stringify(nextRuns || []),
        );
      } catch {}
    },
    [rewatchRunsStorageKey],
  );

  /* ------------------------- carga de vistos/plays ------------------------- */
  const loadTraktShowWatched = useCallback(
    async ({ allowDisconnected = false } = {}) => {
      if (type !== "tv") return;
      const requestId = watchedBySeasonRequestIdRef.current + 1;
      watchedBySeasonRequestIdRef.current = requestId;

      if (!connected && !allowDisconnected) {
        setWatchedBySeason({});
        setWatchedBySeasonLoaded(false);
        return { ok: false, connected: false };
      }

      try {
        const r = await withTimeout(
          traktGetShowWatched({
            tmdbId: Number(id),
            traktId: traktResolvedIdRef.current ?? undefined,
          }),
          25000,
        );

        if (requestId !== watchedBySeasonRequestIdRef.current) {
          return {
            ok: false,
            connected: !!connected,
            found: watchedBySeasonLoadedRef.current,
            watchedBySeason: watchedBySeasonRef.current,
          };
        }

        if (r?.connected === false) {
          setWatchedBySeason({});
          setWatchedBySeasonLoaded(false);
          return {
            ok: false,
            connected: false,
            found: false,
            watchedBySeason: {},
          };
        }

        if (isDegradedTraktPayload(r) && watchedBySeasonLoadedRef.current) {
          return {
            ok: false,
            connected: true,
            found: true,
            watchedBySeason: watchedBySeasonRef.current,
          };
        }

        const nextWatchedBySeason = applyWatchedBySeasonState(
          r?.watchedBySeason || {},
          { loaded: r?.connected !== false },
        );
        return {
          ok: true,
          connected: r?.connected !== false,
          found: !!r?.found,
          watchedBySeason: nextWatchedBySeason,
        };
      } catch {
        return {
          ok: false,
          connected: !!connected,
          found: watchedBySeasonLoadedRef.current,
          watchedBySeason: watchedBySeasonRef.current,
        };
      }
    },
    [type, id, connected, applyWatchedBySeasonState],
  );

  useEffect(() => {
    loadTraktShowWatchedRef.current = loadTraktShowWatched;
  }, [loadTraktShowWatched]);

  const loadTraktShowPlays = useCallback(
    async (startAtIso = null, endBeforeIso = null) => {
      if (type !== "tv") return;
      const requestId = showPlaysRequestIdRef.current + 1;
      showPlaysRequestIdRef.current = requestId;
      if (!connected) {
        setShowPlays([]);
        setRewatchWatchedBySeason(null);
        setRewatchHistoryByEpisode({});
        return;
      }

      try {
        const r = await traktGetShowPlays({
          tmdbId: id,
          startAt: startAtIso || undefined,
          endBefore: endBeforeIso || undefined,
        });

        if (requestId !== showPlaysRequestIdRef.current) {
          return;
        }

        if (Array.isArray(r?.rewatchRuns) && r.rewatchRuns.length > 0) {
          setRewatchRuns((prev) => {
            const mergedRuns = mergeRewatchRuns(prev, r.rewatchRuns);
            try {
              window.localStorage.setItem(
                rewatchRunsStorageKey,
                JSON.stringify(mergedRuns),
              );
            } catch {}
            return mergedRuns;
          });
        }

        setShowPlays(
          Array.isArray(r?.showPlays)
            ? r.showPlays
            : Array.isArray(r?.plays)
              ? r.plays
              : [],
        );

        if (startAtIso) {
          const nextWatchedBySeason =
            r?.watchedBySeasonSince &&
            typeof r.watchedBySeasonSince === "object"
              ? r.watchedBySeasonSince
              : {};
          const nextHistoryIds =
            r?.historyIdsByEpisodeSince &&
            typeof r.historyIdsByEpisodeSince === "object"
              ? r.historyIdsByEpisodeSince
              : {};

          cacheRewatchViewState({
            startAtIso,
            endBeforeIso,
            watchedBySeason: nextWatchedBySeason,
            historyIdsByEpisode: nextHistoryIds,
          });

          setRewatchWatchedBySeason(nextWatchedBySeason);
          setRewatchHistoryByEpisode(nextHistoryIds);
        } else {
          setRewatchWatchedBySeason(null);
          setRewatchHistoryByEpisode({});
        }
      } catch (e) {
        if (requestId !== showPlaysRequestIdRef.current) return;
        if (startAtIso) {
          const restored = restoreRewatchViewStateFromCache(
            startAtIso,
            endBeforeIso,
          );
          if (!restored) {
            setRewatchWatchedBySeason({});
            setRewatchHistoryByEpisode({});
          }
        }
      }
    },
    [
      id,
      type,
      connected,
      mergeRewatchRuns,
      rewatchRunsStorageKey,
      cacheRewatchViewState,
      restoreRewatchViewStateFromCache,
    ],
  );

  /* ---------------------------- carga inicial ------------------------------ */
  // Runs de rewatch desde localStorage (+ migración de formato legacy).
  useEffect(() => {
    if (type !== "tv") {
      setRewatchStartAt(null);
      setRewatchWatchedBySeason(null);
      setShowPlays([]);
      setRewatchRuns([]);
      setActiveEpisodesView("global");
      setRewatchHistoryByEpisode({});
      return;
    }

    try {
      let runs = [];
      const rawRuns = window.localStorage.getItem(rewatchRunsStorageKey);
      if (rawRuns) {
        const parsed = JSON.parse(rawRuns);
        if (Array.isArray(parsed)) runs = parsed;
      }

      if (!runs.length) {
        const legacy = window.localStorage.getItem(rewatchStorageKey);
        if (legacy) {
          runs = [
            {
              id: legacy,
              startedAt: legacy,
              label: `Rewatch · ${legacy.slice(0, 10)}`,
            },
          ];
          try {
            window.localStorage.setItem(
              rewatchRunsStorageKey,
              JSON.stringify(runs),
            );
          } catch {}
        }
      }

      setRewatchRuns(runs);

      const savedView =
        window.localStorage.getItem(episodesViewStorageKey) || "global";
      const validView =
        savedView === "global" || runs.some((r) => r?.id === savedView)
          ? savedView
          : "global";

      setActiveEpisodesView(validView);

      if (validView === "global") {
        setRewatchStartAt(null);
      } else {
        const run = runs.find((r) => r.id === validView);
        setRewatchStartAt(run?.startedAt || validView);
      }
    } catch {
      setRewatchRuns([]);
      setActiveEpisodesView("global");
      setRewatchStartAt(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, id]);

  // Carga inicial de episodios vistos EN PARALELO (no espera a `connected`).
  useEffect(() => {
    if (type !== "tv") return;
    showWatchedInitiatedRef.current = true;
    void loadTraktShowWatchedRef.current?.({ allowDisconnected: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, type]);

  // Refresca vistos + plays al ABRIR el modal de episodios.
  useEffect(() => {
    let ignore = false;

    const refreshOnOpen = async () => {
      if (!episodesModalOpen) return;
      if (type !== "tv") return;
      if (!connected) return;

      try {
        await loadTraktShowWatched();
        if (ignore) return;

        const windowState = resolveRewatchWindow(
          activeEpisodesViewRef.current,
          rewatchRunsRef.current,
        );
        restoreRewatchViewStateFromCache(
          windowState.startAt || null,
          windowState.endBefore || null,
        );
        await loadTraktShowPlays(
          windowState.startAt || null,
          windowState.endBefore || null,
        );
      } catch {
        // no machacamos UI si falla
      }
    };

    refreshOnOpen();
    return () => {
      ignore = true;
    };
  }, [
    episodesModalOpen,
    type,
    connected,
    loadTraktShowWatched,
    loadTraktShowPlays,
    resolveRewatchWindow,
    restoreRewatchViewStateFromCache,
  ]);

  // Reconciliación en segundo plano al CERRAR el modal de episodios.
  const reconcileAfterClose = useCallback(() => {
    setEpisodeBusyKey("");
    if (type !== "tv" || !connected) return;
    void loadTraktShowWatched();
  }, [type, connected, loadTraktShowWatched]);

  /* ---------------------------- marcar episodio ---------------------------- */
  const toggleEpisodeWatched = useCallback(
    async (seasonNumber, episodeNumber) => {
      if (type !== "tv") return;
      if (!connected) return;
      if (episodeBusyKey) return;

      const key = `S${seasonNumber}E${episodeNumber}`;
      setEpisodeBusyKey(key);

      const currentlyWatched =
        !!watchedBySeason?.[seasonNumber]?.includes(episodeNumber);
      const next = !currentlyWatched;

      const optimisticWatchedBySeason = {
        ...normalizeWatchedBySeasonMap(watchedBySeasonRef.current),
      };
      const optimisticEpisodes = new Set(
        optimisticWatchedBySeason?.[seasonNumber] || [],
      );
      if (next) optimisticEpisodes.add(episodeNumber);
      else optimisticEpisodes.delete(episodeNumber);
      optimisticWatchedBySeason[seasonNumber] = Array.from(
        optimisticEpisodes,
      ).sort((a, b) => a - b);
      applyWatchedBySeasonState(optimisticWatchedBySeason, { loaded: true });

      try {
        const r = await traktSetEpisodeWatched({
          tmdbId: id,
          season: seasonNumber,
          episode: episodeNumber,
          watched: next,
          watchedAt: null,
          title,
        });
        invalidateTraktGetCache({
          tmdbId: id,
          traktId: traktResolvedIdRef.current ?? undefined,
        });

        if (r?.watchedBySeason) {
          applyWatchedBySeasonState(r.watchedBySeason, { loaded: true });
        } else {
          const fresh = await traktGetShowWatched({ tmdbId: id });
          applyWatchedBySeasonState(fresh?.watchedBySeason || {}, {
            loaded: true,
          });
        }
      } catch {
        const rollbackWatchedBySeason = {
          ...normalizeWatchedBySeasonMap(watchedBySeasonRef.current),
        };
        const rollbackEpisodes = new Set(
          rollbackWatchedBySeason?.[seasonNumber] || [],
        );
        if (!next) rollbackEpisodes.add(episodeNumber);
        else rollbackEpisodes.delete(episodeNumber);
        rollbackWatchedBySeason[seasonNumber] = Array.from(
          rollbackEpisodes,
        ).sort((a, b) => a - b);
        applyWatchedBySeasonState(rollbackWatchedBySeason, { loaded: true });
      } finally {
        setEpisodeBusyKey("");
      }
    },
    [type, connected, episodeBusyKey, watchedBySeason, id, title, applyWatchedBySeasonState],
  );

  const toggleEpisodeRewatch = useCallback(
    async (seasonNumber, episodeNumber, options = {}) => {
      if (type !== "tv") return;
      if (!connected) return;
      if (episodeBusyKey) return;

      const targetViewId =
        options && typeof options === "object" && !Array.isArray(options)
          ? options.viewId || activeEpisodesViewRef.current
          : activeEpisodesViewRef.current;
      const windowState = resolveRewatchWindow(
        targetViewId,
        rewatchRunsRef.current,
      );
      const targetStartAt = windowState.startAt || rewatchStartAtRef.current;
      if (!targetStartAt) return;

      const key = `S${seasonNumber}E${episodeNumber}`;
      setEpisodeBusyKey(key);

      const currentlyWatched =
        !!rewatchWatchedBySeason?.[seasonNumber]?.includes(episodeNumber);
      const next = !currentlyWatched;
      const watchedAtOverride =
        options && typeof options === "object" && !Array.isArray(options)
          ? options.watchedAt || null
          : null;

      let optimisticWatchedBySeason = null;
      setRewatchWatchedBySeason((prev) => {
        const p = prev && typeof prev === "object" ? prev : {};
        const cur = new Set(p?.[seasonNumber] || []);
        if (next) cur.add(episodeNumber);
        else cur.delete(episodeNumber);
        optimisticWatchedBySeason = {
          ...p,
          [seasonNumber]: Array.from(cur).sort((a, b) => a - b),
        };
        return optimisticWatchedBySeason;
      });
      cacheRewatchViewState({
        startAtIso: targetStartAt,
        endBeforeIso: windowState.endBefore || null,
        watchedBySeason: optimisticWatchedBySeason || {},
        historyIdsByEpisode: rewatchHistoryByEpisode || {},
      });

      try {
        if (next) {
          const watchedAtIso = watchedAtOverride || new Date().toISOString();
          const watchedAtMs = new Date(watchedAtIso).getTime();
          const rewatchStartMs = new Date(targetStartAt).getTime();

          if (
            Number.isFinite(watchedAtMs) &&
            Number.isFinite(rewatchStartMs) &&
            watchedAtMs < rewatchStartMs
          ) {
            throw new Error(
              "La fecha del episodio no puede ser anterior al inicio del rewatch activo.",
            );
          }

          const r = await traktAddEpisodePlay({
            tmdbId: id,
            season: seasonNumber,
            episode: episodeNumber,
            watchedAt: watchedAtIso,
            title,
          });
          invalidateTraktGetCache({
            tmdbId: id,
            traktId: traktResolvedIdRef.current ?? undefined,
          });
          const hid = r?.historyId || r?.id || null;
          if (hid)
            setRewatchHistoryByEpisode((p) => ({ ...(p || {}), [key]: hid }));
        } else {
          const hid = rewatchHistoryByEpisode?.[key];
          if (!hid) {
            throw new Error(
              "No hay historyId para desmarcar este episodio en rewatch.",
            );
          }
          await traktRemoveWatchPlay({ historyId: hid });
          invalidateTraktGetCache({
            tmdbId: id,
            traktId: traktResolvedIdRef.current ?? undefined,
          });
          setRewatchHistoryByEpisode((p) => {
            const nextMap = { ...(p || {}) };
            delete nextMap[key];
            return nextMap;
          });
        }

        await loadTraktShowPlays(targetStartAt, windowState.endBefore || null);

        const fresh = await traktGetShowWatched({ tmdbId: id });
        applyWatchedBySeasonState(fresh?.watchedBySeason || {}, {
          loaded: true,
        });
      } catch (e) {
        let rollbackWatchedBySeason = null;
        setRewatchWatchedBySeason((prev) => {
          const p = prev && typeof prev === "object" ? prev : {};
          const cur = new Set(p?.[seasonNumber] || []);
          if (!next) cur.add(episodeNumber);
          else cur.delete(episodeNumber);
          rollbackWatchedBySeason = {
            ...p,
            [seasonNumber]: Array.from(cur).sort((a, b) => a - b),
          };
          return rollbackWatchedBySeason;
        });
        cacheRewatchViewState({
          startAtIso: targetStartAt,
          endBeforeIso: windowState.endBefore || null,
          watchedBySeason: rollbackWatchedBySeason || {},
          historyIdsByEpisode: rewatchHistoryByEpisode || {},
        });
      } finally {
        setEpisodeBusyKey("");
      }
    },
    [
      type,
      connected,
      episodeBusyKey,
      rewatchWatchedBySeason,
      rewatchHistoryByEpisode,
      id,
      title,
      loadTraktShowPlays,
      resolveRewatchWindow,
      cacheRewatchViewState,
      applyWatchedBySeasonState,
    ],
  );

  /* ---------------------------- serie completa ----------------------------- */
  const onToggleShowWatched = useCallback(
    async (watchedAtOrNull) => {
      if (type !== "tv") return;
      if (!connected) return;
      if (episodeBusyKey) return;

      const tmdbIdNum = Number(id);
      if (!Number.isFinite(tmdbIdNum)) return;

      const seasonsList = Array.isArray(seasons) ? seasons : [];
      const seasonNumbers = seasonsList
        .map((s) => s?.season_number)
        .filter((n) => typeof n === "number" && n > 0);

      if (seasonNumbers.length === 0) {
        console.warn(
          "[useTraktEpisodesWatched] No hay temporadas válidas para marcar la serie completa.",
        );
        return;
      }

      setEpisodeBusyKey(SHOW_BUSY_KEY);

      try {
        const res = await fetch("/api/trakt/history/show", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tmdbId: tmdbIdNum,
            seasonNumbers,
            watchedAt: watchedAtOrNull,
          }),
        });

        const responseText = await res.text();

        let json;
        try {
          json = JSON.parse(responseText);
        } catch (parseError) {
          console.error(
            "[useTraktEpisodesWatched] Error parsing response as JSON:",
            parseError,
          );
          throw new Error(
            "El servidor devolvió una respuesta inválida (no JSON).",
          );
        }

        if (!res.ok)
          throw new Error(json?.error || "Error marcando serie en Trakt");
        invalidateTraktGetCache({
          tmdbId: tmdbIdNum,
          traktId: traktResolvedIdRef.current ?? undefined,
        });

        setWatchedBySeason(() => {
          if (!watchedAtOrNull) return {};
          const next = {};
          for (const s of seasonsList) {
            const sn = s?.season_number;
            const total = Number(s?.episode_count || 0);
            if (typeof sn === "number" && sn > 0 && total > 0) {
              next[sn] = Array.from({ length: total }, (_, i) => i + 1);
            }
          }
          return next;
        });

        await reloadTraktStatus();
        const fresh = await traktGetShowWatched({ tmdbId: tmdbIdNum });
        applyWatchedBySeasonState(fresh?.watchedBySeason || {}, {
          loaded: true,
        });
      } catch (e) {
        console.error("[useTraktEpisodesWatched] onToggleShowWatched error:", e);
      } finally {
        setEpisodeBusyKey("");
      }
    },
    [type, connected, episodeBusyKey, id, seasons, reloadTraktStatus, applyWatchedBySeasonState],
  );

  const onAddShowPlay = useCallback(
    async (watchedAtIsoOrNull) => {
      if (type !== "tv") return;
      if (!connected) return;
      if (episodeBusyKey) return;

      setEpisodeBusyKey(SHOW_BUSY_KEY);
      try {
        await traktAddShowPlay({ tmdbId: id, watchedAt: watchedAtIsoOrNull });
        invalidateTraktGetCache({
          tmdbId: id,
          traktId: traktResolvedIdRef.current ?? undefined,
        });
        await reloadTraktStatus();

        const fresh = await traktGetShowWatched({ tmdbId: id });
        applyWatchedBySeasonState(fresh?.watchedBySeason || {}, {
          loaded: true,
        });

        const windowState = resolveRewatchWindow(
          activeEpisodesViewRef.current,
          rewatchRunsRef.current,
        );
        await loadTraktShowPlays(
          windowState.startAt || null,
          windowState.endBefore || null,
        );
      } finally {
        setEpisodeBusyKey("");
      }
    },
    [
      type,
      connected,
      episodeBusyKey,
      id,
      reloadTraktStatus,
      applyWatchedBySeasonState,
      resolveRewatchWindow,
      loadTraktShowPlays,
    ],
  );

  /* ------------------------------ vistas/runs ------------------------------ */
  const changeEpisodesView = useCallback(
    async (viewId) => {
      const v = viewId || "global";
      setActiveEpisodesView(v);
      try {
        window.localStorage.setItem(episodesViewStorageKey, v);
      } catch {}

      if (v === "global") {
        setRewatchStartAt(null);
        await loadTraktShowPlays(null);
        return;
      }

      const windowState = resolveRewatchWindow(v, rewatchRuns);
      const startAt = windowState.startAt || v;

      setRewatchStartAt(startAt);
      restoreRewatchViewStateFromCache(startAt, windowState.endBefore || null);
      await loadTraktShowPlays(startAt, windowState.endBefore || null);
    },
    [
      episodesViewStorageKey,
      rewatchRuns,
      loadTraktShowPlays,
      resolveRewatchWindow,
      restoreRewatchViewStateFromCache,
    ],
  );

  const createRewatchRun = useCallback(
    async (startedAtIsoOrNull) => {
      const startedAt = startedAtIsoOrNull || new Date().toISOString();
      const run = {
        id: startedAt,
        startedAt,
        label: `Rewatch · ${startedAt.slice(0, 10)}`,
      };
      const nextRuns = [
        run,
        ...(Array.isArray(rewatchRunsRef.current)
          ? rewatchRunsRef.current
          : []
        ).filter((r) => r?.id !== run.id),
      ];

      setRewatchRuns(nextRuns);
      persistRuns(nextRuns);

      setActiveEpisodesView(run.id);
      try {
        window.localStorage.setItem(episodesViewStorageKey, run.id);
      } catch {}
      setRewatchStartAt(run.startedAt);

      const windowState = resolveRewatchWindow(run.id, nextRuns);
      await loadTraktShowPlays(windowState.startAt, windowState.endBefore || null);
    },
    [episodesViewStorageKey, persistRuns, loadTraktShowPlays, resolveRewatchWindow],
  );

  const deleteRewatchRun = useCallback(
    async (runId) => {
      if (!runId) return;

      const baseRuns = Array.isArray(rewatchRuns) ? rewatchRuns : [];
      const sortedRuns = [...baseRuns].sort(
        (a, b) =>
          new Date(b?.startedAt || b?.id || 0).getTime() -
          new Date(a?.startedAt || a?.id || 0).getTime(),
      );
      const targetIdx = sortedRuns.findIndex(
        (r) => (r?.id || r?.startedAt) === runId,
      );
      const targetRun = targetIdx >= 0 ? sortedRuns[targetIdx] : null;
      const startAt = targetRun?.startedAt || String(runId);
      const newerRun = targetIdx > 0 ? sortedRuns[targetIdx - 1] : null;
      const endBefore = newerRun?.startedAt || null;

      if (connected && type === "tv") {
        const windowData = await traktGetShowPlays({
          tmdbId: Number(id),
          startAt,
          ...(endBefore ? { endBefore } : {}),
        });

        const idsToRemove = Array.isArray(windowData?.historyIdsSince)
          ? windowData.historyIdsSince
          : [];

        if (idsToRemove.length) {
          const CHUNK = 300;
          for (let i = 0; i < idsToRemove.length; i += CHUNK) {
            await traktRemoveHistoryEntries({
              ids: idsToRemove.slice(i, i + CHUNK),
            });
          }
        }
      }

      setRewatchRuns((prev) => {
        const base = Array.isArray(prev) ? prev : [];
        const next = base.filter((r) => r?.id !== runId);
        persistRuns(next);
        return next;
      });

      const wasActive = activeEpisodesView === runId;

      setActiveEpisodesView((prev) => {
        const nextView = prev === runId ? "global" : prev;
        try {
          window.localStorage.setItem(episodesViewStorageKey, nextView);
        } catch {}
        return nextView;
      });

      if (wasActive) {
        setRewatchStartAt(null);
        await loadTraktShowPlays(null);
      }

      if (connected && type === "tv") {
        try {
          const fresh = await traktGetShowWatched({ tmdbId: Number(id) });
          applyWatchedBySeasonState(fresh?.watchedBySeason || {}, {
            loaded: true,
          });
        } catch {}

        try {
          if (wasActive) {
            await loadTraktShowPlays(null);
          } else {
            const windowState = resolveRewatchWindow(
              activeEpisodesViewRef.current,
              rewatchRunsRef.current,
            );
            await loadTraktShowPlays(
              windowState.startAt || null,
              windowState.endBefore || null,
            );
          }
        } catch {}
      }
    },
    [
      activeEpisodesView,
      rewatchRuns,
      connected,
      type,
      id,
      episodesViewStorageKey,
      persistRuns,
      loadTraktShowPlays,
      resolveRewatchWindow,
      applyWatchedBySeasonState,
    ],
  );

  return {
    // estado
    watchedBySeason,
    watchedBySeasonLoaded,
    episodeBusyKey,
    showPlays,
    rewatchStartAt,
    rewatchWatchedBySeason,
    rewatchRuns,
    activeEpisodesView,
    // carga / reconciliación
    loadTraktShowWatched,
    loadTraktShowPlays,
    reconcileAfterClose,
    // acciones de episodios / serie
    toggleEpisodeWatched,
    toggleEpisodeRewatch,
    onToggleShowWatched,
    onAddShowPlay,
    // vistas / runs de rewatch
    changeEpisodesView,
    createRewatchRun,
    deleteRewatchRun,
    // helpers de progreso (referencias estables a nivel de módulo, aptas para
    // arrays de dependencias en el consumidor)
    getWatchedEpisodeCountForSeason,
    hasAnyWatchedEpisode: hasAnyWatchedEpisodeInMap,
    // --- API extendida para consumidores que conservan efectos periféricos
    //     (DetailsClient: hidratación desde servidor, persistencia en
    //     localStorage, sync en foco, badge de progreso). No la necesita el
    //     modal, pero es aditiva. ---
    setWatchedBySeason,
    setWatchedBySeasonLoaded,
    setEpisodeBusyKey,
    watchedBySeasonRef,
    watchedBySeasonLoadedRef,
    applyWatchedBySeasonState,
  };
}

export default useTraktEpisodesWatched;
