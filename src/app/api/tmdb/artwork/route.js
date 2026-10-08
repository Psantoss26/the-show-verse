import { NextResponse } from "next/server";

import { artworkItemKey, pickListArtwork } from "@/lib/tmdb/artworkPicks";
import { TMDB_IMAGE_LANGS_PARAM } from "@/lib/tmdb/imageLanguages";

// ARTE DE VARIOS TÍTULOS EN UNA PETICIÓN (POST { items: ["movie:603", …] }).
//
// Las tarjetas de las listas y las vistas previas del índice elegían su póster
// inglés pidiendo /images a TMDb DESDE EL NAVEGADOR, una petición por título:
// una ficha de 48 títulos eran 48 peticiones y el índice de colecciones, cientos
// (TMDb respondía 429 y había que reintentar). Aquí se piden desde el servidor,
// con concurrencia limitada y reintentos, y quedan cacheadas UN DÍA para todos
// los usuarios: la segunda vez es instantáneo. Los criterios de elección son
// los mismos (lib/tmdb/artworkPicks).

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

async function fetchImages(key) {
  const [mediaType, id] = key.split(":");
  const url = `https://api.themoviedb.org/3/${mediaType}/${id}/images?api_key=${TMDB_KEY}&${TMDB_IMAGE_LANGS_PARAM}`;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const res = await limited(() => fetch(url, { cache: "force-cache", next: { revalidate: DAY } }));
    if (res.ok) return res.json();
    if (res.status !== 429) return null;
    const retryAfter = Number(res.headers.get("retry-after"));
    await sleep(Number.isFinite(retryAfter) ? retryAfter * 1000 : 300 * 2 ** attempt);
  }
  return null;
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
    keys.map(async (key) => {
      try {
        // `null` = no se pudo consultar (distinto de «consultado, sin póster»).
        return [key, pickListArtwork(await fetchImages(key))];
      } catch {
        return [key, null];
      }
    }),
  );

  return NextResponse.json(
    { ok: true, artwork: Object.fromEntries(entries) },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
