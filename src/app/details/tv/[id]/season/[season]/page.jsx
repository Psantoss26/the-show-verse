// src/app/details/tv/[id]/season/[season]/page.jsx
import SeasonDetailsClient from "@/components/SeasonDetailsClient";
import { getCachedSeasonImdbData } from "@/lib/api/ratingsCached";
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

export default async function SeasonPage({ params }) {
  if (!TMDB_API_KEY)
    throw new Error("Missing TMDB_API_KEY or NEXT_PUBLIC_TMDB_API_KEY");

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

  const showPromise = tmdbFetch(`/tv/${showId}?append_to_response=external_ids`);
  const seasonPromise = tmdbFetch(`/tv/${showId}/season/${seasonNumber}`);

  const scoreboardPromise = getCachedTraktScoreboardData({
    type: "season",
    tmdbId: showId,
    season: seasonNumber,
  }).catch(() => null);

  const imdbPromise = showPromise
    .then((show) =>
      getCachedSeasonImdbData({
        showId,
        imdbId: show?.external_ids?.imdb_id || null,
        seasonNumber,
      }),
    )
    .catch((e) => {
      console.error("Error fetching cached season IMDb:", e);
      return null;
    });

  const [show, season, initialScoreboard, imdb] = await Promise.all([
    showPromise,
    seasonPromise,
    scoreboardPromise,
    imdbPromise,
  ]);

  const showImdbId = show?.external_ids?.imdb_id || null;

  const imdbUrl = showImdbId
    ? `https://www.imdb.com/title/${showImdbId}/episodes?season=${seasonNumber}`
    : null;

  return (
    <SeasonDetailsClient
      showId={showId}
      seasonNumber={seasonNumber}
      show={show}
      season={season}
      initialScoreboard={initialScoreboard}
      imdb={imdb}
      imdbUrl={imdbUrl}
    />
  );
}
