import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import DetailsPageLoader from "@/components/DetailsPageLoader";
import { getDetails, getWatchProviders } from "@/lib/api/tmdb";
import {
  getTraktItemStatusFromCookieStore,
  getTraktShowWatchedFromCookieStore,
} from "@/lib/trakt/server";

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
  const [data, initialTraktStatus, initialShowWatched, wpResult] =
    await Promise.all([
      getDetails(type, id),
      resolveWithin(
        getTraktItemStatusFromCookieStore(cookieStore, {
          type: type === "tv" ? "show" : "movie",
          tmdbId: id,
        }).catch(() => null),
        type === "tv" ? 900 : 750,
        null,
      ),
      type === "tv"
        ? resolveWithin(
            getTraktShowWatchedFromCookieStore(cookieStore, {
              tmdbId: id,
            }).catch(() => null),
            950,
            null,
          )
        : Promise.resolve(null),
      resolveWithin(
        getWatchProviders(type, id, "ES").catch(() => ({
          providers: [],
          link: null,
        })),
        1200,
        { providers: [], link: null },
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
    />
  );
}
