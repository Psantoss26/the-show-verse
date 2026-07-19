import { NextResponse } from "next/server";
import { backendFetchJson, setBackendAuthCookies } from "@/lib/backend/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 10;

const TMDB_API = "https://api.themoviedb.org/3";
const TMDB_API_KEY =
  process.env.TMDB_API_KEY || process.env.NEXT_PUBLIC_TMDB_API_KEY;

// Lista de nº de episodio de una temporada (desde TMDb) para marcar la temporada
// entera como vista en el backend propio (/v1/history/seasons requiere la lista al
// marcar como visto; al quitar, borra la temporada completa sin necesitarla).
async function fetchSeasonEpisodes(tmdbId, season) {
  if (!TMDB_API_KEY) return [];
  try {
    const url = `${TMDB_API}/tv/${tmdbId}/season/${season}?api_key=${TMDB_API_KEY}&language=es-ES`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return [];
    const json = await res.json();
    const eps = Array.isArray(json?.episodes) ? json.episodes : [];
    return eps
      .map((e) => Number(e?.episode_number))
      .filter((n) => Number.isFinite(n) && n > 0)
      .map((n) => ({ episode: n }));
  } catch {
    return [];
  }
}

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const { tmdbId, season, watched, watchedAt, title, posterPath } = body || {};

  const showTmdbId = Number(tmdbId);
  const seasonNumber = Number(season);
  if (!Number.isFinite(showTmdbId) || showTmdbId <= 0) {
    return NextResponse.json({ error: "Missing tmdbId" }, { status: 400 });
  }
  if (!Number.isFinite(seasonNumber) || seasonNumber < 0) {
    return NextResponse.json({ error: "Invalid season" }, { status: 400 });
  }

  // Marcar VISTO necesita la lista de episodios de la temporada.
  const episodes = watched
    ? await fetchSeasonEpisodes(showTmdbId, seasonNumber)
    : [];
  if (watched && episodes.length === 0) {
    return NextResponse.json(
      { connected: true, error: "No se pudieron obtener los episodios de la temporada" },
      { status: 502 },
    );
  }

  try {
    const backend = await backendFetchJson(request, "/v1/history/seasons", {
      method: "POST",
      body: JSON.stringify({
        tmdbId: showTmdbId,
        season: seasonNumber,
        watched: Boolean(watched),
        watchedAt: watchedAt || undefined,
        episodes: watched ? episodes : undefined,
        title: title || undefined,
        posterPath: posterPath || undefined,
      }),
    });

    if (backend.ok) {
      const res = NextResponse.json({
        connected: true,
        ok: true,
        found: true,
        traktId: null,
        watched: Boolean(watched),
        watchedBySeason: backend.json?.watchedBySeason || {},
        source: "backend",
      });
      setBackendAuthCookies(res, backend, {
        secure: request.nextUrl.protocol === "https:",
      });
      return res;
    }

    return NextResponse.json(
      {
        connected: true,
        error: backend.error || "No se pudo marcar la temporada",
      },
      { status: backend.status || 502 },
    );
  } catch (e) {
    return NextResponse.json(
      { connected: true, error: e?.message || "Season watched failed" },
      { status: 500 },
    );
  }
}
