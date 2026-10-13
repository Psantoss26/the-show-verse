import { test } from "node:test";
import assert from "node:assert/strict";
import { deflateRawSync } from "node:zlib";
import {
  buildImdbImport,
  chunkImdbImport,
  classifyImdbCsv,
  imdbDay,
  imdbListName,
  imdbRating,
  imdbTitleId,
  readImdbFiles,
} from "./export.js";
import { mapImdbChunk, pickImdbMatch } from "./resolve.js";
import { parseCsv } from "../letterboxd/export.js";

const RATINGS = `Const,Your Rating,Date Rated,Title,Original Title,URL,Title Type,IMDb Rating,Runtime (mins),Year,Genres,Num Votes,Release Date,Directors
tt0133093,9,2024-01-15,The Matrix,The Matrix,https://www.imdb.com/title/tt0133093/,Movie,8.7,136,1999,"Action, Sci-Fi",2000000,1999-03-31,"Lana Wachowski, Lilly Wachowski"
tt0903747,10,2023-05-01,Breaking Bad,Breaking Bad,https://www.imdb.com/title/tt0903747/,TV Series,9.5,49,2008,Drama,2100000,2008-01-20,
tt2301451,10,2023-06-02,Ozymandias,Ozymandias,https://www.imdb.com/title/tt2301451/,TV Episode,10,47,2013,Drama,200000,2013-09-15,Rian Johnson
tt9999999,7,2022-01-01,Some Game,Some Game,https://www.imdb.com/title/tt9999999/,Video Game,7,,2020,,10,,
`;
const WATCHLIST = `Position,Const,Created,Modified,Description,Title,Original Title,URL,Title Type,IMDb Rating,Runtime (mins),Year,Genres,Num Votes,Release Date,Directors
1,tt0111161,2024-02-01,2024-02-01,,The Shawshank Redemption,,https://www.imdb.com/title/tt0111161/,Movie,9.3,142,1994,Drama,3000000,1994-10-14,Frank Darabont
2,tt0133093,2024-02-02,2024-02-02,,The Matrix,,https://www.imdb.com/title/tt0133093/,Movie,8.7,136,1999,Action,2000000,1999-03-31,
`;
const LIST = `Position,Const,Created,Modified,Description,Title,Original Title,URL,Title Type,IMDb Rating,Runtime (mins),Year,Genres,Num Votes,Release Date,Directors
1,tt0903747,2024-03-01,2024-03-01,,Breaking Bad,,https://www.imdb.com/title/tt0903747/,TV Series,9.5,49,2008,Drama,2100000,2008-01-20,
2,nm0000206,2024-03-02,2024-03-02,,Keanu Reeves,,https://www.imdb.com/name/nm0000206/,,,,,,,,
`;

const file = (name, text) => ({ name, text: async () => text });

