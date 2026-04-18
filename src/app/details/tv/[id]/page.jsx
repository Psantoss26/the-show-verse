import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import DetailsPageLoader from "@/components/DetailsPageLoader";
import { getDetails } from "@/lib/api/tmdb";
import { getTraktDetailsBootstrapFromCookieStore } from "@/lib/trakt/server";
import { getCachedTraktScoreboardData } from "@/lib/trakt/scoreboardCached";

export const dynamic = "force-dynamic";

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
    getDetails("tv", id, {
      appendToResponse: "credits,reviews,external_ids",
    }),
    resolveWithin(
      getTraktDetailsBootstrapFromCookieStore(cookieStore, {
        type: "show",
        tmdbId: id,
      }).catch(() => null),
      1800,
      null,
    ),
    resolveWithin(
      getCachedTraktScoreboardData({
        type: "show",
        tmdbId: id,
        includeStats: false,
      }).catch(() => null),
      500,
      null,
    ),
  ]);

  if (!data) {
    notFound();
  }

  const initialCastData = Array.isArray(data?.credits?.cast)
    ? data.credits.cast
    : [];
  const initialReviews = Array.isArray(data?.reviews?.results)
    ? data.reviews.results
    : [];
  const initialTraktStatus = traktBootstrap?.status ?? null;
  const initialShowWatched = traktBootstrap?.showWatched ?? null;

  return (
    <DetailsPageLoader
      type="tv"
      id={id}
      data={data}
      initialCastData={initialCastData}
      initialReviews={initialReviews}
      initialTraktStatus={initialTraktStatus}
      initialShowWatched={initialShowWatched}
      initialScoreboard={initialScoreboard}
    />
  );
}
