import test from "node:test";
import assert from "node:assert/strict";

import { listZipEntries, parseCsv } from "./letterboxd/export.js";
import { buildExportFiles, createZip, packageExport, toCsv } from "./userExport.js";

const DATA = {
  app: "The Show Verse",
  version: 1,
  exportedAt: "2026-10-14T08:00:00.000Z",
  user: { username: "ana" },
  favorites: [
    { tmdbId: 603, mediaType: "movie", title: "Matrix", originalTitle: "The Matrix", year: 1999, imdbId: "tt0133093", addedAt: "2026-01-02T10:00:00.000Z" },
    { tmdbId: 1396, mediaType: "tv", title: "Breaking Bad", originalTitle: null, year: 2008, imdbId: null, addedAt: "2026-01-01T10:00:00.000Z" },
  ],
  watchlist: [
    { tmdbId: 27205, mediaType: "movie", title: 'Origen, "Inception"', originalTitle: null, year: 2010, imdbId: null, priority: 0, addedAt: null },
  ],
  ratings: [
    { tmdbId: 1396, mediaType: "episode", title: "Breaking Bad", originalTitle: null, year: 2008, imdbId: null, season: 0, episode: 3, rating: 9, ratedAt: "2026-06-18T15:11:15.000Z" },
    { tmdbId: 603, mediaType: "movie", title: "Matrix", originalTitle: "The Matrix", year: 1999, imdbId: "tt0133093", season: null, episode: null, rating: 7.5, ratedAt: "2026-06-01T00:00:00.000Z" },
  ],
};

test("toCsv entrecomilla comas, comillas y saltos de línea", () => {
  const csv = toCsv([["A", (row) => row.a], ["B", (row) => row.b]], [{ a: 'x, "y"', b: null }, { a: "l1\nl2", b: 0 }]);
  assert.equal(csv, 'A,B\r\n"x, ""y""",\r\n"l1\nl2",0\r\n');
});

test("CSV: un archivo por sección con todas las filas; la temporada 0 se conserva", () => {
  const { files, counts } = buildExportFiles(DATA, { format: "csv" });
  assert.deepEqual(files.map((file) => file.name), ["favoritos.csv", "pendientes.csv", "puntuaciones.csv"]);
  assert.deepEqual(counts, { favorites: 2, watchlist: 1, ratings: 2 });
  assert.ok(files[0].text.startsWith("﻿"), "BOM para Excel");

  const ratings = parseCsv(files[2].text.replace(/^﻿/, ""));
  assert.equal(ratings[0].type, "episode");
  assert.equal(ratings[0].season, "0");
  assert.equal(ratings[0].rating10, "9");
  assert.equal(ratings[1].rating10, "7.5");

  const watchlist = parseCsv(files[1].text.replace(/^﻿/, ""));
  assert.equal(watchlist[0].title, 'Origen, "Inception"');
});

test("Letterboxd: solo películas, nota entera y sin BOM", () => {
  const { files, counts } = buildExportFiles(DATA, { format: "letterboxd", sections: ["ratings", "favorites"] });
  assert.deepEqual(files.map((file) => file.name), ["letterboxd-favoritos.csv", "letterboxd-puntuaciones.csv"]);
  assert.deepEqual(counts, { favorites: 1, ratings: 1 });
  assert.ok(!files[0].text.startsWith("﻿"));
  assert.equal(files[1].text.split("\r\n")[0], "tmdbID,imdbID,Title,Year,Rating10");
  assert.equal(files[1].text.split("\r\n")[1], "603,tt0133093,Matrix,1999,8");
});

test("JSON: solo las secciones elegidas", () => {
  const { files } = buildExportFiles(DATA, { format: "json", sections: ["watchlist"] });
  const parsed = JSON.parse(files[0].text);
  assert.equal(parsed.user.username, "ana");
  assert.equal(parsed.watchlist.length, 1);
  assert.equal("favorites" in parsed, false);
  assert.equal("ratings" in parsed, false);
});

test("createZip se puede volver a leer con el lector de ZIP de la app", async () => {
  const files = [
    { name: "favoritos.csv", text: "Title\r\nAmélie\r\n" },
    { name: "puntuaciones.csv", text: "Title,Rating10\r\nMatrix,9\r\n" },
  ];
  const zip = createZip(files, new Date(2026, 9, 14, 12, 30, 10));
  const entries = listZipEntries(zip.buffer);
  assert.deepEqual(entries.map((entry) => entry.name), ["favoritos.csv", "puntuaciones.csv"]);
  const decoder = new TextDecoder();
  assert.equal(decoder.decode(await entries[0].read()), "Title\r\nAmélie\r\n");
  assert.equal(decoder.decode(await entries[1].read()), "Title,Rating10\r\nMatrix,9\r\n");
});

test("packageExport: un CSV va suelto, varios en ZIP y el JSON con fecha", () => {
  const date = new Date(2026, 9, 14);
  assert.equal(
    packageExport([{ name: "favoritos.csv", text: "a" }], { format: "csv", date }).name,
    "the-show-verse-favoritos-2026-10-14.csv",
  );
  const zip = packageExport(
    [{ name: "letterboxd-favoritos.csv", text: "a" }, { name: "letterboxd-pendientes.csv", text: "b" }],
    { format: "letterboxd", date },
  );
  assert.equal(zip.name, "the-show-verse-letterboxd-2026-10-14.zip");
  assert.equal(zip.blob.type, "application/zip");
  assert.equal(
    packageExport([{ name: "the-show-verse.json", text: "{}" }], { format: "json", date }).name,
    "the-show-verse-2026-10-14.json",
  );
});
