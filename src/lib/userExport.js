// src/lib/userExport.js
// Exportación de favoritos, pendientes y puntuaciones. /api/user/export
// devuelve los datos en JSON y aquí se convierten, en el navegador, en el
// archivo elegido:
//
//   - csv          un CSV por sección (en un ZIP si hay más de uno), con
//                  películas, series, temporadas y episodios.
//   - letterboxd   CSV con las columnas que entiende el importador de
//                  Letterboxd (tmdbID, imdbID, Title, Year, Rating10). Solo
//                  películas: Letterboxd no tiene series y un id de serie de
//                  TMDb se confundiría con el de otra película.
//   - json         todo en un archivo, tal cual lo da el servidor.

export const EXPORT_SECTIONS = ["favorites", "watchlist", "ratings"];
export const EXPORT_FORMATS = ["csv", "letterboxd", "json"];

const SECTION_FILE = {
  favorites: "favoritos",
  watchlist: "pendientes",
  ratings: "puntuaciones",
};

const BASE_COLUMNS = [
  ["Title", (row) => row.title],
  ["OriginalTitle", (row) => row.originalTitle],
  ["Year", (row) => row.year],
  ["Type", (row) => row.mediaType],
];
const ID_COLUMNS = [
  ["tmdbID", (row) => row.tmdbId],
  ["imdbID", (row) => row.imdbId],
];

const CSV_COLUMNS = {
  favorites: [...BASE_COLUMNS, ...ID_COLUMNS, ["AddedAt", (row) => row.addedAt]],
  watchlist: [
    ...BASE_COLUMNS,
    ...ID_COLUMNS,
    ["Priority", (row) => row.priority],
    ["AddedAt", (row) => row.addedAt],
  ],
  ratings: [
    ...BASE_COLUMNS,
    ["Season", (row) => row.season],
    ["Episode", (row) => row.episode],
    ["Rating10", (row) => row.rating],
    ...ID_COLUMNS,
    ["RatedAt", (row) => row.ratedAt],
  ],
};

const LETTERBOXD_BASE = [
  ["tmdbID", (row) => row.tmdbId],
  ["imdbID", (row) => row.imdbId],
  ["Title", (row) => row.title],
  ["Year", (row) => row.year],
];
const LETTERBOXD_COLUMNS = {
  favorites: LETTERBOXD_BASE,
  watchlist: LETTERBOXD_BASE,
  // Letterboxd puntúa de media en media estrella: Rating10 entero de 1 a 10.
  ratings: [
    ...LETTERBOXD_BASE,
    ["Rating10", (row) => Math.min(10, Math.max(1, Math.round(Number(row.rating))))],
  ],
};

