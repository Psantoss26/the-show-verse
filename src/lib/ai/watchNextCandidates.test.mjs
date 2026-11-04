import assert from "node:assert/strict";
import test from "node:test";

import { parseWatchIntent } from "./watchNextIntent.js";
import {
  buildDiscoverQueries,
  checkCandidate,
  scoreCandidate,
  weightedRating,
} from "./watchNextCandidates.js";

const TODAY = new Date("2026-11-04T12:00:00Z");
const parse = (q) => parseWatchIntent(q, { now: TODAY });
const queriesFor = (q) => buildDiscoverQueries(parse(q), { today: TODAY });

test("la búsqueda de TMDb lleva plataforma, minutos, nota y género", () => {
  const qs = queriesFor("Una comedia en Netflix de menos de 90 minutos con más de 7");
  const movie = qs.find((q) => q.mediaType === "movie");
  assert.equal(movie.params.with_genres, "35");
  assert.equal(movie.params.with_watch_providers, "8|1796");
  assert.equal(movie.params.watch_region, "ES");
  assert.equal(movie.params["with_runtime.lte"], 90);
  assert.equal(movie.params["vote_average.gte"], 7);
  assert.ok(movie.params["vote_count.gte"] >= 150, "con nota mínima, votos de sobra");
  // Nunca sin estrenar.
  assert.equal(movie.params["primary_release_date.lte"], "2026-11-04");
  assert.deepEqual(movie.verifies.sort(), ["genres", "providers", "rating", "runtime"]);
  // Minutos sin tipo: solo películas.
  assert.ok(qs.every((q) => q.mediaType === "movie"));
  // En series los minutos son del episodio, y «serie corta» no los limita.
  const tv = queriesFor("una serie de comedia de menos de 30 minutos").find((q) => q.mediaType === "tv");
  assert.equal(tv.params["with_runtime.lte"], 30);
});

test("series de terror por palabra clave (no hay género de terror en series)", () => {
  const tv = queriesFor("una serie de terror").find((q) => q.mediaType === "tv");
  assert.equal(tv.params.with_keywords, "315058");
  assert.equal(tv.params.with_genres, undefined);
});

test("varios géneros: todos a la vez y cualquiera", () => {
  const variants = queriesFor("una peli de comedia y romance")
    .filter((q) => q.params.page === 1 && q.params.sort_by === "popularity.desc")
    .map((q) => q.params.with_genres);
  assert.deepEqual(variants, ["35,10749", "35|10749"]);
});

test("excluidos, idioma, época y cines", () => {
  const korean = queriesFor("serie coreana de misterio sin romance").find((q) => q.mediaType === "tv");
  assert.equal(korean.params.with_original_language, "ko");
  assert.equal(korean.params.with_genres, "9648");
  // Sin género de romance en series: el excluido no va a TMDb, se filtra después.
  assert.equal(korean.params.without_genres, undefined);

  const eighties = queriesFor("pelis de los 80").find((q) => q.mediaType === "movie");
  assert.equal(eighties.params["primary_release_date.gte"], "1980-01-01");
  assert.equal(eighties.params["primary_release_date.lte"], "1989-12-31");

  const cinema = queriesFor("qué hay en cines de terror");
  assert.ok(cinema.every((q) => q.mediaType === "movie"));
  assert.ok(cinema.some((q) => q.verifies.includes("cinema") && q.params.with_genres === "27"));
});

test("con niños: familia o animación y sin terror", () => {
  const movie = queriesFor("algo para ver con niños").find((q) => q.mediaType === "movie" && q.genreMatch === "any");
  assert.equal(movie.params.with_genres, "10751|16");
  assert.equal(movie.params.without_genres, "27");
});

test("serie corta favorece miniseries sin limitar el episodio", () => {
  const qs = queriesFor("una serie corta");
  assert.ok(qs.some((q) => q.verifies.includes("miniseries") && q.params.with_keywords === "11162"));
  assert.ok(qs.every((q) => q.params["with_runtime.lte"] === undefined));
});

const base = {
  id: 1,
  mediaType: "movie",
  genreIds: [35],
  voteAverage: 7.4,
  voteCount: 3000,
  releaseDate: "2019-05-01",
  sources: ["trakt_trending"],
};

