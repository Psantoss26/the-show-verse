// /src/app/api/trakt/ratings/route.js
// Valoraciones de usuario — ÍNTEGRO en el backend propio (/v1/ratings). Sin Trakt.
import { NextResponse } from "next/server";
import {
  backendFetchJson,
  mediaTypeToBackend,
  setBackendAuthCookies,
} from "@/lib/backend/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
        `/v1/ratings?type=${type}&limit=1000`,
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
          : // La temporada tiene su propia valoración y no representa a sus
            // episodios, que se puntúan de forma independiente.
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
      const showTmdbId = Number(body?.tmdbId ?? body?.ids?.tmdb);
      const seasonNumber = Number(body?.season ?? body?.seasonNumber);
      backendResult =
        rating === null
          ? await backendFetchJson(
              req,
              `/v1/ratings/${encodeURIComponent(showTmdbId)}/season?season=${seasonNumber}`,
              { method: "DELETE" },
            )
          : await backendFetchJson(req, "/v1/ratings", {
              method: "POST",
              body: JSON.stringify({
                tmdbId: showTmdbId,
                mediaType: "season",
                rating,
                season: seasonNumber,
                title: body?.title || undefined,
                posterPath: body?.posterPath || undefined,
              }),
            });
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
