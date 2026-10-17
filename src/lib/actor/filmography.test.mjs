import assert from "node:assert/strict";
import test from "node:test";

import { buildFilmography, filmographyRoleLabel } from "./filmography.js";

const credits = [
  { id: 1, media_type: "movie", kind: "acting", title: "The Princess Diaries 3", character: "Mia Thermopolis" },
  { id: 2, media_type: "movie", kind: "acting", title: "Verity", character: "Verity Crawford", release_date: "2026-10-02" },
  { id: 3, media_type: "tv", kind: "acting", name: "Jeopardy!", character: "Self - Clue Presenter", episode_count: 1, first_air_date: "1984-09-10" },
  { id: 3, media_type: "tv", kind: "acting", name: "Jeopardy!", character: "Self - Clue Presenter", episode_count: 1, first_air_date: "1984-09-10" },
  { id: 4, media_type: "movie", kind: "acting", title: "The Devil Wears Prada 2", character: "Andy", release_date: "2026-05-01" },
  { id: 5, media_type: "movie", kind: "crew", department: "Production", job: "Producer", title: "Song One", release_date: "2014-01-20" },
  { id: 5, media_type: "movie", kind: "crew", department: "Production", job: "Executive Producer", title: "Song One", release_date: "2014-01-20" },
];

test("agrupa por departamento y año, sin fecha primero y lo reciente arriba", () => {
  const [acting, production] = buildFilmography(credits);
  assert.equal(acting.key, "Acting");
  assert.equal(acting.label, "Actuación");
  assert.deepEqual(acting.years.map((group) => group.year), [null, 2026, 1984]);
  assert.deepEqual(acting.years[1].items.map((item) => item.title), ["Verity", "The Devil Wears Prada 2"]);
  assert.equal(production.label, "Producción");
});

test("un título por departamento: junta papeles, trabajos y episodios", () => {
  const [acting, production] = buildFilmography(credits);
  const jeopardy = acting.years.at(-1).items[0];
  assert.equal(jeopardy.episodes, 2);
  assert.deepEqual(jeopardy.roles, ["Self - Clue Presenter"]);
  const songOne = production.years[0].items[0];
  assert.equal(filmographyRoleLabel(songOne, "Production"), "Producer, Executive Producer");
  assert.equal(filmographyRoleLabel(acting.years[0].items[0], "Acting"), "como Mia Thermopolis");
});

test("filtra por tipo y busca en título y papel", () => {
  assert.deepEqual(buildFilmography(credits, { media: "tv" }).map((group) => group.key), ["Acting"]);
  const [only] = buildFilmography(credits, { query: "andy" });
  assert.equal(only.count, 1);
  assert.equal(only.years[0].items[0].title, "The Devil Wears Prada 2");
  assert.deepEqual(buildFilmography(credits, { query: "zzz" }), []);
});
