import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import DetailsPageLoader from "@/components/DetailsPageLoader";
import { getDetails } from "@/lib/api/tmdb";
import { getTraktMovieWatchedFromCookieStore } from "@/lib/trakt/server";

export const dynamic = "force-dynamic";
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

  const traktBootstrapPromise =
    type === "movie"
      ? (async () => {
          const cookieStore = await cookies();
          return resolveWithin(
            getTraktMovieWatchedFromCookieStore(cookieStore, {
              tmdbId: id,
            }).catch(() => null),
            1400,
            null,
          );
        })()
      : Promise.resolve(null);

  const [data, traktBootstrap] = await Promise.all([
    getDetails(type, id, {
      appendToResponse: "external_ids",
    }),
    traktBootstrapPromise,
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

  return (
    <DetailsPageLoader
      type={type}
      id={id}
      data={data}
      initialTraktStatus={traktBootstrap ?? null}
      initialCastData={initialCastData}
      initialReviews={initialReviews}
    />
  );
}
