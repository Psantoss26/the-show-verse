import { NextResponse } from "next/server";
import { getCachedEpisodeImdbData } from "@/lib/api/ratingsCached";

export const revalidate = 3600;

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
