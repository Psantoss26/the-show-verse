import { fetchTrakt, normalizeType } from "@/lib/trakt/fetchWithCache";

const RESOLVE_CACHE_TTL_MS = 60 * 60 * 1000;
const pendingResolutions = new Map();
const resolvedCache = new Map();

function getResolveCacheKey(type, tmdbId) {
  return `${String(type)}:${String(tmdbId)}`;
}

function getFromResolvedCache(cacheKey) {
  const cached = resolvedCache.get(cacheKey);
  if (!cached) return null;

  if (Date.now() > cached.expiresAt) {
    resolvedCache.delete(cacheKey);
    return null;
  }

  return cached.value || null;
}

function saveResolvedCache(cacheKey, value) {
  if (!value?.traktId) return;

  resolvedCache.set(cacheKey, {
    value,
    expiresAt: Date.now() + RESOLVE_CACHE_TTL_MS,
  });
}

function pickResolvedEntity(searchResult, normalizedType) {
  const first = Array.isArray(searchResult) ? searchResult[0] : null;
  const item = first?.[normalizedType] || null;
  const ids = item?.ids || null;
  const traktId = ids?.trakt || null;

  if (!traktId) return null;

  return {
    item,
    ids,
    traktId,
    slug: ids?.slug || null,
  };
}

function getResolveTimeoutMs() {
  return process.env.NODE_ENV === "production" ? 8000 : 6000;
}

async function searchTraktEntity(path, normalizedType) {
  const search = await fetchTrakt(path, {
    timeoutMs: getResolveTimeoutMs(),
    maxRetries: 1,
    cacheTTL: RESOLVE_CACHE_TTL_MS,
  });

  return pickResolvedEntity(search, normalizedType);
}

function mapNormalizedTypeToTmdbType(normalizedType) {
  return normalizedType === "show" ? "tv" : normalizedType;
}

async function fetchTmdbExternalIds(normalizedType, tmdbId) {
  const apiKey = process.env.NEXT_PUBLIC_TMDB_API_KEY;
  if (!apiKey) return null;

  const tmdbType = mapNormalizedTypeToTmdbType(normalizedType);
  const url = new URL(
    `https://api.themoviedb.org/3/${tmdbType}/${encodeURIComponent(String(tmdbId))}/external_ids`,
  );
  url.searchParams.set("api_key", apiKey);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);

  try {
    const res = await fetch(url, {
      cache: "force-cache",
      next: { revalidate: 60 * 60 * 24 },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!res.ok) return null;
    const data = await res.json().catch(() => null);
    return data?.imdb_id ? String(data.imdb_id) : null;
  } catch {
    clearTimeout(timeoutId);
    return null;
  }
}

async function resolveTraktEntityUncached(normalizedType, normalizedTmdbId) {
  let firstError = null;

  try {
    const directHit = await searchTraktEntity(
      `/search/tmdb/${encodeURIComponent(normalizedTmdbId)}?type=${encodeURIComponent(normalizedType)}`,
      normalizedType,
    );
    if (directHit?.traktId) return directHit;
  } catch (error) {
    firstError = error;
  }

  const imdbId = await fetchTmdbExternalIds(normalizedType, normalizedTmdbId);
  if (imdbId) {
    try {
      const imdbHit = await searchTraktEntity(
        `/search/imdb/${encodeURIComponent(imdbId)}?type=${encodeURIComponent(normalizedType)}`,
        normalizedType,
      );
      if (imdbHit?.traktId) return imdbHit;
    } catch (error) {
      firstError = firstError || error;
    }
  }

  if (firstError) {
    throw firstError;
  }

  return null;
}

export async function resolveTraktEntityFromTmdb({ type, tmdbId } = {}) {
  const normalizedType = normalizeType(type);
  const normalizedTmdbId = tmdbId != null ? String(tmdbId) : "";

  if (!normalizedType || !normalizedTmdbId) return null;

  const cacheKey = getResolveCacheKey(normalizedType, normalizedTmdbId);
  const cached = getFromResolvedCache(cacheKey);
  if (cached) return cached;

  if (pendingResolutions.has(cacheKey)) {
    return pendingResolutions.get(cacheKey);
  }

  const resolutionPromise = resolveTraktEntityUncached(
    normalizedType,
    normalizedTmdbId,
  )
    .then((resolved) => {
      if (resolved?.traktId) {
        saveResolvedCache(cacheKey, resolved);
      }
      return resolved;
    })
    .finally(() => {
      pendingResolutions.delete(cacheKey);
    });

  pendingResolutions.set(cacheKey, resolutionPromise);
  return resolutionPromise;
}
