// Modelo de la IMAGEN y el VÍDEO compartibles de una lista o una colección
// (formato historia, 1080×1920), hermano de lib/details/shareCard y shareStory.
//
// En vez de la fila de acciones de la ficha, la imagen enseña una VISTA PREVIA
// de los títulos que contiene (los primeros pósters y un «+N» con el resto) y,
// debajo, las puntuaciones MEDIAS de la lista (TMDb e IMDb). El vídeo empieza
// con esa imagen y sigue con lo que no cabe: el contenido, las mejor valoradas,
// el reparto destacado (colecciones), las cifras y la descripción.
//
// Reparto del trabajo, igual que en la ficha:
//   - las páginas de listas arman los payloads con `buildListShareCard` y
//     `buildListShareStory` a partir de lo que ya tienen cargado;
//   - /api/share/list-card y /api/share/list-story los validan con
//     `sanitizeListShareCard` / `sanitizeListShareStory` (las rutas las puede
//     llamar cualquiera: textos cortos, números finitos y solo rutas de TMDb);
//   - la coreografía del vídeo es la de la ficha (storyTimeline / storyFrame).

import { tmdbImagePath } from "../details/shareCard.js";
import { truncateText } from "../details/shareStory.js";

// Pósters de la vista previa de la imagen (el último se convierte en «+N» si
// la lista tiene más).
export const LIST_PREVIEW_MAX = 5;
// Pósters del mosaico de portada de una lista sin portada propia.
export const LIST_COLLAGE_MAX = 6;
// Títulos de la sección «Contenido» del vídeo (4 columnas × 3 filas).
export const LIST_GRID_MAX = 12;
// Filas de «Mejor valoradas».
export const LIST_TOP_MAX = 5;
// Caras de «Reparto destacado».
export const LIST_CAST_MAX = 6;
// Celdas de «En cifras».
export const LIST_FACTS_MAX = 8;
// Candidatos del mosaico: algunos títulos pueden no tener póster inglés y se
// saltan (ver lib/lists/shareListPosters).
export const LIST_COLLAGE_CANDIDATES = LIST_COLLAGE_MAX + 4;

export const LIST_SCENES = ["titles", "top", "cast", "stats", "about"];

// Iconos de ogKit que pueden pedir las celdas de «En cifras».
const FACT_ICONS = new Set([
  "layers",
  "film",
  "tv",
  "calendar",
  "clock",
  "trending",
  "dollar",
  "users",
  "heart",
  "eye",
  "star",
  "trophy",
]);

// Sustantivo del recuento: «8 películas», «1 serie», «12 títulos».
const NOUNS = {
  movie: ["película", "películas"],
  tv: ["serie", "series"],
  title: ["título", "títulos"],
};

function text(value, max) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function finite(value, min, max) {
  if (value == null || value === "") return null;
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.max(min, Math.min(max, number));
}

function score(value) {
  const number = finite(value, 0, 10);
  return number != null && number > 0 ? Math.round(number * 10) / 10 : null;
}

function year(value) {
  const number = finite(value, 1870, 2200);
  return number != null ? Math.round(number) : null;
}

export function countLabel(count, noun = "title") {
  const [one, many] = NOUNS[noun] || NOUNS.title;
  return `${count} ${count === 1 ? one : many}`;
}

// ------------------------------------------------------------------ cliente

// Identidad del título (para resolver su póster inglés en el cliente, con el
// mismo criterio que las tarjetas de la página). El servidor la ignora.
const ref = (item) => ({ id: item?.id ?? null, mediaType: item?.mediaType === "tv" ? "tv" : "movie" });

/**
 * Normaliza un título de cualquiera de las tres fuentes (partes de una
 * colección de TMDb, listas propias con forma TMDb y filas de las listas de la
 * comunidad) y le pega su nota de IMDb si ya está resuelta.
 */
export function normalizeListShareItem(item, imdbRatings = null) {
  const mediaType = (item?.mediaType ?? item?.media_type) === "tv" ? "tv" : "movie";
  const id = item?.tmdbId ?? item?.tmdb_id ?? item?.id ?? null;
  const date = item?.release_date || item?.first_air_date || "";
  const imdb = imdbRatings?.[`${mediaType}:${id}`];
  return {
    id,
    mediaType,
    title: text(item?.title ?? item?.name, 80),
    posterPath: tmdbImagePath(item?.posterPath ?? item?.poster_path),
    year: year(item?.year ?? String(date).slice(0, 4)),
    tmdb: score(item?.vote_average ?? item?.voteAverage),
    imdb: score(imdb?.rating ?? imdb),
  };
}

/** «películas» si todo son películas, «series» si todo son series y si no «títulos». */
export function listNoun(items) {
  const types = new Set((Array.isArray(items) ? items : []).map((item) => item?.mediaType));
  if (types.size !== 1) return "title";
  return types.has("tv") ? "tv" : "movie";
}