function csvField(value) {
  if (value === null || value === undefined) return "";
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** CSV (RFC 4180, fin de línea CRLF) a partir de [[cabecera, valor(row)]]. */
export function toCsv(columns, rows) {
  const lines = [columns.map(([header]) => csvField(header)).join(",")];
  for (const row of rows) {
    lines.push(columns.map(([, value]) => csvField(value(row))).join(","));
  }
  return `${lines.join("\r\n")}\r\n`;
}

/** "2026-10-14" en la zona horaria del usuario. */
export function exportDateStamp(date = new Date()) {
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Filas de cada sección que entran en el formato (Letterboxd: solo películas). */
export function exportRows(data, section, format) {
  const rows = Array.isArray(data?.[section]) ? data[section] : [];
  return format === "letterboxd" ? rows.filter((row) => row.mediaType === "movie") : rows;
}

/**
 * Archivos de la exportación: { files: [{ name, text }], counts }. `counts`
 * son las filas exportadas de cada sección pedida.
 */
export function buildExportFiles(data, { format = "csv", sections = EXPORT_SECTIONS } = {}) {
  const wanted = EXPORT_SECTIONS.filter((section) => sections.includes(section));
  const counts = Object.fromEntries(
    wanted.map((section) => [section, exportRows(data, section, format).length]),
  );

  if (format === "json") {
    const payload = { ...data };
    for (const section of EXPORT_SECTIONS) {
      if (!wanted.includes(section)) delete payload[section];
    }
    return {
      counts,
      files: [{ name: "the-show-verse.json", text: `${JSON.stringify(payload, null, 2)}\n` }],
    };
  }

  const letterboxd = format === "letterboxd";
  const columns = letterboxd ? LETTERBOXD_COLUMNS : CSV_COLUMNS;
  const files = wanted.map((section) => ({
    name: `${letterboxd ? "letterboxd-" : ""}${SECTION_FILE[section]}.csv`,
    // BOM para que Excel lea bien los acentos. El importador de Letterboxd no
    // lo necesita y es mejor no arriesgar a que lo tome por parte de la cabecera.
    text: `${letterboxd ? "" : "﻿"}${toCsv(columns[section], exportRows(data, section, format))}`,
  }));
  return { counts, files };
}

// ── ZIP ──────────────────────────────────────────────────────────────────
// Sin compresión: los CSV pesan poco y así no depende de CompressionStream.

let crcTable = null;

function crc32(bytes) {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let index = 0; index < 256; index += 1) {
      let value = index;
      for (let bit = 0; bit < 8; bit += 1) {
        value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
      }
      crcTable[index] = value >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (let index = 0; index < bytes.length; index += 1) {
    crc = crcTable[(crc ^ bytes[index]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function dosDateTime(date) {
  const year = Math.max(1980, date.getFullYear());
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  };
}

/** ZIP (método 0, nombres en UTF-8) con [{ name, text }] → Uint8Array. */
export function createZip(files, date = new Date()) {
  const encoder = new TextEncoder();
  const stamp = dosDateTime(date);
  const entries = files.map((file) => {
    const name = encoder.encode(file.name);
    const data = typeof file.text === "string" ? encoder.encode(file.text) : file.text;
    return { name, data, crc: crc32(data) };
  });

  const localSize = entries.reduce((sum, entry) => sum + 30 + entry.name.length + entry.data.length, 0);
  const centralSize = entries.reduce((sum, entry) => sum + 46 + entry.name.length, 0);
  const out = new Uint8Array(localSize + centralSize + 22);
  const view = new DataView(out.buffer);
  let offset = 0;

  const header = (signature, entry) => {
    view.setUint32(offset, signature, true);
    offset += 4;
    if (signature === 0x02014b50) {
      view.setUint16(offset, 20, true); // versión que lo creó
      offset += 2;
    }
    view.setUint16(offset, 20, true); // versión necesaria
    view.setUint16(offset + 2, 0x0800, true); // nombres en UTF-8
    view.setUint16(offset + 4, 0, true); // sin compresión
    view.setUint16(offset + 6, stamp.time, true);
    view.setUint16(offset + 8, stamp.date, true);
    view.setUint32(offset + 10, entry.crc, true);
    view.setUint32(offset + 14, entry.data.length, true);
    view.setUint32(offset + 18, entry.data.length, true);
    view.setUint16(offset + 22, entry.name.length, true);
    view.setUint16(offset + 24, 0, true); // campo extra
    offset += 26;
  };

  for (const entry of entries) {
    entry.offset = offset;
    header(0x04034b50, entry);
    out.set(entry.name, offset);
    offset += entry.name.length;
    out.set(entry.data, offset);
    offset += entry.data.length;
  }

  const centralStart = offset;
  for (const entry of entries) {
    header(0x02014b50, entry);
    view.setUint16(offset, 0, true); // comentario
    view.setUint16(offset + 2, 0, true); // disco
    view.setUint16(offset + 4, 0, true); // atributos internos
    view.setUint32(offset + 6, 0, true); // atributos externos
    view.setUint32(offset + 10, entry.offset, true);
    offset += 14;
    out.set(entry.name, offset);
    offset += entry.name.length;
  }

  view.setUint32(offset, 0x06054b50, true);
  view.setUint16(offset + 4, 0, true);
  view.setUint16(offset + 6, 0, true);
  view.setUint16(offset + 8, entries.length, true);
  view.setUint16(offset + 10, entries.length, true);
  view.setUint32(offset + 12, centralSize, true);
  view.setUint32(offset + 16, centralStart, true);
  view.setUint16(offset + 20, 0, true);
  return out;
}

/**
 * El archivo que se descarga: { name, blob }. Un solo archivo va suelto
 * (con la fecha en el nombre); varios, en un ZIP.
 */
export function packageExport(files, { format = "csv", date = new Date() } = {}) {
  const stamp = exportDateStamp(date);
  if (format === "json") {
    return {
      name: `the-show-verse-${stamp}.json`,
      blob: new Blob([files[0].text], { type: "application/json;charset=utf-8" }),
    };
  }
  if (files.length === 1) {
    const [file] = files;
    return {
      name: `the-show-verse-${file.name.replace(/\.csv$/, "")}-${stamp}.csv`,
      blob: new Blob([file.text], { type: "text/csv;charset=utf-8" }),
    };
  }
  const prefix = format === "letterboxd" ? "the-show-verse-letterboxd" : "the-show-verse";
  return {
    name: `${prefix}-${stamp}.zip`,
    blob: new Blob([createZip(files, date)], { type: "application/zip" }),
  };
}

/** Pide la exportación al servidor con las secciones elegidas. */
export async function fetchUserExport(sections = EXPORT_SECTIONS) {
  const include = EXPORT_SECTIONS.filter((section) => sections.includes(section)).join(",");
  const res = await fetch(`/api/user/export?include=${encodeURIComponent(include)}`, {
    cache: "no-store",
    credentials: "include",
  });
  const json = await res.json().catch(() => null);
  if (res.status === 401) throw new Error("Inicia sesión para exportar tus datos.");
  if (res.status === 429) throw new Error("Demasiadas exportaciones seguidas. Espera un minuto.");
  if (!res.ok || !json || json.error) {
    throw new Error("No se pudieron leer tus datos. Inténtalo de nuevo.");
  }
  return json;
}
