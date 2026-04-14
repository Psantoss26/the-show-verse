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
import { getTraktRelated, traktGetScoreboard } from "@/lib/api/traktClient";
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
        // Prioridad alta: detalles base + scoreboard de Trakt
        const traktType = type === "tv" ? "show" : "movie";
        const scoreboardPromise = type !== "person"
          ? traktGetScoreboard({ type: traktType, tmdbId: id }).catch(() => null)
          : Promise.resolve(null);

        const detailsPromise = getDetails(type, id);
        const [details, scoreboard] = await Promise.all([
          detailsPromise,
          scoreboardPromise,
        ]);
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

        // Renderizar cuanto antes con los datos críticos
        setPropsToRender({
          type,
          id,
          data: details,
          castData: [],
          recommendations: [],
          reviews: [],
          providers: [],
          watchLink: null,
          initialScoreboard: scoreboard || null,
        });
        setRenderReady(true);

        // Cargas secundarias en background
        Promise.all([
          getCredits(type, id).catch(() => ({ cast: [] })),
          getReviews(type, id).catch(() => ({ results: [] })),
          getWatchProviders(type, id, "ES").catch(() => ({
            providers: [],
            link: null,
          })),
        ])
          .then(([cast, reviews, watchProviders]) => {
            if (cancelled) return;
            setPropsToRender((prev) => ({
              ...prev,
              castData: cast?.cast || [],
              reviews: reviews?.results || [],
              providers: watchProviders?.providers || [],
              watchLink: watchProviders?.link || null,
            }));
          })
          .catch(() => {
            // silencioso: DetailsClient soporta datos vacíos
          });

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
