// Backdrops de las PRIMERAS tarjetas de una sección del dashboard, elegidos en
// el servidor (vista lista o modo backdrop). Sin esto, esas tarjetas nacían
// vacías y se llenaban por tandas al responder el lote de arte del cliente.
//
// Mismas peticiones (URLs y caché de un día) y mismo criterio que
// /api/tmdb/artwork (`dashboardBackdrop` de pickListArtwork), así que lo que
// se elige aquí es lo que el cliente habría elegido, y lo que se pide aquí
// deja la caché caliente para la ruta. El resto de tarjetas sigue por el lote.
// Ficha y `/images` por separado: `append_to_response=images` llega a veces
// desde el servidor filtrado solo al inglés (ver la ruta).

import { pickListArtwork } from "@/lib/tmdb/artworkPicks";

const TMDB_KEY =
  process.env.TMDB_API_KEY || process.env.NEXT_PUBLIC_TMDB_API_KEY;
const DAY = 86_400;

async function fetchTmdbJson(url) {
  const res = await fetch(url, { cache: "force-cache", next: { revalidate: DAY } });
  return res.ok ? res.json() : undefined;
}

async function fetchDashboardBackdrop(type, id) {
  const base = `https://api.themoviedb.org/3/${type}/${id}`;
  const [details, images] = await Promise.all([
    fetchTmdbJson(`${base}?api_key=${TMDB_KEY}`),
    fetchTmdbJson(`${base}/images?api_key=${TMDB_KEY}`),
  ]);
  if (!images) return undefined;
  return (
    pickListArtwork(images, {
      originalLanguage: details?.original_language,
    })?.dashboardBackdrop || null
  );
}

/**
 * { "movie:603": "/ruta.jpg" | null } de los `count` primeros títulos. Lo que no
 * llegue en `budgetMs` se queda fuera (lo pide el cliente).
 */
export async function loadSectionBackdrops(items, { count = 24, budgetMs = 1200 } = {}) {
  if (!TMDB_KEY || !Array.isArray(items)) return {};
  const out = {};
  const work = items.slice(0, count).map(async (item) => {
    const type = item?.media_type === "tv" ? "tv" : "movie";
    const id = Number(item?.id);
    if (!Number.isInteger(id) || id <= 0) return;
    try {
      const path = await fetchDashboardBackdrop(type, id);
      if (path !== undefined) out[`${type}:${id}`] = path;
    } catch {
      // Sin respuesta: la pedirá el cliente.
    }
  });
  let timer = 0;
  await Promise.race([
    Promise.all(work),
    new Promise((resolve) => {
      timer = setTimeout(resolve, budgetMs);
    }),
  ]);
  clearTimeout(timer);
  return { ...out };
}
