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

const TMDB_RETRY_DELAYS_MS = [400, 1200];

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Devuelve el id de IMDb, `null` si TMDb CONFIRMA que no tiene, o lanza si no se
// pudo saber (límite de peticiones, error de red o de TMDb). Distinguirlo
// importa: el cliente guarda los «sin nota» confirmados como entrada negativa y
// esos títulos se ordenan al final; un fallo pasajero tratado igual dejaba
// títulos con nota clavados al final de su grupo durante un día.
async function tmdbExternalIds(item) {
  if (!TMDB_KEY) throw new Error("TMDb key missing");

  const mediaType = normalizeMediaType(item?.mediaType || item?.media_type);
  const tmdbId = item?.tmdbId ?? item?.tmdb_id ?? item?.id;
  if (!tmdbId) return null;

  const url = new URL(
    `${TMDB_BASE}/${mediaType}/${encodeURIComponent(String(tmdbId))}/external_ids`,
  );
  url.searchParams.set("api_key", TMDB_KEY);

  for (let attempt = 0; ; attempt += 1) {
    const res = await fetch(url, {
      cache: "force-cache",
      next: { revalidate: 60 * 60 * 24 * 7 },
    });
    if (res.ok) {
      const json = await res.json().catch(() => null);
      if (!json) throw new Error("TMDb external_ids unreadable");
      return json.imdb_id ? String(json.imdb_id) : null;
    }
    // 404: el título no existe con ese tipo; no hay id que buscar.
    if (res.status === 404) return null;
    // 429 / 5xx: reintento breve. Las cargas de cientos de títulos llegan en
    // lotes paralelos y TMDb limita las ráfagas.
    if (
      (res.status === 429 || res.status >= 500) &&
      attempt < TMDB_RETRY_DELAYS_MS.length
    ) {
      const retryAfter = Number(res.headers.get("retry-after"));
      await wait(
        Number.isFinite(retryAfter) && retryAfter > 0
          ? retryAfter * 1000
          : TMDB_RETRY_DELAYS_MS[attempt],
      );
      continue;
    }
    throw new Error(`TMDb external_ids ${res.status}`);
  }
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

    // Títulos cuyo id de IMDb no se pudo averiguar (fallo, no «no tiene»): se
    // devuelven en `unresolved` para que el cliente no los dé por «sin nota».
    const unresolved = [];
    const resolved = await mapWithConcurrency(
      items,
      async (item) => {
        let imdbId = item.imdbId || item.imdb_id || null;
        if (!imdbId) {
          try {
            imdbId = await tmdbExternalIds(item);
          } catch {
            unresolved.push(item.key);
            return null;
          }
        }
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
        unresolved,
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
