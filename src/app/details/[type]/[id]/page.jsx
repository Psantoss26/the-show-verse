import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import DetailsPageLoader from "@/components/DetailsPageLoader";
import { getDetails, getWatchProviders } from "@/lib/api/tmdb";
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

export default async function DetailsPage({ params }) {
  const p = await params;
  const type = String(p?.type || "").toLowerCase();
  const id = p?.id;

  if (!id || (type !== "movie" && type !== "tv")) {
    notFound();
  }

  const cookieStore = await cookies();
  const traktType = type === "tv" ? "show" : "movie";
  const traktBootstrapTimeoutMs = type === "tv" ? 1400 : 900;
  const [
    data,
    traktBootstrap,
    wpResult,
    initialScoreboard,
  ] = await Promise.all([
    getDetails(type, id),
    resolveWithin(
      getTraktDetailsBootstrapFromCookieStore(cookieStore, {
        type: traktType,
        tmdbId: id,
      }).catch(() => null),
      traktBootstrapTimeoutMs,
      null,
    ),
    resolveWithin(
      getWatchProviders(type, id, "ES").catch(() => ({
        providers: [],
        link: null,
      })),
      1200,
      { providers: [], link: null },
    ),
    // Scoreboard de Trakt: rating comunidad + estadísticas (watchers, plays, etc.)
    // Usa unstable_cache (300s) → instantáneo en cache hit, ~4s en cold start
    resolveWithin(
      getCachedTraktScoreboardData({ type: traktType, tmdbId: id }).catch(
        () => null,
      ),
      4000,
      null,
    ),
  ]);

  if (!data) {
    notFound();
  }

  // Extraer datos iniciales del response enriquecido (append_to_response)
  const initialCastData = Array.isArray(data?.credits?.cast)
    ? data.credits.cast
    : [];
  const initialReviews = Array.isArray(data?.reviews?.results)
    ? data.reviews.results
    : [];
  const initialProviders = wpResult?.providers ?? [];
  const initialWatchLink = wpResult?.link ?? null;
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
      initialProviders={initialProviders}
      initialWatchLink={initialWatchLink}
      initialTraktStatus={initialTraktStatus}
      initialShowWatched={initialShowWatched}
      initialScoreboard={initialScoreboard}
    />
  );
}
