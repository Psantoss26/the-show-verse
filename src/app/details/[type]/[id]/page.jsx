import { notFound } from "next/navigation";
import DetailsPageLoader from "@/components/DetailsPageLoader";
import { getDetails } from "@/lib/api/tmdb";
export const revalidate = 600;

const DETAILS_APPEND_TO_RESPONSE =
  "external_ids,images,videos,credits,reviews,recommendations";

export async function generateMetadata({ params }) {
  const p = await params;
  const type = String(p?.type || "").toLowerCase();
  const id = p?.id;

  if (!id || (type !== "movie" && type !== "tv")) {
    return { title: "Detalles" };
  }

  const data = await getDetails(type, id, { language: "es-ES" }).catch(() => null);
  return {
    title: data?.title || data?.name || "Detalles",
  };
}

export default async function DetailsPage({ params }) {
  const p = await params;
  const type = String(p?.type || "").toLowerCase();
  const id = p?.id;

  if (!id || (type !== "movie" && type !== "tv")) {
    notFound();
  }

  const data = await getDetails(type, id, {
    appendToResponse: DETAILS_APPEND_TO_RESPONSE,
    language: "es-ES",
  });

  if (!data) {
    notFound();
  }

  const initialCastData = Array.isArray(data?.credits?.cast)
    ? data.credits.cast
    : [];
  const initialReviews = Array.isArray(data?.reviews?.results)
    ? data.reviews.results
    : [];
  const initialRecommendations = Array.isArray(data?.recommendations?.results)
    ? data.recommendations.results
    : [];

  return (
    <DetailsPageLoader
      type={type}
      id={id}
      data={data}
      initialCastData={initialCastData}
      initialReviews={initialReviews}
      initialRecommendations={initialRecommendations}
    />
  );
}
