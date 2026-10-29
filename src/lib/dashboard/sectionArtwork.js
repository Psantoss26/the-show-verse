// Arte de las PRIMERAS tarjetas de una sección del dashboard, elegido en el
// servidor: el póster (escalera de idioma de toda la app, como Favoritos) y,
// en vista lista o modo backdrop, el backdrop. Sin esto, esas tarjetas nacían
// con el póster en español del motor (o vacías en backdrop) y se cambiaban
// por tandas al responder el lote de arte del cliente.
//
// Mismas peticiones (URLs y caché de un día) y mismo criterio que
// /api/tmdb/artwork (`poster` y `dashboardBackdrop` de pickListArtwork), así
// que lo que se elige aquí es lo que el cliente habría elegido, y lo que se
// pide aquí deja la caché caliente para la ruta. El resto de tarjetas sigue
// por el lote. Ficha y `/images` por separado: `append_to_response=images`
// llega a veces desde el servidor filtrado solo al inglés (ver la ruta).

import { pickListArtwork } from "@/lib/tmdb/artworkPicks";

const TMDB_KEY =
  process.env.TMDB_API_KEY || process.env.NEXT_PUBLIC_TMDB_API_KEY;
const DAY = 86_400;

async function fetchTmdbJson(url) {
  const res = await fetch(url, { cache: "force-cache", next: { revalidate: DAY } });
  return res.ok ? res.json() : undefined;
}

async function fetchSectionArtwork(type, id) {
  const base = `https://api.themoviedb.org/3/${type}/${id}`;
  const [details, images] = await Promise.all([
    fetchTmdbJson(`${base}?api_key=${TMDB_KEY}`),
    fetchTmdbJson(`${base}/images?api_key=${TMDB_KEY}`),
  ]);
  if (!images) return undefined;
  const picks = pickListArtwork(images, {
    originalLanguage: details?.original_language,
  });
  return {
    poster: picks?.poster || null,
    backdrop: picks?.dashboardBackdrop || null,
  };
}

/**
 * { "movie:603": { poster, backdrop } } de los `count` primeros títulos (cada
 * ruta, o null si no hay). Lo que no llegue en `budgetMs` se queda fuera (lo
 * pide el cliente).
 */
export async function loadSectionArtwork(items, { count = 24, budgetMs = 1200 } = {}) {
  if (!TMDB_KEY || !Array.isArray(items)) return {};
  const out = {};
  const work = items.slice(0, count).map(async (item) => {
    const type = item?.media_type === "tv" ? "tv" : "movie";
    const id = Number(item?.id);
    if (!Number.isInteger(id) || id <= 0) return;
    try {
      const picks = await fetchSectionArtwork(type, id);
      if (picks !== undefined) out[`${type}:${id}`] = picks;
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
