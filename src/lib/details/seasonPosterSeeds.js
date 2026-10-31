"use client";

import { createContext, useContext } from "react";

// Pósters de «Temporadas» que el SSR de la ficha ya trae resueltos (ver
// seasonPosterSeeds.server.js). Los leen useSeasonLadderPoster y
// useCommunitySeasonPoster antes de pedir nada: la tarjeta sale con su póster
// definitivo en el HTML. Fuera de la ficha (DetailModal…) no hay proveedor y
// todo sigue como antes. El servidor y el cliente ven las mismas semillas, así
// que la hidratación coincide.
const SeasonPosterSeedsContext = createContext(null);

export const SeasonPosterSeedsProvider = SeasonPosterSeedsContext.Provider;

/** Ruta sembrada de la escalera (`null` = sin póster) o `undefined` si no hay. */
export function useSeededLadderPoster(showId, seasonNumber) {
  const seeds = useContext(SeasonPosterSeedsContext);
  if (!seeds || Number(seeds.showId) !== Number(showId)) return undefined;
  return seeds.ladder?.[Number(seasonNumber)];
}

/** Más votado sembrado (`null` = sin votos) o `undefined` si no hay. */
export function useSeededCommunityPoster(seasonId) {
  const seeds = useContext(SeasonPosterSeedsContext);
  return seeds?.community?.[Number(seasonId)];
}
