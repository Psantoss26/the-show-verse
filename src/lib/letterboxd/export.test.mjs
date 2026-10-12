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
  });
  assert.equal(listZipEntries(zip).length, 4);
  const file = { name: "letterboxd-export.zip", arrayBuffer: async () => zip };
  const texts = await readLetterboxdFiles([file]);
  assert.deepEqual(Object.keys(texts).sort(), ["diary.csv", "ratings.csv"]);
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
