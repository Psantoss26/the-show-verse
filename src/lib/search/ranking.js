// src/lib/search/ranking.js
// Peso de lo CONOCIDO en los resultados de búsqueda del Navbar. Puro, sin
// dependencias: lo usa `scoreSearchResult` (texto + esto) y el filtro de
// resultados vacíos.

// Votos y popularidad de un resultado de TMDb. Las personas no tienen votos:
// cuentan los del título más votado por el que se las conoce.
export function searchResultReach(item) {
  const votes =
    item?.media_type === "person"
      ? Math.max(
          0,
          ...(item.known_for || []).map((work) => Number(work?.vote_count) || 0),
        )
      : Number(item?.vote_count) || 0;
  return { votes, popularity: Number(item?.popularity) || 0 };
}

// Puntos por lo conocido que es, en escala logarítmica y con un peso
// comparable al del texto (coincidencia exacta +10000, empieza por +7000).
// Antes la popularidad sumaba como mucho ~3500 en lineal y la coincidencia
// exacta lo aplastaba todo: con «Naruto», una película sin votos ni póster que
// se llama así quedaba por encima de «Naruto Shippuden» (8800 votos). Ahora un
// título conocido que empieza por la consulta gana a uno exacto desconocido,
// y entre dos exactos gana el conocido.
//   0 votos → 0 · 100 → 3000 · 1000 → 4500 · 10000 → 6000 (más la popularidad)
export function searchReachScore(item) {
  const { votes, popularity } = searchResultReach(item);
  return 1500 * Math.log10(1 + votes) + 800 * Math.log10(1 + popularity);
}

// Resultado VACÍO: sin imagen y casi sin votos (p. ej. la película «Naruto» de
// 0 votos o un actor «Naruto» sin foto ni títulos). No aporta nada y solo tapa
// lo que se busca. Colecciones y usuarios no se juzgan aquí.
export const SEARCH_EMPTY_MAX_VOTES = 20;

export function isEmptySearchResult(item) {
  if (!["movie", "tv", "person"].includes(item?.media_type)) return false;
  if (item.poster_path || item.profile_path) return false;
  return searchResultReach(item).votes < SEARCH_EMPTY_MAX_VOTES;
}

// Quita los resultados vacíos, salvo que no quede nada: entonces se enseñan
// (mejor algo que «sin resultados» para una búsqueda muy rara).
export function withoutEmptySearchResults(items) {
  const kept = items.filter((item) => !isEmptySearchResult(item));
  return kept.length > 0 ? kept : items;
}

// Resultados todos DESCONOCIDOS: ninguno llega a estos votos. Suele ser una
// errata («interstelar»): TMDb no tolera erratas y devuelve solo títulos
// raros de nombre parecido. El Navbar prueba entonces también por prefijo.
export const SEARCH_KNOWN_MIN_VOTES = 100;

export function isWeakSearchResultSet(items) {
  return !items.some(
    (item) => searchResultReach(item).votes >= SEARCH_KNOWN_MIN_VOTES,
  );
}
