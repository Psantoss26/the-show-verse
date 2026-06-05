import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { fetchFavoritesForUser } from "@/lib/api/tmdb";
import {
  clearTraktCookies,
  getValidTraktToken,
  setTraktCookies,
  traktFetch,
} from "@/lib/trakt/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const TMDB = "https://api.themoviedb.org/3";
const API_KEY = process.env.NEXT_PUBLIC_TMDB_API_KEY;
const LIST_NAME = "TMDb Favorites";
const LIST_DESCRIPTION =
  "Favoritos de TMDb que no caben en los favoritos nativos de Trakt.";
const BATCH_SIZE = 50;

function noCacheHeaders(response) {
  response.headers.set(
    "Cache-Control",
    "private, no-store, no-cache, must-revalidate, max-age=0",
  );
  response.headers.set("Pragma", "no-cache");
  response.headers.set("Expires", "0");
  return response;
}

function getItemType(item) {
  return item?.media_type || (item?.title ? "movie" : "tv");
}

function getTmdbKey(item) {
  const type = getItemType(item);
  const id = Number(item?.id);
  if (!Number.isFinite(id) || id <= 0) return null;
  return `${type}:${id}`;
}

function rowsToKeys(rows, objectKey, mediaType) {
  return (Array.isArray(rows) ? rows : [])
    .map((row) => row?.[objectKey]?.ids?.tmdb)
    .filter(Boolean)
    .map((tmdbId) => `${mediaType}:${tmdbId}`);
}

async function getAccount(sessionId) {
  const url = `${TMDB}/account?api_key=${API_KEY}&session_id=${sessionId}`;
  const res = await fetch(url, { cache: "no-store" });
  const data = await res.json();
  if (!res.ok) throw new Error(data.status_message || "TMDB_ACCOUNT_ERROR");
  return data;
}

async function getTmdbFavorites({ sessionId, requestItems }) {
  if (Array.isArray(requestItems) && requestItems.length > 0) {
    return requestItems;
  }

  const account = await getAccount(sessionId);
  return fetchFavoritesForUser(account.id, sessionId);
}

async function fetchNativeFavoriteKeys(token, pathType, objectKey, mediaType) {
  const keys = [];
  const limit = 100;

  for (let page = 1; page <= 20; page += 1) {
    const res = await traktFetch(
      `/sync/favorites/${pathType}?page=${page}&limit=${limit}`,
      {
        token,
        timeoutMs: 12000,
        retries: 1,
      },
    );
    if (!res.ok) return keys;

    const rows = Array.isArray(res.json) ? res.json : [];
    if (rows.length === 0) break;
    keys.push(...rowsToKeys(rows, objectKey, mediaType));
    if (rows.length < limit) break;
  }

  return keys;
}

async function fetchListItemKeys(token, listKey) {
  const keys = [];
  const limit = 100;

  for (let page = 1; page <= 20; page += 1) {
    const res = await traktFetch(
      `/users/me/lists/${encodeURIComponent(String(listKey))}/items?page=${page}&limit=${limit}`,
      {
        token,
        timeoutMs: 12000,
        retries: 1,
      },
    );
    if (!res.ok) return keys;

    const rows = Array.isArray(res.json) ? res.json : [];
    if (rows.length === 0) break;
    keys.push(...rowsToKeys(rows, "movie", "movie"));
    keys.push(...rowsToKeys(rows, "show", "tv"));
    if (rows.length < limit) break;
  }

  return keys;
}

function normalizeList(row) {
  const list = row?.list || row || {};
  return {
    id: list?.ids?.trakt ?? list?.id ?? null,
    slug: list?.ids?.slug || null,
    name: list?.name || "",
  };
}

async function ensureTraktList(token) {
  const listsRes = await traktFetch("/users/me/lists?limit=100", {
    token,
    timeoutMs: 12000,
    retries: 1,
  });

  const existing = (Array.isArray(listsRes.json) ? listsRes.json : [])
    .map(normalizeList)
    .find((list) => list.name.trim().toLowerCase() === LIST_NAME.toLowerCase());

  if (existing?.slug || existing?.id) return existing;

  const created = await traktFetch("/users/me/lists", {
    token,
    method: "POST",
    body: {
      name: LIST_NAME,
      description: LIST_DESCRIPTION,
      privacy: "private",
      display_numbers: false,
      allow_comments: false,
      sort_by: "added",
      sort_how: "asc",
    },
    timeoutMs: 12000,
    retries: 1,
  });

  if (!created.ok) {
    return {
      error:
        created.json?.error ||
        created.json?.message ||
        `Trakt list create failed (${created.status})`,
      status: created.status,
    };
  }

  return normalizeList(created.json);
}

function buildPayload(items) {
  const movies = [];
  const shows = [];

  for (const item of items) {
    const id = Number(item?.id);
    if (!Number.isFinite(id) || id <= 0) continue;
    if (getItemType(item) === "tv") {
      shows.push({ ids: { tmdb: id } });
    } else {
      movies.push({ ids: { tmdb: id } });
    }
  }

  return {
    ...(movies.length ? { movies } : {}),
    ...(shows.length ? { shows } : {}),
  };
}

