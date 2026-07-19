// /src/app/api/trakt/ratings/route.js
// Valoraciones de usuario — ÍNTEGRO en el backend propio (/v1/ratings). Sin Trakt.
// El backend no tiene valoración de TEMPORADA: se mapea a valoración POR EPISODIO
// (puntuar/leer todos los episodios de la temporada, que comparten valor).
import { NextResponse } from "next/server";
import {
  backendFetchJson,
  mediaTypeToBackend,
  setBackendAuthCookies,
} from "@/lib/backend/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TMDB_API = "https://api.themoviedb.org/3";
const TMDB_API_KEY =
  process.env.TMDB_API_KEY || process.env.NEXT_PUBLIC_TMDB_API_KEY;

function normalizeType(t) {
  const x = String(t || "")
    .toLowerCase()
    .trim();
  if (x === "tv" || x === "shows" || x === "series") return "show";
  if (x === "movies") return "movie";
  if (x === "seasons") return "season";
  if (x === "episodes") return "episode";
  return x;
}

function normalizeRating(val) {
  if (val === null || val === undefined) return null;
  const n = Number(val);
  if (!Number.isFinite(n)) return null;
  const clamped = Math.min(10, Math.max(1, n));
  const normalized = Math.round(clamped * 10) / 10;
  if (normalized < 1 || normalized > 10) return null;
  return normalized;
}

async function fetchSeasonEpisodes(tmdbId, season) {
  if (!TMDB_API_KEY || !Number.isFinite(tmdbId) || !Number.isFinite(season)) {
    return [];
  }
  try {
    const url = `${TMDB_API}/tv/${tmdbId}/season/${season}?api_key=${TMDB_API_KEY}&language=es-ES`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return [];
    const json = await res.json();
    const eps = Array.isArray(json?.episodes) ? json.episodes : [];
    return eps
      .map((e) => Number(e?.episode_number))
      .filter((n) => Number.isFinite(n) && n > 0);
  } catch {
    return [];
  }
}

const secureFor = (req) => ({ secure: req.nextUrl?.protocol === "https:" });

// ======================
// GET: leer la valoración del usuario (backend propio)
//   ?type=movie|show|episode|season&tmdbId=..&season=..&episode=..
//   (sin type → lista completa de valoraciones)
// ======================
export async function GET(req) {
  try {
    const url = new URL(req.url);
    const type = normalizeType(url.searchParams.get("type"));

    if (!type) {
      const limit = Number(url.searchParams.get("limit") || 1000);
      const backend = await backendFetchJson(
        req,
        `/v1/ratings?limit=${encodeURIComponent(String(limit))}`,
      );
      if (!backend.ok) {
        return NextResponse.json(
          { results: [], page: 1 },
          { status: backend.status === 401 ? 401 : 200 },
        );
      }
      const res = NextResponse.json({
        results: Array.isArray(backend.json?.results)
          ? backend.json.results
          : [],
        page: backend.json?.page || 1,
        source: "backend",
      });
      setBackendAuthCookies(res, backend, secureFor(req));
      return res;
    }

    if (type === "movie" || type === "show") {
      const tmdbId = Number(url.searchParams.get("tmdbId"));
      const mediaType = mediaTypeToBackend(type);
      const backend = await backendFetchJson(
        req,
        `/v1/items/${encodeURIComponent(tmdbId)}/${mediaType}/status`,
      );
      if (!backend.ok) {
        return NextResponse.json(
          { found: false, rating: null },
          { status: backend.status === 401 ? 401 : 200 },
        );
      }
      const res = NextResponse.json({
        found: backend.json?.rating != null,
        rating: backend.json?.rating ?? null,
        source: "backend",
      });
      setBackendAuthCookies(res, backend, secureFor(req));
      return res;
    }

    if (type === "episode" || type === "season") {
      const showTmdbId = Number(url.searchParams.get("tmdbId"));
      const seasonNumber = Number(url.searchParams.get("season"));
      const episodeNumber =
        type === "episode" ? Number(url.searchParams.get("episode")) : null;

      const backend = await backendFetchJson(
        req,
        "/v1/ratings?type=episode&limit=1000",
      );
      if (!backend.ok) {
        return NextResponse.json(
          { found: false, rating: null },
          { status: backend.status === 401 ? 401 : 200 },
        );
      }
      const items = Array.isArray(backend.json?.results)
        ? backend.json.results
        : [];
      const found =
        type === "episode"
          ? items.find(
              (it) =>
                Number(it.tmdbId) === showTmdbId &&
                Number(it.season) === seasonNumber &&
                Number(it.episode) === episodeNumber,
            )
          : // Temporada: valoración representativa = la de cualquier episodio
            // valorado de la temporada (todos comparten valor al puntuar la temporada).
            items.find(
              (it) =>
                Number(it.tmdbId) === showTmdbId &&
                Number(it.season) === seasonNumber,
            );

      const res = NextResponse.json({
        found: !!found,
        rating: found ? found.rating : null,
        source: "backend",
      });
      setBackendAuthCookies(res, backend, secureFor(req));
      return res;
    }

    return NextResponse.json({ error: "Unsupported type" }, { status: 400 });
  } catch (e) {
    return NextResponse.json(
      { error: e?.message || "Server error" },
      { status: 500 },
    );
  }
}

