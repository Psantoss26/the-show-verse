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

  useEffect(() => {
    setDeferredData(EMPTY_DEFERRED);
  }, [type, id]);

  useEffect(() => {
    if (!type || !id || !data || type === "person") return;

    let cancelled = false;

    const loadPriorityDeferredData = async () => {
      try {
        const [credits, related] = await Promise.all([
          getCredits(type, id).catch(() => ({ cast: [] })),
          getTraktRelated({ type, tmdbId: id }).catch(() => ({ results: [] })),
        ]);

        if (cancelled) return;

        setDeferredData((prev) => ({
          ...prev,
          castData: Array.isArray(credits?.cast) ? credits.cast : EMPTY_ARRAY,
          recommendations: related?.results || EMPTY_ARRAY,
        }));
      } catch (error) {
        console.error(
          "Error cargando datos prioritarios del detalle:",
          error,
        );
      }
    };

    const loadSecondaryDeferredData = async () => {
      try {
        const [reviews, watchProviders] = await Promise.all([
          getReviews(type, id).catch(() => ({ results: [] })),
          getWatchProviders(type, id, "ES").catch(() => ({
            providers: [],
            link: null,
          })),
        ]);

        if (cancelled) return;

        setDeferredData((prev) => ({
          ...prev,
          reviews: reviews?.results || EMPTY_ARRAY,
          providers: watchProviders?.providers || EMPTY_ARRAY,
          watchLink: watchProviders?.link || null,
        }));
      } catch (error) {
        console.error(
          "Error cargando datos TMDb diferidos del detalle:",
          error,
        );
      }
    };

    loadPriorityDeferredData();
    loadSecondaryDeferredData();

    return () => {
      cancelled = true;
    };
  }, [type, id, data]);

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
