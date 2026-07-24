import assert from "node:assert/strict";
import test from "node:test";

import {
  addManualProgress,
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
