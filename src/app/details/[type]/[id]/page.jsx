import { notFound } from "next/navigation";
import DetailsPageLoader from "@/components/DetailsPageLoader";
import MobilePosterPreload from "@/components/details/MobilePosterPreload";
import { getDetails } from "@/lib/api/tmdb";
import { fetchCommunitySummary } from "@/lib/community/server";
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

  // `throwOnUnavailable`: un fallo TEMPORAL de TMDb/red lanza en vez de
  // devolver `null`. Así `notFound()` (permanente) solo se dispara ante un 404
  // real; una caída temporal propaga el error al límite de error de la ruta,
  // que ofrece "reintentar" en lugar de un falso "página no encontrada".
  const data = await getDetails(type, id, {
    appendToResponse: DETAILS_APPEND_TO_RESPONSE,
    language: "es-ES",
    include_video_language: "en,es,null",
    throwOnUnavailable: true,
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

  // Tolerant: a null/slow community summary must never break the page render.
  const community = await fetchCommunitySummary({ type, id }).catch(
    () => null,
  );

  return (
    <>
      {/* Va antes que la ficha: el navegador empieza a bajar la portada móvil
          mientras todavía está leyendo el HTML, sin esperar a hidratar. */}
      <MobilePosterPreload data={data} />
      <DetailsPageLoader
        type={type}
        id={id}
        data={data}
        initialCastData={initialCastData}
        initialReviews={initialReviews}
        initialRecommendations={initialRecommendations}
        initialSentiment={community?.sentiment || null}
        initialComments={community?.comments || null}
        initialLists={community?.lists?.items || null}
      />
    </>
  );
}
