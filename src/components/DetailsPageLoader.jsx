"use client";

import { useEffect, useState } from "react";
import DetailsClient from "@/components/DetailsClient";
import {
  getReviews,
  getWatchProviders,
} from "@/lib/api/tmdb";
import { getTraktRelated } from "@/lib/api/traktClient";

const EMPTY_ARRAY = [];
const EMPTY_DEFERRED = {
  recommendations: EMPTY_ARRAY,
  providers: EMPTY_ARRAY,
  watchLink: null,
  reviews: EMPTY_ARRAY,
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
  } = props;

  const [deferredData, setDeferredData] = useState(EMPTY_DEFERRED);

  useEffect(() => {
    setDeferredData(EMPTY_DEFERRED);
  }, [type, id]);

  useEffect(() => {
    if (!type || !id || !data || type === "person") return;

    let cancelled = false;

    const loadDeferredData = async () => {
      try {
        const [reviews, watchProviders, related] = await Promise.all([
          getReviews(type, id).catch(() => ({ results: [] })),
          getWatchProviders(type, id, "ES").catch(() => ({
            providers: [],
            link: null,
          })),
          getTraktRelated({ type, tmdbId: id }).catch(() => ({ results: [] })),
        ]);

        if (cancelled) return;

        setDeferredData({
          reviews: reviews?.results || EMPTY_ARRAY,
          providers: watchProviders?.providers || EMPTY_ARRAY,
          watchLink: watchProviders?.link || null,
          recommendations: related?.results || EMPTY_ARRAY,
        });
      } catch (error) {
        console.error("Error cargando datos diferidos del detalle:", error);
      }
    };

    loadDeferredData();

    return () => {
      cancelled = true;
    };
  }, [type, id, data]);

  return (
    <DetailsClient
      type={type}
      id={id}
      data={data}
      castData={initialCastData}
      initialScoreboard={initialScoreboard}
      reviews={deferredData.reviews !== EMPTY_ARRAY ? deferredData.reviews : initialReviews}
      providers={deferredData.providers !== EMPTY_ARRAY ? deferredData.providers : initialProviders}
      watchLink={deferredData.watchLink ?? initialWatchLink}
      recommendations={
        deferredData.recommendations !== EMPTY_ARRAY
          ? deferredData.recommendations
          : initialRecommendations
      }
    />
  );
}
