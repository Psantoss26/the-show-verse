// src/lib/letterboxd/export.js
// Lectura de la exportación de datos de Letterboxd (Settings → Data → Export
// your data): un ZIP con diary.csv, watched.csv y ratings.csv, o esos CSV
// sueltos. Todo ocurre en el navegador; a /api/letterboxd/import solo viajan
// las películas (nombre + año) y sus visionados y puntuaciones, por tandas.
//
//   - diary.csv    cada visionado registrado, con su fecha real ("Watched Date")
//                  y si fue un rewatch: es el historial.
//   - watched.csv  todas las películas marcadas como vistas. Las que no están en
//                  el diario no tienen fecha de visionado: entran con la fecha
//                  en que se marcaron y solo si no las tienes ya vistas.
//   - ratings.csv  la puntuación actual de cada película (0,5–5 estrellas → 1–10).

// Igual que normalizeText de lib/netflix/resolve (que es de servidor).
export function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[×✕⨯╳]/g, "x")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

export const LETTERBOXD_FILES = ["diary.csv", "watched.csv", "ratings.csv"];
export const LETTERBOXD_CHUNK_FILMS = 60;

// ---------------------------------------------------------------------------
// ZIP (solo lo necesario: entradas "stored" y "deflate", sin ZIP64). La
// descompresión la hace la plataforma (DecompressionStream, Baseline 2023).

function readUint16(view, offset) {
  return view.getUint16(offset, true);
}

function readUint32(view, offset) {
  return view.getUint32(offset, true);
}

async function inflateRaw(bytes) {
  if (typeof DecompressionStream === "undefined") {
    throw new Error("Este navegador no puede abrir el ZIP. Sube los archivos CSV sueltos.");
  }
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/**
 * Entradas de un ZIP: [{ name, read() → Promise<Uint8Array> }].
 */
export function listZipEntries(buffer) {
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  const decoder = new TextDecoder();

  // Fin del directorio central: 22 bytes + comentario (hasta 64 KiB).
  let eocd = -1;
  const minOffset = Math.max(0, bytes.length - 22 - 0xffff);
  for (let offset = bytes.length - 22; offset >= minOffset; offset -= 1) {
    if (readUint32(view, offset) === 0x06054b50) {
      eocd = offset;
      break;
    }
  }
  if (eocd < 0) throw new Error("El archivo no es un ZIP válido.");

  const count = readUint16(view, eocd + 10);
  let offset = readUint32(view, eocd + 16);
  const entries = [];

  for (let index = 0; index < count; index += 1) {
    if (readUint32(view, offset) !== 0x02014b50) break;
    const method = readUint16(view, offset + 10);
    const compressedSize = readUint32(view, offset + 20);
    const nameLength = readUint16(view, offset + 28);
    const extraLength = readUint16(view, offset + 30);
    const commentLength = readUint16(view, offset + 32);
    const localOffset = readUint32(view, offset + 42);
    const name = decoder.decode(bytes.subarray(offset + 46, offset + 46 + nameLength));
    offset += 46 + nameLength + extraLength + commentLength;

    entries.push({
      name,
      async read() {
        const localNameLength = readUint16(view, localOffset + 26);
        const localExtraLength = readUint16(view, localOffset + 28);
        const start = localOffset + 30 + localNameLength + localExtraLength;
        const data = bytes.subarray(start, start + compressedSize);
        if (method === 0) return data;
        if (method === 8) return inflateRaw(data);
        throw new Error(`Compresión no soportada en ${name}.`);
      },
    });
  }

  return entries;
}

// Los CSV del perfil están en la raíz del ZIP (o en una sola carpeta). Los de
// deleted/, orphaned/, likes/ o lists/ tienen los mismos nombres y no valen.
function exportFileName(path) {
  const parts = String(path || "").split("/").filter(Boolean);
  if (!parts.length || parts.length > 2) return null;
  const base = parts[parts.length - 1].toLowerCase();
  if (parts.length === 2 && /^(deleted|orphaned|likes|lists|reviews)$/i.test(parts[0])) return null;
  return LETTERBOXD_FILES.includes(base) ? base : null;
}

/**
 * Lee los CSV de la exportación a partir de los archivos elegidos (un ZIP o
 * los CSV sueltos). Devuelve { "diary.csv": texto, ... } con los que haya.
 */
export async function readLetterboxdFiles(files) {
  const texts = {};
  for (const file of Array.from(files || [])) {
    const name = String(file?.name || "").toLowerCase();
    if (name.endsWith(".zip")) {
      const entries = listZipEntries(await file.arrayBuffer());
      const decoder = new TextDecoder();
      for (const entry of entries) {
        const key = exportFileName(entry.name);
        if (!key || texts[key]) continue;
        texts[key] = decoder.decode(await entry.read());
      }
    } else if (LETTERBOXD_FILES.includes(name)) {
      texts[name] = await file.text();
    }
  }
  return texts;
}

// ---------------------------------------------------------------------------
// CSV

export function parseCsv(text) {
  const source = String(text || "").replace(/^﻿/, "");
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];

    if (char === '"') {
      if (quoted && next === '"') {
        cell += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }
    if (char === "," && !quoted) {
      row.push(cell);
      cell = "";
      continue;
    }
    if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(cell);
      if (row.some((value) => value.trim())) rows.push(row);
      row = [];
      cell = "";
      continue;
    }
    cell += char;
  }

  row.push(cell);
  if (row.some((value) => value.trim())) rows.push(row);
  if (rows.length < 2) return [];

  const headers = rows[0].map((value) => value.trim().toLowerCase());
  return rows.slice(1).map((values) => {
    const item = {};
    headers.forEach((header, index) => {
      item[header] = values[index]?.trim() || "";
    });
    return item;
  });
}

