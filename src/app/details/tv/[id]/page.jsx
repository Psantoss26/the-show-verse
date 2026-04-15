import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import DetailsPageLoader from "@/components/DetailsPageLoader";
import { getDetails } from "@/lib/api/tmdb";
import {
  getTraktDetailsBootstrapFromCookieStore,
} from "@/lib/trakt/server";
import { getCachedTraktScoreboardData } from "@/lib/trakt/scoreboardCached";

export const revalidate = 600;

function resolveWithin(promise, timeoutMs, fallback = null) {
  return Promise.race([
    promise,
    new Promise((resolve) => {
      setTimeout(() => resolve(fallback), timeoutMs);
    }),
  ]);
}

export default async function TvDetailsPage({ params }) {
  const p = await params;
  const id = p?.id;

  if (!id) {
    notFound();
  }

  const cookieStore = await cookies();
  const [data, traktBootstrap, initialScoreboard] = await Promise.all([
    getDetails("tv", id, { appendToResponse: "external_ids" }),
    resolveWithin(
      getTraktDetailsBootstrapFromCookieStore(cookieStore, {
        type: "show",
        tmdbId: id,
      }).catch(() => null),
      900,
      null,
    ),
    // Scoreboard de Trakt: rating comunidad + estadísticas (watchers, plays, etc.)
    resolveWithin(
      getCachedTraktScoreboardData({ type: "show", tmdbId: id }).catch(
        () => null,
      ),
      600,
      null,
    ),
  ]);

  if (!data) {
    notFound();
  }

  const initialTraktStatus = traktBootstrap?.status ?? null;
  const initialShowWatched = traktBootstrap?.showWatched ?? null;

  return (
    <DetailsPageLoader
      type="tv"
      id={id}
      data={data}
      initialTraktStatus={initialTraktStatus}
      initialShowWatched={initialShowWatched}
      initialScoreboard={initialScoreboard}
    />
  );
}
