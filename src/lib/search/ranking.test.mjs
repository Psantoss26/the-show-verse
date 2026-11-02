import assert from "node:assert/strict";
import test from "node:test";

import {
  isEmptySearchResult,
  searchReachScore,
  withoutEmptySearchResults,
} from "./ranking.js";

// Datos reales de TMDb para «Naruto» (noviembre de 2026).
const narutoMovieVacia = { media_type: "movie", id: 1, popularity: 1.2, vote_count: 0, poster_path: null };
const narutoActorVacio = { media_type: "person", id: 2, popularity: 0.25, profile_path: null, known_for: [{ vote_count: 0 }] };
const narutoSerie = { media_type: "tv", id: 3, popularity: 98.9, vote_count: 6180, poster_path: "/a.jpg" };
const shippuden = { media_type: "tv", id: 4, popularity: 79.2, vote_count: 8837, poster_path: "/b.jpg" };

test("un resultado sin imagen y casi sin votos es vacío", () => {
  assert.equal(isEmptySearchResult(narutoMovieVacia), true);
  assert.equal(isEmptySearchResult(narutoActorVacio), true);
  assert.equal(isEmptySearchResult(narutoSerie), false);
  // Sin imagen pero conocido (o una persona conocida por un título votado).
  assert.equal(isEmptySearchResult({ ...narutoMovieVacia, vote_count: 300 }), false);
  assert.equal(
    isEmptySearchResult({ ...narutoActorVacio, known_for: [{ vote_count: 61 }] }),
    false,
  );
  // Colecciones y usuarios no se juzgan.
  assert.equal(isEmptySearchResult({ media_type: "collection", id: 5 }), false);
});

test("los vacíos se quitan salvo que no quede nada", () => {
  assert.deepEqual(
    withoutEmptySearchResults([narutoMovieVacia, narutoSerie, narutoActorVacio]),
    [narutoSerie],
  );
  assert.deepEqual(withoutEmptySearchResults([narutoMovieVacia]), [narutoMovieVacia]);
});

test("un título conocido que empieza por la consulta gana a uno exacto desconocido", () => {
  // Texto de `scoreSearchResult`: exacto 10000 y empieza por 7000 (+3000 de
  // palabras en los dos casos).
  const exactoDesconocido = 13000 + searchReachScore({ ...narutoMovieVacia, poster_path: "/c.jpg" });
  const empiezaConocido = 10000 + searchReachScore(shippuden);
  const exactoConocido = 13000 + searchReachScore(narutoSerie);
  assert.ok(empiezaConocido > exactoDesconocido);
  assert.ok(exactoConocido > empiezaConocido);
});

test("un conjunto sin ningún título conocido es débil (errata probable)", async () => {
  const { isWeakSearchResultSet } = await import("./ranking.js");
  // «interstelar»: TMDb solo devuelve dos títulos raros.
  assert.equal(
    isWeakSearchResultSet([
      { media_type: "movie", vote_count: 0 },
      { media_type: "movie", vote_count: 15 },
    ]),
    true,
  );
  assert.equal(isWeakSearchResultSet([narutoMovieVacia, shippuden]), false);
});
