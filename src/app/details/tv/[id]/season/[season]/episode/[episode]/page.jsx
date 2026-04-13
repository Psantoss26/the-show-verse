// src/app/details/tv/[id]/season/[season]/episode/[episode]/page.jsx
import EpisodeDetailsClient from "@/components/EpisodeDetailsClient";
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

export default async function EpisodePage({ params }) {
  if (!TMDB_API_KEY) throw new Error("Missing NEXT_PUBLIC_TMDB_API_KEY");

  const p = await params;
  const showId = Number(p?.id);
  const seasonNumber = Number(p?.season);
  const episodeNumber = Number(p?.episode);

  if (
    !Number.isFinite(showId) ||
    !Number.isFinite(seasonNumber) ||
    !Number.isFinite(episodeNumber)
  ) {
    return (
      <div className="min-h-screen bg-[#101010] text-white flex items-center justify-center">
        <div className="text-zinc-400">Ruta inválida (id/season/episode).</div>
      </div>
    );
  }

  const [show, episode] = await Promise.all([
    tmdbFetch(`/tv/${showId}?append_to_response=external_ids`),
    tmdbFetch(
      `/tv/${showId}/season/${seasonNumber}/episode/${episodeNumber}?append_to_response=credits,external_ids`,
    ),
  ]);

  const showImdbId = show?.external_ids?.imdb_id || null;

  // Obtener rating de este episodio específico usando el helper directamente (sin HTTP fetch)
  let imdb = null;
  if (showImdbId) {
    try {
      const ratingsData = await getEpisodeRatings(showId, seasonNumber !== 0);
      const targetSeason = ratingsData?.seasons?.find(
        (s) => s.seasonNumber === seasonNumber,
      );
      const targetEpisode = targetSeason?.episodes?.find(
        (ep) => ep.episodeNumber === episodeNumber,
      );

      if (targetEpisode) {
        imdb = {
          id: showImdbId,
          rating:
            typeof targetEpisode.imdb === "number" ? targetEpisode.imdb : null,
          votes:
            typeof targetEpisode.imdbVotes === "number"
              ? targetEpisode.imdbVotes
              : null,
        };
      }
    } catch (e) {
      console.error("Error fetching episode rating:", e);
    }
  }

  const imdbUrl = showImdbId
    ? `https://www.imdb.com/title/${showImdbId}/episodes?season=${seasonNumber}`
    : null;

  return (
    <EpisodeDetailsClient
      showId={showId}
      seasonNumber={seasonNumber}
      episodeNumber={episodeNumber}
      show={show}
      episode={episode}
      imdb={imdb}
      imdbUrl={imdbUrl}
    />
  );
}
