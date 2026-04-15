// src/app/details/tv/[id]/season/[season]/page.jsx
import SeasonDetailsClient from "@/components/SeasonDetailsClient";

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

  const [show, season] = await Promise.all([showPromise, seasonPromise]);

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
      showImdbId={showImdbId}
      initialScoreboard={null}
      imdb={null}
      imdbUrl={imdbUrl}
    />
  );
}
