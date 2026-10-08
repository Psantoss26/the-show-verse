import assert from "node:assert/strict";
import test from "node:test";

import {
  LIST_GRID_MAX,
  LIST_PREVIEW_MAX,
  buildListShareCard,
  buildListShareStory,
  countLabel,
  listNoun,
  listStorySceneIds,
  listYearSpan,
  normalizeListShareItem,
  sanitizeListShareCard,
  sanitizeListShareStory,
} from "./shareList.js";

const collectionParts = [
  { id: 11, title: "La guerra de las galaxias", release_date: "1977-05-25", vote_average: 8.2, poster_path: "/a.jpg", media_type: "movie" },
  { id: 1891, title: "El imperio contraataca", release_date: "1980-05-20", vote_average: 8.4, poster_path: "/b.jpg", media_type: "movie" },
  { id: 1892, title: "El retorno del Jedi", release_date: "1983-05-25", vote_average: 7.9, poster_path: "/c.jpg", media_type: "movie" },
  { id: 140607, title: "El despertar de la fuerza", release_date: "2015-12-15", vote_average: 7.3, poster_path: "/d.jpg", media_type: "movie" },
  { id: 181808, title: "Los últimos Jedi", release_date: "2017-12-13", vote_average: 6.8, poster_path: "/e.jpg", media_type: "movie" },
  { id: 181812, title: "El ascenso de Skywalker", release_date: "2019-12-18", vote_average: 6.4, poster_path: "/f.jpg", media_type: "movie" },
];
const imdbRatings = { "movie:11": { rating: 8.6 }, "movie:1891": { rating: 8.7 }, "movie:1892": { rating: 8.3 } };

test("normaliza las tres formas de título y pega la nota de IMDb", () => {
  const part = normalizeListShareItem(collectionParts[0], imdbRatings);
  assert.deepEqual(part, {
    id: 11,
    mediaType: "movie",
    title: "La guerra de las galaxias",
    posterPath: "/a.jpg",
    year: 1977,
    tmdb: 8.2,
    imdb: 8.6,
  });

  // Fila de una lista de la comunidad.
  const community = normalizeListShareItem(
    { tmdbId: 1399, mediaType: "tv", title: "Juego de tronos", posterPath: "/got.jpg", voteAverage: 8.5 },
    { "tv:1399": { rating: 9.2 } },
  );
  assert.equal(community.mediaType, "tv");
  assert.equal(community.imdb, 9.2);
  assert.equal(community.year, null);

  // Rutas que no son de TMDb y notas imposibles se descartan.
  const bad = normalizeListShareItem({ id: 1, poster_path: "https://evil/x.jpg", vote_average: 0 });
  assert.equal(bad.posterPath, null);
  assert.equal(bad.tmdb, null);
});

test("recuentos, sustantivo y años", () => {
  assert.equal(countLabel(1, "movie"), "1 película");
  assert.equal(countLabel(3, "tv"), "3 series");
  assert.equal(countLabel(12, "nada"), "12 títulos");

  const items = collectionParts.map((part) => normalizeListShareItem(part));
  assert.equal(listNoun(items), "movie");
  assert.equal(listNoun([...items, { mediaType: "tv" }]), "title");
  assert.equal(listYearSpan(items), "1977 – 2019");
  assert.equal(listYearSpan(items.slice(0, 1)), "1977");
  assert.equal(listYearSpan([]), null);
});

test("la tarjeta lleva la vista previa, las medias y el mosaico solo sin portada", () => {
  const items = collectionParts.map((part) => normalizeListShareItem(part, imdbRatings));
  const withCover = buildListShareCard({
    kind: "collection",
    title: "Star Wars",
    label: "Colección TMDb",
    coverPath: "/cover.jpg",
    items,
    count: items.length,
    meta: ["1977 – 2019", null],
    tmdb: { average: 7.5, ratedCount: 6, totalCount: 6 },
    imdb: { average: 8.5, ratedCount: 3, totalCount: 6 },
  });
  assert.equal(withCover.preview.length, LIST_PREVIEW_MAX);
  assert.deepEqual(withCover.collage, []);
  assert.deepEqual(withCover.meta, ["1977 – 2019"]);
  // Solo la cifra de la media, sin «media de …» debajo.
  assert.deepEqual(withCover.scores.tmdb, { value: "7.5", votes: null });
  assert.deepEqual(withCover.scores.imdb, { value: "8.5", votes: null });

  // Cada título de la vista previa lleva su identidad, para resolver en el
  // cliente el mismo póster que su tarjeta.
  assert.deepEqual(
    { id: withCover.preview[0].id, mediaType: withCover.preview[0].mediaType },
    { id: 11, mediaType: "movie" },
  );
  assert.deepEqual(withCover.collageRefs, []);

  const noCover = buildListShareCard({ title: "Mi lista", items, tmdb: null });
  assert.equal(noCover.collage.length, 6);
  assert.equal(noCover.collageRefs.length, items.length);
  assert.equal(noCover.scores.tmdb, null);
  assert.equal(noCover.count, items.length);
});