test("el filtro descarta lo que no cumple y no se puede comprobar", () => {
  const intent = parse("Una comedia en Netflix de menos de 90 minutos con más de 7");
  // De tendencias: sin plataforma ni minutos conocidos → fuera.
  assert.deepEqual(checkCandidate(base, intent, { today: TODAY }).missing.sort(), ["providers", "runtime"]);
  // Con su ficha pedida: dentro.
  assert.equal(
    checkCandidate({ ...base, runtime: 88, providerIds: [8] }, intent, { today: TODAY }).ok,
    true,
  );
  // De la búsqueda que ya lo garantiza: dentro.
  assert.equal(
    checkCandidate({ ...base, verified: ["providers", "runtime", "genres", "rating"] }, intent, { today: TODAY }).ok,
    true,
  );
});

test("excluidos y sin estrenar quedan fuera en cualquier nivel", () => {
  const intent = parse("algo para reír sin terror");
  const horror = { ...base, genreIds: [35, 27] };
  assert.ok(checkCandidate(horror, intent, { today: TODAY, level: 2 }).missing.includes("excludeGenres"));
  const unreleased = { ...base, releaseDate: "2027-03-01" };
  assert.ok(checkCandidate(unreleased, parse("una comedia"), { today: TODAY, level: 2 }).missing.includes("unreleased"));
  assert.equal(checkCandidate(unreleased, parse("los próximos estrenos de comedia"), { today: TODAY }).ok, true);
});

test("al relajar se deja de exigir primero nota y época, luego géneros", () => {
  const intent = parse("comedia de los 80 con más de 8");
  const modern = { ...base, voteAverage: 7.1, releaseDate: "2015-01-01" };
  assert.deepEqual(checkCandidate(modern, intent, { today: TODAY }).missing.sort(), ["rating", "years"]);
  assert.equal(checkCandidate(modern, intent, { today: TODAY, level: 1 }).ok, true);
  const drama = { ...modern, genreIds: [18] };
  assert.ok(checkCandidate(drama, intent, { today: TODAY, level: 1 }).missing.includes("genres"));
  assert.equal(checkCandidate(drama, intent, { today: TODAY, level: 2 }).ok, true);
});

test("de mis pendientes: solo lo que está en Pendientes", () => {
  const intent = parse("algo para llorar de mis pendientes");
  assert.ok(checkCandidate(base, intent, { today: TODAY, level: 2 }).missing.includes("watchlist"));
  assert.equal(checkCandidate({ ...base, sources: ["watchlist"] }, intent, { today: TODAY }).ok, true);
});

test("la nota pondera los votos", () => {
  assert.ok(weightedRating({ voteAverage: 8.2, voteCount: 20000 }) > weightedRating({ voteAverage: 9.5, voteCount: 12 }));
});

test("la puntuación premia encaje, pendientes y penaliza lo visto", () => {
  const intent = parse("una comedia");
  const ctx = { watchedSet: new Set(), recentKeySet: new Set() };
  const comedy = scoreCandidate(base, intent, ctx);
  const drama = scoreCandidate({ ...base, genreIds: [18] }, intent, ctx);
  assert.ok(comedy > drama);
  const pending = scoreCandidate({ ...base, sources: ["watchlist"] }, intent, ctx);
  assert.ok(pending > comedy);
  const watched = scoreCandidate(base, intent, { ...ctx, watchedSet: new Set(["movie:1"]) });
  assert.ok(watched < comedy - 100);
  // Ánimo ligero: el terror baja.
  const light = parse("algo ligero");
  assert.ok(scoreCandidate({ ...base, genreIds: [27] }, light, ctx) < scoreCandidate(base, light, ctx));
});

test("excluir un género que las series no tienen no quita sus aproximados", () => {
  const intent = parse("serie coreana de misterio sin romance");
  const mysteryDrama = { ...base, mediaType: "tv", genreIds: [9648, 18], originalLanguage: "ko" };
  assert.equal(checkCandidate(mysteryDrama, intent, { today: TODAY }).ok, true);
});

test("«parecida a…»: solo similares y Pendientes que no se parecen suman poco", () => {
  const intent = { ...parse("algo parecido a mis favoritas"), requireSimilar: true };
  assert.ok(checkCandidate({ ...base, sources: ["watchlist"] }, intent, { today: TODAY }).missing.includes("similar"));
  assert.equal(checkCandidate({ ...base, sources: ["similar_favorites"] }, intent, { today: TODAY }).ok, true);
  const ctx = { watchedSet: new Set(), recentKeySet: new Set() };
  const pendingOnly = scoreCandidate({ ...base, sources: ["watchlist"] }, intent, ctx);
  const similarOnly = scoreCandidate({ ...base, sources: ["similar_favorites"] }, intent, ctx);
  assert.ok(similarOnly > pendingOnly);
});
