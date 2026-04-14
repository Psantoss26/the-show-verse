"use client";

import { useEffect, useState } from "react";
import DetailsClient from "@/components/DetailsClient";
import { getReviews, getWatchProviders, getExternalIds } from "@/lib/api/tmdb";
import { getTraktRelated } from "@/lib/api/traktClient";

const EMPTY_ARRAY = [];
const EMPTY_DEFERRED = {
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
  } = props;

  const [deferredData, setDeferredData] = useState(EMPTY_DEFERRED);

  useEffect(() => {
    setDeferredData(EMPTY_DEFERRED);
  }, [type, id]);

  useEffect(() => {
    if (!type || !id || !data || type === "person") return;

    let cancelled = false;
    let relatedTimer = null;
    let scoreboardTimer = null;

    const loadCoreDeferredData = async () => {
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

    const loadPriorityScoreboard = async () => {
      try {
        const externalIds = await getExternalIds(type, id).catch(() => null);
        const imdbId = externalIds?.imdb_id || data?.external_ids?.imdb_id || "";

        const res = await fetch(
          `/api/scoreboard/public?type=${encodeURIComponent(type)}&id=${encodeURIComponent(id)}&imdb=${encodeURIComponent(imdbId || "")}`,
          { cache: "no-store" },
        );

        const json = await res.json().catch(() => null);
        if (cancelled || !json) return;

        setDeferredData((prev) => ({
          ...prev,
          initialScoreboard: json,
        }));
      } catch {
      }
    };

    const loadTraktRelatedDeferred = async () => {
      try {
        const related = await getTraktRelated({ type, tmdbId: id }).catch(
          () => ({ results: [] }),
        );

        if (cancelled) return;

        setDeferredData((prev) => ({
          ...prev,
          recommendations: related?.results || EMPTY_ARRAY,
        }));
      } catch (error) {
        console.error("Error cargando recomendaciones de Trakt:", error);
      }
    };

    loadCoreDeferredData();

    scoreboardTimer = window.setTimeout(() => {
      void loadPriorityScoreboard();
    }, 50);

    relatedTimer = window.setTimeout(
      () => {
        void loadTraktRelatedDeferred();
      },
      deferredData.initialScoreboard?.found || initialScoreboard?.found
        ? 900
        : type === "tv"
          ? 3200
          : 1800,
    );

    return () => {
      cancelled = true;
      if (scoreboardTimer) window.clearTimeout(scoreboardTimer);
      if (relatedTimer) window.clearTimeout(relatedTimer);
    };
  }, [type, id, data, initialScoreboard]);

  return (
    <DetailsClient
      type={type}
      id={id}
      data={data}
      castData={initialCastData}
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
