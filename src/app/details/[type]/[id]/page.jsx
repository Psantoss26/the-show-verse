// /src/app/details/[type]/[id]/page.jsx
"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import {
  getDetails,
  getCredits,
  getWatchProviders,
  getReviews,
  getActorMovies,
} from "@/lib/api/tmdb";
import { getTraktRelated } from "@/lib/api/traktClient";
import DetailsClient from "@/components/DetailsClient";

export default function DetailsPage() {
  const { type, id } = useParams();

  const [renderReady, setRenderReady] = useState(false);
  const [propsToRender, setPropsToRender] = useState({});

  useEffect(() => {
    if (!type || !id) return;

    let cancelled = false;

    const fetchAll = async () => {
      try {
        const details = await getDetails(type, id);
        if (cancelled) return;

        if (type === "person") {
          // Vista de persona: filmografía en vez de providers/reviews
          const actorMovies = await getActorMovies(id).catch(() => ({ cast: [] }));
          if (cancelled) return;
          setPropsToRender({
            type,
            id,
            data: details,
            castData: actorMovies?.cast || [],
            recommendations: [],
            providers: [],
            watchLink: null,
            reviews: [],
          });
          setRenderReady(true);
          return;
        }

        // Resto de tipos (movie / tv): llamadas en paralelo — SIN getTraktRelated
        // getTraktRelated se carga a continuación de forma NO bloqueante
        const [cast, reviews, watchProviders] = await Promise.all([
          getCredits(type, id).catch(() => ({ cast: [] })),
          getReviews(type, id).catch(() => ({ results: [] })),
          getWatchProviders(type, id, "ES").catch(() => ({
            providers: [],
            link: null,
          })),
        ]);
        if (cancelled) return;

        const providers = watchProviders?.providers || [];
        const watchLink = watchProviders?.link || null;

        // ✅ Renderizar de inmediato con recomendaciones vacías (sin esperar Trakt)
        setPropsToRender({
          type,
          id,
          data: details,
          castData: cast?.cast || [],
          recommendations: [],
          reviews: reviews?.results || [],
          providers,
          watchLink,
        });
        setRenderReady(true);

        // ✅ Cargar recomendaciones de Trakt en segundo plano, sin bloquear
        getTraktRelated({ type, tmdbId: id })
          .then((related) => {
            if (cancelled) return;
            const results = related?.results || [];
            if (results.length > 0) {
              setPropsToRender((prev) => ({
                ...prev,
                recommendations: results,
              }));
            }
          })
          .catch(() => {
            // Silencioso: si Trakt falla para este título, no hay recomendaciones
          });
      } catch (err) {
        console.error("Error cargando detalles:", err);
        // No dejar la página en blanco aunque falle algo inesperado
        if (!cancelled) setRenderReady(true);
      }
    };

    fetchAll();
    return () => {
      cancelled = true;
    };
  }, [type, id]);

  if (!renderReady) return null;

  return <DetailsClient {...propsToRender} />;
}
