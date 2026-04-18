import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import DetailsPageLoader from "@/components/DetailsPageLoader";
import { getDetails } from "@/lib/api/tmdb";
import { getTraktDetailsBootstrapFromCookieStore } from "@/lib/trakt/server";

export const dynamic = "force-dynamic";
export const revalidate = 0; // Sin caché: siempre datos frescos de Trakt

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
            getTraktDetailsBootstrapFromCookieStore(cookieStore, {
              type: "movie",
              tmdbId: id,
            }).catch(() => null),
            950,
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
      initialTraktStatus={traktBootstrap?.status ?? null}
      initialCastData={initialCastData}
      initialReviews={initialReviews}
    />
  );
}
