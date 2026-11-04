import assert from "node:assert/strict";
import test from "node:test";

import {
  NO_PROVIDER_KEY,
  applyAdvancedFilters,
  buildWatchCountGroupMeta,
  collectGenreOptions,
  createDefaultAdvancedFilters,
  getYearBounds,
  listActiveAdvancedFilters,
  collectLanguageOptions,
  findBulkWatchInstants,
  getWatchTimeParts,
  normalizeAdvancedFilters,
  sortWatchCountGroups,
} from "./advancedFilters.js";

const movie = (id, extra = {}) => ({ id, title: `M${id}`, media_type: "movie", ...extra });
const show = (id, extra = {}) => ({ id, name: `S${id}`, media_type: "tv", ...extra });

const ITEMS = [
  movie(1, { release_date: "1999-03-31", vote_average: 8.2, genre_ids: [28, 878], user_rating: 9 }),
  movie(2, { release_date: "2015-06-01", vote_average: 6.1, genre_ids: [35] }),
  show(3, { first_air_date: "2008-01-20", vote_average: 8.9, genre_ids: [18, 80], user_rating: 10 }),
  show(4, { first_air_date: "", vote_average: 0, genre_ids: [] }),
];
const ids = (items) => items.map((item) => item.id);

test("sin filtros devuelve la misma lista", () => {
  const filters = createDefaultAdvancedFilters();
  assert.equal(applyAdvancedFilters(ITEMS, filters), ITEMS);
  assert.deepEqual(listActiveAdvancedFilters(filters, { yearBounds: [1999, 2015] }), []);
});

test("rangos de nota excluyen títulos sin nota", () => {
  const filters = { ...createDefaultAdvancedFilters(), userRating: [8, 10] };
  assert.deepEqual(ids(applyAdvancedFilters(ITEMS, filters, { getUserRating: (i) => i.user_rating })), [1, 3]);
  const tmdb = { ...createDefaultAdvancedFilters(), tmdbRating: [0, 7] };
  assert.deepEqual(ids(applyAdvancedFilters(ITEMS, tmdb)), [2]);
});

test("año: el rango completo de la lista no cuenta como filtro", () => {
  const bounds = getYearBounds(ITEMS);
  assert.deepEqual(bounds, [1999, 2015]);
  const full = { ...createDefaultAdvancedFilters(), yearRange: [1990, 2030] };
  assert.equal(applyAdvancedFilters(ITEMS, full, { yearBounds: bounds }), ITEMS);
  const part = { ...createDefaultAdvancedFilters(), yearRange: [2000, 2015] };
  assert.deepEqual(ids(applyAdvancedFilters(ITEMS, part, { yearBounds: bounds })), [2, 3]);
  assert.equal(listActiveAdvancedFilters(part, { yearBounds: bounds })[0].label, "2000–2015");
});

test("géneros: basta con uno de los elegidos", () => {
  const filters = { ...createDefaultAdvancedFilters(), genres: [878, 18] };
  assert.deepEqual(ids(applyAdvancedFilters(ITEMS, filters)), [1, 3]);
  assert.equal(collectGenreOptions(ITEMS).length, 5);
});

test("plataformas: sin conocer quedan fuera; «sin plataforma» las vacías", () => {
  const providers = new Map([
    [1, [{ platform_key: "netflix" }]],
    [2, []],
    [3, [{ platform_key: "hbo-max" }, { platform_key: "plex" }]],
  ]);
  const ctx = { getProviders: (item) => providers.get(item.id) };
  const filters = { ...createDefaultAdvancedFilters(), providers: ["plex", NO_PROVIDER_KEY] };
  assert.deepEqual(ids(applyAdvancedFilters(ITEMS, filters, ctx)), [2, 3]);
});

