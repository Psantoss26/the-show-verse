import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SERIESGRAPH_REVALIDATE_SECONDS = 60 * 60 * 24 * 30;
const MEMORY_TTL_MS = SERIESGRAPH_REVALIDATE_SECONDS * 1000;
const CACHE = new Map();

function cacheGet(key) {
  const hit = CACHE.get(key);
  if (!hit) return null;
  if (Date.now() - hit.ts > MEMORY_TTL_MS) {
    CACHE.delete(key);
    return null;
  }
  return hit.data;
}

function cacheSet(key, data) {
  CACHE.set(key, { ts: Date.now(), data });
}

function toNumber(value) {
  if (value == null) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const normalized = String(value).replace(",", ".").trim();
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function toInteger(value) {
  const parsed = toNumber(value);
  if (parsed == null) return null;
  return Math.trunc(parsed);
}

function slugifyForSeriesGraph(value = "") {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeSeasons(payload) {
  const rawSeasons = Array.isArray(payload?.seasons)
    ? payload.seasons
    : Array.isArray(payload)
      ? payload
      : [];

  return rawSeasons
    .map((season, seasonIndex) => {
      const seasonNumber =
        toInteger(season?.season_number ?? season?.seasonNumber) ??
        seasonIndex + 1;

      if (seasonNumber <= 0) return null;

      const rawEpisodes = Array.isArray(season?.episodes)
        ? season.episodes
        : [];

      const episodes = rawEpisodes
        .map((episode, episodeIndex) => {
          const episodeNumber =
            toInteger(episode?.episode_number ?? episode?.episodeNumber) ??
            episodeIndex + 1;
          if (episodeNumber <= 0) return null;

          const rating = toNumber(
            episode?.vote_average ??
              episode?.rating ??
              episode?.seriesGraphRating,
          );
          const votes = toInteger(
            episode?.num_votes ??
              episode?.vote_count ??
              episode?.votes ??
              episode?.seriesGraphVotes,
          );

          return {
            episode_number: episodeNumber,
            episodeNumber,
            season_number: seasonNumber,
            seasonNumber,
            name: episode?.name || episode?.title || "",
            air_date: episode?.air_date || episode?.airDate || null,
            overview: episode?.overview || "",
            still_path: episode?.still_path || null,
            tconst: episode?.tconst || null,
            source: "seriesgraph",
            vote_average: rating,
            vote_count: votes,
            seriesGraphRating: rating,
            seriesGraphVotes: votes,
          };
        })
        .filter(Boolean)
        .sort((a, b) => a.episode_number - b.episode_number);

      return {
        season_number: seasonNumber,
        seasonNumber,
        episodes,
      };
    })
    .filter((season) => season && season.episodes.length > 0)
    .sort((a, b) => a.season_number - b.season_number);
}

async function fetchSeriesGraphSeasonRatings(tmdbId) {
  const url = `https://seriesgraph.com/api/shows/${encodeURIComponent(
    tmdbId,
  )}/season-ratings`;

  const res = await fetch(url, {
    redirect: "follow",
    cache: "no-store",
    headers: {
      accept: "application/json, text/plain, */*",
      "accept-language": "es-ES,es;q=0.9,en;q=0.8",
      referer: `https://seriesgraph.com/show/${encodeURIComponent(tmdbId)}`,
      "user-agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
    },
  });

  if (!res.ok) {
    const error = new Error(
      `SeriesGraph devolvió ${res.status} al obtener episodios.`,
    );
    error.status = res.status;
    throw error;
  }

  const contentType = res.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    const error = new Error("SeriesGraph no devolvió datos JSON válidos.");
    error.status = 502;
    throw error;
  }

  return res.json();
}

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const tmdbId = searchParams.get("tmdbId")?.trim();
  const title = searchParams.get("title")?.trim() || "";

  if (!tmdbId) {
    return NextResponse.json(
      { error: "Falta el parámetro tmdbId de la serie." },
      { status: 400 },
    );
  }

  const cacheKey = `seriesgraph:${tmdbId}`;
  const cached = cacheGet(cacheKey);
  if (cached) {
    return NextResponse.json(cached, {
      headers: {
        "Cache-Control": `public, s-maxage=${SERIESGRAPH_REVALIDATE_SECONDS}, stale-while-revalidate=${SERIESGRAPH_REVALIDATE_SECONDS}`,
      },
    });
  }

  try {
    const payload = await fetchSeriesGraphSeasonRatings(tmdbId);
    const seasons = normalizeSeasons(payload);
    const episodeCount = seasons.reduce(
      (total, season) => total + season.episodes.length,
      0,
    );

    if (!episodeCount) {
      return NextResponse.json(
        { error: "SeriesGraph no tiene episodios para esta serie." },
        { status: 404 },
      );
    }

    const slug = slugifyForSeriesGraph(title);
    const normalized = {
      meta: {
        source: "seriesgraph",
        totalSeasons: seasons.length,
        totalEpisodes: episodeCount,
        imdbId: payload?.imdbId || null,
        providerUrl: `https://seriesgraph.com/show/${tmdbId}${
          slug ? `-${slug}` : ""
        }`,
      },
      seasons,
    };

    cacheSet(cacheKey, normalized);

    return NextResponse.json(normalized, {
      headers: {
        "Cache-Control": `public, s-maxage=${SERIESGRAPH_REVALIDATE_SECONDS}, stale-while-revalidate=${SERIESGRAPH_REVALIDATE_SECONDS}`,
      },
    });
  } catch (err) {
    console.error("Error en /api/seriesgraph/episode-ratings:", err);
    return NextResponse.json(
      {
        error:
          err?.message ||
          "No se pudieron cargar las puntuaciones de SeriesGraph.",
      },
      { status: err?.status || 500 },
    );
  }
}
