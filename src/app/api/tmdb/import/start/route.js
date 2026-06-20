import { NextResponse } from "next/server";
import {
  backendFetchJson,
  getCookieSecure,
  setBackendAuthCookies,
} from "@/lib/backend/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const TMDB = "https://api.themoviedb.org/3";
const API_KEY = process.env.TMDB_API_KEY || process.env.NEXT_PUBLIC_TMDB_API_KEY;
const TMDB_IMPORT_MAX_PAGES = 500;

async function tmdbJson(path) {
  if (!API_KEY) {
    const err = new Error("Missing TMDB API key");
    err.status = 500;
    throw err;
  }

  const url = path.startsWith("http") ? new URL(path) : new URL(`${TMDB}${path}`);
  url.searchParams.set("api_key", API_KEY);

  const res = await fetch(url.toString(), {
    cache: "no-store",
    headers: { Accept: "application/json" },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json?.success === false) {
    const err = new Error(json?.status_message || `TMDb HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return json;
}

async function getTmdbAccount(sessionId) {
  return tmdbJson(`/account?session_id=${encodeURIComponent(sessionId)}`);
}

async function fetchTmdbPage({ accountId, sessionId, collection, mediaType, page }) {
  const bucket =
    collection === "watchlist"
      ? "watchlist"
      : collection === "ratings"
        ? "rated"
        : "favorite";
  const typePath = mediaType === "tv" ? "tv" : "movies";
  const json = await tmdbJson(
    `/account/${encodeURIComponent(accountId)}/${bucket}/${typePath}?session_id=${encodeURIComponent(sessionId)}&sort_by=created_at.desc&page=${page}`,
  );

  return {
    results: (Array.isArray(json?.results) ? json.results : []).map((item) => ({
      ...item,
      media_type: mediaType,
    })),
    totalPages: Math.max(1, Number(json?.total_pages || 1)),
  };
}

async function sendImportChunk(request, payload) {
  const backend = await backendFetchJson(request, "/v1/import/tmdb/data/chunk", {
    method: "POST",
    body: JSON.stringify(payload),
  });

  if (backend.status === 413) {
    const favoriteItems = Array.isArray(payload.favorites) ? payload.favorites : [];
    const watchlistItems = Array.isArray(payload.watchlist) ? payload.watchlist : [];
    const ratingItems = Array.isArray(payload.ratings) ? payload.ratings : [];
    if (favoriteItems.length > 1) {
      const mid = Math.ceil(favoriteItems.length / 2);
      const first = await sendImportChunk(request, {
        ...payload,
        favorites: favoriteItems.slice(0, mid),
        watchlist: [],
        ratings: [],
      });
      const second = await sendImportChunk(request, {
        ...payload,
        reset: false,
        favorites: favoriteItems.slice(mid),
        watchlist: [],
        ratings: [],
      });
      return second.ok ? second : first;
    }
    if (watchlistItems.length > 1) {
      const mid = Math.ceil(watchlistItems.length / 2);
      const first = await sendImportChunk(request, {
        ...payload,
        favorites: [],
        watchlist: watchlistItems.slice(0, mid),
        ratings: [],
      });
      const second = await sendImportChunk(request, {
        ...payload,
        reset: false,
        favorites: [],
        watchlist: watchlistItems.slice(mid),
        ratings: [],
      });
      return second.ok ? second : first;
    }
    if (ratingItems.length > 1) {
      const mid = Math.ceil(ratingItems.length / 2);
      const first = await sendImportChunk(request, {
        ...payload,
        favorites: [],
        watchlist: [],
        ratings: ratingItems.slice(0, mid),
      });
      const second = await sendImportChunk(request, {
        ...payload,
        reset: false,
        favorites: [],
        watchlist: [],
        ratings: ratingItems.slice(mid),
      });
      return second.ok ? second : first;
    }
  }

  return backend;
}

async function importCollectionPages(request, { accountId, sessionId, collection, mediaType }) {
  let lastBackend = null;
  for (let page = 1; page <= TMDB_IMPORT_MAX_PAGES; page += 1) {
    const { results, totalPages } = await fetchTmdbPage({
      accountId,
      sessionId,
      collection,
      mediaType,
      page,
    });

    if (results.length > 0) {
      lastBackend = await sendImportChunk(request, {
        favorites: collection === "favorites" ? results : [],
        watchlist: collection === "watchlist" ? results : [],
        ratings: collection === "ratings" ? results : [],
      });
      if (!lastBackend.ok) return lastBackend;
    }

    if (page >= totalPages) break;
  }
  return lastBackend;
}

export async function POST(request) {
  const sessionId = request.cookies.get("tmdb_session_id")?.value || null;
  if (!sessionId) {
    return NextResponse.json(
      {
        error: "Conecta TMDb antes de importar favoritos y pendientes.",
        code: "TMDB_NOT_CONNECTED",
      },
      { status: 409 },
    );
  }

  let backend = null;
  try {
    const account = await getTmdbAccount(sessionId);
    if (!account?.id) {
      const err = new Error("TMDb account not available");
      err.status = 401;
      throw err;
    }

    backend = await sendImportChunk(request, {
      reset: true,
      favorites: [],
      watchlist: [],
      ratings: [],
    });
    if (!backend.ok) throw Object.assign(new Error(backend.error), { status: backend.status });

    const imports = [
      ["favorites", "movie"],
      ["favorites", "tv"],
      ["watchlist", "movie"],
      ["watchlist", "tv"],
      ["ratings", "movie"],
      ["ratings", "tv"],
    ];

    for (const [collection, mediaType] of imports) {
      backend = await importCollectionPages(request, {
        accountId: account.id,
        sessionId,
        collection,
        mediaType,
      });
      if (backend && !backend.ok) {
        throw Object.assign(new Error(backend.error), { status: backend.status });
      }
    }

    backend = await sendImportChunk(request, {
      done: true,
      favorites: [],
      watchlist: [],
      ratings: [],
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error?.message || "No se pudieron importar los datos de TMDb.",
        code: error?.status === 401 ? "TMDB_AUTH_FAILED" : "TMDB_IMPORT_FAILED",
      },
      { status: error?.status || 502 },
    );
  }

  const res = NextResponse.json(backend.json || { error: backend.error }, {
    status: backend.ok ? 202 : backend.status || 500,
  });
  setBackendAuthCookies(res, backend, { secure: getCookieSecure(request) });
  return res;
}
