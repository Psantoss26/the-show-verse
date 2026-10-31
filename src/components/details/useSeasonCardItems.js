"use client";

// Tarjetas de temporada de las fichas del modal (DetailModal): las mismas que
// la sección «Temporadas» de la ficha completa, con nota de TMDb, de IMDb (o
// SeriesGraph si IMDb agrupa distinto), episodios vistos y apertura del panel
// de la temporada. Lo usan la vista de teléfono (PhoneDetailsSections) y la
// vista ancha del modal.

import { useEffect, useMemo, useState } from "react";
import { getSeriesGraphSeasonAverages } from "@/lib/details/seriesGraphRatings";
import { seasonStructuresAlign } from "@/lib/details/episodeRatingsStructure";
import { getWatchedEpisodeCountForSeason } from "@/lib/hooks/useTraktEpisodesWatched";
import { prefetchSubrouteDetails } from "@/lib/navigation/subroutePrefetch";

function toRatingNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export default function useSeasonCardItems({
  type,
  item,
  data,
  imdbId,
  episodesWatched,
  onOpenSeason,
  // Precarga de lo que abre la temporada. Por defecto, su panel lateral
  // (iframe, subroutePrefetch); quien abra otra cosa precarga lo suyo.
  onPrefetchSeason,
}) {
  const id = item?.id ?? null;
  const prefetchSeason = (seasonNumber) =>
    onPrefetchSeason
      ? onPrefetchSeason(seasonNumber)
      : prefetchSubrouteDetails({ media_type: "season", id, showId: id, seasonNumber });

  /* ------------------- VALORACIÓN DE EPISODIOS (TV) ------------------- */
  const [episodeRatings, setEpisodeRatings] = useState(null);

  useEffect(() => {
    if (type !== "tv" || id == null) {
      setEpisodeRatings(null);
      return undefined;
    }
    // Ya no hay sección que las pinte: se usan para casar las temporadas de
    // SeriesGraph con las de TMDb (más abajo).
    let ignore = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/seriesgraph/episode-ratings?tmdbId=${encodeURIComponent(id)}`,
          { cache: "no-store" },
        );
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error);
        if (!ignore) setEpisodeRatings(json);
      } catch {
        // Sin notas: las temporadas se pintan con los datos de TMDb.
      }
    })();
    return () => {
      ignore = true;
    };
  }, [type, id]);

  const tmdbSeasons = useMemo(
    () => (Array.isArray(data?.seasons) ? data.seasons : []),
    [data?.seasons],
  );

  // TMDb ya llega con la ficha: mostrar sus temporadas sin esperar a ratings,
  // incluidos los próximos estrenos y excluidos los especiales.
  const visibleSeasons = useMemo(
    () =>
      tmdbSeasons.filter((season) => Number(season?.season_number) > 0),
    [tmdbSeasons],
  );

  const seriesGraphSeasonRatings = useMemo(() => {
    const averages = getSeriesGraphSeasonAverages({
      ratings: episodeRatings,
      tmdbSeasons,
    });
    const map = new Map();
    averages.forEach((aggregate, seasonNumber) => {
      if (aggregate?.rating != null) map.set(seasonNumber, aggregate.rating);
    });
    return map;
  }, [episodeRatings, tmdbSeasons]);

  // SeriesGraph e IMDb pueden agrupar un anime de forma distinta a TMDb, y ahí
  // un mismo número de temporada no representa los mismos episodios.
  const seasonStructuresMismatch = useMemo(() => {
    const sgSeasons = Array.isArray(episodeRatings?.seasons)
      ? episodeRatings.seasons
      : [];
    const airedSeasons = visibleSeasons.filter((season) => Number(season?.episode_count) > 0);
    if (!sgSeasons.length || !airedSeasons.length) return false;
    return !seasonStructuresAlign(sgSeasons, airedSeasons);
  }, [episodeRatings, visibleSeasons]);

  // Nota de IMDb por temporada. Comparte CLAVE DE CACHÉ con la ficha completa,
  // así que si ya se visitó esa ficha en esta pestaña no se pide nada.
  const [seasonImdbRatings, setSeasonImdbRatings] = useState({});
  const visibleSeasonNumbersKey = visibleSeasons
    .map((season) => Number(season.season_number))
    .join(",");

  useEffect(() => {
    if (type !== "tv" || !imdbId || !visibleSeasonNumbersKey || seasonStructuresMismatch) {
      setSeasonImdbRatings({});
      return undefined;
    }
    const seasonNumbers = visibleSeasonNumbersKey.split(",").map(Number);
    let ignore = false;
    const controller = new AbortController();
    const cacheKey = `showverse:tv:${id}:season-imdb-ratings:${imdbId}`;

    const readCache = () => {
      try {
        const raw = window.sessionStorage.getItem(cacheKey);
        const parsed = raw ? JSON.parse(raw) : null;
        return parsed && typeof parsed === "object" ? parsed : {};
      } catch {
        return {};
      }
    };

    (async () => {
      const cached = readCache();
      if (!ignore) setSeasonImdbRatings(cached);
      const missing = seasonNumbers.filter(
        (seasonNumber) =>
          !Object.prototype.hasOwnProperty.call(cached, String(seasonNumber)),
      );
      if (!missing.length) return;

      const next = { ...cached };
      for (const seasonNumber of missing) {
        if (ignore) return;
        try {
          const params = new URLSearchParams({
            showId: String(id),
            imdbId,
            season: String(seasonNumber),
          });
          const res = await fetch(`/api/ratings/season?${params}`, {
            signal: controller.signal,
            cache: "no-store",
          });
          const json = await res.json().catch(() => ({}));
          next[seasonNumber] = res.ok ? toRatingNumber(json?.rating) : null;
        } catch (error) {
          if (error?.name === "AbortError") return;
          next[seasonNumber] = null;
        }
      }
      if (ignore) return;
      try {
        window.sessionStorage.setItem(cacheKey, JSON.stringify(next));
      } catch {
        // La nota por temporada se vuelve a pedir en la próxima visita.
      }
      setSeasonImdbRatings(next);
    })();

    return () => {
      ignore = true;
      controller.abort();
    };
  }, [type, id, imdbId, visibleSeasonNumbersKey, seasonStructuresMismatch]);

  const seasonCardItems = visibleSeasons.map((season) => {
    const sn = Number(season.season_number);
    const imdbRating = toRatingNumber(seasonImdbRatings?.[sn]);
    const graphRating = seriesGraphSeasonRatings.get(sn) ?? null;
    const totalEp = Number(season?.episode_count || 0) || null;
    return {
      key: sn,
      showId: item?.id ?? null,
      seasonNumber: sn,
      seasonId: season.id ?? null,
      name: season.name || null,
      posterPath: season.poster_path || null,
      fallbackPosterPath: data?.poster_path || null,
      airDate: season.air_date || null,
      tmdbRating: season.vote_average ?? null,
      imdbRating: seasonStructuresMismatch ? graphRating : (imdbRating ?? graphRating),
      totalEpisodes: totalEp,
      watchedEpisodes: getWatchedEpisodeCountForSeason(episodesWatched?.watchedBySeason, sn, totalEp || 0),
      onClick: () => onOpenSeason?.(sn),
      // Su panel (iframe) se precarga al apuntar a la tarjeta (subroutePrefetch).
      onPrefetch: () => prefetchSeason(sn),
    };
  });
  const specialSeason = tmdbSeasons.find(
    (season) => Number(season?.season_number) === 0,
  );
  const seasonSheetCardItems = [
    ...seasonCardItems,
    ...(specialSeason
      ? [
          {
            key: 0,
            showId: item?.id ?? null,
            seasonNumber: 0,
            seasonId: specialSeason.id ?? null,
            name: "Especiales",
            posterPath: specialSeason.poster_path || null,
            fallbackPosterPath: data?.poster_path || null,
            airDate: specialSeason.air_date || null,
            tmdbRating: specialSeason.vote_average ?? null,
            imdbRating: seasonStructuresMismatch
              ? (seriesGraphSeasonRatings.get(0) ?? null)
              : (toRatingNumber(seasonImdbRatings?.[0]) ??
                seriesGraphSeasonRatings.get(0) ??
                null),
            totalEpisodes: Number(specialSeason.episode_count || 0) || null,
            watchedEpisodes: getWatchedEpisodeCountForSeason(
              episodesWatched?.watchedBySeason,
              0,
              Number(specialSeason.episode_count || 0) || 0,
            ),
            onClick: () => onOpenSeason?.(0),
            onPrefetch: () => prefetchSeason(0),
          },
        ]
      : []),
  ];

  return { visibleSeasons, tmdbSeasons, seasonCardItems, seasonSheetCardItems };
}
