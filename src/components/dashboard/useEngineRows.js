"use client";
// Hook + conversor compartidos para las filas de la engine de dashboards.
// Cada dashboard (Inicio/Películas/Series) obtiene aquí sus filas genéricas +
// recomendaciones (ya deduplicadas y rotadas por el backend) y las pinta con
// SU propio componente de fila nativo.
import { useAuth } from "@/context/AuthContext";
import { useEffect, useMemo, useState } from "react";

const ENGINE_ROWS_CACHE_TTL_MS = 5 * 60 * 1000;
const ENGINE_ROWS_CACHE_PREFIX = "showverse:dashboard:engine:v2:";
const memoryCache = new Map();
const inFlight = new Map();

// Convierte el "card" de la engine a la forma TMDb que esperan las tarjetas de
// los dashboards (id, media_type, poster_path, etc.).
export function toTmdbShape(card) {
  if (!card || card.tmdbId == null) return null;
  const year = card.year || null;
  const dateStr = year ? `${year}-01-01` : undefined;
  const isTv = card.mediaType === "tv";
  return {
    id: card.tmdbId,
    media_type: card.mediaType,
    title: card.title,
    name: card.title,
    original_title: card.title,
    original_name: card.title,
    poster_path: card.posterPath || null,
    backdrop_path: card.backdropPath || null,
    vote_average: typeof card.voteAverage === "number" ? card.voteAverage : 0,
    genre_ids: Array.isArray(card.genreIds) ? card.genreIds : [],
    popularity: card.popularity || 0,
    release_date: isTv ? undefined : dateStr,
    first_air_date: isTv ? dateStr : undefined,
  };
}

export function mapRows(json) {
  if (!json || !Array.isArray(json.rows)) return [];
  return json.rows
    .map((row) => {
      const seen = new Set();
      const items = (Array.isArray(row.items) ? row.items : [])
        .map(toTmdbShape)
        .filter((item) => {
          if (!item?.id) return false;
          const key = `${item.media_type}:${item.id}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });

      return {
        key: row.key,
        title: row.title,
        reason: row.reason || null,
        mediaType: row.mediaType,
        items,
      };
    })
    .filter((row) => row.items.length > 0);
}

function cacheKey(surface, scope) {
  return `${surface}:${scope}`;
}

function readMemoryCache(key) {
  const cached = memoryCache.get(key);
  if (!cached) return null;
  if (Date.now() - cached.t > ENGINE_ROWS_CACHE_TTL_MS) {
    memoryCache.delete(key);
    return null;
  }
  return cached;
}

function readSessionCache(key) {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(`${ENGINE_ROWS_CACHE_PREFIX}${key}`);
    if (!raw) return null;
    const cached = JSON.parse(raw);
    if (!cached || Date.now() - Number(cached.t || 0) > ENGINE_ROWS_CACHE_TTL_MS) {
      window.sessionStorage.removeItem(`${ENGINE_ROWS_CACHE_PREFIX}${key}`);
      return null;
    }
    return cached;
  } catch {
    return null;
  }
}

function writeCache(key, value) {
  const cached = { ...value, t: Date.now() };
  memoryCache.set(key, cached);

  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(
      `${ENGINE_ROWS_CACHE_PREFIX}${key}`,
      JSON.stringify(cached),
    );
  } catch {
    // ignore storage quota/private mode
  }
}

function itemIdentity(item) {
  if (!item?.id) return "";
  return `${item.media_type || ""}:${item.id}`;
}

function rowIdentity(row) {
  const ids = (Array.isArray(row?.items) ? row.items : [])
    .map(itemIdentity)
    .join(",");
  return `${row?.key || ""}:${row?.title || ""}:${ids}`;
}

function rowsIdentity(rows) {
  return (Array.isArray(rows) ? rows : []).map(rowIdentity).join("|");
}

function stabilizeRows(currentRows, nextRows) {
  const current = Array.isArray(currentRows) ? currentRows : [];
  const next = Array.isArray(nextRows) ? nextRows : [];

  if (rowsIdentity(current) === rowsIdentity(next)) return current;

  const currentByIdentity = new Map(
    current.map((row) => [rowIdentity(row), row]),
  );
  let changed = current.length !== next.length;

  const stableRows = next.map((row, index) => {
    const stable = currentByIdentity.get(rowIdentity(row));
    if (stable) return stable;
    if (current[index] !== row) changed = true;
    return row;
  });

  return changed ? stableRows : current;
}

function setRowsStable(setRows, nextRows) {
  setRows((current) => stabilizeRows(current, nextRows));
}

async function fetchEngineRows(surface, key) {
  if (inFlight.has(key)) return inFlight.get(key);

  const promise = fetch(`/api/dashboard/${surface}`, {
    cache: "no-store",
    credentials: "include",
    priority: "high",
  })
    .then((r) => (r.ok ? r.json() : null))
    .then((json) => ({
      rows: mapRows(json),
      personalized: !!json?.personalized,
    }))
    .finally(() => {
      inFlight.delete(key);
    });

  inFlight.set(key, promise);
  return promise;
}

// Obtiene las filas de la engine para una superficie ('home'|'movies'|'series').
// Hace fetch en cliente al proxy /api/dashboard/:surface (que reenvía la auth
// para personalizar, o sirve genérico si el usuario es anónimo).
export function useEngineRows(surface, { initialRows = [] } = {}) {
  const { account, hydrated } = useAuth();
  const scope = hydrated ? (account?.id ? `user:${account.id}` : "anon") : null;
  const initialMappedRows = useMemo(
    () => mapRows({ rows: initialRows }),
    [initialRows],
  );
  const [rows, setRows] = useState(initialMappedRows);
  const [loading, setLoading] = useState(initialMappedRows.length === 0);
  const [personalized, setPersonalized] = useState(false);

  useEffect(() => {
    if (initialMappedRows.length === 0) return;
    setRows((current) =>
      current.length ? stabilizeRows(current, initialMappedRows) : initialMappedRows,
    );
    setLoading(false);
  }, [initialMappedRows]);

  useEffect(() => {
    if (!surface || !scope) return;
    let cancel = false;
    const key = cacheKey(surface, scope);
    const cached = readMemoryCache(key) || readSessionCache(key);

    if (cached?.rows?.length) {
      setRowsStable(setRows, cached.rows);
      setPersonalized(!!cached.personalized);
      setLoading(false);
    } else if (initialMappedRows.length) {
      setRowsStable(setRows, initialMappedRows);
      setLoading(false);
    } else {
      setLoading(true);
    }

    if (scope === "anon" && initialMappedRows.length && !cached?.rows?.length) {
      writeCache(key, {
        rows: initialMappedRows,
        personalized: false,
      });
      setPersonalized(false);
      return () => {
        cancel = true;
      };
    }

    fetchEngineRows(surface, key)
      .then((payload) => {
        if (cancel) return;
        writeCache(key, payload);
        setRowsStable(setRows, payload.rows);
        setPersonalized(payload.personalized);
      })
      .catch(() => {
        if (!cancel && !cached?.rows?.length && !initialMappedRows.length) {
          setRows([]);
        }
      })
      .finally(() => {
        if (!cancel) setLoading(false);
      });

    return () => {
      cancel = true;
    };
  }, [surface, scope, initialMappedRows]);

  return { rows, loading, personalized };
}