// ---------------------------------------------------------------------------
// Normalización

/** "2023-05-14" → mediodía UTC de ese día (el mismo día en cualquier huso de Europa/América). */
export function letterboxdDay(value) {
  const match = String(value || "").trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/** Estrellas de Letterboxd (0,5–5) → puntuación 1–10. */
export function letterboxdRating(value) {
  const stars = Number(String(value || "").replace(",", "."));
  if (!Number.isFinite(stars) || stars <= 0) return null;
  const rating = Math.round(stars * 2);
  return rating >= 1 && rating <= 10 ? rating : null;
}

export function letterboxdFilmKey(name, year) {
  const title = normalizeText(name);
  if (!title) return "";
  const safeYear = /^\d{4}$/.test(String(year || "").trim()) ? String(year).trim() : "";
  return `${title}|${safeYear}`;
}

/**
 * De los CSV a { films, history, ratings }:
 *   films    [{ key, name, year }]
 *   history  [{ film, watchedAt, rewatch, undated }]
 *   ratings  [{ film, rating, ratedAt }]
 */
export function buildLetterboxdImport(texts = {}) {
  const films = new Map();
  const addFilm = (row) => {
    const name = String(row?.name || "").trim();
    const year = String(row?.year || "").trim();
    const key = letterboxdFilmKey(name, year);
    if (!key) return "";
    if (!films.has(key)) films.set(key, { key, name, year: /^\d{4}$/.test(year) ? Number(year) : null });
    return key;
  };

  const history = [];
  const diaryFilms = new Set();
  const diaryRatings = new Map();
  for (const row of parseCsv(texts["diary.csv"])) {
    const film = addFilm(row);
    const watchedAt = letterboxdDay(row["watched date"]) || letterboxdDay(row.date);
    if (!film || !watchedAt) continue;
    diaryFilms.add(film);
    history.push({ film, watchedAt, rewatch: /^yes$/i.test(row.rewatch || ""), undated: false });
    const rating = letterboxdRating(row.rating);
    // La puntuación del registro más reciente del diario, por si falta ratings.csv.
    const previous = diaryRatings.get(film);
    if (rating && (!previous || previous.ratedAt <= watchedAt)) {
      diaryRatings.set(film, { film, rating, ratedAt: watchedAt });
    }
  }

  for (const row of parseCsv(texts["watched.csv"])) {
    const film = addFilm(row);
    if (!film || diaryFilms.has(film)) continue;
    diaryFilms.add(film);
    history.push({ film, watchedAt: letterboxdDay(row.date), rewatch: false, undated: true });
  }

  const ratings = new Map();
  for (const row of parseCsv(texts["ratings.csv"])) {
    const film = addFilm(row);
    const rating = letterboxdRating(row.rating);
    if (!film || !rating) continue;
    ratings.set(film, { film, rating, ratedAt: letterboxdDay(row.date) });
  }
  for (const [film, item] of diaryRatings) {
    if (!ratings.has(film)) ratings.set(film, item);
  }

  return { films: [...films.values()], history, ratings: [...ratings.values()] };
}

/** Reparte la importación en tandas de películas, cada una con sus visionados y puntuaciones. */
export function chunkLetterboxdImport(data, size = LETTERBOXD_CHUNK_FILMS) {
  const films = Array.isArray(data?.films) ? data.films : [];
  const historyByFilm = Map.groupBy(data?.history || [], (item) => item.film);
  const ratingsByFilm = Map.groupBy(data?.ratings || [], (item) => item.film);
  const chunks = [];
  for (let index = 0; index < films.length; index += size) {
    const chunkFilms = films.slice(index, index + size);
    chunks.push({
      films: chunkFilms,
      history: chunkFilms.flatMap((film) => historyByFilm.get(film.key) || []),
      ratings: chunkFilms.flatMap((film) => ratingsByFilm.get(film.key) || []),
    });
  }
  return chunks;
}

// ---------------------------------------------------------------------------
// Sincronización incremental (exportación periódica por la extensión): cada
// visionado y cada puntuación tienen una clave; solo se envía lo que no se
// envió antes. Una nota cambiada tiene otra clave, así que vuelve a enviarse.

export function letterboxdHistoryKey(item) {
  return `h|${item.film}|${item.watchedAt}|${item.undated ? 1 : 0}`;
}

export function letterboxdRatingKey(item) {
  return `r|${item.film}|${item.rating}`;
}

/** Lo que falta por enviar: visionados y notas nuevos, con sus películas. */
export function pendingLetterboxdImport(data, syncedKeys = new Set()) {
  const history = (data?.history || []).filter((item) => !syncedKeys.has(letterboxdHistoryKey(item)));
  const ratings = (data?.ratings || []).filter((item) => !syncedKeys.has(letterboxdRatingKey(item)));
  const used = new Set([...history, ...ratings].map((item) => item.film));
  return { films: (data?.films || []).filter((film) => used.has(film.key)), history, ratings };
}

/** Claves de una tanda ya importada. */
export function letterboxdChunkKeys(chunk) {
  return [
    ...(chunk?.history || []).map(letterboxdHistoryKey),
    ...(chunk?.ratings || []).map(letterboxdRatingKey),
  ];
}
