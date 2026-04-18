"use client";

import { useEffect, useState } from "react";
import DetailsClient from "@/components/DetailsClient";
import { getCredits, getReviews, getWatchProviders } from "@/lib/api/tmdb";
import { getTraktRelated } from "@/lib/api/traktClient";

const EMPTY_ARRAY = [];
const EMPTY_DEFERRED = {
  castData: EMPTY_ARRAY,
  recommendations: EMPTY_ARRAY,
  providers: EMPTY_ARRAY,
  watchLink: null,
  reviews: EMPTY_ARRAY,
  initialScoreboard: null,
};

export default function DetailsPageLoader(props) {
  const {
    type,
    id,
    data,
    initialRecommendations = EMPTY_ARRAY,
    initialCastData = EMPTY_ARRAY,
    initialProviders = EMPTY_ARRAY,
    initialWatchLink = null,
    initialReviews = EMPTY_ARRAY,
    initialScoreboard = null,
    initialTraktStatus = null,
    initialShowWatched = null,
  } = props;

  const [deferredData, setDeferredData] = useState(EMPTY_DEFERRED);
  const hasData = !!data;

  useEffect(() => {
    setDeferredData(EMPTY_DEFERRED);
  }, [type, id]);

  useEffect(() => {
    if (!type || !id || !hasData || type === "person") return;

    let cancelled = false;
    let priorityTimer = null;
    let secondaryTimer = null;
    const isMovie = type === "movie";
    const priorityDelayMs = isMovie ? 1100 : 350;
    const secondaryDelayMs = isMovie ? 1800 : 1200;

    const loadPriorityDeferredData = async () => {
      try {
        // Si el servidor ya proporcionó el cast, no repetir la petición
        const skipCast =
          Array.isArray(initialCastData) && initialCastData.length > 0;

        const [credits, related] = await Promise.all([
          skipCast
            ? Promise.resolve(null)
            : getCredits(type, id).catch(() => ({ cast: [] })),
          getTraktRelated({ type, tmdbId: id }).catch(() => ({ results: [] })),
        ]);

        if (cancelled) return;

        setDeferredData((prev) => ({
          ...prev,
          ...(credits != null
            ? {
                castData: Array.isArray(credits?.cast)
                  ? credits.cast
                  : EMPTY_ARRAY,
              }
            : {}),
          recommendations: related?.results || EMPTY_ARRAY,
        }));
      } catch (error) {
        console.error("Error cargando datos prioritarios del detalle:", error);
      }
    };

    const loadSecondaryDeferredData = async () => {
      try {
        // Si el servidor ya proporcionó reviews/providers, no repetir las peticiones
        const skipReviews =
          Array.isArray(initialReviews) && initialReviews.length > 0;
        const skipProviders =
          Array.isArray(initialProviders) && initialProviders.length > 0;

        // Si ambos están cubiertos por el servidor, no hay nada que hacer
        if (skipReviews && skipProviders) return;

        const [reviews, watchProviders] = await Promise.all([
          skipReviews
            ? Promise.resolve(null)
            : getReviews(type, id).catch(() => ({ results: [] })),
          skipProviders
            ? Promise.resolve(null)
            : getWatchProviders(type, id, "ES").catch(() => ({
                providers: [],
                link: null,
              })),
        ]);

        if (cancelled) return;

        setDeferredData((prev) => ({
          ...prev,
          ...(reviews != null
            ? { reviews: reviews?.results || EMPTY_ARRAY }
            : {}),
          ...(watchProviders != null
            ? {
                providers: watchProviders?.providers || EMPTY_ARRAY,
                watchLink: watchProviders?.link || null,
              }
            : {}),
        }));
      } catch (error) {
        console.error(
          "Error cargando datos TMDb diferidos del detalle:",
          error,
        );
      }
    };

    priorityTimer = window.setTimeout(() => {
      void loadPriorityDeferredData();
    }, priorityDelayMs);

    secondaryTimer = window.setTimeout(() => {
      void loadSecondaryDeferredData();
    }, secondaryDelayMs);

    return () => {
      cancelled = true;
      if (priorityTimer) window.clearTimeout(priorityTimer);
      if (secondaryTimer) window.clearTimeout(secondaryTimer);
    };
  }, [type, id, hasData]);

  return (
    <DetailsClient
      type={type}
      id={id}
      data={data}
      castData={
        deferredData.castData !== EMPTY_ARRAY
          ? deferredData.castData
          : initialCastData
      }
      initialTraktStatus={initialTraktStatus}
      initialShowWatched={initialShowWatched}
      initialScoreboard={deferredData.initialScoreboard ?? initialScoreboard}
      reviews={
        deferredData.reviews !== EMPTY_ARRAY
          ? deferredData.reviews
          : initialReviews
      }
      providers={
        deferredData.providers !== EMPTY_ARRAY
          ? deferredData.providers
          : initialProviders
      }
      watchLink={deferredData.watchLink ?? initialWatchLink}
      recommendations={
        deferredData.recommendations !== EMPTY_ARRAY
          ? deferredData.recommendations
          : initialRecommendations
      }
    />
  );
}
