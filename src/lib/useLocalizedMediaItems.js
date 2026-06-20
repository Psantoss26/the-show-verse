"use client";

import { useEffect, useMemo, useState } from "react";

import { normalizeLocale } from "@/lib/localization";

const CACHE_KEY = "showverse:localized-media:v2";
const CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 14;

function resolveType(item) {
  const type = item?.media_type || item?.mediaType;
  if (type === "movie") return "movie";
  if (type === "tv" || type === "show") return "tv";
  return item?.title ? "movie" : "tv";
}

function resolveId(item) {
  return Number(item?.tmdbId || item?.tmdb_id || item?.media_id || item?.id);
}

function mediaKey(item) {
  const type = resolveType(item);
  const id = resolveId(item);
  return Number.isFinite(id) && id > 0 ? `${type}:${id}` : null;
}

function localizedCacheKey(locale, key) {
  return `${normalizeLocale(locale)}:${key}`;
}

function readCache() {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeCache(cache) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {}
}

function readCachedItems(items, locale) {
  const cache = readCache();
  const now = Date.now();
  const map = new Map();
  const missing = [];
  let dirty = false;

  for (const item of items) {
    const key = mediaKey(item);
    if (!key) continue;
    const cacheKey = localizedCacheKey(locale, key);
    const entry = cache[cacheKey];
    if (entry?.data && now - Number(entry.t || 0) < CACHE_TTL_MS) {
      map.set(key, entry.data);
      continue;
    }
    if (entry) {
      delete cache[cacheKey];
      dirty = true;
    }
    missing.push(item);
  }

  if (dirty) writeCache(cache);
  return { map, missing };
}

function writeCachedItems(results, locale) {
  if (!results || typeof results !== "object") return;
  const cache = readCache();
  const now = Date.now();
  for (const [key, data] of Object.entries(results)) {
    cache[localizedCacheKey(locale, key)] = { t: now, data };
  }
  writeCache(cache);
}

function mergeItem(item, localized) {
  if (!localized) return item;
  return {
    ...item,
    title: localized.title || localized.name || item.title || item.name || null,
    name: localized.name || localized.title || item.name || item.title || null,
    overview: localized.overview || item.overview || null,
    poster_path: localized.poster_path || item.poster_path || null,
    backdrop_path: localized.backdrop_path || item.backdrop_path || null,
    release_date: localized.release_date || item.release_date || null,
    first_air_date: localized.first_air_date || item.first_air_date || null,
    year: localized.year || item.year || null,
    genre_ids: Array.isArray(localized.genre_ids) && localized.genre_ids.length
      ? localized.genre_ids
      : item.genre_ids,
    genres: Array.isArray(localized.genres) && localized.genres.length
      ? localized.genres
      : item.genres,
    vote_average: localized.vote_average ?? item.vote_average ?? null,
  };
}

export function useLocalizedMediaItems(items, locale, { limit = 120 } = {}) {
  const normalizedLocale = normalizeLocale(locale);
  const safeItems = Array.isArray(items) ? items : [];
  const [localizedByKey, setLocalizedByKey] = useState(() => new Map());
  const signature = useMemo(
    () => safeItems.map((item) => mediaKey(item)).filter(Boolean).join("|"),
    [safeItems],
  );

  useEffect(() => {
    if (!safeItems.length) {
      setLocalizedByKey(new Map());
      return undefined;
    }

    let cancelled = false;
    const scopedItems = safeItems.slice(0, limit);
    const { map, missing } = readCachedItems(scopedItems, normalizedLocale);
    setLocalizedByKey(map);

    const requestItems = missing.slice(0, limit).map((item) => ({
      id: resolveId(item),
      type: resolveType(item),
    }));

    if (!requestItems.length) return undefined;

    const load = async () => {
      const res = await fetch("/api/tmdb/localized-metadata", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          language: normalizedLocale,
          items: requestItems,
        }),
      }).catch(() => null);
      if (!res?.ok) return;
      const json = await res.json().catch(() => null);
      if (cancelled || !json?.results) return;
      writeCachedItems(json.results, normalizedLocale);
      setLocalizedByKey((current) => {
        const next = new Map(current);
        for (const [key, value] of Object.entries(json.results)) {
          next.set(key, value);
        }
        return next;
      });
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [limit, normalizedLocale, safeItems, signature]);

  return useMemo(
    () =>
      safeItems.map((item) => {
        const key = mediaKey(item);
        return mergeItem(item, key ? localizedByKey.get(key) : null);
      }),
    [safeItems, localizedByKey],
  );
}
