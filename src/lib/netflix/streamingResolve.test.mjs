import assert from "node:assert/strict";
import test from "node:test";

import {
  resolveStreamingEntity,
  searchTmdbCandidatesWithFallback,
  matchEpisodeByName,
  scoreConfidence,
} from "./streamingResolve.js";

const peakyShow = {
  id: 60574,
  name: "Peaky Blinders",
  original_name: "Peaky Blinders",
};

test("falls back to direct TMDb when the backend search is unavailable", async () => {
  const results = await searchTmdbCandidatesWithFallback({
    mediaType: "tv",
    backendSearch: async () => {
      throw new Error("backend unavailable");
    },
    directSearch: async () => [peakyShow],
  });

  assert.deepEqual(results, [peakyShow]);
});

test("prefers the exact TV title over a related movie when episode numbers are missing", async () => {
  const result = await resolveStreamingEntity({
    query: "Peaky Blinders",
    preferTv: true,
    search: async (mediaType) =>
      mediaType === "tv"
        ? [peakyShow]
        : [
            {
              id: 875828,
              title: "Peaky Blinders: El hombre inmortal",
              original_title: "Peaky Blinders: The Immortal Man",
            },
          ],
  });

  assert.equal(result?.kind, "show_level");
  assert.equal(result?.entity?.id, 60574);
});

test("resolves a detected episode against TV results", async () => {
  const result = await resolveStreamingEntity({
    query: "Peaky Blinders",
    expectedMediaType: "tv",
    search: async () => [peakyShow],
  });

  assert.equal(result?.kind, "resolved");
  assert.equal(result?.mediaType, "tv");
  assert.equal(result?.entity?.id, 60574);
});

test("does not replace an exact movie with a fuzzy TV result", async () => {
  const result = await resolveStreamingEntity({
    query: "Roma",
    preferTv: true,
    search: async (mediaType) =>
      mediaType === "movie"
        ? [{ id: 426426, title: "Roma", original_title: "Roma" }]
        : [{ id: 999, name: "Roma: The Series" }],
  });

  assert.equal(result?.kind, "resolved");
  assert.equal(result?.mediaType, "movie");
  assert.equal(result?.entity?.id, 426426);
});

test("matchEpisodeByName finds S/E by normalized episode title", () => {
  const eps = [
    { season_number: 1, episode_number: 1, name: "Piloto" },
    { season_number: 2, episode_number: 3, name: "El Regreso" },
  ];
  assert.deepEqual(
    matchEpisodeByName({ episodeName: "el regreso", seasonEpisodes: eps }),
    { season: 2, episode: 3 },
  );
  assert.equal(
    matchEpisodeByName({ episodeName: "no existe", seasonEpisodes: eps }),
    null,
  );
  assert.equal(matchEpisodeByName({ episodeName: "", seasonEpisodes: eps }), null);
});

test("scoreConfidence maps title exactness + episode source", () => {
  assert.equal(scoreConfidence({ exactTitle: true, episodeSource: "number" }), "high");
  assert.equal(scoreConfidence({ exactTitle: true, episodeSource: "name" }), "high");
  assert.equal(scoreConfidence({ exactTitle: false, episodeSource: "name" }), "medium");
  assert.equal(scoreConfidence({ exactTitle: false, episodeSource: "heuristic" }), "medium");
  assert.equal(scoreConfidence({ exactTitle: true, episodeSource: "none" }), "low");
});

test("resolveStreamingEntity returns show_level/low when episode unknown", async () => {
  const result = await resolveStreamingEntity({
    query: "Peaky Blinders",
    preferTv: true,
    search: async (mt) => (mt === "tv" ? [peakyShow] : []),
  });
  assert.equal(result.kind, "show_level");
  assert.equal(result.confidence, "low");
  assert.equal(result.entity.id, 60574);
});

test("resolveStreamingEntity attaches high confidence to exact resolved tv", async () => {
  const result = await resolveStreamingEntity({
    query: "Peaky Blinders",
    expectedMediaType: "tv",
    search: async () => [peakyShow],
  });
  assert.equal(result.kind, "resolved");
  assert.equal(result.confidence, "high");
});
