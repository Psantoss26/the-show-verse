import { NextResponse } from "next/server";
import { pickEpisodeHeroStills } from "@/lib/details/episodeHeroStills";

export const revalidate = 86400;

const TMDB_API_KEY =
  process.env.TMDB_API_KEY || process.env.NEXT_PUBLIC_TMDB_API_KEY;

async function tmdbFetch(path) {
  const url = `https://api.themoviedb.org/3${path}${path.includes("?") ? "&" : "?"}api_key=${TMDB_API_KEY}`;
  const res = await fetch(url, { next: { revalidate } });
  const json = await res.json().catch(() => ({}));
  if (!res.ok)
    throw new Error(json?.status_message || `TMDb error ${res.status}`);
  return json;
}

// Imágenes de la portada móvil de un episodio (las bandas de
// EpisodeStillStack): la misma selección que hace la ficha del episodio en el
// servidor. La usa la vista previa de pulsación larga.
export async function GET(_request, context) {
  const { id, season, episode } = await context.params;
  const showId = Number(id);
  const seasonNumber = Number(season);
  const episodeNumber = Number(episode);

  if (
    !TMDB_API_KEY ||
    !Number.isFinite(showId) ||
    !Number.isFinite(seasonNumber) ||
    !Number.isFinite(episodeNumber)
  ) {
    return NextResponse.json({ stills: [] }, { status: 200 });
  }

  const base = `/tv/${showId}/season/${seasonNumber}/episode/${episodeNumber}`;
  const [details, images, showImages] = await Promise.all([
    tmdbFetch(base).catch(() => null),
    tmdbFetch(`${base}/images?include_image_language=null,xx,en,es`).catch(
      () => null,
    ),
    tmdbFetch(`/tv/${showId}/images?include_image_language=null,xx`).catch(
      () => null,
    ),
  ]);

  const stills = pickEpisodeHeroStills({
    stillPath: details?.still_path || null,
    stills: images?.stills,
    showBackdrops: showImages?.backdrops,
  });

  return NextResponse.json(
    { stills },
    {
      status: 200,
      headers: {
        "Cache-Control": stills.length
          ? "public, s-maxage=86400, stale-while-revalidate=604800"
          : "no-store",
      },
    },
  );
}