test("visto: no filtra hasta tener el historial; varias veces solo en películas", () => {
  const counts = new Map([[1, 3], [3, 40]]);
  const ctx = { getWatchCount: (item) => counts.get(item.id), watchReady: true };
  const base = createDefaultAdvancedFilters();
  assert.deepEqual(ids(applyAdvancedFilters(ITEMS, { ...base, watched: "watched" }, ctx)), [1, 3]);
  assert.deepEqual(ids(applyAdvancedFilters(ITEMS, { ...base, watched: "unwatched" }, ctx)), [2, 4]);
  assert.deepEqual(ids(applyAdvancedFilters(ITEMS, { ...base, watched: "rewatched" }, ctx)), [1]);
  assert.equal(
    applyAdvancedFilters(ITEMS, { ...base, watched: "watched" }, { ...ctx, watchReady: false }),
    ITEMS,
  );
});

test("agrupar por veces vista", () => {
  const groups = [
    buildWatchCountGroupMeta(movie(1), 0),
    buildWatchCountGroupMeta(movie(2), 1),
    buildWatchCountGroupMeta(show(3), 12),
    buildWatchCountGroupMeta(movie(4), 4),
  ];
  assert.deepEqual(
    sortWatchCountGroups(groups).map((g) => g.label),
    ["Vista 4 veces", "Vista 1 vez", "Series vistas", "Sin ver"],
  );
});

test("normaliza lo guardado", () => {
  const filters = normalizeAdvancedFilters({ userRating: [9, 2], watched: "x", genres: ["18", "a", null] });
  assert.deepEqual(filters.userRating, [2, 9]);
  assert.equal(filters.watched, "all");
  assert.deepEqual(filters.genres, [18, "a"]);
});

test("páginas sin genre_ids/vote_average: getters propios y géneros por nombre", () => {
  const entries = [
    { id: 1, year: 2001, genres: ["Drama"], vote: 7 },
    { id: 2, year: 2010, genres: ["Comedia", "Drama"], vote: 5 },
  ];
  const ctx = {
    getYear: (e) => e.year,
    getGenres: (e) => e.genres,
    getTmdbRating: (e) => e.vote,
    yearBounds: getYearBounds(entries, (e) => e.year),
  };
  assert.deepEqual(ctx.yearBounds, [2001, 2010]);
  const genres = collectGenreOptions(entries, (e) => e.genres);
  assert.deepEqual(genres.map((g) => [g.id, g.count]), [["Drama", 2], ["Comedia", 1]]);
  const base = createDefaultAdvancedFilters();
  assert.deepEqual(ids(applyAdvancedFilters(entries, { ...base, genres: ["Comedia"] }, ctx)), [2]);
  assert.deepEqual(ids(applyAdvancedFilters(entries, { ...base, tmdbRating: [6, 10] }, ctx)), [1]);
  assert.deepEqual(ids(applyAdvancedFilters(entries, { ...base, yearRange: [2005, 2010] }, ctx)), [2]);
  assert.deepEqual(normalizeAdvancedFilters({ genres: ["Drama", "18"] }).genres, ["Drama", 18]);
});

test("idioma, duración, estado y votos", () => {
  const list = [
    movie(1, { original_language: "en", vote_count: 20000 }),
    movie(2, { original_language: "ja", vote_count: 40 }),
    show(3, { original_language: "en", vote_count: 3000 }),
  ];
  const runtime = new Map([[1, 148], [2, 95], [3, 45]]);
  const status = new Map([[3, "Returning Series"]]);
  const ctx = { getRuntime: (i) => runtime.get(i.id), getSeriesStatus: (i) => status.get(i.id) };
  const base = createDefaultAdvancedFilters();
  assert.deepEqual(collectLanguageOptions(list).map((o) => [o.id, o.count]), [["en", 2], ["ja", 1]]);
  assert.deepEqual(ids(applyAdvancedFilters(list, { ...base, originalLanguages: ["ja"] }, ctx)), [2]);
  assert.deepEqual(ids(applyAdvancedFilters(list, { ...base, runtimeRange: [30, 60] }, ctx)), [3]);
  // El tope de la barra es «sin límite»: 148 min entra en «2 h o más».
  assert.deepEqual(ids(applyAdvancedFilters(list, { ...base, runtimeRange: [120, 240] }, ctx)), [1]);
  assert.deepEqual(ids(applyAdvancedFilters(list, { ...base, runtimeRange: [0, 240] }, ctx)), [1, 2, 3]);
  assert.deepEqual(ids(applyAdvancedFilters(list, { ...base, seriesStatus: ["returning"] }, ctx)), [3]);
  assert.deepEqual(ids(applyAdvancedFilters(list, { ...base, minVotes: 1000 }, ctx)), [1, 3]);
  assert.deepEqual(
    listActiveAdvancedFilters({ ...base, minVotes: 1000, originalLanguages: ["ja"] }).map((f) => f.label),
    ["Japonés", "1.000+ votos"],
  );
});

