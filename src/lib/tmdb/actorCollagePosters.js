// PÓSTERS SIN IDIOMA DEL FONDO DE MOSAICO de la ficha de una persona,
// resueltos EN EL SERVIDOR durante el SSR (src/app/details/person/[id]).
//
// Antes los pedía el navegador tras hidratar: 60 títulos en 4 POSTs a
// /api/tmdb/artwork (16 a la vez en el servidor), y el fondo esperaba al
// último. En frío el mosaico aparecía a los ~3,2 s; en caliente, ~1 s, la
// mitad esperando a la hidratación para empezar a pedir. Ahora la página lanza
// esto sin esperarlo y le pasa la PROMESA al cliente: llega por el mismo
// stream de la página, antes de hidratar.
//
// Solo hace falta el póster sin texto, así que se pide `/images` filtrado a
// los que no tienen idioma (~130 ms y ~20 KB por título, frente a ~220 ms y
// ~90 KB de la ficha con todas sus imágenes que pide la ruta de las listas).
// Cacheado un día como la ruta.
//
// Se resuelve en cuanto los primeros títulos, EN ORDEN, dan pósters para el
// mosaico más grande. Pero TMDb tiene una cola larga con los títulos que su
// CDN no tiene a mano (medido: mediana ~120 ms, p90 1,3-1,9 s, máximo ~2,4 s
// por título), y uno lento al principio frenaba a todos. Pasado
// DEADLINE_MS, sale con lo que haya llegado (en orden) si basta para un
// mosaico decente; lo que falta sigue llegando y queda en la caché para la
// siguiente visita.

import { MAX_BACKGROUND_TILE_COUNT } from "../lists/posterCollage.js";
import { artworkItemKey, pickTextlessPoster } from "./artworkPicks.js";

const TMDB_KEY = process.env.NEXT_PUBLIC_TMDB_API_KEY;
const MAX_TITLES = 60;
const MAX_CONCURRENT = 20;
const DAY = 86_400;
const POSTER_SIZE = "w185";
const DEADLINE_MS = 900;
// Con menos, el mosaico repite demasiado (buildBackgroundCollageTiles cicla).
const MIN_POSTERS_AFTER_DEADLINE = 24;

let active = 0;
const queue = [];
async function limited(task) {
  if (active >= MAX_CONCURRENT) await new Promise((resolve) => queue.push(resolve));
  active += 1;
  try {
    return await task();
  } finally {
    active -= 1;
    queue.shift()?.();
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchTextlessPoster(key) {
  const [mediaType, id] = key.split(":");
  const url = `https://api.themoviedb.org/3/${mediaType}/${id}/images?api_key=${TMDB_KEY}&include_image_language=null,xx`;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const res = await limited(() =>
      fetch(url, {
        cache: "force-cache",
        next: { revalidate: DAY },
        signal: AbortSignal.timeout(6000),
      }),
    );
    if (res.ok) return pickTextlessPoster((await res.json())?.posters);
    if (res.status !== 429) return null;
    const retryAfter = Number(res.headers.get("retry-after"));
    await sleep(Number.isFinite(retryAfter) ? retryAfter * 1000 : 300 * 2 ** attempt);
  }
  return null;
}

/**
 * URLs de los pósters sin texto de `titles` (en su orden, sin repetir), o
 * null si TMDb no respondió a ninguno (el cliente cae a pedirlos él).
 */
export function getActorCollagePosters(titles) {
  if (!TMDB_KEY) return Promise.resolve(null);
  const keys = [
    ...new Set(
      (Array.isArray(titles) ? titles : [])
        .map((title) => artworkItemKey(title?.media_type, title?.id))
        .filter(Boolean),
    ),
  ].slice(0, MAX_TITLES);
  if (!keys.length) return Promise.resolve([]);

  return new Promise((resolve) => {
    // undefined = pendiente · null = sin póster o fallo · string = ruta.
    const results = new Array(keys.length).fill(undefined);
    let failures = 0;
    let settled = 0;
    let done = false;
    let deadlinePassed = false;

    const ready = () => {
      const paths = [];
      for (const path of results) {
        if (path === undefined) {
          if (!deadlinePassed) return paths.length >= MAX_BACKGROUND_TILE_COUNT ? paths : null;
          continue;
        }
        if (path) paths.push(path);
      }
      if (settled === keys.length) return paths;
      if (deadlinePassed && paths.length >= MIN_POSTERS_AFTER_DEADLINE) return paths;
      return paths.length >= MAX_BACKGROUND_TILE_COUNT ? paths : null;
    };

    const check = () => {
      if (done) return;
      if (settled === keys.length && failures === keys.length) {
        finish(null);
        return;
      }
      const paths = ready();
      if (paths) finish(paths);
    };

    const deadline = setTimeout(() => {
      deadlinePassed = true;
      check();
    }, DEADLINE_MS);

    const finish = (paths) => {
      done = true;
      clearTimeout(deadline);
      resolve(
        paths &&
          [...new Set(paths)].map(
            (path) => `https://image.tmdb.org/t/p/${POSTER_SIZE}${path}`,
          ),
      );
    };

    keys.forEach((key, index) => {
      fetchTextlessPoster(key)
        .catch(() => {
          failures += 1;
          return null;
        })
        .then((path) => {
          results[index] = path;
          settled += 1;
          check();
        });
    });
  });
}
