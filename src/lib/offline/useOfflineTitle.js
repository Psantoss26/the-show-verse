"use client";
import { useEffect } from "react";
import { isServerReachable, workerMessage } from "./client.js";

export function useOfflineTitle(type, id, data) {
  const ready = Boolean(data?.id || data?.detailsResolved);
  const seasons = JSON.stringify((data?.seasons || []).map((season) => season.season_number));
  useEffect(() => {
    if (!ready || !id || !["movie", "tv"].includes(type) || !("serviceWorker" in navigator)) return;
    const save = () => {
      if (!isServerReachable() || !navigator.serviceWorker.controller) return;
      // Start immediately; the worker finishes even when this view unmounts.
      void workerMessage({ type: "OFFLINE_PREPARE_TITLE", mediaType: type, id, seasons: JSON.parse(seasons) });
    };
    save();
    navigator.serviceWorker.addEventListener("controllerchange", save);
    return () => navigator.serviceWorker.removeEventListener("controllerchange", save);
  }, [type, id, ready, seasons]);
}
