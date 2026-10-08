import { NextResponse } from "next/server";
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

async function fetchJson(url, init) {
  const res = await fetch(url, init);
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j?.status_message || "TMDb request failed");
  return j;
}

export async function GET() {
  try {
    if (!TMDB_KEY)
      return NextResponse.json({ error: "Missing TMDb key" }, { status: 500 });

    // Primero, eliminar IDs duplicados del array original
    const uniqueIds = [...new Set(FEATURED_COLLECTION_IDS)];
    console.log(
      `📦 IDs: ${FEATURED_COLLECTION_IDS.length} → únicos: ${uniqueIds.length}`,
    );

    const collections = await Promise.all(
      uniqueIds.map(async (id) => {
        try {
          const tmdbUrl = await buildTmdbUrl(`/collection/${id}`);
          const c = await fetchJson(tmdbUrl, {
            cache: "force-cache",
            next: { revalidate: 3600 }, // 1 hora
          });
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

    console.log(
      `📦 Resultado: ${validCollections.length} válidas → ${uniqueById.length} únicas`,
    );

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
    return NextResponse.json(
      { error: e?.message || "Server error" },
      { status: 500 },
    );
  }
}
