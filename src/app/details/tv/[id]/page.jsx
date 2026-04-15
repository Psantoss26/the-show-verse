import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import DetailsPageLoader from "@/components/DetailsPageLoader";
import { getDetails } from "@/lib/api/tmdb";
import {
  getTraktItemStatusFromCookieStore,
  getTraktShowWatchedFromCookieStore,
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
  const [data, initialTraktStatus, initialShowWatched, initialScoreboard] =
    await Promise.all([
      getDetails("tv", id),
      resolveWithin(
        getTraktItemStatusFromCookieStore(cookieStore, {
          type: "show",
          tmdbId: id,
        }).catch(() => null),
        900,
        null,
      ),
      resolveWithin(
        getTraktShowWatchedFromCookieStore(cookieStore, {
          tmdbId: id,
        }).catch(() => null),
        950,
        null,
      ),
      // Scoreboard de Trakt: rating comunidad + estadísticas (watchers, plays, etc.)
      resolveWithin(
        getCachedTraktScoreboardData({ type: "show", tmdbId: id }).catch(
          () => null,
        ),
        4000,
        null,
      ),
    ]);

  if (!data) {
    notFound();
  }

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
