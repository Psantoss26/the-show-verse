import { NextResponse } from "next/server";
import { getCachedEpisodeImdbData } from "@/lib/api/ratingsCached";
import { getSeriesGraphEpisodeRating } from "@/lib/details/seriesGraphRatings";

export const revalidate = 3600;

const TMDB_API_KEY =
  process.env.TMDB_API_KEY || process.env.NEXT_PUBLIC_TMDB_API_KEY;

async function safeJson(res) {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

async function fetchTmdbShowSeasons(showId) {
  if (!TMDB_API_KEY || !showId) return [];

  const res = await fetch(
    `https://api.themoviedb.org/3/tv/${encodeURIComponent(showId)}?api_key=${TMDB_API_KEY}&language=es-ES`,
    { next: { revalidate: 86400 } },
  );
  if (!res.ok) return [];

  const data = await safeJson(res);
  return Array.isArray(data?.seasons) ? data.seasons : [];
}

async function fetchSeriesGraphRatings(request, showId) {
  const seriesGraphUrl = new URL(
    `/api/seriesgraph/episode-ratings?tmdbId=${encodeURIComponent(showId)}`,
    request.url,
  );
  const res = await fetch(seriesGraphUrl, {
    next: { revalidate: 60 * 60 * 24 * 30 },
  });
  if (!res.ok) return null;
  return safeJson(res);
}

export async function GET(request, context) {
  const { params } = context;
  const { id } = await params;

  if (!id) {
    return NextResponse.json(
      { error: "Falta el parámetro id de la serie." },
      { status: 400 },
    );
  }

  const url = new URL(request.url);
  const seasonNumber = Number(url.searchParams.get("season"));
  const episodeNumber = Number(url.searchParams.get("episode"));
  const imdbId = url.searchParams.get("imdbId");

  if (
    !Number.isFinite(seasonNumber) ||
    !Number.isFinite(episodeNumber) ||
    !imdbId
  ) {
    return NextResponse.json(
      { error: "Faltan parámetros válidos para season/episode/imdbId." },
      { status: 400 },
    );
  }

  try {
    const [seriesGraphRatings, tmdbSeasons] = await Promise.all([
      fetchSeriesGraphRatings(request, id),
      fetchTmdbShowSeasons(id),
    ]);

    const seriesGraphImdb = getSeriesGraphEpisodeRating({
      ratings: seriesGraphRatings,
      seasonNumber,
      episodeNumber,
      tmdbSeasons,
      showId: id,
    });

    if (typeof seriesGraphImdb?.rating === "number") {
      return NextResponse.json(
        { imdb: seriesGraphImdb },
        {
          status: 200,
          headers: {
            "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
          },
        },
      );
    }

    const imdb = await getCachedEpisodeImdbData({
      showId: id,
      imdbId,
      seasonNumber,
      episodeNumber,
    });

    return NextResponse.json(
      { imdb: imdb || null },
      {
        status: 200,
        headers: {
          "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
        },
      },
    );
  } catch (err) {
    console.error("Error en /api/tv/[id]/episode-imdb:", err);
    return NextResponse.json({ imdb: null }, { status: 200 });
  }
}
