import { NextResponse } from "next/server";
import {
  resolveTraktIdFromTmdb,
  traktHeaders,
  readPaginationHeaders,
  safeTraktBody,
  buildTraktErrorMessage,
} from "../_utils";

export const dynamic = "force-dynamic";

function isAbortLikeError(error) {
  return (
    error?.name === "AbortError" ||
    /aborted|abort|timeout/i.test(error?.message || "")
  );
}

async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

async function fetchListsPageWithRetry(url, headers) {
  const timeouts = [4500, 6500];
  let lastError = null;

  for (let i = 0; i < timeouts.length; i++) {
    try {
      return await fetchWithTimeout(
        url,
        {
          headers,
          cache: "no-store",
        },
        timeouts[i],
      );
    } catch (error) {
      lastError = error;
      if (!isAbortLikeError(error) || i === timeouts.length - 1) {
        throw error;
      }
    }
  }

  throw lastError || new Error("Trakt lists request failed");
}

async function mapLimit(arr, limit, fn) {
  const out = new Array(arr.length);
  let i = 0;
  const workers = new Array(Math.min(limit, arr.length))
    .fill(0)
    .map(async () => {
      while (true) {
        const idx = i++;
        if (idx >= arr.length) break;
        out[idx] = await fn(arr[idx], idx);
      }
    });
  await Promise.all(workers);
  return out;
}

function tmdbAuthHeaders() {
  const bearer =
    process.env.TMDB_BEARER_TOKEN ||
    process.env.TMDB_TOKEN ||
    process.env.NEXT_PUBLIC_TMDB_BEARER_TOKEN;

  return bearer ? { Authorization: `Bearer ${bearer}` } : {};
}

function tmdbApiKey() {
  return (
    process.env.TMDB_API_KEY ||
    process.env.NEXT_PUBLIC_TMDB_API_KEY ||
    process.env.TMDB_KEY
  );
}

