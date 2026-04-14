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

  const [data, initialScoreboard] = await Promise.all([
    getDetails("tv", id),
    getCachedTraktScoreboardData({ type: "tv", tmdbId: id }).catch(() => null),
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
