// /src/app/api/tmdb/collections/featured/route.js
import { NextResponse } from "next/server";

const TMDB_KEY = process.env.NEXT_PUBLIC_TMDB_API_KEY;
const TMDB_API = "https://api.themoviedb.org/3";

const FEATURED_COLLECTION_IDS = [
  // Fantasía y Aventuras
  119, // The Lord of the Rings Collection
  121, // The Hobbit Collection
  1241, // Harry Potter Collection
  10, // Star Wars Collection
  420650, // The Chronicles of Narnia Collection

  // Marvel Cinematic Universe
  86311, // The Avengers Collection
  748, // X-Men Collection
  556, // Spider-Man Collection
  131292, // Iron Man Collection
  131295, // Captain America Collection
  131296, // Thor Collection

  // DC Universe
  263, // The Dark Knight Collection
  468552, // Wonder Woman Collection
  284433, // Aquaman Collection

  // Acción
  645, // James Bond Collection
  1570, // Die Hard Collection
  304, // Ocean's Collection
  9, // The Fast and the Furious Collection
  87359, // Mission: Impossible Collection
  31562, // Bourne Collection
  2344, // The Matrix Collection
  528, // Terminator Collection
  328, // Jurassic Park Collection

  // Animación
  2150, // Shrek Collection
  10194, // Toy Story Collection
  89137, // How to Train Your Dragon Collection
  86066, // Despicable Me Collection
  8354, // Ice Age Collection
  14740, // Madagascar Collection
  77816, // Kung Fu Panda Collection
  468222, // The Incredibles Collection

  // Ciencia Ficción
  8091, // Alien Collection
  115570, // Predator Collection
  264, // Back to the Future Collection
  173710, // Planet of the Apes Collection
  422834, // Blade Runner Collection
  131635, // The Hunger Games Collection
  8945, // Mad Max Collection

  // Terror
  8580, // A Nightmare on Elm Street Collection
  313086, // The Conjuring Collection
  91361, // Halloween Collection
  656, // Saw Collection
  14563, // The Ring Collection
  2602, // Scream Collection

  // Comedia
  86055, // Men in Black Collection
  1006, // Austin Powers Collection
  86119, // The Hangover Collection
  266672, // Ted Collection
  495527, // Johnny English Collection

  // Drama
  151094, // Before Trilogy Collection
  230, // The Godfather Collection
  1436, // Rocky Collection
  5039, // Rambo Collection
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

    const collections = await Promise.all(
      uniqueIds.map(async (id) => {
        try {
          const c = await fetchJson(buildTmdbUrl(`/collection/${id}`), {
            cache: "force-cache",
            next: { revalidate: 3600 }, // 1 hora
          });
          const parts = Array.isArray(c?.parts) ? c.parts : [];
          return {
            source: "collection",
            id: String(c?.id),
            name: c?.name || "Colección",
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

    // Filtrar nulos y eliminar duplicados por ID y nombre
    const validCollections = collections.filter(Boolean);

    // Deduplicar primero por ID
    const uniqueById = Array.from(
      new Map(validCollections.map((c) => [c.id, c])).values(),
    );

    // Deduplicar también por nombre (por si hay IDs que resuelven a la misma colección)
    const uniqueCollections = Array.from(
      new Map(uniqueById.map((c) => [c.name?.toLowerCase(), c])).values(),
    );

    console.log(
      `📦 Colecciones: ${validCollections.length} → ${uniqueById.length} (por ID) → ${uniqueCollections.length} (por nombre)`,
    );

    return NextResponse.json(
      { ok: true, collections: uniqueCollections },
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
