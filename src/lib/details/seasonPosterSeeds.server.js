import "server-only";

import { headers } from "next/headers";
import { clientIpFromHeaders } from "@/lib/backend/server";
import { seasonArtworkKey } from "@/lib/tmdb/artworkPicks";
import { hasTmdbKey, resolveArtworkPicks } from "@/lib/tmdb/artworkPicks.server";

// Pósters de «Temporadas» resueltos en el SSR de la ficha: la escalera de
// idioma (lo mismo que /api/tmdb/artwork) y el más votado de la comunidad (lo
// mismo que /api/community/seasons/artwork). Las tarjetas esperaban a esas dos
// peticiones del navegador sin enseñar nada, y al cargar la ficha salían a la
// cola de las decenas de peticiones del arranque: 1,5–2,9 s medidos en local
// para respuestas que el servidor da en 7–18 ms. Llegando ya en el HTML, el
// póster se pide con la página.
//
// Con presupuesto: lo que no esté en `budgetMs` (TMDb en frío) no retrasa la
// página y esa tarjeta lo pide desde el navegador como antes. Lo resuelto
// después igualmente queda en la caché del servidor para esa petición.
const BASE = process.env.BACKEND_API_BASE_URL || process.env.NEXT_PUBLIC_API_BASE_URL;
export const SEASON_SEED_BUDGET_MS = 350;

const withBudget = (promise, ms) =>
  Promise.race([promise, new Promise((resolve) => setTimeout(resolve, ms))]);

async function fetchCommunitySeasonPosters(ids, budgetMs) {
  if (!BASE || !ids.length) return {};
  try {
    const ip = clientIpFromHeaders(await headers().catch(() => null));
    const res = await fetch(`${BASE}/v1/community/seasons/artwork?ids=${ids.join(",")}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(budgetMs),
      headers: ip ? { "X-Forwarded-For": ip } : {},
    });
    if (!res.ok) return {};
    const posters = (await res.json())?.posters || {};
    // Sin entrada = sin votos (null), igual que en el cliente.
    return Object.fromEntries(ids.map((id) => [id, posters[id] || null]));
  } catch {
    return {};
  }
}

/**
 * `{ showId, ladder: { [temporada]: ruta|null }, community: { [seasonId]: ruta|null } }`
 * con lo resuelto a tiempo, o `null` si no es una serie.
 */
export async function fetchSeasonPosterSeeds(type, data, { budgetMs = SEASON_SEED_BUDGET_MS } = {}) {
  const seasons = type === "tv" && Array.isArray(data?.seasons) ? data.seasons : [];
  const showId = Number(data?.id);
  if (!seasons.length || !Number.isInteger(showId)) return null;

  const ladder = {};
  const ladderDone = hasTmdbKey()
    ? Promise.all(
        seasons.map(async (season) => {
          const number = Number(season?.season_number);
          if (!Number.isInteger(number) || number < 0) return;
          const picks = await resolveArtworkPicks(seasonArtworkKey(showId, number));
          // `null` = TMDb falló: no se siembra y la tarjeta lo vuelve a pedir.
          if (picks) ladder[number] = picks.poster || null;
        }),
      )
    : Promise.resolve();

  const ids = seasons.map((season) => Number(season?.id)).filter((id) => Number.isInteger(id) && id > 0);
  const [community] = await Promise.all([
    fetchCommunitySeasonPosters(ids, budgetMs),
    withBudget(ladderDone, budgetMs),
  ]);

  // Copia: lo que siga llegando tras el presupuesto no cambia lo ya enviado.
  return { showId, ladder: { ...ladder }, community };
}
