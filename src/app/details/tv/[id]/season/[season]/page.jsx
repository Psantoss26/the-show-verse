// src/app/details/tv/[id]/season/[season]/page.jsx
import SeasonDetailsClient from "@/components/SeasonDetailsClient";
import { getEpisodeRatings } from "@/lib/api/ratingsHelper";

export const revalidate = 3600; // 1h

const TMDB_API_KEY = process.env.NEXT_PUBLIC_TMDB_API_KEY;

async function tmdbFetch(path) {
  const url = `https://api.themoviedb.org/3${path}${path.includes("?") ? "&" : "?"}api_key=${TMDB_API_KEY}&language=es-ES`;
  const res = await fetch(url, { next: { revalidate } });
  const json = await res.json().catch(() => ({}));
  if (!res.ok)
    throw new Error(json?.status_message || `TMDb error ${res.status}`);
  return json;
}

export default async function SeasonPage({ params }) {
  if (!TMDB_API_KEY) throw new Error("Missing NEXT_PUBLIC_TMDB_API_KEY");

  const p = await params;
  const showId = Number(p?.id);
  const seasonNumber = Number(p?.season);

  if (!Number.isFinite(showId) || !Number.isFinite(seasonNumber)) {
    return (
      <div className="min-h-screen bg-[#101010] text-white flex items-center justify-center">
        <div className="text-zinc-400">Ruta inválida (id/season).</div>
      </div>
    );
  }

  const [show, season] = await Promise.all([
    tmdbFetch(`/tv/${showId}?append_to_response=external_ids`),
    tmdbFetch(`/tv/${showId}/season/${seasonNumber}`),
  ]);

  const showImdbId = show?.external_ids?.imdb_id || null;

  // Obtener ratings de episodios usando el helper directamente (sin HTTP fetch)
  let imdb = null;
  if (showImdbId) {
    try {
      const ratingsData = await getEpisodeRatings(showId, seasonNumber !== 0);
      const targetSeason = ratingsData?.seasons?.find(
        (s) => s.seasonNumber === seasonNumber,
      );

      if (targetSeason?.episodes?.length > 0) {
        // Calcular promedio de IMDb para esta temporada
        const imdbRatings = targetSeason.episodes
          .map((ep) => ep.imdb)
          .filter((r) => typeof r === "number" && r > 0);

        const imdbVotes = targetSeason.episodes
          .map((ep) => ep.imdbVotes)
          .filter((v) => typeof v === "number" && v > 0);

        if (imdbRatings.length > 0) {
          const avgRating =
            imdbRatings.reduce((a, b) => a + b, 0) / imdbRatings.length;
          const totalVotes = imdbVotes.reduce((a, b) => a + b, 0);

          imdb = {
            id: showImdbId,
            rating: Number(avgRating.toFixed(1)),
            votes: totalVotes > 0 ? totalVotes : null,
          };
        }
      }
    } catch (e) {
      console.error("Error fetching episode ratings for season:", e);
    }
  }

  const imdbUrl = showImdbId
    ? `https://www.imdb.com/title/${showImdbId}/episodes?season=${seasonNumber}`
    : null;

  return (
    <SeasonDetailsClient
      showId={showId}
      seasonNumber={seasonNumber}
      show={show}
      season={season}
      imdb={imdb}
      imdbUrl={imdbUrl}
    />
  );
}
