import { unstable_cache } from "next/cache";
import { fetchTrakt, normalizeType } from "@/lib/trakt/fetchWithCache";

const RESOLVE_REVALIDATE_SECONDS = 60 * 60;
const RESOLVE_CACHE_TTL_MS = 60 * 60 * 1000;

const resolveTraktEntityCached = unstable_cache(
  async (type, tmdbId) => {
    const normalizedType = normalizeType(type);
    const normalizedTmdbId = tmdbId != null ? String(tmdbId) : "";

    if (!normalizedType || !normalizedTmdbId) return null;

    const timeoutMs = process.env.NODE_ENV === "production" ? 8000 : 6000;
    const search = await fetchTrakt(
      `/search/tmdb/${encodeURIComponent(normalizedTmdbId)}?type=${encodeURIComponent(normalizedType)}`,
      {
        timeoutMs,
        maxRetries: 0,
        cacheTTL: RESOLVE_CACHE_TTL_MS,
      },
    );

    const first = Array.isArray(search) ? search[0] : null;
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
  },
  ["trakt-tmdb-resolve-shared"],
  { revalidate: RESOLVE_REVALIDATE_SECONDS },
);

export async function resolveTraktEntityFromTmdb({ type, tmdbId } = {}) {
  const normalizedType = normalizeType(type);
  const normalizedTmdbId = tmdbId != null ? String(tmdbId) : "";

  if (!normalizedType || !normalizedTmdbId) return null;

  return resolveTraktEntityCached(normalizedType, normalizedTmdbId);
}
