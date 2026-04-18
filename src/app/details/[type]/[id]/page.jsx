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

export default async function DetailsPage({ params }) {
  const p = await params;
  const type = String(p?.type || "").toLowerCase();
  const id = p?.id;

  if (!id || (type !== "movie" && type !== "tv")) {
    notFound();
  }

  const cookieStore = await cookies();
  const traktType = type === "tv" ? "show" : "movie";
  const traktBootstrapTimeoutMs = type === "tv" ? 3500 : 3000;

  const [data, traktBootstrap, initialScoreboard] = await Promise.all([
    getDetails(type, id, {
      appendToResponse: "credits,reviews,external_ids",
    }),
    resolveWithin(
      getTraktDetailsBootstrapFromCookieStore(cookieStore, {
        type: traktType,
        tmdbId: id,
      }).catch(() => null),
      traktBootstrapTimeoutMs,
      null,
    ),
    resolveWithin(
      getCachedTraktScoreboardData({
        type: traktType,
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
  const initialShowWatched =
    type === "tv" ? traktBootstrap?.showWatched ?? null : null;

  return (
    <DetailsPageLoader
      type={type}
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
