import assert from "node:assert/strict";
import test from "node:test";

import {
  resolveStreamingEntity,
  searchTmdbCandidatesWithFallback,
  matchEpisodeByName,
  scoreConfidence,
  isPlausibleMatch,
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

test("con doble coincidencia exacta (serie y película) elige la más popular: serie", async () => {
  const result = await resolveStreamingEntity({
    query: "Stranger Things",
    search: async (mt) =>
      mt === "tv"
        ? [{ id: 66732, name: "Stranger Things", popularity: 300 }]
        : [{ id: 182026, title: "Stranger Things", popularity: 2 }],
  });
  assert.equal(result?.kind, "show_level");
  assert.equal(result?.entity?.id, 66732);
});

test("con doble coincidencia exacta elige la más popular: película", async () => {
  const result = await resolveStreamingEntity({
    query: "Titanic",
    search: async (mt) =>
      mt === "tv"
        ? [{ id: 1, name: "Titanic", popularity: 3 }]
        : [{ id: 597, title: "Titanic", popularity: 80 }],
  });
  assert.equal(result?.kind, "resolved");
  assert.equal(result?.mediaType, "movie");
  assert.equal(result?.entity?.id, 597);
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

test("normaliza × como x: 'Hunter x Hunter' casa la serie 'Hunter × Hunter'", async () => {
  const result = await resolveStreamingEntity({
    query: "Hunter x Hunter",
    search: async (mt) =>
      mt === "tv"
        ? [{ id: 11827, name: "Hunter × Hunter", popularity: 200 }]
        : [{ id: 981011, title: "Hunter X", popularity: 5 }],
  });
  assert.equal(result?.kind, "show_level");
  assert.equal(result?.entity?.id, 11827);
});

test("sin exacta, elige por popularidad (serie popular sobre película irrelevante)", async () => {
  const result = await resolveStreamingEntity({
    query: "Algo Ambiguo",
    search: async (mt) =>
      mt === "tv"
        ? [{ id: 100, name: "Algo Ambiguo XYZ", popularity: 150 }]
        : [{ id: 200, title: "Algo Ambiguo (peli)", popularity: 3 }],
  });
  assert.equal(result?.kind, "show_level");
  assert.equal(result?.entity?.id, 100);
});

test("con doble coincidencia exacta y duración de película, elige la película aunque la serie sea más popular (bug X-Men)", async () => {
  const result = await resolveStreamingEntity({
    query: "X-Men",
    durationSec: 6240, // ~104 min: la película de 2000
    search: async (mt) =>
      mt === "tv"
        ? [{ id: 4658, name: "X-Men", popularity: 120 }] // serie animada de 1992
        : [{ id: 36657, title: "X-Men", popularity: 40 }],
  });
  assert.equal(result?.kind, "resolved");
  assert.equal(result?.mediaType, "movie");
  assert.equal(result?.entity?.id, 36657);
});

test("con doble coincidencia exacta y duración de episodio, elige la serie aunque la película sea más popular", async () => {
  const result = await resolveStreamingEntity({
    query: "X-Men",
    durationSec: 1320, // ~22 min: episodio de la serie animada
    search: async (mt) =>
      mt === "tv"
        ? [{ id: 4658, name: "X-Men", popularity: 10 }]
        : [{ id: 36657, title: "X-Men", popularity: 90 }],
  });
  assert.equal(result?.kind, "show_level");
  assert.equal(result?.entity?.id, 4658);
});

test("sin duración conocida (resolveOnly), mantiene el desempate por popularidad de siempre", async () => {
  const result = await resolveStreamingEntity({
    query: "X-Men",
    search: async (mt) =>
      mt === "tv"
        ? [{ id: 4658, name: "X-Men", popularity: 120 }]
        : [{ id: 36657, title: "X-Men", popularity: 40 }],
  });
  assert.equal(result?.kind, "show_level");
  assert.equal(result?.entity?.id, 4658);
});

test("isPlausibleMatch: título exacto siempre es plausible aunque no tenga reconocimiento", () => {
  assert.equal(
    isPlausibleMatch({ title: "Roma", popularity: 0, vote_count: 0 }, "Roma", "movie"),
    true,
  );
});

test("isPlausibleMatch rechaza un resultado sin relación textual ni reconocimiento", () => {
  assert.equal(
    isPlausibleMatch(
      { title: "Alguna Película Rara", popularity: 0.6, vote_count: 3 },
      "Cargando contenido",
      "movie",
    ),
    false,
  );
});

test("isPlausibleMatch acepta relación textual por inclusión con reconocimiento suficiente", () => {
  assert.equal(
    isPlausibleMatch(
      { name: "Peaky Blinders", popularity: 55, vote_count: 400 },
      "Peaky Blinders temporada",
      "tv",
    ),
    true,
  );
});

test("resolveStreamingEntity descarta (null) un candidato sin relación real con el texto detectado", async () => {
  const result = await resolveStreamingEntity({
    query: "Cargando contenido",
    search: async (mt) =>
      mt === "movie"
        ? [{ id: 999, title: "Alguna Película Rara", popularity: 0.6, vote_count: 3 }]
        : [],
  });
  assert.equal(result, null);
});

test("resolveStreamingEntity acepta un no-exacto con relación textual y reconocimiento suficiente", async () => {
  const result = await resolveStreamingEntity({
    query: "Peaky Blinders temporada",
    search: async (mt) =>
      mt === "tv"
        ? [{ id: 60574, name: "Peaky Blinders", popularity: 55, vote_count: 400 }]
        : [],
  });
  assert.equal(result?.kind, "show_level");
  assert.equal(result?.entity?.id, 60574);
});

test("matchEpisodeByName casa por substring (título parcial o con prefijo)", () => {
  const eps = [
    { season_number: 4, episode_number: 5, name: "Capítulo cinco: El proyecto Nina" },
  ];
  assert.deepEqual(
    matchEpisodeByName({ episodeName: "El proyecto Nina", seasonEpisodes: eps }),
    { season: 4, episode: 5 },
  );
  assert.deepEqual(
    matchEpisodeByName({ episodeName: "Capítulo cinco: El proyecto Nina", seasonEpisodes: eps }),
    { season: 4, episode: 5 },
  );
});
