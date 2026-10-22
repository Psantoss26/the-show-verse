import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import {
  COLLECTION_PREVIEW_ARTWORK_COUNT,
  FEATURED_COLLECTION_IDS,
  toCollectionPreviewItems,
  toCollectionSummary,
  withCollectionPreviewArtwork,
} from "@/lib/tmdb/featuredCollections";
import { pickListArtwork } from "@/lib/tmdb/artworkPicks";

const TMDB_KEY = process.env.NEXT_PUBLIC_TMDB_API_KEY;
const TMDB_API = "https://api.themoviedb.org/3";

function buildTmdbUrl(path, params = {}) {
  const url = new URL(`${TMDB_API}${path}`);
  url.searchParams.set("api_key", TMDB_KEY || "");
  url.searchParams.set("language", "es-ES");
  Object.entries(params).forEach(
    ([k, v]) => v != null && url.searchParams.set(k, String(v)),
  );
  return url.toString();
}

// Con más de cien destacadas, pedirlas todas a la vez rozaba el límite de
// TMDb: como mucho estas a la vez.
const MAX_CONCURRENT = 12;
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

const DAY = 86_400;

// Arte de las vistas previas, con su propio tope (no compite con el catálogo).
const MAX_CONCURRENT_ARTWORK = 16;
let activeArtwork = 0;
const waitingArtwork = [];
async function limitedArtwork(task) {
  if (activeArtwork >= MAX_CONCURRENT_ARTWORK) {
    await new Promise((resolve) => waitingArtwork.push(resolve));
  }
  activeArtwork += 1;
  try {
    return await task();
  } finally {
    activeArtwork -= 1;
    waitingArtwork.shift()?.();
  }
}

// Lo que una respuesta espera al arte de las vistas previas en frío (tras un
// despliegue). Lo que no llegue lo resuelve el cliente por lote, como antes; el
// arte sigue calentándose en segundo plano y sale en las respuestas siguientes.
const PREVIEW_ARTWORK_BUDGET_MS = 1500;

// Misma petición (URL y caché de un día) y mismo criterio que
// /api/tmdb/artwork: lo elegido aquí es lo que el cliente habría elegido.
async function fetchMoviePicks(id) {
  const url = `${TMDB_API}/movie/${id}?api_key=${TMDB_KEY}&append_to_response=images`;
  const res = await limitedArtwork(() =>
    fetch(url, { cache: "force-cache", next: { revalidate: DAY } }),
  );
  if (!res.ok) throw new Error(`TMDb ${res.status}`);
  const details = await res.json();
  return pickListArtwork(details?.images, {
    originalLanguage: details?.original_language,
  });
}

// Elecciones de UNA colección, guardadas un día: la regeneración horaria del
// catálogo lee unas pocas rutas por colección, no la ficha entera de cada
// película. Si falla alguna no se guarda (un fallo de TMDb es transitorio).
const readCollectionPreviewPicks = unstable_cache(
  async (_collectionId, idsKey) => {
    const ids = idsKey.split(",").filter(Boolean);
    const entries = await Promise.all(
      ids.map(async (id) => [`movie:${id}`, await fetchMoviePicks(id)]),
    );
    return Object.fromEntries(entries);
  },
  ["featured-collection-preview-picks-v1"],
  { revalidate: DAY },
);

// Elecciones ya leídas, en memoria del proceso: cada respuesta del catálogo
// las añade sin volver a la caché de datos (son cientos de colecciones).
const PICKS_MEMO_TTL_MS = 6 * 60 * 60 * 1000;
const picksMemo = new Map(); // `${collectionId}:${idsKey}` -> { picks, expiresAt }

