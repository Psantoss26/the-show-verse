import { test } from "node:test";
import assert from "node:assert/strict";
import { deflateRawSync } from "node:zlib";
import {
  buildLetterboxdImport,
  chunkLetterboxdImport,
  letterboxdRating,
  listZipEntries,
  parseCsv,
  readLetterboxdFiles,
} from "./export.js";
import { pickLetterboxdMatch } from "./resolve.js";

const DIARY = `Date,Name,Year,Letterboxd URI,Rating,Rewatch,Tags,Watched Date
2023-05-15,"Crouching Tiger, Hidden Dragon",2000,https://boxd.it/a,4.5,,,2023-05-14
2024-01-02,The Matrix,1999,https://boxd.it/b,5,Yes,,2024-01-01
2019-03-03,The Matrix,1999,https://boxd.it/c,4,,,2019-03-03
`;
const WATCHED = `Date,Name,Year,Letterboxd URI
2020-02-02,The Matrix,1999,https://boxd.it/m
2020-02-03,Amélie,2001,https://boxd.it/n
`;
const RATINGS = `Date,Name,Year,Letterboxd URI,Rating
2024-01-02,The Matrix,1999,https://boxd.it/m,5
2021-07-07,Amélie,2001,https://boxd.it/n,3.5
`;

const LIKES = `Date,Name,Year,Letterboxd URI
2022-03-03,Amélie,2001,https://boxd.it/n
`;
const WATCHLIST = `Date,Name,Year,Letterboxd URI
2024-02-02,Paris\, Texas,1984,https://boxd.it/p
2024-02-03,Paris\, Texas,1984,https://boxd.it/p
`;

