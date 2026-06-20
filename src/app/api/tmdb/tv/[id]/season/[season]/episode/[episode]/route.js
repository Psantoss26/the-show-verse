import { NextResponse } from "next/server";
import { cookies } from "next/headers";

export const revalidate = 86400;

const TMDB_API_KEY =
  process.env.TMDB_API_KEY || process.env.NEXT_PUBLIC_TMDB_API_KEY;

async function tmdbFetch(path) {
  const cookieStore = await cookies();
  const locale = cookieStore.get("showverse_locale")?.value || "es-ES";
  const url = `https://api.themoviedb.org/3${path}${path.includes("?") ? "&" : "?"}api_key=${TMDB_API_KEY}&language=${locale}`;
  const res = await fetch(url, { next: { revalidate } });
  const json = await res.json().catch(() => ({}));
  if (!res.ok)
    throw new Error(json?.status_message || `TMDb error ${res.status}`);
  return json;
}

export async function GET(_request, context) {
  if (!TMDB_API_KEY) {
    return NextResponse.json({ name: null }, { status: 200 });
  }

  const { id, season, episode } = await context.params;
  const showId = Number(id);
  const seasonNumber = Number(season);
  const episodeNumber = Number(episode);

  if (
    !Number.isFinite(showId) ||
    !Number.isFinite(seasonNumber) ||
    !Number.isFinite(episodeNumber)
  ) {
    return NextResponse.json({ name: null }, { status: 200 });
  }

  try {
    const data = await tmdbFetch(
      `/tv/${showId}/season/${seasonNumber}/episode/${episodeNumber}`,
    );

    return NextResponse.json(
      {
        name: data?.name || null,
        season_number: data?.season_number ?? seasonNumber,
        episode_number: data?.episode_number ?? episodeNumber,
      },
      {
        status: 200,
        headers: {
          "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800",
        },
      },
    );
  } catch (err) {
    console.error("Error obteniendo episodio TMDb localizado:", err);
    return NextResponse.json({ name: null }, { status: 200 });
  }
}
