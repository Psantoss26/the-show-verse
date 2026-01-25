// /src/app/api/tmdb/collections/featured/route.js
import { NextResponse } from "next/server";

const TMDB_KEY = process.env.NEXT_PUBLIC_TMDB_API_KEY;
const TMDB_API = "https://api.themoviedb.org/3";

const FEATURED_COLLECTION_IDS = [
  // Top Populares
  10, // Star Wars
  1241, // Harry Potter
  119, // The Lord of the Rings
  535313, // The Hobbit
  86311, // The Avengers
  9485, // Fast & Furious
  645, // James Bond

  // Marvel
  556, // Spider-Man
  131292, // Iron Man
  131295, // Captain America
  131296, // Thor
  748, // X-Men

  // DC
  263, // The Dark Knight
  8537, // Superman

  // Acción
  87359, // Mission: Impossible
  2344, // The Matrix
  328, // Jurassic Park
  528, // Terminator
  31562, // Bourne
  1570, // Die Hard
  304, // Ocean's

  // Animación
  10194, // Toy Story
  86066, // Despicable Me
  8354, // Ice Age
  2150, // Shrek
  14740, // Madagascar

  // Terror
  313086, // The Conjuring
  91361, // Halloween
  656, // Saw
  2602, // Scream

  // Ciencia Ficción
  8091, // Alien
  264, // Back to the Future
  131635, // The Hunger Games
  8945, // Mad Max

  // Drama
  230, // The Godfather
  553, // Rocky
  5039, // Rambo
];

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
          const c = await fetchJson(buildTmdbUrl(`/collection/${id}`), {
            cache: "force-cache",
            next: { revalidate: 3600 }, // 1 hora
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
          "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=7200",
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