/** «1977 – 2019» con los años de los títulos (o solo uno si coinciden). */
export function listYearSpan(items) {
  const years = (Array.isArray(items) ? items : []).map((item) => item?.year).filter(Boolean);
  if (!years.length) return null;
  const first = Math.min(...years);
  const last = Math.max(...years);
  return first === last ? String(first) : `${first} – ${last}`;
}

// Media de la lista en el formato de la insignia: solo la cifra («7.8»), sin
// línea debajo.
function summaryScore(summary) {
  const average = finite(summary?.average, 0, 10);
  if (average == null || average <= 0) return null;
  return { value: average.toFixed(1), votes: null };
}

/**
 * Payload de la IMAGEN. `items` ya normalizados (normalizeListShareItem);
 * `tmdb` / `imdb` son los resúmenes de lib/lists/ratingSummary e
 * imdbRatingSummary (los mismos que pinta el marcador de la página).
 *
 * `layout: "poster"` (colecciones): la portada es el póster oficial CON su
 * título impreso, entero y sin nada encima; la imagen no escribe nombre,
 * etiqueta ni recuento. `backdropPath` es el fondo del vídeo (un póster sin
 * texto, para que el título impreso no asome bajo las secciones).
 */
export function buildListShareCard({
  kind = "list",
  title,
  label,
  coverPath = null,
  backdropPath = null,
  layout = "cover",
  items = [],
  count,
  noun,
  meta = [],
  tmdb = null,
  imdb = null,
}) {
  const withPoster = items.filter((item) => item?.posterPath);
  return {
    kind,
    title,
    label,
    coverPath: coverPath || null,
    backdropPath: backdropPath || null,
    layout: layout === "poster" && coverPath ? "poster" : "cover",
    // Sin portada propia, el mosaico de los primeros pósters. `collageRefs`
    // son los candidatos con los que el cliente lo rehace con los pósters
    // ingleses (prepareListShare) antes de pedir la imagen.
    collage: coverPath ? [] : withPoster.slice(0, LIST_COLLAGE_MAX).map((item) => item.posterPath),
    collageRefs: coverPath ? [] : items.slice(0, LIST_COLLAGE_CANDIDATES).map(ref),
    count: Number.isFinite(Number(count)) ? Number(count) : items.length,
    noun: noun || listNoun(items),
    meta: meta.filter(Boolean),
    preview: items.slice(0, LIST_PREVIEW_MAX).map((item) => ({
      ...ref(item),
      posterPath: item.posterPath || null,
      title: item.title || "",
    })),
    scores: { tmdb: summaryScore(tmdb), imdb: summaryScore(imdb) },
  };
}

/**
 * Payload del VÍDEO.
 *   - items: todos los títulos cargados (normalizados), en el orden de la lista;
 *   - count: total de la lista (puede haber más de los cargados);
 *   - cast: reparto destacado de una colección (lib/lists/collectionStats);
 *   - facts: celdas de «En cifras» ya formateadas ({ icon, label, value, wide? }).
 */
export function buildListShareStory({ items = [], count, noun, description = "", cast = [], facts = [] }) {
  const total = Number.isFinite(Number(count)) ? Number(count) : items.length;
  const grid = items.slice(0, LIST_GRID_MAX);

  // Mejor valoradas: por IMDb si la tiene y si no por TMDb. Solo títulos con
  // nota; la nota de desempate es la otra fuente.
  const ranked = items
    .map((item) => ({ item, key: item.imdb ?? item.tmdb, tie: item.imdb != null ? item.tmdb : null }))
    .filter((row) => row.key != null)
    .sort((a, b) => b.key - a.key || (b.tie ?? 0) - (a.tie ?? 0))
    .slice(0, LIST_TOP_MAX)
    .map(({ item }) => ({
      ...ref(item),
      posterPath: item.posterPath || null,
      title: item.title,
      year: item.year,
      mediaType: item.mediaType,
      tmdb: item.tmdb,
      imdb: item.imdb,
    }));

  return {
    noun: noun || listNoun(items),
    count: total,
    items: grid.map((item) => ({ ...ref(item), posterPath: item.posterPath || null, title: item.title, year: item.year })),
    more: Math.max(0, total - grid.length),
    top: ranked,
    cast: (Array.isArray(cast) ? cast : []).slice(0, LIST_CAST_MAX).map((member) => ({
      name: member?.name || "",
      profilePath: member?.profile_path ?? member?.profilePath ?? null,
      count: Array.isArray(member?.appearances) ? member.appearances.length : member?.count ?? null,
    })),
    facts,
    description: description || "",
  };
}

// ------------------------------------------------------------------ servidor