function chunkArray(items, size) {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function extractTraktError(result) {
  return (
    result?.json?.error_description ||
    result?.json?.error ||
    result?.json?.message ||
    (result?.status ? `Trakt HTTP ${result.status}` : "Trakt list sync failed")
  );
}

export async function POST(request) {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get("tmdb_session_id")?.value;

  if (!sessionId) {
    return noCacheHeaders(
      NextResponse.json({ error: "NO_TMDB_SESSION" }, { status: 401 }),
    );
  }

  const traktAuth = await getValidTraktToken(cookieStore).catch(() => ({
    token: null,
    refreshedTokens: null,
    shouldClear: false,
  }));

  if (!traktAuth.token) {
    const res = NextResponse.json({
      connected: false,
      synced: 0,
      list: null,
    });
    if (traktAuth.shouldClear) clearTraktCookies(res);
    return noCacheHeaders(res);
  }

  try {
    const body = await request.json().catch(() => ({}));
    const tmdbFavorites = await getTmdbFavorites({
      sessionId,
      requestItems: body?.items,
    });

    const [movieNativeKeys, tvNativeKeys] = await Promise.all([
      fetchNativeFavoriteKeys(traktAuth.token, "movies", "movie", "movie"),
      fetchNativeFavoriteKeys(traktAuth.token, "shows", "show", "tv"),
    ]);
    const nativeKeys = new Set(
      [...movieNativeKeys, ...tvNativeKeys].map(String),
    );

    const overflowItems = [];
    const seenOverflow = new Set();
    for (const item of Array.isArray(tmdbFavorites) ? tmdbFavorites : []) {
      const key = getTmdbKey(item);
      if (!key || nativeKeys.has(key) || seenOverflow.has(key)) continue;
      seenOverflow.add(key);
      overflowItems.push(item);
    }

    if (overflowItems.length === 0) {
      const res = NextResponse.json({
        connected: true,
        synced: 0,
        skipped: 0,
        list: null,
      });
      if (traktAuth.refreshedTokens) {
        setTraktCookies(res, traktAuth.refreshedTokens);
      }
      return noCacheHeaders(res);
    }

    const list = await ensureTraktList(traktAuth.token);
    if (list?.error || (!list?.slug && !list?.id)) {
      const res = NextResponse.json({
        connected: true,
        degraded: true,
        synced: 0,
        skipped: 0,
        list: null,
        upstreamStatus: list?.status || 500,
        error: list?.error || "No se pudo crear la lista de Trakt",
      });
      if (traktAuth.refreshedTokens) {
        setTraktCookies(res, traktAuth.refreshedTokens);
      }
      return noCacheHeaders(res);
    }

    const listKey = list.slug || list.id;
    const existingListKeys = new Set(
      (await fetchListItemKeys(traktAuth.token, listKey)).map(String),
    );
    const missingListItems = overflowItems.filter((item) => {
      const key = getTmdbKey(item);
      return key && !existingListKeys.has(key);
    });

    const syncedKeys = [];
    const results = [];

    for (const batch of chunkArray(missingListItems, BATCH_SIZE)) {
      const payload = buildPayload(batch);
      if (!payload.movies && !payload.shows) continue;
      if (results.length > 0) await sleep(1100);

      const result = await traktFetch(
        `/users/me/lists/${encodeURIComponent(String(listKey))}/items`,
        {
          token: traktAuth.token,
          method: "POST",
          body: payload,
          timeoutMs: 15000,
          retries: 1,
        },
      );
      results.push({ ok: result.ok, status: result.status });

      if (!result.ok) {
        const res = NextResponse.json({
          connected: true,
          degraded: true,
          synced: syncedKeys.length,
          skipped: overflowItems.length - missingListItems.length,
          addedKeys: syncedKeys,
          list,
          upstreamStatus: result.status,
          error: extractTraktError(result),
          batches: results.length,
        });
        if (traktAuth.refreshedTokens) {
          setTraktCookies(res, traktAuth.refreshedTokens);
        }
        return noCacheHeaders(res);
      }

      syncedKeys.push(...batch.map(getTmdbKey).filter(Boolean));
    }

    const res = NextResponse.json({
      connected: true,
      synced: syncedKeys.length,
      skipped: overflowItems.length - missingListItems.length,
      addedKeys: syncedKeys,
      list,
      batches: results.length,
    });
    if (traktAuth.refreshedTokens) {
      setTraktCookies(res, traktAuth.refreshedTokens);
    }
    return noCacheHeaders(res);
  } catch (error) {
    const res = NextResponse.json(
      {
        connected: true,
        synced: 0,
        list: null,
        error:
          error?.message || "TMDb favorites custom Trakt list sync failed",
      },
      { status: 500 },
    );
    if (traktAuth.refreshedTokens) {
      setTraktCookies(res, traktAuth.refreshedTokens);
    }
    return noCacheHeaders(res);
  }
}