test("visto hace…, estreno, progreso y episodios que faltan", () => {
  const now = Date.parse("2026-11-04T12:00:00Z");
  const list = [
    show(1, { first_air_date: "2027-02-01", last: "2026-11-01T20:00:00Z", pct: 90, left: 2 }),
    show(2, { first_air_date: "2020-01-01", last: "2025-01-01T20:00:00Z", pct: 20, left: 30 }),
    movie(3, { release_date: "" }),
  ];
  const ctx = {
    now,
    getLastWatchedAt: (i) => i.last,
    getProgress: (i) => i.pct,
    getRemaining: (i) => i.left,
  };
  const base = createDefaultAdvancedFilters();
  assert.deepEqual(ids(applyAdvancedFilters(list, { ...base, lastWatched: "week" }, ctx)), [1]);
  assert.deepEqual(ids(applyAdvancedFilters(list, { ...base, lastWatched: "older" }, ctx)), [2]);
  assert.deepEqual(ids(applyAdvancedFilters(list, { ...base, release: "upcoming" }, ctx)), [1, 3]);
  assert.deepEqual(ids(applyAdvancedFilters(list, { ...base, progress: [50, 100] }, ctx)), [1]);
  assert.deepEqual(ids(applyAdvancedFilters(list, { ...base, remaining: ["gt10"] }, ctx)), [2]);
});

test("día y hora del visionado ignoran fechas importadas y marcados en bloque", () => {
  // 12:00 UTC exacto = importado con solo fecha: día UTC, sin hora.
  assert.deepEqual(getWatchTimeParts("2026-03-02T12:00:00.000Z"), { weekday: 1, hour: null });
  assert.equal(getWatchTimeParts("2026-03-02T21:13:05.000Z", { bulk: true }), null);
  const parts = getWatchTimeParts("2026-03-02T21:13:05.000Z");
  assert.equal(typeof parts.hour, "number");
  const bulk = findBulkWatchInstants([
    { watched_at: "a" }, { watched_at: "a" }, { watched_at: "a" }, { watched_at: "b" },
  ]);
  assert.deepEqual([...bulk], ["a"]);
  const entries = [
    { id: 1, parts: { weekday: 6, hour: 22 } },
    { id: 2, parts: { weekday: 2, hour: 9 } },
    { id: 3, parts: { weekday: 6, hour: null } },
  ];
  const ctx = { getWatchParts: (e) => e.parts };
  const base = createDefaultAdvancedFilters();
  assert.deepEqual(ids(applyAdvancedFilters(entries, { ...base, weekdays: [6, 0] }, ctx)), [1, 3]);
  assert.deepEqual(ids(applyAdvancedFilters(entries, { ...base, dayParts: ["evening"] }, ctx)), [1]);
});

test("getMediaType: series con `title` (En progreso, Historial)", () => {
  const list = [{ id: 1, title: "Smallville" }];
  const base = { ...createDefaultAdvancedFilters(), seriesStatus: ["ended"] };
  const ctx = { getSeriesStatus: () => "Ended" };
  assert.deepEqual(ids(applyAdvancedFilters(list, base, ctx)), []);
  assert.deepEqual(ids(applyAdvancedFilters(list, base, { ...ctx, getMediaType: () => "tv" })), [1]);
});
