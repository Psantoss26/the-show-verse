// src/lib/imdb/export.js
// Lectura de las exportaciones de IMDb. IMDb no tiene una exportación única:
// cada lista (Tus valoraciones, Tu watchlist y cada lista propia) se exporta
// por separado desde su página y los CSV se descargan en imdb.com/exports.
// Aquí se aceptan esos CSV (o un ZIP con ellos) y se reconoce cada uno por sus
// columnas, no por el nombre del archivo:
//
//   - valoraciones   Const, Your Rating, Date Rated, Title, Title Type, Year…
//                    → puntuaciones (películas, series y episodios, 1–10).
//   - listas         Position, Const, Created, Title, Title Type, Year…
//                    → la watchlist a Pendientes, los check-ins a Vistos y el
//                    resto a listas propias (el usuario puede cambiarlo).
//
// Todo ocurre en el navegador; a /api/imdb/import solo viajan los ids de IMDb
// con su título, año y tipo, y lo que se importa de cada uno, por tandas.

// Mismo lector de ZIP y CSV que la exportación de Letterboxd.
import { listZipEntries, parseCsv } from "../letterboxd/export.js";

export const IMDB_CHUNK_TITLES = 80;
export const IMDB_LIST_NAME_MAX = 100;

// Tipos de IMDb que no existen en TMDb: no se envían.
const UNSUPPORTED_TYPE = /video ?game|podcast|music ?video/i;

/** "tt0133093" (de la columna Const o de la URL) o null. */
export function imdbTitleId(value) {
  const match = String(value || "").match(/\btt\d{5,10}\b/);
  return match ? match[0] : null;
}

/** "2024-01-15" (o una fecha que el navegador entienda) → mediodía UTC de ese día. */
export function imdbDay(value) {
  const text = String(value || "").trim();
  if (!text) return null;
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  const date = iso
    ? new Date(Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]), 12))
    : new Date(text);
  if (Number.isNaN(date.getTime())) return null;
  if (!iso) date.setUTCHours(12, 0, 0, 0);
  return date.toISOString();
}

/** Puntuación de IMDb (1–10) o null. */
export function imdbRating(value) {
  const rating = Number(String(value || "").replace(",", "."));
  return Number.isFinite(rating) && rating >= 1 && rating <= 10 ? Math.round(rating) : null;
}

/** Qué es un CSV por sus columnas: "ratings", "list" o null. */
export function classifyImdbCsv(rows) {
  const first = Array.isArray(rows) ? rows[0] : null;
  if (!first) return null;
  const has = (column) => Object.prototype.hasOwnProperty.call(first, column);
  if (!has("const")) return null;
  if (has("position")) return "list";
  if (has("your rating") && has("date rated")) return "ratings";
  return null;
}

