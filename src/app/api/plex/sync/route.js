import { NextResponse } from "next/server";
import { backendFetchJson } from "@/lib/backend/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TMDB_API_KEY = process.env.TMDB_API_KEY || process.env.NEXT_PUBLIC_TMDB_API_KEY;

// Recibe el historial leído por el NAVEGADOR desde el servidor Plex del usuario
// (el servidor local no es accesible desde Vercel, pero sí desde el navegador en
// la misma red vía *.plex.direct). Cada ítem se resuelve a TMDb y se inserta en
// el historial. La deduplicación la hace el backend.
//
// Formato esperado del body: { items: [ {
//   type: "movie" | "episode",
//   title: string,            // título de la película o del episodio
//   show?: string,            // nombre de la serie (solo episodios)
//   season?: number,
//   episode?: number,
//   year?: number,
//   viewedAt?: number|string, // epoch segundos o ISO
// } ] }

function cleanTitle(raw) {
  return String(raw || "")
    .replace(/\s*\((19|20)\d{2}\)\s*$/, "")
    .trim();
}

function toIso(viewedAt) {
  if (!viewedAt) return new Date().toISOString();
  // Plex devuelve epoch en segundos.
  if (typeof viewedAt === "number") return new Date(viewedAt * 1000).toISOString();
  const n = Number(viewedAt);
  if (Number.isFinite(n) && n > 0) return new Date(n * 1000).toISOString();
  const d = new Date(viewedAt);
  return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

async function searchTmdb(request, query, type) {
  const res = await backendFetchJson(
    request,
    `/v1/tmdb/search?q=${encodeURIComponent(query)}&type=${type}`,
  );
  if (res.ok && res.json?.results?.length > 0) return res.json.results[0];
  return null;
}

async function resolveItem(request, item) {
  const isTv = item.type === "episode";
  const season = Number.isInteger(item.season) && item.season > 0 ? item.season : isTv ? 1 : null;
  const episode = Number.isInteger(item.episode) && item.episode > 0 ? item.episode : null;

  if (isTv) {
    const query = cleanTitle(item.show || item.title);
    if (!query || !episode) return { skipped: true, reason: "missing_show_or_episode" };
    const show = await searchTmdb(request, query, "tv");
    if (!show) return { skipped: true, reason: "tv_not_found", query };

    let resolvedTitle = show.name;
    if (TMDB_API_KEY) {
      try {
        const epUrl = `https://api.themoviedb.org/3/tv/${show.id}/season/${season}/episode/${episode}?api_key=${TMDB_API_KEY}&language=es-ES`;
        const epRes = await fetch(epUrl);
        if (epRes.ok) {
          const epData = await epRes.json();
          if (epData?.name) resolvedTitle = `${show.name}: ${epData.name}`;
        }
      } catch {
        // título de episodio opcional
      }
    }
    return {
      tmdbId: show.id,
      mediaType: "tv",
      title: resolvedTitle,
      posterPath: show.poster_path || "",
      season,
      episode,
    };
  }

  const query = cleanTitle(item.title);
  if (!query) return { skipped: true, reason: "empty_title" };
  const movie = await searchTmdb(request, query, "movie");
  if (!movie) return { skipped: true, reason: "movie_not_found", query };
  return {
    tmdbId: movie.id,
    mediaType: "movie",
    title: movie.title,
    posterPath: movie.poster_path || "",
  };
}

export async function POST(request) {
  let payload;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const items = Array.isArray(payload?.items) ? payload.items : null;
  if (!items) {
    return NextResponse.json({ error: "items array is required" }, { status: 400 });
  }

  // Limitamos por seguridad para no abusar del backend en una sola llamada.
  const slice = items.slice(0, 200);
  let added = 0;
  let duplicates = 0;
  let skipped = 0;
  let failed = 0;

  for (const item of slice) {
    try {
      const resolved = await resolveItem(request, item);
      if (resolved.skipped || !resolved.tmdbId) {
        skipped += 1;
        continue;
      }

      const body = {
        tmdbId: resolved.tmdbId,
        mediaType: resolved.mediaType,
        watchedAt: toIso(item.viewedAt),
      };
      if (resolved.title) body.title = resolved.title;
      if (resolved.posterPath) body.posterPath = resolved.posterPath;
      if (resolved.mediaType === "tv" && resolved.season != null) body.season = resolved.season;
      if (resolved.mediaType === "tv" && resolved.episode != null) body.episode = resolved.episode;

      const historyRes = await backendFetchJson(request, "/v1/history", {
        method: "POST",
        body: JSON.stringify(body),
      });

      if (!historyRes.ok) {
        failed += 1;
        continue;
      }
      if (historyRes.json?.duplicate) duplicates += 1;
      else added += 1;
    } catch {
      failed += 1;
    }
  }

  return NextResponse.json({
    success: true,
    processed: slice.length,
    added,
    duplicates,
    skipped,
    failed,
  });
}
