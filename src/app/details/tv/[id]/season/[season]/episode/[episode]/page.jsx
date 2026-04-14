// src/app/details/tv/[id]/season/[season]/episode/[episode]/page.jsx
import EpisodeDetailsClient from "@/components/EpisodeDetailsClient";
import { getCachedEpisodeImdbData } from "@/lib/api/ratingsCached";
import { getCachedTraktScoreboardData } from "@/lib/trakt/scoreboardCached";

export const revalidate = 3600; // 1h

const TMDB_API_KEY =
  process.env.TMDB_API_KEY || process.env.NEXT_PUBLIC_TMDB_API_KEY;

async function tmdbFetch(path) {
  const url = `https://api.themoviedb.org/3${path}${path.includes("?") ? "&" : "?"}api_key=${TMDB_API_KEY}&language=es-ES`;
  const res = await fetch(url, { next: { revalidate } });
  const json = await res.json().catch(() => ({}));
  if (!res.ok)
    throw new Error(json?.status_message || `TMDb error ${res.status}`);
  return json;
}

export default async function EpisodePage({ params }) {
  if (!TMDB_API_KEY)
    throw new Error("Missing TMDB_API_KEY or NEXT_PUBLIC_TMDB_API_KEY");

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

  const showPromise = tmdbFetch(`/tv/${showId}?append_to_response=external_ids`);
  const episodePromise = tmdbFetch(
    `/tv/${showId}/season/${seasonNumber}/episode/${episodeNumber}?append_to_response=credits,external_ids`,
  );

  const scoreboardPromise = getCachedTraktScoreboardData({
    type: "episode",
    tmdbId: showId,
    season: seasonNumber,
    episode: episodeNumber,
  }).catch(() => null);

  const imdbPromise = showPromise
    .then((show) =>
      getCachedEpisodeImdbData({
        showId,
        imdbId: show?.external_ids?.imdb_id || null,
        seasonNumber,
        episodeNumber,
      }),
    )
    .catch((e) => {
      console.error("Error fetching cached episode IMDb:", e);
      return null;
    });

  const [show, episode, initialScoreboard, imdb] = await Promise.all([
    showPromise,
    episodePromise,
    scoreboardPromise,
    imdbPromise,
  ]);

  const showImdbId = show?.external_ids?.imdb_id || null;

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
      initialScoreboard={initialScoreboard}
      imdb={imdb}
      imdbUrl={imdbUrl}
    />
  );
}
