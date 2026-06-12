import { NextResponse } from "next/server";
import {
  getImdbRatingsDatasetStatus,
  lookupImdbRatings,
} from "@/lib/server/imdbRatingsDataset";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 86400;
export const maxDuration = 60;

const cacheHeaders = {
  "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800",
};

const errorCacheHeaders = {
  "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600",
};

const postCacheHeaders = {
  "Cache-Control": "no-store",
};

const TMDB_KEY =
  process.env.TMDB_API_KEY || process.env.NEXT_PUBLIC_TMDB_API_KEY;
const TMDB_BASE = "https://api.themoviedb.org/3";

function parseIds(searchParams) {
  const ids = [
    searchParams.get("i"),
    searchParams.get("id"),
    searchParams.get("ids"),
  ]
    .filter(Boolean)
    .flatMap((value) => String(value).split(","))
    .map((value) => value.trim())
    .filter(Boolean);

  return [...new Set(ids)].slice(0, 100);
}

function normalizeMediaType(mediaType) {
  const type = String(mediaType || "")
    .toLowerCase()
    .trim();
  if (type === "tv" || type === "show") return "tv";
  return "movie";
}

function getItemKey(item) {
  const mediaType = normalizeMediaType(item?.mediaType || item?.media_type);
  const tmdbId = item?.tmdbId ?? item?.tmdb_id ?? item?.id;
  if (!tmdbId) return null;
  return `${mediaType}:${tmdbId}`;
}

async function tmdbExternalIds(item) {
  if (!TMDB_KEY) return null;

  const mediaType = normalizeMediaType(item?.mediaType || item?.media_type);
  const tmdbId = item?.tmdbId ?? item?.tmdb_id ?? item?.id;
  if (!tmdbId) return null;

  const url = new URL(
    `${TMDB_BASE}/${mediaType}/${encodeURIComponent(String(tmdbId))}/external_ids`,
  );
  url.searchParams.set("api_key", TMDB_KEY);

  const res = await fetch(url, {
    cache: "force-cache",
    next: { revalidate: 60 * 60 * 24 * 7 },
  });
  if (!res.ok) return null;

  const json = await res.json().catch(() => null);
  return json?.imdb_id ? String(json.imdb_id) : null;
}

async function mapWithConcurrency(items, worker, concurrency = 10) {
  const out = new Array(items.length);
  let index = 0;

  const runners = Array.from(
    { length: Math.min(concurrency, items.length) },
    async () => {
      while (index < items.length) {
        const current = index++;
        out[current] = await worker(items[current]).catch(() => null);
      }
    },
  );

  await Promise.all(runners);
  return out;
}

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const ids = parseIds(searchParams);

    if (!ids.length) {
      return NextResponse.json(
        { error: "Missing IMDb id. Use ?i=tt0111161 or ?ids=tt...,tt..." },
        { status: 400, headers: errorCacheHeaders },
      );
    }

    const items = await lookupImdbRatings(ids, {
      force: searchParams.get("refresh") === "1",
    });

    const firstId = ids[0]?.toLowerCase();
    const first = firstId ? items[firstId] || null : null;

    return NextResponse.json(
      {
        id: firstId,
        rating: first?.rating ?? null,
        votes: first?.votes ?? null,
        source: first?.source ?? "imdb-dataset",
        items,
        meta: getImdbRatingsDatasetStatus(),
      },
      { headers: cacheHeaders },
    );
  } catch (error) {
    return NextResponse.json(
      {
        rating: null,
        votes: null,
        items: {},
        error: error?.message || "IMDb ratings dataset unavailable",
        meta: getImdbRatingsDatasetStatus(),
      },
      { status: 200, headers: errorCacheHeaders },
    );
  }
}

export async function POST(req) {
  try {
    const payload = await req.json().catch(() => null);
    const inputItems = Array.isArray(payload?.items) ? payload.items : [];
    const items = inputItems
      .map((item) => ({
        ...item,
        key: getItemKey(item),
      }))
      .filter((item) => item.key)
      .slice(0, 250);

    if (!items.length) {
      return NextResponse.json(
        {
          error: "Missing items",
          items: {},
          meta: getImdbRatingsDatasetStatus(),
        },
        { status: 400, headers: errorCacheHeaders },
      );
    }

    const resolved = await mapWithConcurrency(
      items,
      async (item) => {
        const imdbId = item.imdbId || item.imdb_id || (await tmdbExternalIds(item));
        return imdbId ? { key: item.key, imdbId } : null;
      },
      12,
    );

    const byImdbId = new Map();
    resolved.forEach((entry) => {
      if (!entry?.imdbId) return;
      const imdbId = entry.imdbId.toLowerCase();
      const entries = byImdbId.get(imdbId) || [];
      entries.push(entry);
      byImdbId.set(imdbId, entries);
    });

    const ratings = await lookupImdbRatings([...byImdbId.keys()], {
      force: payload?.refresh === true,
    });

    const byItemKey = {};
    byImdbId.forEach((entries, imdbId) => {
      const rating = ratings[imdbId];
      if (!rating?.rating) return;
      entries.forEach((entry) => {
        byItemKey[entry.key] = {
          imdbId,
          rating: rating.rating,
          votes: rating.votes ?? null,
          source: rating.source || "imdb-dataset",
        };
      });
    });

    return NextResponse.json(
      {
        items: byItemKey,
        meta: {
          ...getImdbRatingsDatasetStatus(),
          requested: items.length,
          resolved: Object.keys(byItemKey).length,
        },
      },
      { headers: postCacheHeaders },
    );
  } catch (error) {
    return NextResponse.json(
      {
        items: {},
        error: error?.message || "IMDb ratings batch unavailable",
        meta: getImdbRatingsDatasetStatus(),
      },
      { status: 200, headers: postCacheHeaders },
    );
  }
}
