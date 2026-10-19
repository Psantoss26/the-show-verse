import { NextResponse } from "next/server";

import { normalizeArtworkKey, pickListArtwork, pickSeasonArtwork } from "@/lib/tmdb/artworkPicks";

// ARTE DE VARIOS TÍTULOS EN UNA PETICIÓN (POST { items: ["movie:603", …] }).
//
// Las tarjetas de las listas y las vistas previas del índice elegían su póster
// inglés pidiendo /images a TMDb DESDE EL NAVEGADOR, una petición por título:
// una ficha de 48 títulos eran 48 peticiones y el índice de colecciones, cientos
// (TMDb respondía 429 y había que reintentar). Aquí se piden desde el servidor,
// con concurrencia limitada y reintentos, y quedan cacheadas UN DÍA para todos
// los usuarios: la segunda vez es instantáneo. Los criterios de elección son
// los mismos (lib/tmdb/artworkPicks).
//
// Se pide la FICHA con sus imágenes (`append_to_response=images`, sin filtro
// de idioma): trae el arte de todos los idiomas y `original_language`, que la
// escalera necesita para su escalón «idioma original».
//
// También admite TEMPORADAS ("season:1396:2", tarjetas de «Temporadas» de la
// ficha): su galería sin filtro de idioma más la ficha de la serie, que aporta
// el idioma original (y es la misma petición cacheada que "tv:1396").

const TMDB_KEY = process.env.NEXT_PUBLIC_TMDB_API_KEY;
const MAX_ITEMS = 60;
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
function fetchTitleWithImages(mediaType, id) {
  const url = `https://api.themoviedb.org/3/${mediaType}/${id}?api_key=${TMDB_KEY}&append_to_response=images`;
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
      fetchTitleWithImages("tv", id),
      fetchTmdbJson(`https://api.themoviedb.org/3/tv/${id}/season/${season}/images?api_key=${TMDB_KEY}`),
    ]);
    return pickSeasonArtwork(images, { originalLanguage: show?.original_language });
  }
  const details = await fetchTitleWithImages(kind, id);
  return pickListArtwork(details?.images, {
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
function resolvePicks(key) {
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

export async function POST(request) {
  if (!TMDB_KEY) return NextResponse.json({ error: "Missing TMDb key" }, { status: 500 });
  const body = await request.json().catch(() => null);
  const keys = [
    ...new Set(
      (Array.isArray(body?.items) ? body.items : [])
        .map(normalizeArtworkKey)
        .filter(Boolean),
    ),
  ].slice(0, MAX_ITEMS);

  const entries = await Promise.all(
    keys.map(async (key) => [key, await resolvePicks(key)]),
  );

  return NextResponse.json(
    { ok: true, artwork: Object.fromEntries(entries) },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