// ZIP mínimo (deflate) para probar el lector.
function makeZip(files) {
  const encoder = new TextEncoder();
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const [name, text] of Object.entries(files)) {
    const nameBytes = encoder.encode(name);
    const data = deflateRawSync(Buffer.from(text));
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt16LE(nameBytes.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(local, nameBytes, data);
    centrals.push(central, nameBytes);
    offset += 30 + nameBytes.length + data.length;
  }
  const centralSize = centrals.reduce((sum, part) => sum + part.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(Object.keys(files).length, 8);
  end.writeUInt16LE(Object.keys(files).length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  const buffer = Buffer.concat([...locals, ...centrals, end]);
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.length);
}

test("lee los CSV de la raíz del ZIP y no los de deleted/ ni lists/", async () => {
  const zip = makeZip({
    "diary.csv": DIARY,
    "deleted/diary.csv": "Date,Name\n2000-01-01,Nope\n",
    "lists/ratings.csv": "x",
    "ratings.csv": RATINGS,
    "likes/films.csv": LIKES,
    "watchlist.csv": WATCHLIST,
  });
  assert.equal(listZipEntries(zip).length, 6);
  const file = { name: "letterboxd-export.zip", arrayBuffer: async () => zip };
  const texts = await readLetterboxdFiles([file]);
  assert.deepEqual(Object.keys(texts).sort(), ["diary.csv", "likes/films.csv", "ratings.csv", "watchlist.csv"]);
  assert.equal(texts["diary.csv"], DIARY);
});

test("parsea CSV con comillas y BOM", () => {
  const rows = parseCsv(`﻿${DIARY}`);
  assert.equal(rows[0].name, "Crouching Tiger, Hidden Dragon");
  assert.equal(rows[0]["watched date"], "2023-05-14");
});

test("estrellas a 1–10", () => {
  assert.equal(letterboxdRating("0.5"), 1);
  assert.equal(letterboxdRating("3.5"), 7);
  assert.equal(letterboxdRating("5"), 10);
  assert.equal(letterboxdRating(""), null);
});

test("diario como historial, vistas sin diario sin fecha y puntuaciones", () => {
  const data = buildLetterboxdImport({ "diary.csv": DIARY, "watched.csv": WATCHED, "ratings.csv": RATINGS });
  assert.equal(data.films.length, 3);
  assert.deepEqual(
    data.history.map((item) => [item.film, item.watchedAt.slice(0, 10), item.rewatch, item.undated]),
    [
      ["crouching tiger hidden dragon|2000", "2023-05-14", false, false],
      ["the matrix|1999", "2024-01-01", true, false],
      ["the matrix|1999", "2019-03-03", false, false],
      ["amelie|2001", "2020-02-03", false, true],
    ],
  );
  const ratings = Object.fromEntries(data.ratings.map((item) => [item.film, item.rating]));
  // Sin ratings.csv para Tigre y Dragón: la del diario.
  assert.deepEqual(ratings, { "the matrix|1999": 10, "amelie|2001": 7, "crouching tiger hidden dragon|2000": 9 });

  const chunks = chunkLetterboxdImport(data, 2);
  assert.equal(chunks.length, 2);
  assert.equal(chunks[0].history.length, 3);
  assert.equal(chunks[1].films[0].key, "amelie|2001");
  assert.equal(chunks[1].ratings[0].rating, 7);
});

test("elige la película de TMDb por título y año", () => {
  const results = [
    { id: 1, title: "Matrix", original_title: "The Matrix", release_date: "2021-12-22" },
    { id: 2, title: "Matrix", original_title: "The Matrix", release_date: "1999-03-30" },
    { id: 3, title: "Otra", original_title: "Other", release_date: "1999-01-01" },
  ];
  assert.equal(pickLetterboxdMatch(results, { name: "The Matrix", year: 1999 }).id, 2);
  assert.equal(pickLetterboxdMatch(results, { name: "Nada que ver", year: 2010 }), null);
  assert.equal(pickLetterboxdMatch([{ id: 4, title: "Festival", release_date: "2001-01-01" }], { name: "Festival cut", year: 2000 }).id, 4);
  assert.equal(pickLetterboxdMatch([{ id: 5, title: "Distinta" }], { name: "Sin año" }), null);
});

test("solo envía visionados y notas nuevos o cambiados", async () => {
  const { pendingLetterboxdImport, letterboxdChunkKeys } = await import("./export.js");
  const data = buildLetterboxdImport({ "diary.csv": DIARY, "watched.csv": WATCHED, "ratings.csv": RATINGS });
  const first = pendingLetterboxdImport(data, new Set());
  assert.equal(first.films.length, 3);
  const synced = new Set(letterboxdChunkKeys(first));
  assert.equal(pendingLetterboxdImport(data, synced).films.length, 0);

  // Cambia la nota de Amélie y se registra un visionado nuevo de Heat.
  const changed = buildLetterboxdImport({
    "diary.csv": `${DIARY}2025-01-01,Heat,1995,x,,,,2025-01-01\n`,
    "watched.csv": WATCHED,
    "ratings.csv": RATINGS.replace("Amélie,2001,https://boxd.it/n,3.5", "Amélie,2001,https://boxd.it/n,5"),
  });
  const next = pendingLetterboxdImport(changed, synced);
  assert.deepEqual(next.films.map((film) => film.key).sort(), ["amelie|2001", "heat|1995"]);
  assert.deepEqual(next.ratings.map((item) => [item.film, item.rating]), [["amelie|2001", 10]]);
  assert.deepEqual(next.history.map((item) => item.watchedAt.slice(0, 10)), ["2025-01-01"]);
});

test("likes como favoritas y watchlist como pendientes, en sus tandas", async () => {
  const { pendingLetterboxdImport, letterboxdChunkKeys } = await import("./export.js");
  const csvWatchlist = 'Date,Name,Year,Letterboxd URI\n2024-02-02,"Paris, Texas",1984,x\n2024-02-03,"Paris, Texas",1984,x\n';
  const data = buildLetterboxdImport({ "ratings.csv": RATINGS, "likes/films.csv": LIKES, "watchlist.csv": csvWatchlist });
  assert.deepEqual(data.favorites, [{ film: "amelie|2001", addedAt: "2022-03-03T12:00:00.000Z" }]);
  assert.deepEqual(data.watchlist, [{ film: "paris texas|1984", addedAt: "2024-02-02T12:00:00.000Z" }]);
  const [chunk] = chunkLetterboxdImport(data);
  assert.equal(chunk.favorites.length, 1);
  assert.equal(chunk.watchlist.length, 1);
  const synced = new Set(letterboxdChunkKeys(chunk));
  assert.equal(pendingLetterboxdImport(data, synced).films.length, 0);
});

test("CSV sueltos: films.csv son los likes", async () => {
  const file = (name, text) => ({ name, text: async () => text });
  const texts = await readLetterboxdFiles([file("films.csv", LIKES), file("watchlist.csv", "a")]);
  assert.deepEqual(Object.keys(texts).sort(), ["likes/films.csv", "watchlist.csv"]);
});

const REVIEWS = `Date,Name,Year,Letterboxd URI,Rating,Rewatch,Review,Tags,Watched Date
2024-01-02,The Matrix,1999,https://boxd.it/r1,5,Yes,"<p>Still <i>perfect</i> &amp; loud.</p><p>Second line<br />third</p>",,2024-01-01
2019-03-04,The Matrix,1999,https://boxd.it/r2,4,,First watch,,2019-03-03
2021-07-07,Amélie,2001,https://boxd.it/r3,3.5,,"   ",,2021-07-07
`;

test("reseñas: una por entrada, en texto plano y con su fecha", async () => {
  const { letterboxdChunkKeys, pendingLetterboxdImport } = await import("./export.js");
  const zip = makeZip({
    "reviews.csv": REVIEWS,
    "deleted/reviews.csv": "Date,Name\n2000-01-01,Nope\n",
  });
  const texts = await readLetterboxdFiles([{ name: "letterboxd.zip", arrayBuffer: async () => zip }]);
  assert.deepEqual(Object.keys(texts), ["reviews.csv"]);

  const data = buildLetterboxdImport(texts);
  assert.deepEqual(
    data.reviews.map((item) => [item.film, item.body, item.reviewedAt.slice(0, 10), item.uri]),
    [
      ["the matrix|1999", "Still perfect & loud.\n\nSecond line\nthird", "2024-01-02", "https://boxd.it/r1"],
      ["the matrix|1999", "First watch", "2019-03-04", "https://boxd.it/r2"],
    ],
  );
  assert.equal(data.reviews[0].spoiler, false);

  const [chunk] = chunkLetterboxdImport(data);
  assert.equal(chunk.reviews.length, 2);
  const synced = new Set(letterboxdChunkKeys(chunk));
  assert.equal(pendingLetterboxdImport(data, synced).reviews.length, 0);
});

test("reseñas sueltas y recorte al máximo", async () => {
  const { letterboxdReviewBody, LETTERBOXD_REVIEW_MAX } = await import("./export.js");
  const texts = await readLetterboxdFiles([{ name: "reviews.csv", text: async () => REVIEWS }]);
  assert.deepEqual(Object.keys(texts), ["reviews.csv"]);
  const long = letterboxdReviewBody("a".repeat(LETTERBOXD_REVIEW_MAX + 50));
  assert.equal(long.length, LETTERBOXD_REVIEW_MAX);
  assert.ok(long.endsWith("…"));
  assert.equal(letterboxdReviewBody("x &#128512; &#99999999; y"), "x 😀 &#99999999; y");
});

test("resolución: no acepta una ficha casi vacía solo porque coincide el año", async () => {
  const { resolveLetterboxdFilm } = await import("./resolve.js");
  // Respuestas reales de TMDb (es-ES/en-US) para cada intento.
  const catalog = {
    "The Gentlemen": ({ primary_release_year, language }) =>
      primary_release_year === 2019
        ? [{ id: 991530, title: "Gentlemen Of The World", original_title: "Gentlemen Of The World", release_date: "2019-06-24", vote_count: 1 }]
        : [{ id: 522627, title: language === "en-US" ? "The Gentlemen" : "The Gentlemen: Los señores de la mafia", original_title: "The Gentlemen", release_date: "2020-01-01", vote_count: 6000 }],
    300: ({ primary_release_year }) =>
      primary_release_year === 2006
        ? [{ id: 719963, title: "Home Movies 300-1", original_title: "Home Movies 300-1", release_date: "2006-01-01", vote_count: 0 }]
        : [{ id: 1271, title: "300", original_title: "300", release_date: "2007-03-07", vote_count: 14000 }],
    Snowpiercer: ({ language }) =>
      language === "en-US"
        ? [{ id: 110415, title: "Snowpiercer", original_title: "설국열차", release_date: "2013-08-01", vote_count: 10000 }]
        : [
            { id: 612154, title: "Snowpiercer International Special Animation", original_title: "Snowpiercer International Special Animation", release_date: "2013-01-01", vote_count: 2 },
            { id: 110415, title: "Rompenieves", original_title: "설국열차", release_date: "2013-08-01", vote_count: 10000 },
          ],
    "Spirited Away": () => [{ id: 129, title: "El viaje de Chihiro", original_title: "千と千尋の神隠し", release_date: "2001-07-20", vote_count: 17000 }],
  };
  const search = async (query, params) => catalog[query]?.(params) || [];
  const details = async (id) => ({ 110415: { title: "Rompenieves", poster_path: "/es.jpg" }, 522627: { title: "The Gentlemen: Los señores de la mafia" } })[id] || null;

  assert.equal((await resolveLetterboxdFilm({ name: "The Gentlemen", year: 2019 }, { search, details })).tmdbId, 522627);
  assert.equal((await resolveLetterboxdFilm({ name: "300", year: 2006 }, { search, details })).tmdbId, 1271);
  const snow = await resolveLetterboxdFilm({ name: "Snowpiercer", year: 2013 }, { search, details });
  assert.deepEqual(snow, { tmdbId: 110415, title: "Rompenieves", posterPath: "/es.jpg" });
  // Sin coincidencia de título pero conocida y del mismo año: se acepta.
  assert.equal((await resolveLetterboxdFilm({ name: "Spirited Away", year: 2001 }, { search: async (q, p) => (p.language === "es-ES" ? catalog["Spirited Away"]() : []), details })).tmdbId, 129);
});
