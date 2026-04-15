import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import DetailsPageLoader from "@/components/DetailsPageLoader";
import { getDetails } from "@/lib/api/tmdb";
import {
  getTraktItemStatusFromCookieStore,
  getTraktShowWatchedFromCookieStore,
} from "@/lib/trakt/server";

export const revalidate = 600;

export default async function TvDetailsPage({ params }) {
  const p = await params;
  const id = p?.id;

  if (!id) {
    notFound();
  }

  const cookieStore = await cookies();
  const [data, initialTraktStatus, initialShowWatched] = await Promise.all([
    getDetails("tv", id),
    getTraktItemStatusFromCookieStore(cookieStore, {
      type: "show",
      tmdbId: id,
    }).catch(() => null),
    getTraktShowWatchedFromCookieStore(cookieStore, {
      tmdbId: id,
    }).catch(() => null),
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
    />
  );
}
