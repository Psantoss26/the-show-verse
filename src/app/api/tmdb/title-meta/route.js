import { NextResponse } from "next/server";

import { normalizeTitleMetaKey, pickTitleMeta } from "@/lib/tmdb/titleMeta";

// GÉNEROS Y DURACIÓN DE VARIOS TÍTULOS EN UNA PETICIÓN
// (POST { items: ["movie:603", "tv:1396", …] }).
//
// Las filas de la vista de lista (detalles de listas y colecciones, vistas
// laterales de recomendaciones y de la ficha de persona) muestran dos géneros
// y la duración, que las listas de TMDb no traen: hace falta la ficha de cada
// título. Se piden aquí, en español, con concurrencia limitada y reintentos, y
// quedan cacheadas UN DÍA para todos los usuarios (como /api/tmdb/artwork).

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

// Lo ya elegido, en memoria del proceso (la ficha entera pesa decenas de KB;
// esto, unos bytes). Solo lo que llega bien: un fallo de TMDb es transitorio.
const META_TTL_MS = DAY * 1000;
const MAX_REMEMBERED = 6000;
const remembered = new Map(); // key -> { meta, expiresAt }
const inFlight = new Map(); // key -> Promise<meta|null>

function readRemembered(key) {
  const entry = remembered.get(key);
  if (!entry) return undefined;
  if (entry.expiresAt <= Date.now()) {
    remembered.delete(key);
    return undefined;
  }
  return entry.meta;
}

function remember(key, meta) {
  if (remembered.size >= MAX_REMEMBERED) {
    remembered.delete(remembered.keys().next().value);
  }
  remembered.set(key, { meta, expiresAt: Date.now() + META_TTL_MS });
}

// `null` = no se pudo consultar (distinto de «consultado, sin datos»).
function resolveMeta(key) {
  const known = readRemembered(key);
  if (known !== undefined) return Promise.resolve(known);
  const pending = inFlight.get(key);
  if (pending) return pending;

  const promise = (async () => {
    try {
      const [mediaType, id] = key.split(":");
      const details = await fetchTmdbJson(
        `https://api.themoviedb.org/3/${mediaType}/${id}?api_key=${TMDB_KEY}&language=es-ES`,
      );
      const meta = details ? pickTitleMeta(details, mediaType) : null;
      if (meta) remember(key, meta);
      return meta;
    } catch {
      return null;
    } finally {
      inFlight.delete(key);
    }
  })();
  inFlight.set(key, promise);
  return promise;
}

export async function POST(request) {
  if (!TMDB_KEY) return NextResponse.json({ error: "Missing TMDb key" }, { status: 500 });
  const body = await request.json().catch(() => null);
  const keys = [
    ...new Set(
      (Array.isArray(body?.items) ? body.items : [])
        .map(normalizeTitleMetaKey)
        .filter(Boolean),
    ),
  ].slice(0, MAX_ITEMS);

  const entries = await Promise.all(keys.map(async (key) => [key, await resolveMeta(key)]));

  return NextResponse.json(
    { ok: true, meta: Object.fromEntries(entries) },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