test("saneado de la tarjeta: nada que no se reconozca pasa", () => {
  const card = sanitizeListShareCard({
    kind: "otra",
    title: "  Mi   lista  ",
    coverPath: "/../../etc/passwd",
    collage: ["/a.jpg", "javascript:alert(1)", "/b.png"],
    count: "1e9",
    noun: "__proto__",
    meta: ["@pablo", "x", "y"],
    preview: Array.from({ length: 9 }, (_, index) => ({ posterPath: `/p${index}.jpg`, title: "t" })),
    scores: { tmdb: { value: "7.5", votes: "media de 6" }, imdb: { value: "<script>" } },
  });
  assert.equal(card.kind, "list");
  assert.equal(card.title, "Mi lista");
  assert.equal(card.coverPath, null);
  assert.deepEqual(card.collage, ["/a.jpg", "/b.png"]);
  assert.equal(card.count, 100_000);
  assert.equal(card.noun, "title");
  assert.equal(card.meta.length, 2);
  assert.equal(card.preview.length, LIST_PREVIEW_MAX);
  assert.deepEqual(card.scores, { tmdb: { value: "7.5", votes: null }, imdb: null });

  // Cuerpo vacío: una tarjeta pintable.
  const empty = sanitizeListShareCard(null);
  assert.equal(empty.title, "Lista");
  // La identidad de los títulos no llega a la imagen.
  assert.equal("collageRefs" in empty, false);
  assert.deepEqual(empty.preview, []);
});

test("la historia ordena las mejor valoradas por IMDb y luego TMDb", () => {
  const items = collectionParts.map((part) => normalizeListShareItem(part, imdbRatings));
  const story = buildListShareStory({ items, count: items.length, noun: "movie", description: "Una saga." });
  assert.deepEqual(
    story.top.map((item) => item.title),
    ["El imperio contraataca", "La guerra de las galaxias", "El retorno del Jedi", "El despertar de la fuerza", "Los últimos Jedi"],
  );
  assert.equal(story.more, 0);
  assert.equal(story.items.length, items.length);
});

test("la historia recorta la cuadrícula y cuenta el resto", () => {
  const many = Array.from({ length: 30 }, (_, index) =>
    normalizeListShareItem({ id: index + 1, title: `T${index}`, poster_path: `/p${index}.jpg` }),
  );
  const story = sanitizeListShareStory(buildListShareStory({ items: many, count: 40 }));
  assert.equal(story.items.length, LIST_GRID_MAX);
  assert.equal(story.more, 28);
  // Sin notas no hay «Mejor valoradas».
  assert.deepEqual(story.top, []);
});

test("saneado de la historia: reparto, cifras y descripción", () => {
  const story = sanitizeListShareStory({
    cast: [
      { name: "Mark Hamill", profilePath: "/m.jpg", count: 5 },
      { name: "", profilePath: "/x.jpg" },
      { name: "Carrie Fisher", profilePath: "http://evil/c.jpg", count: "3" },
    ],
    facts: [
      { icon: "bomb", label: "Películas", value: "9" },
      { icon: "calendar", label: "Años", value: "1977 – 2019", wide: "sí" },
      { icon: "film", label: "", value: "sin etiqueta" },
    ],
    description: "palabra ".repeat(200),
  });
  assert.deepEqual(story.cast, [
    { name: "Mark Hamill", profilePath: "/m.jpg", count: 5 },
    { name: "Carrie Fisher", profilePath: null, count: 3 },
  ]);
  assert.deepEqual(story.facts, [
    { icon: "layers", label: "Películas", value: "9", wide: false },
    { icon: "calendar", label: "Años", value: "1977 – 2019", wide: false },
  ]);
  assert.ok(story.description.length <= 420);
  assert.ok(story.description.endsWith("…"));
});

test("secciones del vídeo: solo las que tienen algo que enseñar", () => {
  const items = collectionParts.map((part) => normalizeListShareItem(part, imdbRatings));
  const full = sanitizeListShareStory(
    buildListShareStory({
      items,
      count: items.length,
      description: "Una saga.",
      cast: [{ name: "A" }, { name: "B" }, { name: "C" }],
      facts: [
        { icon: "film", label: "Películas", value: "6" },
        { icon: "calendar", label: "Años", value: "1977 – 2019" },
      ],
    }),
  );
  assert.deepEqual(listStorySceneIds(null, full), ["titles", "top", "cast", "stats", "about"]);

  // Una lista de tres títulos ya se ve entera en la portada: sin «Contenido».
  const short = sanitizeListShareStory(buildListShareStory({ items: items.slice(0, 3), count: 3 }));
  assert.deepEqual(listStorySceneIds(null, short), ["top"]);
});

test("composición «póster»: solo con póster, y con fondo sin texto aparte", () => {
  const items = collectionParts.map((part) => normalizeListShareItem(part));
  const card = buildListShareCard({
    kind: "collection",
    title: "Star Wars",
    layout: "poster",
    coverPath: "/oficial.jpg",
    backdropPath: "/textless.jpg",
    items,
  });
  assert.equal(card.layout, "poster");
  const clean = sanitizeListShareCard(card);
  assert.equal(clean.layout, "poster");
  assert.equal(clean.backdropPath, "/textless.jpg");

  // Sin póster no hay nada que enseñar entero: composición normal.
  assert.equal(buildListShareCard({ title: "x", layout: "poster", items }).layout, "cover");
  assert.equal(sanitizeListShareCard({ layout: "poster", coverPath: "http://evil/x.jpg" }).layout, "cover");
});
