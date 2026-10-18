import { NextResponse } from "next/server";

import { artworkItemKey, pickListArtwork } from "@/lib/tmdb/artworkPicks";

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

async function fetchTitleWithImages(key) {
  const [mediaType, id] = key.split(":");
  const url = `https://api.themoviedb.org/3/${mediaType}/${id}?api_key=${TMDB_KEY}&append_to_response=images`;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const res = await limited(() => fetch(url, { cache: "force-cache", next: { revalidate: DAY } }));
    if (res.ok) return res.json();
    if (res.status !== 429) return null;
    const retryAfter = Number(res.headers.get("retry-after"));
    await sleep(Number.isFinite(retryAfter) ? retryAfter * 1000 : 300 * 2 ** attempt);
  }
  return null;
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
      const details = await fetchTitleWithImages(key);
      const picks = pickListArtwork(details?.images, {
        originalLanguage: details?.original_language,
      });
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
        .map((raw) => {
          const [mediaType, id] = String(raw).split(":");
          return artworkItemKey(mediaType, id);
        })
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
