import assert from "node:assert/strict";
import test from "node:test";

import {
  addManualProgress,
  getLocalInProgress,
  normalizeProgressSearchResults,
} from "./progressClient.js";

test("normalizes movie and TV search results while excluding people and duplicates", () => {
  assert.deepEqual(
    normalizeProgressSearchResults([
      {
        id: 10,
        media_type: "movie",
        title: "Película",
        poster_path: "/movie.jpg",
        release_date: "2025-01-02",
      },
      {
        id: 20,
        media_type: "tv",
        name: "Serie",
        first_air_date: "2024-03-04",
      },
      { id: 10, media_type: "movie", title: "Duplicada" },
      { id: 30, media_type: "person", name: "Actor" },
      { id: 40, media_type: "movie", title: "   " },
    ]),
    [
      {
        id: 10,
        media_type: "movie",
        title: "Película",
        original_title: "",
        poster_path: "/movie.jpg",
        release_date: "2025-01-02",
        vote_average: 0,
        popularity: 0,
      },
      {
        id: 20,
        media_type: "tv",
        title: "Serie",
        original_title: "",
        poster_path: null,
        release_date: "2024-03-04",
        vote_average: 0,
        popularity: 0,
      },
    ],
  );
});

test("sends a manual TV title using the progress API contract", async () => {
  const originalFetch = globalThis.fetch;
  let captured;
  globalThis.fetch = async (url, init) => {
    captured = { url, init };
    return new Response(
      JSON.stringify({
        item: {
          id: "progress-id",
          tmdbId: 20,
          mediaType: "tv",
          title: "Serie",
        },
      }),
      { status: 201, headers: { "Content-Type": "application/json" } },
    );
  };

  try {
    const result = await addManualProgress({
      id: 20,
      media_type: "tv",
      title: "Serie",
      poster_path: "/poster.jpg",
    });

    assert.equal(captured.url, "/api/progress");
    assert.equal(captured.init.method, "POST");
    assert.deepEqual(JSON.parse(captured.init.body), {
      tmdbId: 20,
      mediaType: "tv",
      title: "Serie",
      posterPath: "/poster.jpg",
    });
    assert.equal(result.id, "progress-id");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

// Un fallo de red y "no tienes nada" NO son lo mismo. Confundirlos es lo que
// vaciaba "Continuar viendo": la lista se quedaba en blanco y, como el vacío se
// guardaba en su caché (que se BORRA al escribir una lista vacía), al volver
// atrás tampoco quedaba nada que pintar.
function conFetch(impl, fn) {
  const original = globalThis.fetch;
  globalThis.fetch = impl;
  return fn().finally(() => {
    globalThis.fetch = original;
  });
}

const ok = (results) =>
  async () => ({ ok: true, json: async () => ({ results }) });

test("por defecto se sigue degradando a lista vacía", async () => {
  // Los consumidores "de adorno" (el % de una ficha, una fila del dashboard)
  // prefieren no romperse: para ellos el comportamiento no cambia.
  await conFetch(
    async () => ({ ok: false, status: 500, json: async () => ({}) }),
    async () => assert.deepEqual(await getLocalInProgress(), []),
  );
  await conFetch(
    async () => {
      throw new Error("red caída");
    },
    async () => assert.deepEqual(await getLocalInProgress(), []),
  );
});

test("con throwOnError, un fallo del servidor se propaga", async () => {
  await conFetch(
    async () => ({ ok: false, status: 502, json: async () => ({}) }),
    async () => {
      await assert.rejects(
        () => getLocalInProgress({ throwOnError: true }),
        /502/,
      );
    },
  );
});

test("con throwOnError, un fallo de red también se propaga", async () => {
  await conFetch(
    async () => {
      throw new Error("Failed to fetch");
    },
    async () => {
      await assert.rejects(
        () => getLocalInProgress({ throwOnError: true }),
        /Failed to fetch/,
      );
    },
  );
});

test("una lista vacía REAL sigue siendo una lista vacía", async () => {
  // Es la distinción que da sentido a todo: si el servidor responde bien y no
  // hay títulos, eso sí es un dato y debe pintarse como "no tienes nada".
  await conFetch(ok([]), async () => {
    assert.deepEqual(await getLocalInProgress({ throwOnError: true }), []);
  });
});

test("las filas se devuelven tal cual cuando la respuesta es buena", async () => {
  const filas = [{ tmdbId: 1, mediaType: "movie" }];
  await conFetch(ok(filas), async () => {
    assert.deepEqual(await getLocalInProgress({ throwOnError: true }), filas);
  });
});