// ======================
// POST: dar/quitar valoración (backend propio)
// ======================
export async function POST(req) {
  try {
    const body = await req.json().catch(() => ({}));
    const type = normalizeType(body?.type);
    const rating = normalizeRating(body?.rating);
    const mediaType = mediaTypeToBackend(type);

    let backendResult = null;

    if (type === "episode") {
      const showTmdbId = Number(
        body?.tmdbId ??
          body?.showId ??
          body?.tvId ??
          body?.showTmdbId ??
          body?.ids?.tmdb,
      );
      const seasonNumber = Number(body?.season ?? body?.seasonNumber);
      const episodeNumber = Number(body?.episode ?? body?.episodeNumber);
      backendResult =
        rating === null
          ? await backendFetchJson(
              req,
              `/v1/ratings/${encodeURIComponent(showTmdbId)}/episode?season=${seasonNumber}&episode=${episodeNumber}`,
              { method: "DELETE" },
            )
          : await backendFetchJson(req, "/v1/ratings", {
              method: "POST",
              body: JSON.stringify({
                tmdbId: showTmdbId,
                mediaType: "episode",
                rating,
                season: seasonNumber,
                episode: episodeNumber,
                title: body?.title || undefined,
                posterPath: body?.posterPath || undefined,
              }),
            });
    } else if (type === "movie" || type === "show") {
      const tmdbId = Number(body?.tmdbId ?? body?.ids?.tmdb);
      backendResult =
        rating === null
          ? await backendFetchJson(
              req,
              `/v1/ratings/${encodeURIComponent(tmdbId)}/${mediaType}`,
              { method: "DELETE" },
            )
          : await backendFetchJson(req, "/v1/ratings", {
              method: "POST",
              body: JSON.stringify({
                tmdbId,
                mediaType,
                rating,
                title: body?.title || undefined,
                posterPath: body?.posterPath || undefined,
              }),
            });
    } else if (type === "season") {
      // No hay valoración de temporada en el backend: puntuar una temporada =
      // puntuar todos sus episodios.
      const showTmdbId = Number(body?.tmdbId ?? body?.ids?.tmdb);
      const seasonNumber = Number(body?.season ?? body?.seasonNumber);
      const episodeNumbers = await fetchSeasonEpisodes(showTmdbId, seasonNumber);
      let anyOk = false;
      for (const epNum of episodeNumbers) {
        const res =
          rating === null
            ? await backendFetchJson(
                req,
                `/v1/ratings/${encodeURIComponent(showTmdbId)}/episode?season=${seasonNumber}&episode=${epNum}`,
                { method: "DELETE" },
              )
            : await backendFetchJson(req, "/v1/ratings", {
                method: "POST",
                body: JSON.stringify({
                  tmdbId: showTmdbId,
                  mediaType: "episode",
                  rating,
                  season: seasonNumber,
                  episode: epNum,
                  title: body?.title || undefined,
                  posterPath: body?.posterPath || undefined,
                }),
              });
        if (res.ok) {
          anyOk = true;
          backendResult = res;
        }
      }
      if (!anyOk) backendResult = null;
    } else {
      return NextResponse.json({ error: "Unsupported type" }, { status: 400 });
    }

    if (!backendResult || !backendResult.ok) {
      return NextResponse.json(
        { error: backendResult?.error || "No se pudo guardar la valoración" },
        { status: backendResult?.status || 502 },
      );
    }

    const res = NextResponse.json({
      ok: true,
      type,
      removed: rating === null,
      rating,
      source: "backend",
    });
    setBackendAuthCookies(res, backendResult, secureFor(req));
    return res;
  } catch (e) {
    return NextResponse.json(
      { error: e?.message || "Server error" },
      { status: 500 },
    );
  }
}
