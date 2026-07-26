// src/app/api/trakt/history/show/route.js
import { NextResponse } from "next/server";
import { backendFetchJson, setBackendAuthCookies } from "@/lib/backend/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TMDB_API = "https://api.themoviedb.org/3";
const TMDB_API_KEY =
  process.env.TMDB_API_KEY || process.env.NEXT_PUBLIC_TMDB_API_KEY;

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

// Marcar/quitar TODA una serie (varias temporadas) como vista — ÍNTEGRO en el
// backend propio (/v1/history/seasons por temporada). Sin Trakt.
// Body: { tmdbId, seasonNumbers:[...], watchedAt }  (watchedAt presente = marcar;
// ausente = quitar).
export async function POST(request) {
  try {
    let body;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const { tmdbId, seasonNumbers = [], watchedAt, title, posterPath } = body || {};
    const showTmdbId = Number(tmdbId);
    if (!Number.isFinite(showTmdbId)) {
      return NextResponse.json({ error: "tmdbId requerido" }, { status: 400 });
    }

    const isAdd = Boolean(watchedAt);
    const cleanSeasons = (Array.isArray(seasonNumbers) ? seasonNumbers : []).filter(
      (n) => typeof n === "number" && n > 0,
    );
    if (cleanSeasons.length === 0) {
      return NextResponse.json({ error: "seasonNumbers vacío" }, { status: 400 });
    }

    // Cada fila de episodio conserva el progreso, pero comparte la identidad
    // de esta acción para que el perfil muestre una sola serie completada.
    const activityGroup = isAdd ? `show-complete:${showTmdbId}:${crypto.randomUUID()}` : undefined;

    let lastBackend = null;
    let anyOk = false;
    for (const season of cleanSeasons) {
      const episodes = isAdd
        ? await fetchSeasonEpisodes(showTmdbId, season)
        : undefined;
      if (isAdd && (!episodes || episodes.length === 0)) continue;

      const res = await backendFetchJson(request, "/v1/history/seasons", {
        method: "POST",
        body: JSON.stringify({
          tmdbId: showTmdbId,
          season,
          watched: isAdd,
          watchedAt: isAdd ? watchedAt : undefined,
          episodes: isAdd ? episodes : undefined,
          title: title || undefined,
          posterPath: posterPath || undefined,
          activityGroup,
        }),
      });
      if (res.ok) {
        anyOk = true;
        lastBackend = res;
      }
    }

    if (!anyOk) {
      return NextResponse.json(
        { error: "No se pudo actualizar la serie" },
        { status: 502 },
      );
    }

    const out = NextResponse.json({
      ok: true,
      source: "backend",
      watchedBySeason: lastBackend?.json?.watchedBySeason || {},
    });
    setBackendAuthCookies(out, lastBackend, {
      secure: request.nextUrl.protocol === "https:",
    });
    return out;
  } catch (e) {
    return NextResponse.json(
      { error: e?.message || "Error desconocido" },
      { status: 500 },
    );
  }
}
