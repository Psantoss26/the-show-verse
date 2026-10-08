import { NextResponse } from "next/server";

import catalog from "@/data/tmdbCollectionsCatalog.json";
import { CATALOG_PAGE_SIZE, catalogPage, normalizeCatalogSort } from "@/lib/tmdb/collectionsCatalog";
import { FEATURED_COLLECTION_IDS, toCollectionSummary } from "@/lib/tmdb/featuredCollections";

// El RESTO de colecciones de TMDb para /lists → Colecciones, por páginas, tras
// las destacadas (que ya devuelve /api/tmdb/collections/featured). El catálogo
// (ids, nombres, nº de películas y votos) lo genera
// scripts/build-collections-catalog.mjs; aquí solo se ordena, se pagina y se
// completa cada colección de la página con sus datos en español (póster, fondo,
// sinopsis), cacheados un día.
//
// GET ?sort=items_desc|items_asc|likes_desc|likes_asc|name_asc|name_desc&page=1

const TMDB_KEY = process.env.NEXT_PUBLIC_TMDB_API_KEY;
const DAY = 86_400;

async function fetchCollection(id) {
  try {
    const url = `https://api.themoviedb.org/3/collection/${id}?api_key=${TMDB_KEY}&language=es-ES`;
    const res = await fetch(url, { cache: "force-cache", next: { revalidate: DAY } });
    if (!res.ok) return null;
    return toCollectionSummary(await res.json());
  } catch {
    return null;
  }
}

export async function GET(request) {
  if (!TMDB_KEY) return NextResponse.json({ error: "Missing TMDb key" }, { status: 500 });

  const { searchParams } = new URL(request.url);
  const sort = normalizeCatalogSort(searchParams.get("sort"));
  const result = catalogPage(catalog.collections, {
    sort,
    page: searchParams.get("page"),
    pageSize: CATALOG_PAGE_SIZE,
    exclude: FEATURED_COLLECTION_IDS,
  });

  const summaries = await Promise.all(
    result.entries.map(async ([id, name, items]) => {
      const summary = await fetchCollection(id);
      // Si TMDb falla, la colección sigue en su sitio con lo del catálogo: así
      // el orden y la paginación no se descuadran.
      return summary || { source: "collection", id: String(id), name, description: "", item_count: items, poster_path: null, backdrop_path: null, tmdbUrl: `https://www.themoviedb.org/collection/${id}` };
    }),
  );

  return NextResponse.json(
    { ok: true, sort, page: result.page, totalPages: result.totalPages, total: result.total, collections: summaries },
    { headers: { "Cache-Control": "public, max-age=600, s-maxage=3600, stale-while-revalidate=86400" } },
  );
}
