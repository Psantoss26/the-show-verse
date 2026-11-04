import assert from "node:assert/strict";
import test from "node:test";

import { describeIntent, genreIdsFor, parseWatchIntent } from "./watchNextIntent.js";

const NOW = new Date("2026-11-04T12:00:00Z");
const parse = (q) => parseWatchIntent(q, { now: NOW });

test("tipo de título", () => {
  assert.equal(parse("una peli de acción").mediaType, "movie");
  assert.equal(parse("una serie para el finde").mediaType, "tv");
  assert.equal(parse("pelis o series de terror").mediaType, null);
  assert.equal(parse("qué hay en cines").mediaType, "movie");
  assert.equal(parse("una miniserie de crimen").mediaType, "tv");
  // Minutos sin tipo: película (las series se miden por capítulos).
  assert.equal(parse("una comedia de menos de 90 minutos").mediaType, "movie");
  assert.equal(parse("una serie de menos de 30 minutos").mediaType, "tv");
  assert.equal(parse("algo corto").mediaType, null);
});

test("géneros pedidos y excluidos, con negación", () => {
  const a = parse("Serie coreana de misterio sin romance");
  assert.deepEqual(a.genres, ["mystery"]);
  assert.deepEqual(a.excludeGenres, ["romance"]);

  const b = parse("que no sea de miedo ni drama, algo para reír");
  assert.deepEqual(b.genres, ["comedy"]);
  assert.deepEqual(b.excludeGenres.sort(), ["drama", "horror"]);

  // «animado» suelto es un ánimo, no animación.
  assert.deepEqual(parse("algo animado para esta noche").genres, []);
  assert.ok(parse("una peli animada").genres.includes("animation"));
  assert.ok(parse("documental de hechos reales").genres.includes("documentary"));
});

test("ánimos: ligero, llorar, pensar, con niños", () => {
  assert.deepEqual(parse("Una serie ligera para desconectar").moods, ["lighthearted"]);
  assert.ok(parse("algo para llorar").moods.includes("cry"));
  assert.ok(parse("algo que me haga pensar, con giros").moods.includes("mindBending"));
  const kids = parse("pelis para ver con niños");
  assert.ok(kids.moods.includes("kids"));
  // Con niños: familia O animación, y nada de terror; sin nombrarlos.
  assert.deepEqual(kids.genres.sort(), ["animation", "family"]);
  assert.ok(kids.excludeGenres.includes("horror"));
  assert.equal(describeIntent(kids), "películas, para ver con niños");
});

test("duración en minutos, horas y palabras", () => {
  assert.equal(parse("comedia de menos de 90 minutos").runtime.max, 90);
  assert.equal(parse("algo de menos de 2 horas").runtime.max, 120);
  assert.equal(parse("que no pase de una hora y media").runtime.max, 90);
  assert.equal(parse("película de más de 150 min").runtime.min, 150);
  const around = parse("película de 2 horas y media");
  assert.deepEqual([around.runtime.min, around.runtime.max], [135, 165]);
  assert.equal(parse("algo corto").runtime.max, 100);
  assert.equal(parse("una serie con capítulos cortos").runtime.episodes.max, 35);
});

test("nota mínima", () => {
  assert.equal(parse("con más de 7").rating.min, 7);
  assert.equal(parse("nota de 7,5 o más").rating.min, 7.5);
  assert.equal(parse("algo con buena nota").rating.min, 7);
  assert.equal(parse("una obra maestra").rating.min, 7.8);
  // Los minutos no son nota.
  assert.equal(parse("de más de 90 minutos").rating, null);
  assert.equal(parse("de más de 2 horas").rating, null);
});

test("plataformas de España, sin falsos positivos", () => {
  assert.deepEqual(parse("una comedia en Netflix").providers.map((p) => p.key), ["netflix"]);
  assert.deepEqual(
    parse("algo en HBO Max o Disney+").providers.map((p) => p.key).sort(),
    ["disney", "max"],
  );
  assert.deepEqual(parse("anime en Crunchyroll").providers.map((p) => p.key), ["crunchyroll"]);
  assert.deepEqual(parse("de 90 minutos como máximo").providers, []);
  assert.deepEqual(parse("algo que no esté en Netflix").providers, []);
  assert.deepEqual(parse("en Prime Video").providers[0].ids, [119, 2100]);
});

test("cines, época y novedad", () => {
  assert.equal(parse("qué hay en cines de terror").inCinemas, true);
  assert.equal(parse("pelis de los 80").years.from, "1980-01-01");
  assert.equal(parse("thrillers de los 90").years.to, "1999-12-31");
  // «los 10 mejores» y «de 90 minutos» no son décadas.
  assert.equal(parse("los 10 mejores thrillers").years, null);
  assert.equal(parse("una de 90 minutos").years, null);
  assert.equal(parse("de 1996").years.from, "1996-01-01");
  assert.equal(parse("entre 2010 y 2015").years.to, "2015-12-31");
  assert.equal(parse("series nuevas en Disney+").years.recent, true);
  // «algo nuevo» es «que no haya visto», no un estreno.
  assert.equal(parse("algo nuevo que ver").years, null);
  assert.equal(parse("un clásico del western").years.classic, true);
});

test("país o idioma original", () => {
  assert.equal(parse("serie coreana").origin.language, "ko");
  assert.equal(parse("anime").origin.language, "ja");
  assert.equal(parse("una peli española").origin.country, "ES");
});

test("parecida a un título o a mis favoritas", () => {
  assert.deepEqual(parse("Algo parecido a mis favoritas").similar, { favorites: true, title: null });
  assert.equal(parse('parecida a "La casa de papel"').similar.title, "La casa de papel");
  assert.equal(parse("Algo como Dark pero más corto").similar.title, "Dark");
  assert.equal(parse("si me gustó Breaking Bad, ¿qué veo?").similar.title, "Breaking Bad");
  // «como para reír» no es un título.
  assert.equal(parse("algo como para reír").similar, null);
});

test("pendientes, rever, futuro, número de títulos", () => {
  assert.equal(parse("algo para llorar de mis pendientes").onlyWatchlist, true);
  assert.equal(parse("algo que ya haya visto para rever").rewatch, true);
  assert.equal(parse("los próximos estrenos más esperados").future, true);
  assert.equal(parse("recomiéndame 3 series").count, 3);
  assert.equal(parse("dame un par de pelis").count, 2);
});

test("sin criterios no hay filtros", () => {
  const i = parse("Recomiéndame algo");
  assert.equal(i.hasConstraints, false);
  assert.equal(i.hasIntent, false);
});

test("géneros de TMDb por tipo", () => {
  assert.deepEqual(genreIdsFor(["scifi"], "movie"), [878]);
  assert.deepEqual(genreIdsFor(["scifi"], "tv"), [10765]);
  // Las series no tienen terror como género (va por palabra clave).
  assert.deepEqual(genreIdsFor(["horror"], "tv"), []);
});

test("la descripción resume los criterios", () => {
  assert.equal(
    describeIntent(parse("Una comedia en Netflix de menos de 90 minutos con más de 7")),
    "películas de comedia, de 90 min como mucho, nota de 7 o más, en Netflix",
  );
  assert.equal(
    describeIntent(parse("que no sea de miedo ni drama, algo para reír")),
    "títulos de comedia, para reír, sin drama ni terror",
  );
});
