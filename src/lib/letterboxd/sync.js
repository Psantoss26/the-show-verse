"use client";

// Sincronización completa con Letterboxd desde el navegador:
//
//   1. La extensión de The Show Verse descarga la exportación oficial de
//      Letterboxd con la sesión de letterboxd.com de este navegador
//      (netflix-extension/letterboxd-export.js). Letterboxd bloquea las
//      lecturas desde el servidor; desde el navegador de la persona, no.
//   2. Se lee aquí (lib/letterboxd/export) y se envía por tandas a
//      /api/letterboxd/import, solo lo nuevo o cambiado desde la última vez.
//   3. Se avisa al backend para que dé el historial por sincronizado.

import {
  buildLetterboxdImport,
  chunkLetterboxdImport,
  letterboxdChunkKeys,
  pendingLetterboxdImport,
  readLetterboxdFiles,
} from "./export.js";

const EXTENSION_ID = process.env.NEXT_PUBLIC_NETFLIX_EXTENSION_ID || "";
const EXPORT_TIMEOUT_MS = 150000;
const PING_TIMEOUT_MS = 1500;
const SYNCED_KEY_PREFIX = "showverse:letterboxd:synced:";
const AUTO_KEY = "showverse:letterboxd:lastAutoSync";
export const LETTERBOXD_AUTO_SYNC_MS = 24 * 60 * 60 * 1000;

export class LetterboxdSyncError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

function viaExtensionId(message, timeoutMs) {
  return new Promise((resolve) => {
    const runtime = typeof window !== "undefined" ? window.chrome?.runtime : null;
    if (!EXTENSION_ID || typeof runtime?.sendMessage !== "function") {
      resolve(null);
      return;
    }
    const timer = window.setTimeout(() => resolve(null), timeoutMs);
    try {
      runtime.sendMessage(EXTENSION_ID, message, (response) => {
        window.clearTimeout(timer);
        resolve(runtime.lastError ? null : response || null);
      });
    } catch {
      window.clearTimeout(timer);
      resolve(null);
    }
  });
}

// Puente por eventos del DOM (content-showverse.js), cuando no hay mensajería por ID.
function viaDomEvents(requestEvent, responseEvent, timeoutMs) {
  return new Promise((resolve) => {
    if (typeof document === "undefined") {
      resolve(null);
      return;
    }
    const timer = window.setTimeout(() => {
      document.removeEventListener(responseEvent, onResponse);
      resolve(null);
    }, timeoutMs);
    function onResponse(event) {
      window.clearTimeout(timer);
      document.removeEventListener(responseEvent, onResponse);
      resolve(event?.detail || null);
    }
    document.addEventListener(responseEvent, onResponse);
    document.dispatchEvent(new CustomEvent(requestEvent));
  });
}

/** ¿Está la extensión en este navegador? */
export async function detectShowVerseExtension() {
  const byId = await viaExtensionId({ action: "ping" }, PING_TIMEOUT_MS);
  if (byId?.installed || byId?.success) return true;
  const byDom = await viaDomEvents("request-tsv-ext-ping", "response-tsv-ext-ping", PING_TIMEOUT_MS);
  return Boolean(byDom?.installed);
}

/** Pide a la extensión la exportación de Letterboxd. Devuelve un ArrayBuffer. */
export async function requestLetterboxdExport() {
  const response =
    (await viaExtensionId({ action: "letterboxdExport" }, EXPORT_TIMEOUT_MS)) ||
    (await viaDomEvents("request-letterboxd-export", "response-letterboxd-export", EXPORT_TIMEOUT_MS));
  if (!response) {
    throw new LetterboxdSyncError(
      "no_extension",
      "No responde la extensión de The Show Verse. Instálala o actualízala (versión 3.2 o posterior) y recarga la página.",
    );
  }
  if (!response.success || !response.base64) {
    throw new LetterboxdSyncError(response.code || "export", response.error || "No se pudo descargar la exportación de Letterboxd.");
  }
  const binary = atob(response.base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes.buffer;
}

function storageKey(username) {
  return `${SYNCED_KEY_PREFIX}${String(username || "").toLowerCase()}`;
}

function readSyncedKeys(username) {
  try {
    const raw = window.localStorage.getItem(storageKey(username));
    const list = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(list) ? list : []);
  } catch {
    return new Set();
  }
}

function writeSyncedKeys(username, keys) {
  try {
    window.localStorage.setItem(storageKey(username), JSON.stringify([...keys]));
  } catch {
    /* sin almacenamiento: la próxima vez se reenvía todo (el backend no duplica) */
  }
}

export function readLastAutoSync() {
  try {
    return Number(window.localStorage.getItem(AUTO_KEY)) || 0;
  } catch {
    return 0;
  }
}

