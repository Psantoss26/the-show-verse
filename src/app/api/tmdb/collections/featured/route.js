import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { FEATURED_COLLECTION_IDS, toCollectionSummary } from "@/lib/tmdb/featuredCollections";

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
          return toCollectionSummary(c);
        } catch (err) {
          console.warn(`❌ Error colección ${id}:`, err.message);
          return null;
        }
      }),
    );

    // Filtrar nulos y eliminar duplicados por ID y nombre
    const validCollections = collections.filter(Boolean);

    // Deduplicar primero por ID
    const uniqueById = Array.from(
      new Map(validCollections.map((c) => [c.id, c])).values(),
    );

    // Don't persist an incomplete catalog when an upstream request fails.
    if (validCollections.length !== uniqueIds.length) {
      throw Object.assign(new Error("Incomplete collections catalog"), { collections: uniqueById });
    }
    return uniqueById;
}, ["featured-collections-summary-v1"], { revalidate: 3600 });

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
    const uniqueById = await loadFeaturedCollections();

    // No deduplicar por nombre, ya que diferentes versiones pueden tener nombres similares
    return NextResponse.json(
      { ok: true, collections: uniqueById },
      {
        headers: {
          "Cache-Control":
            "public, max-age=600, s-maxage=3600, stale-while-revalidate=7200",
        },
      },
    );
  } catch (e) {
    if (Array.isArray(e?.collections) && e.collections.length > 0) {
      return NextResponse.json(
        { ok: true, collections: e.collections },
        { headers: { "Cache-Control": "no-store" } },
      );
    }
    return NextResponse.json(
      { error: e?.message || "Server error" },
      { status: 500 },
    );
  }
}
