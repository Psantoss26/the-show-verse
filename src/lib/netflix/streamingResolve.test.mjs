import assert from "node:assert/strict";
import test from "node:test";

import {
  resolveStreamingEntity,
  searchTmdbCandidatesWithFallback,
  matchEpisodeByName,
  scoreConfidence,
  isPlausibleMatch,
  reconcileEpisodeNumbers,
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


test("episode numbers never authorize an unrelated TV search result", async () => {
  const result = await resolveStreamingEntity({
    query: "Texto ilegible del reproductor", expectedMediaType: "tv",
    search: async () => [peakyShow],
  });
  assert.equal(result, null);
});

test("an ambiguous episode name is left unresolved", () => {
  assert.equal(matchEpisodeByName({ episodeName: "Piloto", seasonEpisodes: [
    { season_number: 1, episode_number: 1, name: "Piloto" },
    { season_number: 2, episode_number: 1, name: "Piloto" },
  ] }), null);
});

test("isPlausibleMatch no acepta un título corto metido dentro de una frase", () => {
  // Un episodio de Netflix ("Capítulo cinco: La Nina") no es la serie "La Niña".
  assert.equal(
    isPlausibleMatch({ name: "La Niña", popularity: 40, vote_count: 300 }, "Capítulo cinco: La Nina", "tv"),
    false,
  );
  // Ni el nombre de un episodio de anime es la serie que comparte una palabra.
  assert.equal(
    isPlausibleMatch({ name: "Promesa", popularity: 40, vote_count: 300 }, "E12 - La promesa de los mil años", "tv"),
    false,
  );
  // Un sufijo corto sigue casando.
  assert.equal(
    isPlausibleMatch({ name: "The Office", popularity: 90, vote_count: 3000 }, "The Office (US)", "tv"),
    true,
  );
});

// Temporadas de «Ataque a los Titanes» en TMDb (sin Especiales).
const AOT_SEASONS = [
  { season_number: 1, episode_count: 25 },
  { season_number: 2, episode_count: 12 },
  { season_number: 3, episode_count: 22 },
  { season_number: 4, episode_count: 28 },
];

test("reconcileEpisodeNumbers: el par que existe en TMDb se queda", () => {
  assert.deepEqual(reconcileEpisodeNumbers({ season: 4, episode: 23 }, AOT_SEASONS), { season: 4, episode: 23, via: "as_is" });
  assert.deepEqual(reconcileEpisodeNumbers({ season: 1, episode: 25 }, AOT_SEASONS), { season: 1, episode: 25, via: "as_is" });
});

test("reconcileEpisodeNumbers: la numeración absoluta de Netflix se reparte por temporadas", () => {
  // «Temporada 4 Parte 2» es la temporada 6 de Netflix; el 82 es el S4E23 («Atardecer»).
  assert.deepEqual(reconcileEpisodeNumbers({ season: 6, episode: 82 }, AOT_SEASONS), { season: 4, episode: 23, via: "absolute" });
  // El 76 («El juicio») es el S4E17.
  assert.deepEqual(reconcileEpisodeNumbers({ season: 6, episode: 76 }, AOT_SEASONS), { season: 4, episode: 17, via: "absolute" });
  // Temporada que SÍ existe pero con un número que no le cabe: también absoluto.
  assert.deepEqual(reconcileEpisodeNumbers({ season: 2, episode: 26 }, AOT_SEASONS), { season: 2, episode: 1, via: "absolute" });
  assert.deepEqual(reconcileEpisodeNumbers({ season: 4, episode: 50 }, AOT_SEASONS), { season: 3, episode: 13, via: "absolute" });
});

test("reconcileEpisodeNumbers: lo ambiguo o imposible no se adivina", () => {
  // Temporada inexistente con un número que cabría en cualquier temporada de una
  // serie con varias: ¿relativo a qué parte?
  assert.equal(reconcileEpisodeNumbers({ season: 6, episode: 7 }, AOT_SEASONS), null);
  // Más episodios que toda la serie.
  assert.equal(reconcileEpisodeNumbers({ season: 6, episode: 120 }, AOT_SEASONS), null);
  assert.equal(reconcileEpisodeNumbers({ season: 1, episode: 3 }, []), null);
  assert.equal(reconcileEpisodeNumbers({ season: null, episode: 3 }, AOT_SEASONS), null);
});

// «Jujutsu Kaisen» en TMDb: una sola temporada de 59 episodios. Netflix la parte en
// dos y su T2:E32 es el S1E32 («El incidente de Shibuya»).
const JJK_SEASONS = [{ season_number: 1, episode_count: 59 }];

test("reconcileEpisodeNumbers: con la posición absoluta del cliente, sin dudas", () => {
  assert.deepEqual(reconcileEpisodeNumbers({ season: 2, episode: 32, absoluteEpisode: 32 }, JJK_SEASONS), { season: 1, episode: 32, via: "absolute" });
  // Netflix empezando la segunda parte en 1: su T2:E8 es la posición 32.
  assert.deepEqual(reconcileEpisodeNumbers({ season: 2, episode: 8, absoluteEpisode: 32 }, JJK_SEASONS), { season: 1, episode: 32, via: "absolute" });
  // En una serie con varias temporadas, igual.
  assert.deepEqual(reconcileEpisodeNumbers({ season: 6, episode: 7, absoluteEpisode: 82 }, AOT_SEASONS), { season: 4, episode: 23, via: "absolute" });
  // Si el par existe en TMDb, manda el par.
  assert.deepEqual(reconcileEpisodeNumbers({ season: 1, episode: 32, absoluteEpisode: 32 }, JJK_SEASONS), { season: 1, episode: 32, via: "as_is" });
  assert.equal(reconcileEpisodeNumbers({ season: 2, episode: 8, absoluteEpisode: 80 }, JJK_SEASONS), null);
});

test("reconcileEpisodeNumbers: sin posición, una serie de una sola temporada se supone absoluta", () => {
  assert.deepEqual(reconcileEpisodeNumbers({ season: 2, episode: 32 }, JJK_SEASONS), { season: 1, episode: 32, via: "absolute_guess" });
  assert.equal(reconcileEpisodeNumbers({ season: 2, episode: 70 }, JJK_SEASONS), null);
});
