import { notFound } from "next/navigation";
import DetailsPageLoader from "@/components/DetailsPageLoader";
import { getDetails } from "@/lib/api/tmdb";

export const revalidate = 600;

export default async function TvDetailsPage({ params }) {
  const p = await params;
  const id = p?.id;

  if (!id) {
    notFound();
  }

  const data = await getDetails("tv", id);

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
      type="tv"
      id={id}
      data={data}
      initialCastData={initialCastData}
      initialReviews={initialReviews}
    />
  );
}
