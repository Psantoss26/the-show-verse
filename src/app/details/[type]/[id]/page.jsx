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

export default async function DetailsPage({ params }) {
  const p = await params;
  const type = String(p?.type || "").toLowerCase();
  const id = p?.id;

  if (!id || (type !== "movie" && type !== "tv")) {
    notFound();
  }

  const cookieStore = await cookies();
  const traktType = type === "tv" ? "show" : "movie";
  const traktBootstrapTimeoutMs = type === "tv" ? 900 : 700;
  const [data, traktBootstrap, initialScoreboard] = await Promise.all([
    getDetails(type, id, { appendToResponse: "external_ids" }),
    resolveWithin(
      getTraktDetailsBootstrapFromCookieStore(cookieStore, {
        type: traktType,
        tmdbId: id,
      }).catch(() => null),
      traktBootstrapTimeoutMs,
      null,
    ),
    // Scoreboard de Trakt: rating comunidad + estadísticas (watchers, plays, etc.)
    // Si no entra rápido, lo termina de cargar el cliente sin bloquear la apertura visual.
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

  const initialTraktStatus = traktBootstrap?.status ?? null;
  const initialShowWatched =
    type === "tv" ? traktBootstrap?.showWatched ?? null : null;

  return (
    <DetailsPageLoader
      type={type}
      id={id}
      data={data}
      initialTraktStatus={initialTraktStatus}
      initialShowWatched={initialShowWatched}
      initialScoreboard={initialScoreboard}
    />
  );
}
