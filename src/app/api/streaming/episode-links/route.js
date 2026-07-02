import { NextResponse } from "next/server";
import { getEpisodeStreamingProviders } from "@/lib/api/justwatch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  const title = request.nextUrl.searchParams.get("title")?.trim();
  const tmdbId = Number(request.nextUrl.searchParams.get("tmdbId"));
  const year = Number(request.nextUrl.searchParams.get("year")) || null;
  const season = Number(request.nextUrl.searchParams.get("season"));
  const episode = Number(request.nextUrl.searchParams.get("episode"));

  if (
    !title ||
    !Number.isInteger(tmdbId) ||
    tmdbId <= 0 ||
    !Number.isInteger(season) ||
    season <= 0 ||
    !Number.isInteger(episode) ||
    episode <= 0
  ) {
    return NextResponse.json(
      { error: "Missing or invalid title, tmdbId, season, or episode" },
      { status: 400 },
    );
  }

  try {
    const result = await getEpisodeStreamingProviders({
      title,
      tmdbId,
      year,
      seasonNumber: season,
      episodeNumber: episode,
    });

    return NextResponse.json(result, {
      headers: {
        "Cache-Control":
          "public, s-maxage=21600, stale-while-revalidate=86400",
      },
    });
  } catch (error) {
    console.error("Episode streaming providers request failed:", error);
    return NextResponse.json(
      { error: "Unable to load episode streaming links" },
      { status: 502 },
    );
  }
}
