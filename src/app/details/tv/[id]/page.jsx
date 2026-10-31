import { notFound } from "next/navigation";
import DetailsPageLoader from "@/components/DetailsPageLoader";
import MobilePosterPreload from "@/components/details/MobilePosterPreload";
import { getDetails } from "@/lib/api/tmdb";
import { fetchTitleRecommendations } from "@/lib/details/titleRecommendations.server";
import { getShareData, shareMetadata } from "@/lib/share/shareMeta";
import { fetchCommunityArtwork } from "@/lib/community/server";
import { fetchSeasonPosterSeeds } from "@/lib/details/seasonPosterSeeds.server";
export const revalidate = 600;

// Las recomendaciones van aparte (`fetchTitleRecommendations`, en paralelo):
// Trakt «relacionados» + dos páginas de TMDb, ordenadas con criterio propio.
const DETAILS_APPEND_TO_RESPONSE = "external_ids,images,videos,credits";

export async function generateMetadata({ params }) {
  const p = await params;
  const id = p?.id;

  if (!id) return { title: "Detalles" };

  // Título + vista previa al compartir (Open Graph). Ver lib/share/shareMeta.js.
  const share = await getShareData({ kind: "tv", id }).catch(() => null);
  return shareMetadata(share, "Detalles");
}

export default async function TvDetailsPage({ params }) {
  const p = await params;
  const id = p?.id;

  if (!id) {
    notFound();
  }

  // `throwOnUnavailable`: un fallo TEMPORAL de TMDb/red lanza en vez de
  // devolver `null`. Así `notFound()` (permanente) solo se dispara ante un 404
  // real; una caída temporal propaga el error al límite de error de la ruta,
  // que ofrece "reintentar" en lugar de un falso "página no encontrada".
  // En paralelo, las imágenes más votadas («Portadas y fondos»): son la
  // imagen por defecto del título y la portada tiene que nacer ya con ellas.
  const [data, communityArtwork, recommendations] = await Promise.all([
    getDetails("tv", id, {
      appendToResponse: DETAILS_APPEND_TO_RESPONSE,
      language: "es-ES",
      include_video_language: "en,es,null",
      throwOnUnavailable: true,
    }),
    fetchCommunityArtwork({ type: "tv", id }).catch(() => null),
    fetchTitleRecommendations("tv", id).catch(() => null),
  ]);

  if (!data) {
    notFound();
  }

  // Pósters de «Temporadas» ya elegidos, con presupuesto corto (ver
  // seasonPosterSeeds.server.js): salen en el HTML en vez de esperar al navegador.
  const seasonPosterSeeds = await fetchSeasonPosterSeeds("tv", data).catch(() => null);

  const initialCastData = Array.isArray(data?.credits?.cast)
    ? data.credits.cast
    : [];
  const initialRecommendations = Array.isArray(recommendations?.results)
    ? recommendations.results
    : [];

  return (
    <>
      {/* Va antes que la ficha: el navegador empieza a bajar la portada móvil
          mientras todavía está leyendo el HTML, sin esperar a hidratar. */}
      <MobilePosterPreload data={data} communityArtwork={communityArtwork} />
      <DetailsPageLoader
        type="tv"
        id={id}
        data={data}
        initialCastData={initialCastData}
        initialRecommendations={initialRecommendations}
        initialCommunityArtwork={communityArtwork}
        seasonPosterSeeds={seasonPosterSeeds}
      />
    </>
  );
}
