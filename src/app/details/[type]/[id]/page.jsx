import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import DetailsPageLoader from "@/components/DetailsPageLoader";
import { getDetails } from "@/lib/api/tmdb";
import {
  getTraktItemStatusFromCookieStore,
  getTraktShowWatchedFromCookieStore,
} from "@/lib/trakt/server";

export const revalidate = 600;

export default async function DetailsPage({ params }) {
  const p = await params;
  const type = String(p?.type || "").toLowerCase();
  const id = p?.id;

  if (!id || (type !== "movie" && type !== "tv")) {
    notFound();
  }

  const cookieStore = await cookies();
  const [data, initialTraktStatus, initialShowWatched] = await Promise.all([
    getDetails(type, id),
    getTraktItemStatusFromCookieStore(cookieStore, {
      type: type === "tv" ? "show" : "movie",
      tmdbId: id,
    }).catch(() => null),
    type === "tv"
      ? getTraktShowWatchedFromCookieStore(cookieStore, {
          tmdbId: id,
        }).catch(() => null)
      : Promise.resolve(null),
  ]);

  if (!data) {
    notFound();
  }

  return (
    <DetailsPageLoader
      type={type}
      id={id}
      data={data}
      initialTraktStatus={initialTraktStatus}
      initialShowWatched={initialShowWatched}
    />
  );
}