async function collectionPreviewPicks(collection, deadline) {
  const items = Array.isArray(collection?.previewItems) ? collection.previewItems : [];
  const idsKey = items
    .slice(0, COLLECTION_PREVIEW_ARTWORK_COUNT)
    .map((item) => item.id)
    .join(",");
  if (!idsKey) return null;
  const memoKey = `${collection.id}:${idsKey}`;
  const memo = picksMemo.get(memoKey);
  if (memo && memo.expiresAt > Date.now()) return memo.picks;

  const request = readCollectionPreviewPicks(String(collection.id), idsKey).then(
    (picks) => {
      picksMemo.set(memoKey, { picks, expiresAt: Date.now() + PICKS_MEMO_TTL_MS });
      return picks;
    },
    () => null,
  );
  let timer = 0;
  const picks = await Promise.race([
    request,
    new Promise((resolve) => {
      timer = setTimeout(() => resolve(null), Math.max(0, deadline - Date.now()));
    }),
  ]);
  clearTimeout(timer);
  return picks;
}

async function withPreviewArtwork(collections) {
  const deadline = Date.now() + PREVIEW_ARTWORK_BUDGET_MS;
  return Promise.all(
    collections.map(async (collection) => ({
      ...collection,
      previewItems: withCollectionPreviewArtwork(
        collection.previewItems || [],
        await collectionPreviewPicks(collection, deadline),
      ),
    })),
  );
}

async function fetchJson(url, init) {
  const res = await fetch(url, init);
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j?.status_message || "TMDb request failed");
  return j;
}

const readFeaturedCollections = unstable_cache(async () => {
    // Primero, eliminar IDs duplicados del array original
    const uniqueIds = [...new Set(FEATURED_COLLECTION_IDS)];

    const collections = await Promise.all(
      uniqueIds.map(async (id) => {
        try {
          const tmdbUrl = buildTmdbUrl(`/collection/${id}`);
          const c = await limited(() => fetchJson(tmdbUrl, {
            cache: "force-cache",
            next: { revalidate: 3600 }, // 1 hora
            signal: AbortSignal.timeout(8000),
          }));
          return { summary: toCollectionSummary(c), raw: c };
        } catch (err) {
          console.warn(`❌ Error colección ${id}:`, err.message);
          return null;
        }
      }),
    );

    // Las películas de cada colección viajan con el catálogo: el índice pinta
    // sus filas sin pedir cada colección aparte. El arte de las primeras se
    // añade en cada respuesta (ver `withPreviewArtwork`).
    const validCollections = collections
      .filter(Boolean)
      .map(({ summary, raw }) => ({
        ...summary,
        previewItems: toCollectionPreviewItems(raw),
      }));

    // Deduplicar primero por ID
    const uniqueById = Array.from(
      new Map(validCollections.map((c) => [c.id, c])).values(),
    );

    // Don't persist an incomplete catalog when an upstream request fails.
    if (validCollections.length !== uniqueIds.length) {
      throw Object.assign(new Error("Incomplete collections catalog"), { collections: uniqueById });
    }
    return uniqueById;
}, ["featured-collections-summary-v2"], { revalidate: 3600 });

let pendingCollections = null;
function loadFeaturedCollections() {
  if (!pendingCollections) {
    pendingCollections = readFeaturedCollections().finally(() => { pendingCollections = null; });
  }
  return pendingCollections;
}

export async function GET() {
  try {
    if (!TMDB_KEY)
      return NextResponse.json({ error: "Missing TMDb key" }, { status: 500 });
    const collections = await withPreviewArtwork(await loadFeaturedCollections());
    // En frío falta arte: que el navegador no guarde esta respuesta diez
    // minutos, para recibir el completo en cuanto esté.
    const complete = collections.every((c) =>
      (c.previewItems || [])
        .slice(0, COLLECTION_PREVIEW_ARTWORK_COUNT)
        .every((item) => item._listPreviewPoster !== undefined),
    );

    // No deduplicar por nombre, ya que diferentes versiones pueden tener nombres similares
    return NextResponse.json(
      { ok: true, collections },
      {
        headers: {
          "Cache-Control": complete
            ? "public, max-age=600, s-maxage=3600, stale-while-revalidate=7200"
            : "no-store",
        },
      },
    );
  } catch (e) {
    if (Array.isArray(e?.collections) && e.collections.length > 0) {
      return NextResponse.json(
        { ok: true, collections: await withPreviewArtwork(e.collections) },
        { headers: { "Cache-Control": "no-store" } },
      );
    }
    return NextResponse.json(
      { error: e?.message || "Server error" },
      { status: 500 },
    );
  }
}
