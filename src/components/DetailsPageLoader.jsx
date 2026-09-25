"use client";

import { useState } from "react";
import DetailsClient from "@/components/DetailsClient";
import {
  restoredValue,
  useDetailsSnapshot,
  useRestorableEffect,
  useSnapshotValues,
} from "@/lib/details/detailsBackSnapshot";
import {
  getCredits,
  getRecommendations,
  getWatchProviders,
} from "@/lib/api/tmdb";

const EMPTY_ARRAY = [];
const EMPTY_DEFERRED = {
  castData: EMPTY_ARRAY,
  recommendations: EMPTY_ARRAY,
  providers: EMPTY_ARRAY,
  watchLink: null,
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
    initialScoreboard = null,
    initialTraktStatus = null,
    initialShowWatched = null,
    initialSentiment = null,
    initialComments = null,
    initialLists = null,
  } = props;

  // Al volver atrás a esta ficha, lo diferido ya cargado se recupera tal cual
  // en vez de vaciarse y volver a pedirse (ver `detailsBackSnapshot`).
  const backSnapshot = useDetailsSnapshot(`loader:${type}:${id}`);
  const [deferredData, setDeferredData] = useState(() =>
    restoredValue(backSnapshot, "deferredData", EMPTY_DEFERRED),
  );
  // Las dos tandas diferidas han terminado: solo entonces se puede dar por
  // buena la instantánea (si se salió antes, al volver se piden de nuevo).
  const [deferredSettled, setDeferredSettled] = useState(() =>
    restoredValue(backSnapshot, "deferredSettled", {
      priority: false,
      secondary: false,
    }),
  );
  useSnapshotValues(backSnapshot, { deferredData, deferredSettled });
  const hasData = !!data;

  useRestorableEffect(backSnapshot, "deferredReset", () => {
    setDeferredData(EMPTY_DEFERRED);
    setDeferredSettled({ priority: false, secondary: false });
  }, [type, id]);

  useRestorableEffect(backSnapshot, "deferredLoad", () => {
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

        const skipRecommendations =
          Array.isArray(initialRecommendations) &&
          initialRecommendations.length > 0;

        const [credits, recommendations] = await Promise.all([
          skipCast
            ? Promise.resolve(null)
            : getCredits(type, id).catch(() => ({ cast: [] })),
          skipRecommendations
            ? Promise.resolve(null)
            : getRecommendations(type, id).catch(() => ({ results: [] })),
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
          ...(recommendations != null
            ? {
                recommendations: Array.isArray(recommendations?.results)
                  ? recommendations.results
                  : EMPTY_ARRAY,
              }
            : {}),
        }));
      } catch (error) {
        console.error("Error cargando datos prioritarios del detalle:", error);
      } finally {
        if (!cancelled) {
          setDeferredSettled((prev) => ({ ...prev, priority: true }));
        }
      }
    };

    const loadSecondaryDeferredData = async () => {
      try {
        // Si el servidor ya proporcionó proveedores, no repetir la petición.
        const skipProviders =
          Array.isArray(initialProviders) && initialProviders.length > 0;

        if (skipProviders) return;

        const watchProviders = await getWatchProviders(type, id, "ES").catch(
          () => ({ providers: [], link: null }),
        );

        if (cancelled) return;

        setDeferredData((prev) => ({
          ...prev,
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
      } finally {
        if (!cancelled) {
          setDeferredSettled((prev) => ({ ...prev, secondary: true }));
        }
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
  }, [
    type,
    id,
    hasData,
    initialCastData,
    initialProviders,
    initialRecommendations,
  ], deferredSettled.priority && deferredSettled.secondary);

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
      initialSentiment={initialSentiment}
      initialComments={initialComments}
      initialLists={initialLists}
    />
  );
}
