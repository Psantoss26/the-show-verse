import "server-only";

import { pickListArtwork, pickSeasonArtwork } from "@/lib/tmdb/artworkPicks";

// Elección de arte en el SERVIDOR (póster/fondo con la escalera de idioma): la
// usan /api/tmdb/artwork (lotes del navegador) y el SSR de la ficha, que manda
// ya resueltos los pósters de «Temporadas» (details/seasonPosterSeeds.server).
// Las fichas de TMDb quedan en la caché de `fetch` un día y las elecciones, en
// memoria del proceso. Ver la explicación completa en la ruta.

const TMDB_KEY = process.env.NEXT_PUBLIC_TMDB_API_KEY;
const MAX_CONCURRENT = 16;
const DAY = 86_400;

let active = 0;
const waiting = [];
async function limited(task) {
  if (active >= MAX_CONCURRENT) await new Promise((resolve) => waiting.push(resolve));
  active += 1;
  try {
    return await task();
  } finally {
    active -= 1;
    waiting.shift()?.();
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchTmdbJson(url) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const res = await limited(() => fetch(url, { cache: "force-cache", next: { revalidate: DAY } }));
    if (res.ok) return res.json();
    if (res.status !== 429) return null;
    const retryAfter = Number(res.headers.get("retry-after"));
    await sleep(Number.isFinite(retryAfter) ? retryAfter * 1000 : 300 * 2 ** attempt);
  }
  return null;
}

// Compartida en vuelo: las temporadas de una serie llegan en el mismo lote y
// cada una necesita la ficha de la serie (en frío, una sola petición a TMDb).
const titlesInFlight = new Map();
function fetchTitle(mediaType, id) {
  const url = `https://api.themoviedb.org/3/${mediaType}/${id}?api_key=${TMDB_KEY}`;
  const pending = titlesInFlight.get(url);
  if (pending) return pending;
  const promise = fetchTmdbJson(url).finally(() => titlesInFlight.delete(url));
  titlesInFlight.set(url, promise);
  return promise;
}

async function fetchPicks(key) {
  const [kind, id, season] = key.split(":");
  if (kind === "season") {
    const [show, images] = await Promise.all([
      fetchTitle("tv", id),
      fetchTmdbJson(`https://api.themoviedb.org/3/tv/${id}/season/${season}/images?api_key=${TMDB_KEY}`),
    ]);
    return pickSeasonArtwork(images, { originalLanguage: show?.original_language });
  }
  const [details, images] = await Promise.all([
    fetchTitle(kind, id),
    fetchTmdbJson(`https://api.themoviedb.org/3/${kind}/${id}/images?api_key=${TMDB_KEY}`),
  ]);
  return pickListArtwork(images, {
    originalLanguage: details?.original_language,
  });
}

// Elecciones ya resueltas, en memoria del proceso. La caché de datos de `fetch`
// guarda la ficha entera (decenas de KB por título, hasta ~150 KB) y hay que
// leerla y volver a elegir en cada lote; los dashboards piden cientos de
// títulos al cargar, así que se recuerda directamente la elección (unas pocas
// rutas). Solo se guardan las que llegan bien: un fallo de TMDb es transitorio.
const PICKS_TTL_MS = DAY * 1000;
const MAX_REMEMBERED_PICKS = 6000;
const rememberedPicks = new Map(); // key -> { picks, expiresAt }
const picksInFlight = new Map(); // key -> Promise<picks|null>

function readRememberedPicks(key) {
  const entry = rememberedPicks.get(key);
  if (!entry) return undefined;
  if (entry.expiresAt <= Date.now()) {
    rememberedPicks.delete(key);
    return undefined;
  }
  return entry.picks;
}

function rememberPicks(key, picks) {
  if (rememberedPicks.size >= MAX_REMEMBERED_PICKS) {
    // El más antiguo primero (orden de inserción del Map).
    rememberedPicks.delete(rememberedPicks.keys().next().value);
  }
  rememberedPicks.set(key, { picks, expiresAt: Date.now() + PICKS_TTL_MS });
}

// `null` = no se pudo consultar (distinto de «consultado, sin póster»).
export function resolveArtworkPicks(key) {
  const remembered = readRememberedPicks(key);
  if (remembered !== undefined) return Promise.resolve(remembered);
  const pending = picksInFlight.get(key);
  if (pending) return pending;

  const promise = (async () => {
    try {
      const picks = await fetchPicks(key);
      if (picks) rememberPicks(key, picks);
      return picks;
    } catch {
      return null;
    } finally {
      picksInFlight.delete(key);
    }
  })();
  picksInFlight.set(key, promise);
  return promise;
}


export const hasTmdbKey = () => Boolean(TMDB_KEY);
