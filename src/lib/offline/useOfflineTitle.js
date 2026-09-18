"use client";
import { useEffect } from "react";
import { saveOfflineRoute } from "./client.js";

export function useOfflineTitle(type, id, data) {
  useEffect(() => {
    if (!id || !["movie", "tv"].includes(type) || !("serviceWorker" in navigator)) return;
    const controller = new AbortController();
    let timer;
    let started = false;
    const run = () => {
      if (started || !navigator.serviceWorker.controller) return;
      started = true;
      timer = setTimeout(async () => {
        const read = async (path) => {
          if (controller.signal.aborted) return;
          try { await fetch(path, { cache: "no-store", priority: "low", signal: controller.signal }); } catch { /* snapshot remains intact */ }
        };
        await read("/api/auth/me");
        if (controller.signal.aborted) return;
        await saveOfflineRoute(`/details/${type}/${id}`);
        const traktType = type === "tv" ? "show" : "movie";
        const qs = `type=${traktType}&tmdbId=${encodeURIComponent(id)}`;
        for (const path of [
          `/api/trakt/item/status?${qs}`,
          `/api/trakt/${traktType}/watched?tmdbId=${id}`,
          `/api/trakt/scoreboard?${qs}`,
          `/api/trakt/scoreboard?${qs}&includeStats=0`,
          `/api/trakt/stats?${qs}`,
          `/api/community/${type}/${id}/sentiment`,
          `/api/community/${type}/${id}/comments?tab=comments&page=1&limit=20`,
          `/api/community/${type}/${id}/lists?limit=20`,
        ]) await read(path);
        if (type === "tv") {
          for (const season of data?.seasons || []) {
            await read(`/api/tmdb/tv/${id}/season/${season.season_number}`);
          }
        }
      }, 2500);
    };
    run();
    navigator.serviceWorker.addEventListener("controllerchange", run);
    return () => { controller.abort(); clearTimeout(timer); navigator.serviceWorker.removeEventListener("controllerchange", run); };
  }, [type, id, data]);
}
