// Colecciones de TMDb del índice de /lists: las DESTACADAS (selección a mano,
// van primero) y el formato con el que se envía cada una al cliente. Lo
// comparten /api/tmdb/collections/featured y /api/tmdb/collections/catalog
// (el resto del catálogo, ver src/data/tmdbCollectionsCatalog.json).

export const FEATURED_COLLECTION_IDS = [
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

/** Nombre del índice: sin « - Colección» / « Collection» (la ficha lo lleva). */
export function cleanCollectionName(name) {
  return String(name || "Colección")
    .replace(/ Collection$/i, "")
    .replace(/ - Colección$/i, "");
}

/** Resumen de una colección (respuesta de /collection/{id}) para el índice. */
export function toCollectionSummary(c) {
  const parts = Array.isArray(c?.parts) ? c.parts : [];
  return {
    source: "collection",
    id: String(c?.id),
    name: cleanCollectionName(c?.name),
    description: c?.overview || "",
    item_count: parts.length,
    poster_path: c?.poster_path || null,
    backdrop_path: c?.backdrop_path || null,
    tmdbUrl: c?.id ? `https://www.themoviedb.org/collection/${c.id}` : null,
  };
}