/** Nombre de lista a partir del archivo: "Mis pelis_de-terror.csv" → "Mis pelis de terror". */
export function imdbListName(fileName) {
  const base = String(fileName || "")
    .split("/")
    .pop()
    .replace(/\.csv$/i, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return (base || "Lista de IMDb").slice(0, IMDB_LIST_NAME_MAX);
}

/**
 * Lee los archivos elegidos (CSV sueltos o un ZIP con ellos) y devuelve los
 * que son de IMDb: [{ id, name, kind, rows, target, listName }]. `target` es
 * el destino propuesto de una lista por el nombre del archivo ("watchlist",
 * "watched" para los check-ins, si no "list"), que el usuario puede cambiar
 * antes de importar.
 */
export async function readImdbFiles(files) {
  const sources = [];
  for (const file of Array.from(files || [])) {
    const name = String(file?.name || "");
    if (/\.zip$/i.test(name)) {
      const decoder = new TextDecoder();
      for (const entry of listZipEntries(await file.arrayBuffer())) {
        if (!/\.csv$/i.test(entry.name) || /(^|\/)__macosx\//i.test(entry.name)) continue;
        sources.push({ name: entry.name.split("/").pop(), text: decoder.decode(await entry.read()) });
      }
    } else if (/\.csv$/i.test(name)) {
      sources.push({ name, text: await file.text() });
    }
  }

  return sources
    .map((source, index) => {
      const rows = parseCsv(source.text);
      const kind = classifyImdbCsv(rows);
      if (!kind) return null;
      return {
        id: `${index}:${source.name}`,
        name: source.name,
        kind,
        rows,
        target: kind !== "list" ? null : /watch ?list/i.test(source.name) ? "watchlist" : /check ?-?ins?/i.test(source.name) ? "watched" : "list",
        listName: imdbListName(source.name),
      };
    })
    .filter(Boolean);
}

/**
 * De los archivos a { titles, ratings, watchlist, watched, lists }:
 *   titles    [{ imdbId, title, year, type }]
 *   ratings   [{ imdbId, rating, ratedAt }]      (la más reciente de cada título)
 *   watchlist [{ imdbId, addedAt }]
 *   watched   [{ imdbId, watchedAt }]           (listas con destino "watched")
 *   lists     [{ name, items: [{ imdbId, addedAt, position }] }]
 * Las listas con destino "watchlist" se suman a la watchlist y las "watched" a
 * vistos; dos archivos con el mismo nombre de lista se unen.
 */
export function buildImdbImport(files = []) {
  const titles = new Map();
  const addTitle = (row) => {
    const imdbId = imdbTitleId(row?.const) || imdbTitleId(row?.url);
    const type = String(row?.["title type"] || "").trim();
    if (!imdbId || UNSUPPORTED_TYPE.test(type)) return null;
    if (!titles.has(imdbId)) {
      const year = Number(String(row?.year || "").trim());
      titles.set(imdbId, {
        imdbId,
        title: String(row?.title || row?.["original title"] || "").trim(),
        year: Number.isInteger(year) && year > 1800 ? year : null,
        type,
      });
    }
    return imdbId;
  };

  const ratings = new Map();
  const watchlist = new Map();
  const watched = new Map();
  const lists = new Map();

  for (const file of Array.isArray(files) ? files : []) {
    if (file?.kind === "ratings") {
      for (const row of file.rows || []) {
        const imdbId = addTitle(row);
        const rating = imdbRating(row["your rating"]);
        if (!imdbId || !rating) continue;
        const ratedAt = imdbDay(row["date rated"]);
        const previous = ratings.get(imdbId);
        if (!previous || (ratedAt && (!previous.ratedAt || previous.ratedAt < ratedAt))) {
          ratings.set(imdbId, { imdbId, rating, ratedAt });
        }
      }
      continue;
    }
    if (file?.kind !== "list") continue;

    if (file.target === "watchlist" || file.target === "watched") {
      const target = file.target === "watchlist" ? watchlist : watched;
      for (const row of file.rows || []) {
        const imdbId = addTitle(row);
        if (!imdbId || target.has(imdbId)) continue;
        const date = imdbDay(row.created);
        target.set(imdbId, file.target === "watchlist" ? { imdbId, addedAt: date } : { imdbId, watchedAt: date });
      }
      continue;
    }

    const name = String(file.listName || "").trim().slice(0, IMDB_LIST_NAME_MAX) || imdbListName(file.name);
    const list = lists.get(name) || { name, items: new Map() };
    lists.set(name, list);
    for (const row of file.rows || []) {
      const imdbId = addTitle(row);
      if (!imdbId || list.items.has(imdbId)) continue;
      const position = Number(row.position);
      list.items.set(imdbId, {
        imdbId,
        addedAt: imdbDay(row.created),
        position: Number.isInteger(position) && position > 0 ? position : list.items.size + 1,
      });
    }
  }

  return {
    titles: [...titles.values()],
    ratings: [...ratings.values()],
    watchlist: [...watchlist.values()],
    watched: [...watched.values()].filter((item) => item.watchedAt),
    lists: [...lists.values()]
      .map((list) => ({ name: list.name, items: [...list.items.values()] }))
      .filter((list) => list.items.length),
  };
}

/** Reparte la importación en tandas de títulos, cada una con lo suyo. */
export function chunkImdbImport(data, size = IMDB_CHUNK_TITLES) {
  const titles = Array.isArray(data?.titles) ? data.titles : [];
  const chunks = [];
  for (let index = 0; index < titles.length; index += size) {
    const chunkTitles = titles.slice(index, index + size);
    const ids = new Set(chunkTitles.map((title) => title.imdbId));
    const inChunk = (item) => ids.has(item.imdbId);
    chunks.push({
      titles: chunkTitles,
      ratings: (data?.ratings || []).filter(inChunk),
      watchlist: (data?.watchlist || []).filter(inChunk),
      watched: (data?.watched || []).filter(inChunk),
      lists: (data?.lists || [])
        .map((list) => ({ name: list.name, items: list.items.filter(inChunk) }))
        .filter((list) => list.items.length),
    });
  }
  return chunks;
}

/**
 * Envía la importación por tandas a /api/imdb/import.
 * @param markWatched  marcar como vistas las películas y episodios puntuados.
 * @param onChunk      ({ done, total, totals }) tras cada tanda.
 */
export async function runImdbImport(data, { markWatched = true, onChunk, isCancelled } = {}) {
  const chunks = chunkImdbImport(data);
  const totals = {
    ratingsImported: 0,
    ratingsUpdated: 0,
    historyImported: 0,
    watchlistImported: 0,
    listsCreated: 0,
    listItemsImported: 0,
    resolved: 0,
    missing: [],
  };
  let done = 0;
  for (let index = 0; index < chunks.length; index += 1) {
    if (isCancelled?.()) return { totals, cancelled: true };
    const chunk = chunks[index];
    const res = await fetch("/api/imdb/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...chunk, markWatched, reset: index === 0 }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json?.error || "No se pudo importar desde IMDb.");
    const result = json?.import?.chunk || {};
    totals.ratingsImported += Number(result.ratings?.imported || 0);
    totals.ratingsUpdated += Number(result.ratings?.updated || 0);
    totals.historyImported += Number(result.history?.imported || 0);
    totals.watchlistImported += Number(result.watchlist?.imported || 0);
    totals.listsCreated += Number(result.lists?.created || 0);
    totals.listItemsImported += Number(result.lists?.imported || 0);
    totals.resolved += Number(json?.resolved || 0);
    totals.missing.push(...(Array.isArray(json?.missing) ? json.missing : []));
    done += chunk.titles.length;
    onChunk?.({ done, total: data.titles.length, totals: { ...totals, missing: [...totals.missing] } });
  }
  return { totals, cancelled: false };
}