export function writeLastAutoSync(value = Date.now()) {
  try {
    window.localStorage.setItem(AUTO_KEY, String(value));
  } catch {
    /* sin almacenamiento */
  }
}

/**
 * Envía la importación por tandas a /api/letterboxd/import.
 * @param onChunk  ({ done, total, totals }) tras cada tanda.
 * @param onChunkDone  (chunk) tras cada tanda importada (para recordar sus claves).
 */
export async function runLetterboxdImport(data, { onChunk, onChunkDone, isCancelled } = {}) {
  const chunks = chunkLetterboxdImport(data);
  const totals = {
    historyImported: 0,
    historySkipped: 0,
    ratingsImported: 0,
    ratingsUpdated: 0,
    favoritesImported: 0,
    watchlistImported: 0,
    reviewsImported: 0,
    resolved: 0,
    missing: [],
  };
  let done = 0;
  for (let index = 0; index < chunks.length; index += 1) {
    if (isCancelled?.()) return { totals, cancelled: true };
    const chunk = chunks[index];
    const res = await fetch("/api/letterboxd/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...chunk, reset: index === 0 }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new LetterboxdSyncError("import", json?.error || "No se pudo importar desde Letterboxd.");
    const history = json?.import?.chunk?.history || {};
    const ratings = json?.import?.chunk?.ratings || {};
    totals.historyImported += Number(history.imported || 0);
    totals.historySkipped += Number(history.skipped || 0);
    totals.ratingsImported += Number(ratings.imported || 0);
    totals.ratingsUpdated += Number(ratings.updated || 0);
    totals.favoritesImported += Number(json?.import?.chunk?.favorites?.imported || 0);
    totals.watchlistImported += Number(json?.import?.chunk?.watchlist?.imported || 0);
    totals.reviewsImported += Number(json?.import?.chunk?.reviews?.imported || 0);
    totals.resolved += Number(json?.resolved || 0);
    totals.missing.push(...(Array.isArray(json?.missing) ? json.missing : []));
    done += chunk.films.length;
    onChunkDone?.(chunk, json);
    onChunk?.({ done, total: data.films.length, totals: { ...totals, missing: [...totals.missing] } });
  }
  return { totals, cancelled: false };
}

/**
 * Sincronización completa con la extensión.
 * @param username  usuario de Letterboxd conectado (para recordar lo enviado).
 * @param full      reenviar todo aunque ya se hubiera enviado.
 * @param onPhase   ("export" | "read" | "import", { done, total, totals }).
 */
let currentSync = null;

export function isLetterboxdSyncRunning() {
  return Boolean(currentSync);
}

export function syncLetterboxdWithExtension(options = {}) {
  // Una sola a la vez (la automática y la del botón de Ajustes comparten esta).
  if (currentSync) return currentSync;
  currentSync = runExtensionSync(options).finally(() => {
    currentSync = null;
  });
  return currentSync;
}

async function runExtensionSync({ username, full = false, onPhase, isCancelled } = {}) {
  onPhase?.("export", {});
  const buffer = await requestLetterboxdExport();

  onPhase?.("read", {});
  const texts = await readLetterboxdFiles([{ name: "letterboxd.zip", arrayBuffer: async () => buffer }]);
  if (!Object.keys(texts).length) {
    throw new LetterboxdSyncError("export", "La exportación de Letterboxd no trae diario, películas vistas, puntuaciones, reseñas, favoritas ni pendientes.");
  }
  const all = buildLetterboxdImport(texts);

  const synced = full ? new Set() : readSyncedKeys(username);
  const pending = pendingLetterboxdImport(all, synced);
  const sent = new Set(synced);
  onPhase?.("import", { done: 0, total: pending.films.length });
  const { totals, cancelled } = await runLetterboxdImport(pending, {
    isCancelled,
    onChunk: (progress) => onPhase?.("import", progress),
    onChunkDone: (chunk) => {
      letterboxdChunkKeys(chunk).forEach((key) => sent.add(key));
      writeSyncedKeys(username, sent);
    },
  });

  const summary = {
    films: all.films.length,
    pending: pending.films.length,
    history: totals.historyImported,
    ratings: totals.ratingsImported + totals.ratingsUpdated,
    favorites: totals.favoritesImported,
    watchlist: totals.watchlistImported,
    reviews: totals.reviewsImported,
    missing: totals.missing,
  };
  if (!cancelled) {
    await fetch("/api/letterboxd/extension-sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ films: summary.films, history: summary.history, ratings: summary.ratings, missing: summary.missing.length }),
    }).catch(() => {});
  }
  return { ...summary, cancelled };
}