async function fetchTmdbPosterUrl(kind, tmdbId) {
  try {
    if (!tmdbId) return null;
    const apiKey = tmdbApiKey();
    const headers = {
      "Content-Type": "application/json",
      ...tmdbAuthHeaders(),
    };

    const base = kind === "movie" ? "movie" : "tv";
    const url = apiKey
      ? `https://api.themoviedb.org/3/${base}/${tmdbId}?api_key=${encodeURIComponent(apiKey)}&language=es-ES`
      : `https://api.themoviedb.org/3/${base}/${tmdbId}?language=es-ES`;

    const res = await fetch(url, { headers, cache: "no-store" });
    if (!res.ok) return null;

    const data = await res.json().catch(() => null);
    const path = data?.poster_path || data?.backdrop_path;
    if (!path) return null;

    return `https://image.tmdb.org/t/p/w342${path}`;
  } catch {
    return null;
  }
}

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const type = (searchParams.get("type") || "").toLowerCase();
    const tmdbId = searchParams.get("tmdbId");
    const tab = (searchParams.get("tab") || "popular").toLowerCase();
    const page = searchParams.get("page") || "1";
    const limit = searchParams.get("limit") || "10";
    const countOnly = searchParams.get("countOnly") === "true";

    if (!tmdbId)
      return NextResponse.json({ error: "Falta tmdbId" }, { status: 400 });
    if (type !== "movie" && type !== "show")
      return NextResponse.json(
        { error: "type debe ser movie o show" },
        { status: 400 },
      );

    const { traktId } = await resolveTraktIdFromTmdb({ type, tmdbId });
    const headers = await traktHeaders({ includeAuth: false });

    const base = type === "movie" ? "movies" : "shows";
    const url = `https://api.trakt.tv/${base}/${traktId}/lists/${tab}?page=${encodeURIComponent(page)}&limit=${encodeURIComponent(limit)}`;

    const res = await fetchListsPageWithRetry(url, headers);

    const { json, text } = await safeTraktBody(res);

    if (!res.ok) {
      const msg = buildTraktErrorMessage({
        res,
        json,
        text,
        fallback: "Error cargando listas",
      });
      return NextResponse.json({ error: msg }, { status: res.status });
    }

    const lists = Array.isArray(json) ? json : [];
    const pg = readPaginationHeaders(res);

    // ✅ Si solo se pide el count, devolver solo la paginación sin procesar items
    if (countOnly) {
      return NextResponse.json({ items: [], pagination: pg, countOnly: true });
    }

    // Concurrencia 3 con timeout 3s (6 listas = 2 rondas × 3s = 6s)
    const listsWithPreviews = await mapLimit(lists, 3, async (row) => {
      try {
        const listObj = row?.list || row || {};
        const userObj = row?.user || listObj?.user || {};

        // ✅ user id correcto para endpoints /users/:id (preferir username)
        const userId = userObj?.username || userObj?.ids?.slug || null;

        // ✅ list_id correcto: preferir slug
        const listId = listObj?.ids?.slug || null;

        if (!userId || !listId) {
          return { ...row, previewPosters: [] };
        }

        // ✅ Timeout de 3s por lista para 5 previews
        const previewController = new AbortController();
        const previewTimeout = setTimeout(
          () => previewController.abort(),
          3000,
        );

        try {
          // ✅ OJO: extended=images (no full,images)
          const itemsUrl =
            `https://api.trakt.tv/users/${encodeURIComponent(userId)}` +
            `/lists/${encodeURIComponent(String(listId))}` +
            `/items?limit=5&extended=images`;

          const itemsRes = await fetch(itemsUrl, {
            headers,
            cache: "no-store",
            signal: previewController.signal,
          });
          clearTimeout(previewTimeout);

          if (!itemsRes.ok) return { ...row, previewPosters: [] };

          const itemsJson = await itemsRes.json().catch(() => []);
          const arr = Array.isArray(itemsJson) ? itemsJson : [];

          // 1) Intento Trakt images
          let previews = arr
            .map((i) => {
              const entity = i?.movie || i?.show || null;
              const poster = entity?.images?.poster;
              return poster?.medium || poster?.thumb || poster?.full || null;
            })
            .filter(Boolean)
            .slice(0, 5);

          // 2) Fallback a TMDb si Trakt no devuelve imágenes
          if (previews.length === 0) {
            const candidates = arr
              .map((i) => {
                if (i?.movie?.ids?.tmdb)
                  return { kind: "movie", tmdb: i.movie.ids.tmdb };
                if (i?.show?.ids?.tmdb)
                  return { kind: "tv", tmdb: i.show.ids.tmdb };
                return null;
              })
              .filter(Boolean)
              .slice(0, 5);

            const tmdbPosters = await Promise.all(
              candidates.map((c) => fetchTmdbPosterUrl(c.kind, c.tmdb)),
            );

            previews = tmdbPosters.filter(Boolean).slice(0, 5);
          }

          return { ...row, previewPosters: previews };
        } catch {
          clearTimeout(previewTimeout);
          // Si timeout, devolver sin previews
          return { ...row, previewPosters: [] };
        }
      } catch (err) {
        console.error("Error fetching list previews", err);
        return { ...row, previewPosters: [] };
      }
    });

    return NextResponse.json({ items: listsWithPreviews, pagination: pg });
  } catch (e) {
    const isExpected =
      e?.status === 403 ||
      e?.status === 404 ||
      e?.status === 429 ||
      isAbortLikeError(e) ||
      /rate limit|timeout|no se encontr|forbidden/i.test(e?.message || "");
    if (!isExpected) console.warn("Trakt lists error:", e?.message);
    return NextResponse.json({
      items: null,
      pagination: { itemCount: 0, pageCount: 0, page: 1, limit: 10 },
      transient: isAbortLikeError(e),
    });
  }
}
