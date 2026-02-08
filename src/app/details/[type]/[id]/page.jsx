// /src/app/details/[type]/[id]/page.jsx
"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import {
  getDetails,
  getCredits,
  getWatchProviders, // <- nuevo helper
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
    const fetchAll = async () => {
      if (!type || !id) return;

      try {
        const details = await getDetails(type, id);

        if (type === "person") {
          // Vista de persona: filmografía en vez de providers/reviews
          const actorMovies = await getActorMovies(id);
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
        } else {
          // Resto de tipos (movie / tv): llamadas en paralelo
          const [cast, recommendations, reviews, watchProviders] =
            await Promise.all([
              getCredits(type, id),
              // Usar Trakt para recomendaciones
              getTraktRelated({ type, tmdbId: id }),
              getReviews(type, id),
              getWatchProviders(type, id, "ES").catch(() => ({ providers: [], link: null })), // <- movie/tv watch providers
            ]);

          const providers = watchProviders?.providers || [];
          const watchLink = watchProviders?.link || null;

          setPropsToRender({
            type,
            id,
            data: details,
            castData: cast?.cast || [],
            recommendations: recommendations?.results || [],
            reviews: reviews?.results || [],
            providers,
            watchLink,
          });
        }

        setRenderReady(true);
      } catch (err) {
        console.error("Error cargando detalles:", err);
      }
    };

    fetchAll();
  }, [type, id]);

  // Hasta tener todo, no renderiza nada
  if (!renderReady) return null;

  return <DetailsClient {...propsToRender} />;
}