function sanitizeScores(raw) {
  const scores = raw && typeof raw === "object" ? raw : {};
  const one = (value) => {
    if (!value || typeof value !== "object") return null;
    const clean = text(value.value, 5);
    if (!/^\d{1,2}(?:\.\d)?$/.test(clean)) return null;
    // Las medias de una lista se pintan sin línea debajo.
    return { value: clean, votes: null };
  };
  return { tmdb: one(scores.tmdb), imdb: one(scores.imdb) };
}

/** Valida el cuerpo de /api/share/list-card. Siempre devuelve una tarjeta pintable. */
export function sanitizeListShareCard(body) {
  const count = finite(body?.count, 0, 100_000);
  return {
    kind: body?.kind === "collection" ? "collection" : "list",
    title: text(body?.title, 90) || "Lista",
    label: text(body?.label, 32),
    coverPath: tmdbImagePath(body?.coverPath),
    backdropPath: tmdbImagePath(body?.backdropPath),
    // El póster entero solo tiene sentido con póster.
    layout: body?.layout === "poster" && tmdbImagePath(body?.coverPath) ? "poster" : "cover",
    collage: (Array.isArray(body?.collage) ? body.collage : [])
      .map(tmdbImagePath)
      .filter(Boolean)
      .slice(0, LIST_COLLAGE_MAX),
    count: count == null ? 0 : Math.round(count),
    noun: Object.hasOwn(NOUNS, body?.noun) ? body.noun : "title",
    meta: (Array.isArray(body?.meta) ? body.meta : [])
      .map((value) => text(value, 32))
      .filter(Boolean)
      .slice(0, 2),
    preview: (Array.isArray(body?.preview) ? body.preview : [])
      .slice(0, LIST_PREVIEW_MAX)
      .map((item) => ({ posterPath: tmdbImagePath(item?.posterPath), title: text(item?.title, 60) })),
    scores: sanitizeScores(body?.scores),
  };
}

/** Valida el cuerpo de /api/share/list-story: nada de lo que no se reconoce pasa. */
export function sanitizeListShareStory(body) {
  const count = finite(body?.count, 0, 100_000);
  const items = (Array.isArray(body?.items) ? body.items : []).slice(0, LIST_GRID_MAX).map((item) => ({
    posterPath: tmdbImagePath(item?.posterPath),
    title: text(item?.title, 60),
    year: year(item?.year),
  }));

  const top = (Array.isArray(body?.top) ? body.top : [])
    .slice(0, LIST_TOP_MAX)
    .map((item) => ({
      posterPath: tmdbImagePath(item?.posterPath),
      title: text(item?.title, 60),
      year: year(item?.year),
      mediaType: item?.mediaType === "tv" ? "tv" : "movie",
      tmdb: score(item?.tmdb),
      imdb: score(item?.imdb),
    }))
    .filter((item) => item.title && (item.tmdb != null || item.imdb != null));

  const cast = (Array.isArray(body?.cast) ? body.cast : [])
    .slice(0, LIST_CAST_MAX)
    .map((member) => {
      const appearances = finite(member?.count, 0, 1000);
      return {
        name: text(member?.name, 40),
        profilePath: tmdbImagePath(member?.profilePath),
        count: appearances ? Math.round(appearances) : null,
      };
    })
    .filter((member) => member.name);

  const facts = (Array.isArray(body?.facts) ? body.facts : [])
    .map((fact) => ({
      icon: FACT_ICONS.has(fact?.icon) ? fact.icon : "layers",
      label: text(fact?.label, 24),
      value: text(fact?.value, 60),
      wide: fact?.wide === true,
    }))
    .filter((fact) => fact.label && fact.value)
    .slice(0, LIST_FACTS_MAX);

  return {
    noun: Object.hasOwn(NOUNS, body?.noun) ? body.noun : "title",
    count: count == null ? items.length : Math.round(count),
    items,
    more: Math.round(finite(body?.more, 0, 100_000) ?? 0),
    top,
    cast,
    facts,
    description: body?.description ? truncateText(body.description, 420) : "",
  };
}

/**
 * Secciones del vídeo que tienen algo que enseñar, en orden. «Contenido» solo
 * si la lista tiene más títulos de los que ya enseña la portada. Misma firma
 * que `storySceneIds` de la ficha (la hoja de compartir usa una u otra).
 */
export function listStorySceneIds(_card, story) {
  return LIST_SCENES.filter((id) => {
    if (id === "titles") return (story?.items?.length || 0) > 0 && (story?.count || 0) > LIST_PREVIEW_MAX;
    if (id === "top") return (story?.top?.length || 0) >= 2;
    if (id === "cast") return (story?.cast?.length || 0) >= 3;
    if (id === "stats") return (story?.facts?.length || 0) >= 2;
    return !!story?.description;
  });
}
