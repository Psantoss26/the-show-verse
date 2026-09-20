import { notFound } from "next/navigation";
import DetailsPageLoader from "@/components/DetailsPageLoader";
import MobilePosterPreload from "@/components/details/MobilePosterPreload";
import { getDetails } from "@/lib/api/tmdb";
import { fetchCommunitySummary } from "@/lib/community/server";
import { readEmbeddedDetailsSeed } from "@/lib/navigation/embeddedDetails";
export const revalidate = 600;

const DETAILS_APPEND_TO_RESPONSE =
  "external_ids,images,videos,credits,recommendations";

// Ficha embebida en el drawer móvil (`/embed/details/...`): el reparto y las
// recomendaciones no son parte de lo crítico (póster, logo, botones de
// acción) y `DetailsPageLoader` YA sabe pedirlos por su cuenta en cuanto
// hidrata -- es el mismo mecanismo que usa si esta llamada no los trae, ver
// `skipCast`/`skipRecommendations` ahí --, así que en el drawer no merece la
// pena esperarlos en el propio SSR: son con diferencia lo más pesado del
// payload (reparto completo + hasta 20 recomendaciones con sus imágenes) y,
// al ir en el mismo `await` que el resto, retrasan por igual el HTML que SÍ
// hace falta pintar al instante. `videos` se mantiene: el botón de tráiler no
// tiene ruta de carga de respaldo en el cliente (se perdería, no solo se
// retrasaría) y su payload es pequeño.
const DETAILS_APPEND_TO_RESPONSE_EMBEDDED = "external_ids,images,videos";

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

export default async function DetailsPage({ params, searchParams, embedded = false }) {
  const p = await params;
  const type = String(p?.type || "").toLowerCase();
  const id = p?.id;

  if (!id || (type !== "movie" && type !== "tv")) {
    notFound();
  }

  // Solo lo rellena la ficha móvil del drawer (`/embed/details/...`), con lo
  // que el DetailModal de escritorio ya sabía del título al abrir el iframe.
  // En una visita normal a `/details/...` no hay estos parámetros y el
  // resultado es `null`, igual que antes.
  const sp = searchParams ? await searchParams : null;
  const initialTraktStatus = readEmbeddedDetailsSeed(sp);

  // `throwOnUnavailable`: un fallo TEMPORAL de TMDb/red lanza en vez de
  // devolver `null`. Así `notFound()` (permanente) solo se dispara ante un 404
  // real; una caída temporal propaga el error al límite de error de la ruta,
  // que ofrece "reintentar" en lugar de un falso "página no encontrada".
  //
  // En paralelo con la comunidad (Trakt): no depende de `data`, así que
  // encadenarla DETRÁS solo sumaba su propia ida y vuelta al tiempo total de
  // respuesta sin necesidad.
  const [data, community] = await Promise.all([
    getDetails(type, id, {
      appendToResponse: embedded
        ? DETAILS_APPEND_TO_RESPONSE_EMBEDDED
        : DETAILS_APPEND_TO_RESPONSE,
      language: "es-ES",
      include_video_language: "en,es,null",
      throwOnUnavailable: true,
    }),
    // Tolerant: a null/slow community summary must never break the page render.
    fetchCommunitySummary({ type, id }).catch(() => null),
  ]);

  if (!data) {
    notFound();
  }

  const initialCastData = Array.isArray(data?.credits?.cast)
    ? data.credits.cast
    : [];
  const initialRecommendations = Array.isArray(data?.recommendations?.results)
    ? data.recommendations.results
    : [];

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
        initialRecommendations={initialRecommendations}
        initialSentiment={community?.sentiment || null}
        initialComments={community?.comments || null}
        initialLists={community?.lists?.items || null}
        initialTraktStatus={initialTraktStatus}
      />
    </>
  );
}