function makeZip(files) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const [name, text] of Object.entries(files)) {
    const nameBytes = Buffer.from(name);
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
    offset += local.length + nameBytes.length + data.length;
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

test("reconoce cada CSV por sus columnas, no por el nombre", async () => {
  assert.equal(classifyImdbCsv(parseCsv(RATINGS)), "ratings");
  assert.equal(classifyImdbCsv(parseCsv(WATCHLIST)), "list");
  assert.equal(classifyImdbCsv(parseCsv("Date,Name\n2024-01-01,x\n")), null);

  const files = await readImdbFiles([
    file("a1b2c3.csv", RATINGS),
    file("WATCHLIST.csv", WATCHLIST),
    file("checkins.csv", LIST),
    file("Mis_series-favoritas.csv", LIST),
    file("notas.txt", "x"),
  ]);
  assert.deepEqual(
    files.map((item) => [item.name, item.kind, item.target, item.listName]),
    [
      ["a1b2c3.csv", "ratings", null, "a1b2c3"],
      ["WATCHLIST.csv", "list", "watchlist", "WATCHLIST"],
      ["checkins.csv", "list", "watched", "checkins"],
      ["Mis_series-favoritas.csv", "list", "list", "Mis series favoritas"],
    ],
  );
});

test("lee los CSV dentro de un ZIP", async () => {
  const zip = makeZip({ "export/ratings.csv": RATINGS, "__MACOSX/export/._ratings.csv": "x", "readme.md": "x" });
  const files = await readImdbFiles([{ name: "imdb.zip", arrayBuffer: async () => zip }]);
  assert.deepEqual(files.map((item) => [item.name, item.kind]), [["ratings.csv", "ratings"]]);
});

test("valoraciones, watchlist, vistos y listas; sin juegos ni personas", async () => {
  const files = await readImdbFiles([file("ratings.csv", RATINGS), file("watchlist.csv", WATCHLIST), file("Series.csv", LIST), file("checkins.csv", LIST)]);
  const data = buildImdbImport(files);
  assert.deepEqual(data.titles.map((item) => item.imdbId), ["tt0133093", "tt0903747", "tt2301451", "tt0111161"]);
  assert.deepEqual(
    data.ratings.map((item) => [item.imdbId, item.rating, item.ratedAt.slice(0, 10)]),
    [["tt0133093", 9, "2024-01-15"], ["tt0903747", 10, "2023-05-01"], ["tt2301451", 10, "2023-06-02"]],
  );
  assert.deepEqual(data.watchlist.map((item) => item.imdbId), ["tt0111161", "tt0133093"]);
  assert.deepEqual(data.watched, [{ imdbId: "tt0903747", watchedAt: "2024-03-01T12:00:00.000Z" }]);
  assert.deepEqual(data.lists, [{ name: "Series", items: [{ imdbId: "tt0903747", addedAt: "2024-03-01T12:00:00.000Z", position: 1 }] }]);

  // Cambiar el destino de la lista: a Pendientes se suma a la watchlist.
  const asWatchlist = buildImdbImport(files.map((item) => (item.name === "Series.csv" ? { ...item, target: "watchlist" } : item)));
  assert.equal(asWatchlist.lists.length, 0);
  assert.ok(asWatchlist.watchlist.some((item) => item.imdbId === "tt0903747"));

  const chunks = chunkImdbImport(data, 2);
  assert.equal(chunks.length, 2);
  assert.deepEqual(chunks[0].ratings.map((item) => item.imdbId), ["tt0133093", "tt0903747"]);
  assert.deepEqual(chunks[1].watchlist.map((item) => item.imdbId), ["tt0111161"]);
  assert.equal(chunks[0].lists[0].items.length, 1);
  assert.equal(chunks[1].lists.length, 0);
});

test("ids, fechas, notas y nombres", () => {
  assert.equal(imdbTitleId("https://www.imdb.com/title/tt0133093/"), "tt0133093");
  assert.equal(imdbTitleId("nm0000206"), null);
  assert.equal(imdbDay("2024-01-15"), "2024-01-15T12:00:00.000Z");
  assert.equal(imdbDay(""), null);
  assert.equal(imdbRating("10"), 10);
  assert.equal(imdbRating("0"), null);
  assert.equal(imdbListName("folder/Mi_lista.csv"), "Mi lista");
});

test("resolución: episodio con la serie y mapeo de la tanda", async () => {
  const getShow = async (id) => (id === 1396 ? { name: "Breaking Bad", poster_path: "/bb.jpg" } : null);
  const episode = await pickImdbMatch({ tv_episode_results: [{ show_id: 1396, season_number: 5, episode_number: 14, name: "Ozymandias" }] }, getShow);
  assert.deepEqual(episode, { tmdbId: 1396, mediaType: "episode", season: 5, episode: 14, title: "Breaking Bad", posterPath: "/bb.jpg", voteAverage: null });
  assert.equal(await pickImdbMatch({ movie_results: [], tv_results: [] }, getShow), null);

  const resolved = new Map([
    ["tt0133093", { tmdbId: 603, mediaType: "movie", season: null, episode: null, title: "Matrix", posterPath: "/m.jpg", voteAverage: 8.2 }],
    ["tt0903747", { tmdbId: 1396, mediaType: "tv", season: null, episode: null, title: "Breaking Bad", posterPath: "/bb.jpg", voteAverage: 8.9 }],
    ["tt2301451", episode],
  ]);
  const chunk = {
    ratings: [
      { imdbId: "tt0133093", rating: 9, ratedAt: "2024-01-15T12:00:00.000Z" },
      { imdbId: "tt0903747", rating: 10, ratedAt: "2023-05-01T12:00:00.000Z" },
      { imdbId: "tt2301451", rating: 10, ratedAt: "2023-06-02T12:00:00.000Z" },
      { imdbId: "tt0000001", rating: 5, ratedAt: null },
    ],
    watchlist: [{ imdbId: "tt0903747", addedAt: null }, { imdbId: "tt2301451", addedAt: null }],
    watched: [{ imdbId: "tt0133093", watchedAt: "2020-01-01T12:00:00.000Z" }],
    lists: [{ name: "Series", items: [{ imdbId: "tt0903747", position: 1, addedAt: null }] }, { name: "Vacía", items: [{ imdbId: "tt2301451" }] }],
  };

  const withWatched = mapImdbChunk({ ...chunk, markWatched: true }, resolved);
  assert.deepEqual(withWatched.ratings.map((item) => [item.mediaType, item.tmdbId, item.season, item.episode]), [
    ["movie", 603, null, null],
    ["tv", 1396, null, null],
    ["episode", 1396, 5, 14],
  ]);
  // El check-in y las puntuaciones de película y episodio; la serie no.
  assert.deepEqual(withWatched.history.map((item) => [item.mediaType, item.tmdbId, item.season, item.episode, item.watchedAt.slice(0, 10)]), [
    ["movie", 603, null, null, "2020-01-01"],
    ["movie", 603, null, null, "2024-01-15"],
    ["tv", 1396, 5, 14, "2023-06-02"],
  ]);
  // Un episodio no cabe en Pendientes ni en una lista.
  assert.deepEqual(withWatched.watchlist.map((item) => item.mediaType), ["tv"]);
  assert.deepEqual(withWatched.lists.map((list) => [list.name, list.items.length]), [["Series", 1]]);

  const withoutWatched = mapImdbChunk({ ...chunk, markWatched: false }, resolved);
  assert.deepEqual(withoutWatched.history.map((item) => item.watchedAt.slice(0, 10)), ["2020-01-01"]);
});
