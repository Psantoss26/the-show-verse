import { notFound } from "next/navigation";
import DetailsPageLoader from "@/components/DetailsPageLoader";
import { getDetails } from "@/lib/api/tmdb";
import { getCachedTraktScoreboardData } from "@/lib/trakt/scoreboardCached";

export const revalidate = 600;

export default async function DetailsPage({ params }) {
  const p = await params;
  const type = String(p?.type || "").toLowerCase();
  const id = p?.id;

  if (!id || (type !== "movie" && type !== "tv")) {
    notFound();
  }

  const [data, initialScoreboard] = await Promise.all([
    getDetails(type, id),
    getCachedTraktScoreboardData({ type, tmdbId: id }).catch(() => null),
  ]);

  if (!data) {
    notFound();
  }

  return (
    <DetailsPageLoader
      type={type}
      id={id}
      data={data}
      initialScoreboard={initialScoreboard}
    />
  );
}
