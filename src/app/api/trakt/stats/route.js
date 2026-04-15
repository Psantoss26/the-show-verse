import { unstable_cache } from "next/cache";
import { NextResponse } from "next/server";
import { fetchTrakt, normalizeType } from "@/lib/trakt/fetchWithCache";
import { resolveTraktEntityFromTmdb } from "@/lib/trakt/resolve";

export const runtime = "nodejs";
export const maxDuration = 12;

const CACHE_HEADERS = {
  "Cache-Control": "public, s-maxage=600, stale-while-revalidate=3600",
};

const EMPTY_STATS = {
  watchers: null,
  plays: null,
  collectors: null,
  comments: null,
  lists: null,
  favorited: null,
};

function shapeStats(stats) {
  if (!stats) return EMPTY_STATS;
  return {
    watchers: typeof stats?.watchers === "number" ? stats.watchers : null,
    plays: typeof stats?.plays === "number" ? stats.plays : null,
    collectors: typeof stats?.collectors === "number" ? stats.collectors : null,
    comments: typeof stats?.comments === "number" ? stats.comments : null,
    lists: typeof stats?.lists === "number" ? stats.lists : null,
    favorited: typeof stats?.favorited === "number" ? stats.favorited : null,
  };
}

const getCachedTraktStats = unstable_cache(
  async (type, tmdbId = "", traktId = "", season = "", episode = "") => {
    const normalizedType = normalizeType(type) || String(type || "").trim();
    const normalizedTmdbId = tmdbId != null ? String(tmdbId) : "";
    const normalizedTraktId =
      traktId != null && String(traktId).trim() ? String(traktId).trim() : null;
    const seasonNumber = season != null && season !== "" ? Number(season) : null;
    const episodeNumber =
      episode != null && episode !== "" ? Number(episode) : null;

    if (!normalizedType || (!normalizedTmdbId && !normalizedTraktId)) {
      return { found: false, stats: EMPTY_STATS };
    }

    const statsTimeoutMs = process.env.NODE_ENV === "production" ? 6500 : 4500;
    const fetchStats = (path) =>
      fetchTrakt(path, {
        timeoutMs: statsTimeoutMs,
        maxRetries: 0,
        cacheTTL: 10 * 60 * 1000,
      });

    if (normalizedType === "movie" || normalizedType === "show") {
      const resolved = normalizedTraktId
        ? { traktId: normalizedTraktId, ids: { trakt: normalizedTraktId } }
        : await resolveTraktEntityFromTmdb({
            type: normalizedType,
            tmdbId: normalizedTmdbId,
          });

      if (!resolved?.traktId) {
        return { found: false, stats: EMPTY_STATS };
      }

      const plural = normalizedType === "show" ? "shows" : "movies";
      const stats = await fetchStats(`/${plural}/${resolved.traktId}/stats`);

      return {
        found: true,
        traktId: resolved.traktId,
        ids: resolved?.ids || { trakt: resolved.traktId },
        stats: shapeStats(stats),
      };
    }

    if (
      !Number.isFinite(seasonNumber) ||
      (normalizedType === "episode" && !Number.isFinite(episodeNumber))
    ) {
      return { found: false, stats: EMPTY_STATS };
    }

    const resolvedShow = normalizedTraktId
      ? { traktId: normalizedTraktId }
      : await resolveTraktEntityFromTmdb({
          type: "show",
          tmdbId: normalizedTmdbId,
        });

    if (!resolvedShow?.traktId) {
      return { found: false, stats: EMPTY_STATS };
    }

    const statsPath =
      normalizedType === "season"
        ? `/shows/${resolvedShow.traktId}/seasons/${seasonNumber}/stats`
        : `/shows/${resolvedShow.traktId}/seasons/${seasonNumber}/episodes/${episodeNumber}/stats`;

    const stats = await fetchStats(statsPath);

    return {
      found: true,
      traktId: resolvedShow.traktId,
      ids: null,
      stats: shapeStats(stats),
    };
  },
  ["trakt-stats-public"],
  { revalidate: 600 },
);

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const rawType = searchParams.get("type");
    const type = normalizeType(rawType) || rawType;
    const tmdbId = searchParams.get("tmdbId");
    const traktId = searchParams.get("traktId");
    const season = searchParams.get("season");
    const episode = searchParams.get("episode");

    if ((!tmdbId && !traktId) || !type) {
      return NextResponse.json(
        { error: "Missing/invalid type or tmdbId/traktId" },
        { status: 400, headers: CACHE_HEADERS },
      );
    }

    const result = await getCachedTraktStats(
      String(type || ""),
      String(tmdbId || ""),
      traktId == null ? "" : String(traktId),
      season == null ? "" : String(season),
      episode == null ? "" : String(episode),
    );

    return NextResponse.json(result || { found: false, stats: EMPTY_STATS }, {
      headers: CACHE_HEADERS,
    });
  } catch (e) {
    const isRecoverable =
      e?.isTimeout ||
      e?.status === 404 ||
      e?.status === 429 ||
      e?.name === "AbortError" ||
      (e?.status >= 500 && e?.status < 600) ||
      /timeout|rate limit/i.test(e?.message || "");

    if (isRecoverable) {
      return NextResponse.json(
        { found: false, stats: EMPTY_STATS },
        { headers: CACHE_HEADERS },
      );
    }

    return NextResponse.json(
      { found: false, error: e?.message || "Unexpected error", stats: EMPTY_STATS },
      { status: 500, headers: CACHE_HEADERS },
    );
  }
}
