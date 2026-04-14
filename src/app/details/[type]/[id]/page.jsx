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
        const traktType = type === "tv" ? "show" : "movie";
        const detailsPromise = getDetails(type, id);
        const scoreboardPromise =
          type !== "person"
            ? traktGetScoreboard({ type: traktType, tmdbId: id }).catch(
                () => null,
              )
            : Promise.resolve(null);
        const castPromise =
          type !== "person"
            ? getCredits(type, id).catch(() => ({ cast: [] }))
            : Promise.resolve({ cast: [] });
        const reviewsPromise =
          type !== "person"
            ? getReviews(type, id).catch(() => ({ results: [] }))
            : Promise.resolve({ results: [] });
        const watchProvidersPromise =
          type !== "person"
            ? getWatchProviders(type, id, "ES").catch(() => ({
                providers: [],
                link: null,
              }))
            : Promise.resolve({ providers: [], link: null });
        const relatedPromise =
          type !== "person"
            ? getTraktRelated({ type, tmdbId: id }).catch(() => ({
                results: [],
              }))
            : Promise.resolve({ results: [] });

        const details = await detailsPromise;
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

        const scoreboard = await scoreboardPromise;
        if (cancelled) return;

        // Renderizar tan pronto como tengamos detalles + scoreboard.
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

        const [cast, reviews, watchProviders, related] = await Promise.all([
          castPromise,
          reviewsPromise,
          watchProvidersPromise,
          relatedPromise,
        ]);
        if (cancelled) return;

        const providers = watchProviders?.providers || [];
        const watchLink = watchProviders?.link || null;

        setPropsToRender({
          type,
          id,
          data: details,
          castData: cast?.cast || [],
          recommendations: related?.results || [],
          reviews: reviews?.results || [],
          providers,
          watchLink,
          initialScoreboard: scoreboard || null,
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
