import assert from "node:assert/strict";
import test from "node:test";

import {
  resolveStreamingEntity,
  searchTmdbCandidatesWithFallback,
  matchEpisodeByName,
  scoreConfidence,
  isPlausibleMatch,
  reconcileEpisodeNumbers,
  anchorEpisodeByName,
  episodeElsewhereByName,
  pickTmdbResult,
  isExactTitle,
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

// Resultado sin la lista de alternativas (se prueba aparte).
const reconcile = (numbers, seasons) => {
  const out = reconcileEpisodeNumbers(numbers, seasons);
  if (!out) return out;
  const { candidates: _candidates, ...rest } = out;
  return rest;
};

// Temporadas de «Ataque a los Titanes» en TMDb (sin Especiales).
const AOT_SEASONS = [
  { season_number: 1, episode_count: 25 },
  { season_number: 2, episode_count: 12 },
  { season_number: 3, episode_count: 22 },
  { season_number: 4, episode_count: 28 },
];

test("reconcileEpisodeNumbers: el par que existe en TMDb se queda", () => {
  assert.deepEqual(reconcile({ season: 4, episode: 23 }, AOT_SEASONS), { season: 4, episode: 23, via: "as_is" });
  assert.deepEqual(reconcile({ season: 1, episode: 25 }, AOT_SEASONS), { season: 1, episode: 25, via: "as_is" });
});

test("reconcileEpisodeNumbers: la numeración absoluta de Netflix se reparte por temporadas", () => {
  // «Temporada 4 Parte 2» es la temporada 6 de Netflix; el 82 es el S4E23 («Atardecer»).
  assert.deepEqual(reconcile({ season: 6, episode: 82 }, AOT_SEASONS), { season: 4, episode: 23, via: "absolute" });
  // El 76 («El juicio») es el S4E17.
  assert.deepEqual(reconcile({ season: 6, episode: 76 }, AOT_SEASONS), { season: 4, episode: 17, via: "absolute" });
  // Temporada que SÍ existe pero con un número que no le cabe y que, repartido,
  // cae en OTRA temporada (la «Temporada 3 Parte 2» es la 4 de Netflix): absoluto.
  assert.deepEqual(reconcile({ season: 4, episode: 50 }, AOT_SEASONS), { season: 3, episode: 13, via: "absolute" });
  // Si cae en la MISMA temporada, la cuenta de antes puede no cuadrar: dudoso.
  assert.deepEqual(reconcile({ season: 2, episode: 26 }, AOT_SEASONS), { season: 2, episode: 1, via: "absolute_same_season" });
});

test("reconcileEpisodeNumbers: lo ambiguo o imposible no se adivina", () => {
  // Temporada inexistente con un número que cabría en cualquier temporada de una
  // serie con varias: ¿relativo a qué parte?
  assert.equal(reconcile({ season: 6, episode: 7 }, AOT_SEASONS), null);
  // Más episodios que toda la serie.
  assert.equal(reconcile({ season: 6, episode: 120 }, AOT_SEASONS), null);
  assert.equal(reconcile({ season: 1, episode: 3 }, []), null);
  assert.equal(reconcile({ season: null, episode: 3 }, AOT_SEASONS), null);
});

// «Jujutsu Kaisen» en TMDb: una sola temporada de 59 episodios. Netflix la parte en
// dos y su T2:E32 es el S1E32 («El incidente de Shibuya»).
const JJK_SEASONS = [{ season_number: 1, episode_count: 59 }];

test("reconcileEpisodeNumbers: con la posición absoluta del cliente, sin dudas", () => {
  assert.deepEqual(reconcile({ season: 2, episode: 32, absoluteEpisode: 32 }, JJK_SEASONS), { season: 1, episode: 32, via: "absolute" });
  // Netflix empezando la segunda parte en 1: su T2:E8 es la posición 32.
  assert.deepEqual(reconcile({ season: 2, episode: 8, absoluteEpisode: 32 }, JJK_SEASONS), { season: 1, episode: 32, via: "absolute" });
  // En una serie con varias temporadas, igual.
  assert.deepEqual(reconcile({ season: 6, episode: 7, absoluteEpisode: 82 }, AOT_SEASONS), { season: 4, episode: 23, via: "absolute" });
  // Si el par existe en TMDb, manda el par.
  assert.deepEqual(reconcile({ season: 1, episode: 32, absoluteEpisode: 32 }, JJK_SEASONS), { season: 1, episode: 32, via: "as_is" });
  assert.equal(reconcile({ season: 2, episode: 8, absoluteEpisode: 80 }, JJK_SEASONS), null);
});

test("reconcileEpisodeNumbers: sin posición, una serie de una sola temporada se supone absoluta", () => {
  assert.deepEqual(reconcile({ season: 2, episode: 32 }, JJK_SEASONS), { season: 1, episode: 32, via: "absolute_guess" });
  assert.equal(reconcile({ season: 2, episode: 70 }, JJK_SEASONS), null);
});

// «My Hero Academia» en TMDb: 13 + 25 + 25 + 25 antes de la T5. Netflix numera el
// T5·E1 como 93: cuenta 4 episodios más (especiales) en las temporadas anteriores.
const MHA_SEASONS = [
  { season_number: 1, episode_count: 13 },
  { season_number: 2, episode_count: 25 },
  { season_number: 3, episode_count: 25 },
  { season_number: 4, episode_count: 25 },
  { season_number: 5, episode_count: 25 },
  { season_number: 6, episode_count: 25 },
  { season_number: 7, episode_count: 21 },
  { season_number: 8, episode_count: 11 },
];

test("reconcileEpisodeNumbers: misma temporada en las dos, cuenta distinta → posición en la temporada", () => {
  // Con la posición dentro de la temporada (extensión 3.3): T5·E1, no T5·E5.
  assert.deepEqual(
    reconcile({ season: 5, episode: 93, absoluteEpisode: 93, seasonEpisodeIndex: 1 }, MHA_SEASONS),
    { season: 5, episode: 1, via: "aligned" },
  );
  assert.deepEqual(
    reconcile({ season: 5, episode: 97, seasonEpisodeIndex: 5 }, MHA_SEASONS),
    { season: 5, episode: 5, via: "season_index" },
  );
  // Sin ella, el reparto absoluto queda como dudoso (el llamador prueba el nombre).
  assert.deepEqual(reconcile({ season: 5, episode: 93 }, MHA_SEASONS), { season: 5, episode: 5, via: "absolute_same_season" });
  // Una posición que no cabe en la temporada no se usa.
  assert.deepEqual(
    reconcile({ season: 5, episode: 93, seasonEpisodeIndex: 40 }, MHA_SEASONS),
    { season: 5, episode: 5, via: "absolute_same_season" },
  );
});

test("reconcileEpisodeNumbers: temporadas partidas siguen yendo por el reparto absoluto", () => {
  // «Ataque a los Titanes»: Netflix T4 = «Temporada 3 Parte 2»; su 1.er episodio es el 50.
  assert.deepEqual(
    reconcile({ season: 4, episode: 50, absoluteEpisode: 50, seasonEpisodeIndex: 1 }, AOT_SEASONS),
    { season: 3, episode: 13, via: "absolute" },
  );
});

// «Incontrolable» en Movistar+ (2025): TMDb la titula «Incontrolable (I Swear)»
// y existe otra «Incontrôlable» de 2006 que casa exacta sin acentos.
const INCONTROLABLE = [
  { id: 13712, title: "Incontrôlable", original_title: "Incontrôlable", release_date: "2006-03-01", popularity: 2, vote_count: 300 },
  { id: 1317149, title: "Incontrolable (I Swear)", original_title: "I Swear", release_date: "2025-10-10", popularity: 9, vote_count: 80 },
];

test("pickTmdbResult: con año, el exacto de ese año aunque TMDb le añada un paréntesis", () => {
  assert.equal(pickTmdbResult(INCONTROLABLE, "Incontrolable", "movie", { exactOnly: true }).id, 13712);
  assert.equal(pickTmdbResult(INCONTROLABLE, "Incontrolable", "movie", { exactOnly: true, year: 2025 }).id, 1317149);
  // Sin coincidencia de año se queda con el exacto de siempre.
  assert.equal(pickTmdbResult(INCONTROLABLE, "Incontrolable", "movie", { exactOnly: true, year: 1990 }).id, 13712);
  // El paréntesis solo se ignora si el año casa.
  assert.equal(isExactTitle(INCONTROLABLE[1], "Incontrolable", "movie"), false);
  assert.equal(isExactTitle(INCONTROLABLE[1], "Incontrolable", "movie", { year: 2025 }), true);
});

test("resolveStreamingEntity: una película segura no se busca entre series", async () => {
  const searched = [];
  const resolution = await resolveStreamingEntity({
    query: "Incontrolable",
    expectedMediaType: "movie",
    year: 2025,
    search: async (type) => {
      searched.push(type);
      return type === "movie" ? INCONTROLABLE : [{ id: 1, name: "Incontrolable", first_air_date: "2025-01-01", popularity: 99 }];
    },
  });
  assert.deepEqual(searched, ["movie"]);
  assert.deepEqual([resolution.mediaType, resolution.entity.id, resolution.exact], ["movie", 1317149, true]);
});

// «Dragon Ball Z Kai»: TMDb 6 temporadas (26, 26, 25, 20, 35, 26); Netflix 2. El
// T2:E1 de Netflix es el S5E1 de TMDb (posición 98), y Netflix cuenta episodios
// de más antes: su posición puede ser 99 o 102 según la cuenta.
const DBZK_SEASONS = [26, 26, 25, 20, 35, 26].map((episode_count, i) => ({ season_number: i + 1, episode_count }));

test("reconcileEpisodeNumbers: temporadas reagrupadas se alinean por su inicio", () => {
  for (const position of [98, 99, 102]) {
    assert.deepEqual(
      reconcile({ season: 2, episode: position, absoluteEpisode: position, seasonEpisodeIndex: 1 }, DBZK_SEASONS),
      { season: 5, episode: 1, via: "aligned" },
      `posición ${position}`,
    );
  }
  // Netflix numera relativo (T2:E1): el par existe en TMDb pero es OTRO episodio.
  assert.deepEqual(
    reconcile({ season: 2, episode: 1, absoluteEpisode: 102, seasonEpisodeIndex: 1 }, DBZK_SEASONS),
    { season: 5, episode: 1, via: "aligned" },
  );
  // Dentro de la T1 de Netflix (que abarca las T1–T4 de TMDb), por posición.
  assert.deepEqual(
    reconcile({ season: 1, episode: 30, absoluteEpisode: 30, seasonEpisodeIndex: 30 }, DBZK_SEASONS),
    { season: 2, episode: 4, via: "aligned" },
  );
  // Un par que cuadra con su posición se queda tal cual.
  assert.deepEqual(
    reconcile({ season: 1, episode: 5, absoluteEpisode: 5, seasonEpisodeIndex: 5 }, DBZK_SEASONS),
    { season: 1, episode: 5, via: "as_is" },
  );
});

test("reconcileEpisodeNumbers: las alternativas quedan para comprobarlas por nombre", () => {
  const out = reconcileEpisodeNumbers({ season: 2, episode: 102, absoluteEpisode: 102, seasonEpisodeIndex: 1 }, DBZK_SEASONS);
  assert.deepEqual(out.candidates.map((c) => [c.season, c.episode]), [[5, 5]]);
});

test("anchorEpisodeByName: el nombre corrige el desfase cerca del resultado, y solo si es único", () => {
  const episodes = [
    { season_number: 5, episode_number: 1, name: "¡Han transcurrido siete años! El primer día de Gohan en la escuela secundaria" },
    { season_number: 5, episode_number: 2, name: "¡Ha nacido un nuevo héroe! ¡El Gran Saiyaman!" },
    { season_number: 1, episode_number: 1, name: "¡Ha nacido un nuevo héroe! ¡El Gran Saiyaman!" },
  ];
  // Desde un S5E5 calculado, el nombre del S5E1 (a 4 episodios) lo corrige.
  assert.deepEqual(
    anchorEpisodeByName("¡Han transcurrido siete años! El primer día de Gohan en la escuela secundaria", episodes, DBZK_SEASONS, { season: 5, episode: 5 }),
    { season: 5, episode: 1 },
  );
  // Un episodio igual de nombre lejos del resultado no cuenta (fuera de la ventana).
  assert.deepEqual(
    anchorEpisodeByName("¡Ha nacido un nuevo héroe! ¡El Gran Saiyaman!", episodes, DBZK_SEASONS, { season: 5, episode: 5 }),
    { season: 5, episode: 2 },
  );
  assert.equal(anchorEpisodeByName("Otro nombre", episodes, DBZK_SEASONS, { season: 5, episode: 5 }), null);
  assert.equal(anchorEpisodeByName("Episodio 3", episodes, DBZK_SEASONS, { season: 5, episode: 5 }), null);
});

test("episodeElsewhereByName: solo un nombre exacto y único en OTRO episodio cambia el par", () => {
  const episodes = [
    { season_number: 2, episode_number: 1, name: "El regreso de Goku" },
    { season_number: 5, episode_number: 1, name: "¡Han transcurrido siete años!" },
    { season_number: 1, episode_number: 3, name: "Piloto" },
    { season_number: 3, episode_number: 3, name: "Repetido" },
    { season_number: 4, episode_number: 3, name: "Repetido" },
  ];
  assert.deepEqual(episodeElsewhereByName("¡Han transcurrido siete años!", episodes, { season: 2, episode: 1 }), { season: 5, episode: 1 });
  assert.equal(episodeElsewhereByName("El regreso de Goku", episodes, { season: 2, episode: 1 }), null);
  assert.equal(episodeElsewhereByName("Siete años después", episodes, { season: 2, episode: 1 }), null);
  assert.equal(episodeElsewhereByName("Repetido", episodes, { season: 2, episode: 1 }), null);
  assert.equal(episodeElsewhereByName("Piloto", episodes, { season: 2, episode: 1 }), null);
});
