import { notFound } from "next/navigation";
import DetailsPageLoader from "@/components/DetailsPageLoader";
import { getDetails } from "@/lib/api/tmdb";
import { getCachedTraktScoreboardData } from "@/lib/trakt/scoreboardCached";

export const revalidate = 600;

export default async function TvDetailsPage({ params }) {
  const p = await params;
  const id = p?.id;

  if (!id) {
    notFound();
  }

  const initialScoreboardPromise = Promise.race([
    getCachedTraktScoreboardData({ type: "show", tmdbId: id }).catch(
      () => null,
    ),
    new Promise((resolve) => setTimeout(() => resolve(null), 1800)),
  ]);

  const [data, initialScoreboard] = await Promise.all([
    getDetails("tv", id),
    initialScoreboardPromise,
  ]);

  if (!data) {
    notFound();
  }

  return (
    <DetailsPageLoader
      type="tv"
      id={id}
      data={data}
      initialScoreboard={initialScoreboard}
    />
  );
}
