import { notFound } from "next/navigation";
import DetailsPageLoader from "@/components/DetailsPageLoader";
import { getDetails } from "@/lib/api/tmdb";
import { cookies } from "next/headers";
export const revalidate = 600;

const DETAILS_APPEND_TO_RESPONSE =
  "external_ids,images,videos,credits,reviews";

export async function generateMetadata({ params }) {
  const p = await params;
  const type = String(p?.type || "").toLowerCase();
  const id = p?.id;

  if (!id || (type !== "movie" && type !== "tv")) {
    return { title: "Detalles" };
  }

  const cookieStore = await cookies();
  const locale = cookieStore.get("showverse_locale")?.value || "es-ES";

  const data = await getDetails(type, id, { language: locale }).catch(() => null);
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

  const cookieStore = await cookies();
  const locale = cookieStore.get("showverse_locale")?.value || "es-ES";

  const data = await getDetails(type, id, {
    appendToResponse: DETAILS_APPEND_TO_RESPONSE,
    language: locale,
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

  return (
    <DetailsPageLoader
      type={type}
      id={id}
      data={data}
      initialCastData={initialCastData}
      initialReviews={initialReviews}
    />
  );
}
