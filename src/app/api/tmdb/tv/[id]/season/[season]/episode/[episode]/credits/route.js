import { NextResponse } from "next/server";
import { cookies } from "next/headers";

export const revalidate = 3600;

const TMDB_API_KEY =
  process.env.TMDB_API_KEY || process.env.NEXT_PUBLIC_TMDB_API_KEY;

async function tmdbFetch(path) {
  const cookieStore = await cookies();
  const locale = cookieStore.get("showverse_locale")?.value || "es-ES";
  const url = `https://api.themoviedb.org/3${path}${
    path.includes("?") ? "&" : "?"
  }api_key=${TMDB_API_KEY}&language=${locale}`;
  const res = await fetch(url, { next: { revalidate } });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = new Error(json?.status_message || `TMDb error ${res.status}`);
    error.status = res.status;
    throw error;
  }
  return json;
}

export async function GET(_request, context) {
  if (!TMDB_API_KEY) {
    return NextResponse.json(
      { error: "Missing TMDB_API_KEY or NEXT_PUBLIC_TMDB_API_KEY" },
      { status: 500 },
    );
  }

  const params = await context.params;
  const showId = Number(params?.id);
  const seasonNumber = Number(params?.season);
  const episodeNumber = Number(params?.episode);

  if (
    !Number.isFinite(showId) ||
    !Number.isFinite(seasonNumber) ||
    !Number.isFinite(episodeNumber)
  ) {
    return NextResponse.json(
      { error: "Ruta inválida (id/season/episode)." },
      { status: 400 },
    );
  }

  try {
    const credits = await tmdbFetch(
      `/tv/${showId}/season/${seasonNumber}/episode/${episodeNumber}/credits`,
    );

    return NextResponse.json(credits, {
      headers: {
        "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error?.message || "No se pudo cargar el reparto del episodio." },
      { status: error?.status || 500 },
    );
  }
}
