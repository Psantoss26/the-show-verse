// /src/app/api/tmdb/collections/search/route.js
import { NextResponse } from "next/server";

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

export async function GET(request) {
  try {
    if (!TMDB_KEY)
      return NextResponse.json({ error: "Missing TMDb key" }, { status: 500 });

    const { searchParams } = new URL(request.url);
    const query = searchParams.get("query") || "";

    if (!query.trim()) {
      return NextResponse.json({ ok: true, collections: [] });
    }

    // Buscar colecciones que coincidan
    const searchRes = await fetchJson(
      buildTmdbUrl("/search/collection", { query, page: 1 }),
      { cache: "force-cache", next: { revalidate: 3600 } },
    );

    const results = Array.isArray(searchRes?.results) ? searchRes.results : [];

    // Obtener detalles de cada colección (necesitamos item_count)
    const collections = await Promise.all(
      results.slice(0, 20).map(async (item) => {
        try {
          const c = await fetchJson(buildTmdbUrl(`/collection/${item.id}`), {
            cache: "force-cache",
            next: { revalidate: 3600 },
          });
          const parts = Array.isArray(c?.parts) ? c.parts : [];
          const cleanName = (c?.name || "Colección")
            .replace(/ Collection$/i, "")
            .replace(/ - Colección$/i, "");
          return {
            source: "collection",
            id: String(c?.id),
            name: cleanName,
            description: c?.overview || "",
            item_count: parts.length,
            poster_path: c?.poster_path || null,
            backdrop_path: c?.backdrop_path || null,
            tmdbUrl: c?.id
              ? `https://www.themoviedb.org/collection/${c.id}`
              : null,
          };
        } catch {
          return null;
        }
      }),
    );

    const validCollections = collections.filter(Boolean);
    const uniqueCollections = Array.from(
      new Map(validCollections.map((c) => [c.id, c])).values(),
    );

    return NextResponse.json(
      { ok: true, collections: uniqueCollections },
      {
        headers: {
          "Cache-Control": "public, s-maxage=1800, stale-while-revalidate=3600",
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
