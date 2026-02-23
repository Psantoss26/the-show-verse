import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 3600; // 1h

const TRAKT_KEY =
  process.env.TRAKT_CLIENT_ID ||
  process.env.NEXT_PUBLIC_TRAKT_CLIENT_ID ||
  process.env.TRAKT_API_KEY;

const TMDB_KEY = process.env.TMDB_API_KEY || process.env.NEXT_PUBLIC_TMDB_API_KEY;
const TRAKT_USER_AGENT =
  process.env.TRAKT_USER_AGENT || "TheShowVerse/1.0 (Next.js; Trakt related)";

function traktHeaders() {
  if (!TRAKT_KEY) throw new Error("Missing TRAKT_CLIENT_ID env");
  return {
    "content-type": "application/json",
    accept: "application/json",
    "trakt-api-version": "2",
    "trakt-api-key": TRAKT_KEY,
    "user-agent": TRAKT_USER_AGENT,
  };
}

async function safeBody(res) {
  const text = await res.text().catch(() => "");
  if (!text) return { json: null, text: "" };
  try {
    return { json: JSON.parse(text), text };
  } catch {
    return { json: null, text };
  }
}

async function fetchTrakt(path) {
  const res = await fetch(`https://api.trakt.tv${path}`, {
    headers: traktHeaders(),
    next: { revalidate },
  });
  const { json, text } = await safeBody(res);
  if (!res.ok) {
    const isCloudflare =
      res.status === 403 &&
      /cloudflare|attention required/i.test(String(text || ""));
    console.error("Trakt related upstream failed", {
      path,
      status: res.status,
      isCloudflare,
      response: json,
      responseText: json ? null : String(text || "").slice(0, 400),
    });
    return [];
  }
  return Array.isArray(json) ? json : [];
}

async function fetchTmdb(type, id) {
  if (!TMDB_KEY) return null;
  const url = `https://api.themoviedb.org/3/${type}/${id}?api_key=${TMDB_KEY}&language=es-ES`;
  const res = await fetch(url, { next: { revalidate } });
  const { json } = await safeBody(res);
  if (!res.ok) return null;
  return json;
}

async function mapWithConcurrency(items, worker, concurrency = 8) {
  const out = new Array(items.length);
  let idx = 0;

  const runners = Array.from(
    { length: Math.min(concurrency, items.length) },
    async () => {
      while (idx < items.length) {
        const cur = idx++;
        out[cur] = await worker(items[cur]).catch(() => null);
      }
    },
  );

  await Promise.all(runners);
  return out.filter(Boolean);
}

/**
 * GET /api/trakt/related?type=movie&tmdbId=123
 * Obtiene recomendaciones relacionadas usando Trakt
 */
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type"); // 'movie' o 'tv'
    const tmdbId = searchParams.get("tmdbId");

    if (!type || !tmdbId) {
      return NextResponse.json(
        { error: "Missing type or tmdbId" },
        { status: 400 },
      );
    }

    // Convertir type a formato Trakt
    const traktType = type === "tv" ? "show" : "movie";
    const traktTypePlural = type === "tv" ? "shows" : "movies";

    // 1. Buscar el ID de Trakt desde TMDb ID
    const searchPath = `/search/tmdb/${encodeURIComponent(tmdbId)}?type=${traktType}`;
    const searchResults = await fetchTrakt(searchPath);

    if (!searchResults || searchResults.length === 0) {
      return NextResponse.json({ results: [] });
    }

    const traktItem = searchResults[0];
    const itemData = traktItem[traktType];
    const traktSlug = itemData?.ids?.slug;

    if (!traktSlug) {
      return NextResponse.json({ results: [] });
    }

    // 2. Obtener recomendaciones relacionadas desde Trakt
    const relatedPath = `/${traktTypePlural}/${traktSlug}/related?extended=full&limit=15`;
    const related = await fetchTrakt(relatedPath);

    if (!related || related.length === 0) {
      return NextResponse.json({ results: [] });
    }

    // 3. Hidratar con datos de TMDb para obtener posters y datos completos
    const hydrated = await mapWithConcurrency(
      related,
      async (item) => {
        const tmdbId = item?.ids?.tmdb;
        if (!tmdbId) return null;

        const tmdbType = type === "tv" ? "tv" : "movie";
        const details = await fetchTmdb(tmdbType, tmdbId);

        if (!details?.id) return null;

        return {
          id: details.id,
          media_type: type,
          title: details.title || null,
          name: details.name || null,
          poster_path: details.poster_path || null,
          backdrop_path: details.backdrop_path || null,
          release_date: details.release_date || null,
          first_air_date: details.first_air_date || null,
          vote_average: details.vote_average ?? null,
          overview: details.overview || null,
        };
      },
      8,
    );

    return NextResponse.json({ results: hydrated });
  } catch (e) {
    console.error("trakt related error", e);
    return NextResponse.json({ results: [] }, { status: 200 });
  }
}
