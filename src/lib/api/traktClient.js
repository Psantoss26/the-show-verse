// /src/lib/api/traktClient.js
async function safeJson(res) {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

let traktAuthBootstrapPromise = null;
let traktAuthBootstrapAt = 0;
let traktAuthBootstrapValue = null;
const inFlightGetRequests = new Map();

async function fetchGetJsonDeduped(
  url,
  { credentials = "include", cache = "no-store" } = {},
) {
  if (inFlightGetRequests.has(url)) {
    return inFlightGetRequests.get(url);
  }

  const promise = (async () => {
    const res = await fetch(url, { cache, credentials });
    const json = await safeJson(res);
    if (!res.ok) {
      throw new Error(json?.error || `HTTP ${res.status}`);
    }
    return json;
  })().finally(() => {
    inFlightGetRequests.delete(url);
  });

  inFlightGetRequests.set(url, promise);
  return promise;
}

async function ensureTraktAuthReady({ force = false } = {}) {
  if (typeof window === "undefined") return { connected: false };

  const now = Date.now();
  if (
    !force &&
    traktAuthBootstrapValue &&
    now - traktAuthBootstrapAt < 5000
  ) {
    return traktAuthBootstrapValue;
  }

  if (!force && traktAuthBootstrapPromise) {
    return traktAuthBootstrapPromise;
  }

  traktAuthBootstrapPromise = (async () => {
    const res = await fetch("/api/trakt/auth/status", {
      cache: "no-store",
      credentials: "include",
    });
    const json = await safeJson(res);
    const status = json || { connected: false };
    traktAuthBootstrapValue = status;
    traktAuthBootstrapAt = Date.now();
    return status;
  })();

  try {
    return await traktAuthBootstrapPromise;
  } finally {
    traktAuthBootstrapPromise = null;
  }
}

/**
 * Normaliza watchedAt para enviar al backend de forma consistente.
 * Devuelve "YYYY-MM-DD" o null
 */
function normalizeWatchedAtForApi(input) {
  if (input == null) return null;

  if (input instanceof Date && !Number.isNaN(input.getTime())) {
    return input.toISOString().slice(0, 10);
  }

  const s = String(input).trim();
  if (!s) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (m) {
    const dd = String(parseInt(m[1], 10)).padStart(2, "0");
    const mm = String(parseInt(m[2], 10)).padStart(2, "0");
    const yyyy = m[3];
    const ymd = `${yyyy}-${mm}-${dd}`;
    return /^\d{4}-\d{2}-\d{2}$/.test(ymd) ? ymd : null;
  }

  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);

  return null;
}

/**
 * Normaliza watchedAt para endpoints de HISTORIAL (plays) en Trakt.
 * Devuelve ISO completo (ej: 2026-01-14T12:34:56.000Z) o null.
 */
function normalizeWatchedAtForHistoryApi(input) {
  if (input == null) return null;

  // Date
  if (input instanceof Date && !Number.isNaN(input.getTime())) {
    return input.toISOString();
  }

  const s = String(input).trim();
  if (!s) return null;

  // YYYY-MM-DD -> medianoche UTC
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const d = new Date(`${s}T00:00:00.000Z`);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }

  // DD/MM/YYYY o DD-MM-YYYY (por si llega así)
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (m) {
    const dd = String(parseInt(m[1], 10)).padStart(2, "0");
    const mm = String(parseInt(m[2], 10)).padStart(2, "0");
    const yyyy = m[3];
    const d = new Date(`${yyyy}-${mm}-${dd}T00:00:00.000Z`);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }

  // ISO o cualquier string parseable
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return d.toISOString();

  return null;
}

export async function traktAuthStatus() {
  return ensureTraktAuthReady({ force: true });
}

export async function traktDisconnect() {
  const res = await fetch("/api/trakt/auth/disconnect", { method: "POST" });
  const json = await safeJson(res);
  if (!res.ok) throw new Error(json?.error || "Disconnect failed");
  return json;
}

export async function traktGetItemStatus({ type, tmdbId, traktId } = {}) {
  const auth = await ensureTraktAuthReady();
  if (!auth?.connected) return { connected: false };

  const qs = new URLSearchParams({ type: String(type) });
  if (tmdbId != null) qs.set("tmdbId", String(tmdbId));
  if (traktId != null) qs.set("traktId", String(traktId));
  return fetchGetJsonDeduped(`/api/trakt/item/status?${qs.toString()}`);
}

export async function traktSetWatched({ type, tmdbId, watched, watchedAt }) {
  const watchedAtYmd = normalizeWatchedAtForApi(watchedAt);

  const payload = { type, tmdbId, watched };
  if (watchedAtYmd) payload.watchedAt = watchedAtYmd;

  const res = await fetch("/api/trakt/item/watched", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const json = await safeJson(res);
  if (!res.ok)
    throw new Error(json?.error || `Trakt watched HTTP ${res.status}`);
  return json;
}

export async function traktHistoryOp({
  op,
  type,
  tmdbId,
  watchedAt,
  historyId,
}) {
  const payload = { op };
  if (type != null) payload.type = type;
  if (tmdbId != null) payload.tmdbId = tmdbId;
  if (historyId != null) payload.historyId = historyId;

  const watchedAtYmd = normalizeWatchedAtForApi(watchedAt);
  if (watchedAtYmd) payload.watchedAt = watchedAtYmd;

  const res = await fetch("/api/trakt/item/history", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const json = await safeJson(res);
  if (!res.ok)
    throw new Error(json?.error || `Trakt history HTTP ${res.status}`);
  return json;
}

export async function traktAddWatchPlay({ type, tmdbId, watchedAt }) {
  return traktHistoryOp({ op: "add", type, tmdbId, watchedAt });
}

export async function traktUpdateWatchPlay({
  type,
  tmdbId,
  historyId,
  watchedAt,
}) {
  return traktHistoryOp({ op: "update", type, tmdbId, historyId, watchedAt });
}

export async function traktRemoveWatchPlay({ historyId }) {
  return traktHistoryOp({ op: "remove", historyId });
}

/**
 * Historial global
 */
export async function traktGetHistory({
  type = "all",
  from,
  to,
  page = 1,
  limit = "all",
  extended = "full",
} = {}) {
  const qs = new URLSearchParams();
  qs.set("type", type);
  qs.set("page", String(page));
  qs.set("limit", String(limit));
  if (from) qs.set("from", from);
  if (to) qs.set("to", to);
  if (extended) qs.set("extended", extended);

  const res = await fetch(`/api/trakt/history?${qs.toString()}`, {
    cache: "no-store",
  });
  const json = await safeJson(res);
  if (!res.ok)
    throw new Error(json?.error || `Trakt history HTTP ${res.status}`);
  return json;
}

/** ✅ NUEVO/CLAVE: carga episodios vistos por show (SIN especiales) */
export async function traktGetShowWatched({ tmdbId, traktId } = {}) {
  const auth = await ensureTraktAuthReady();
  if (!auth?.connected) return { connected: false, found: false, watchedBySeason: {} };

  const qs = new URLSearchParams();
  if (tmdbId != null) qs.set("tmdbId", String(tmdbId));
  if (traktId != null) qs.set("traktId", String(traktId));
  return fetchGetJsonDeduped(`/api/trakt/show/watched?${qs.toString()}`); // { watchedBySeason }
}

/** ✅ Toggle episodio + devuelve watchedBySeason actualizado */
export async function traktSetEpisodeWatched({
  tmdbId,
  season,
  episode,
  watched,
  watchedAt,
}) {
  const watchedAtYmd = normalizeWatchedAtForApi(watchedAt);

  const payload = { tmdbId, season, episode, watched };
  if (watchedAtYmd) payload.watchedAt = watchedAtYmd;

  const res = await fetch("/api/trakt/episode/watched", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const json = await safeJson(res);
  if (!res.ok)
    throw new Error(json?.error || `Trakt episode watched HTTP ${res.status}`);
  return json; // { watchedBySeason }
}

// ✅ COMMUNITY: comentarios, listas, temporadas
export async function traktGetComments({
  type,
  tmdbId,
  sort = "likes",
  page = 1,
  limit = 20,
}) {
  const qs = new URLSearchParams({
    type: String(type),
    tmdbId: String(tmdbId),
    sort: String(sort),
    page: String(page),
    limit: String(limit),
  });
  const res = await fetch(`/api/trakt/community/comments?${qs.toString()}`, {
    cache: "no-store",
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error || "Error cargando comentarios");
  return json;
}

export async function traktGetLists({
  type,
  tmdbId,
  tab = "popular",
  page = 1,
  limit = 10,
  countOnly = false,
}) {
  const qs = new URLSearchParams({
    type: String(type),
    tmdbId: String(tmdbId),
    tab: String(tab),
    page: String(page),
    limit: String(limit),
    countOnly: String(countOnly),
  });
  const res = await fetch(`/api/trakt/community/lists?${qs.toString()}`, {
    cache: "no-store",
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error || "Error cargando listas");
  return json;
}

export async function traktGetShowSeasons({ tmdbId, extended = "full" }) {
  const qs = new URLSearchParams({
    tmdbId: String(tmdbId),
    extended: String(extended),
  });
  const res = await fetch(`/api/trakt/community/seasons?${qs.toString()}`, {
    cache: "no-store",
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error || "Error cargando temporadas");
  return json;
}

export async function traktGetScoreboard({ type, tmdbId, traktId } = {}) {
  const qs = new URLSearchParams({ type: String(type) });
  if (tmdbId != null) qs.set("tmdbId", String(tmdbId));
  if (traktId != null) qs.set("traktId", String(traktId));
  const res = await fetch(`/api/trakt/scoreboard?${qs.toString()}`, {
    method: "GET",
    credentials: "include",
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error || "Error cargando scoreboard");
  return json;
}

export async function traktGetStats({ type, tmdbId, traktId } = {}) {
  const qs = new URLSearchParams({ type: String(type) });
  if (tmdbId != null) qs.set("tmdbId", String(tmdbId));
  if (traktId != null) qs.set("traktId", String(traktId));

  const res = await fetch(`/api/trakt/stats?${qs.toString()}`, {
    cache: "no-store",
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error || "Error cargando stats de Trakt");
  return json;
}

export async function traktSetRating({
  type,
  tmdbId,
  ids,
  season,
  episode,
  rating,
}) {
  const body = {
    type,
    rating: rating == null ? null : Number(rating),
  };

  // ✅ movie/show: tu route espera tmdbId
  const tmdb = tmdbId ?? ids?.tmdb;
  if (tmdb != null) body.tmdbId = Number(tmdb);

  // ✅ season/episode: por si lo reutilizas (tu backend ya puede resolver por tmdbId+season/episode)
  if (season != null) body.season = Number(season);
  if (episode != null) body.episode = Number(episode);

  // ✅ opcional: si tu backend aceptara traktId directo
  if (ids?.trakt != null) body.traktId = Number(ids.trakt);

  const res = await fetch("/api/trakt/ratings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(json?.error || "Trakt rating failed");
    err.status = res.status;
    err.code = json?.code || null;
    throw err;
  }
  return json;
}

export async function traktRemoveRating({ type, ids }) {
  const res = await fetch("/api/trakt/ratings", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type, ids }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      data?.error || `Trakt remove rating failed (${res.status})`,
    );
  }
  return data;
}

// ✅ GET plays + (opcional) progreso desde startAt (rewatch run)
export async function traktGetShowPlays({ tmdbId, startAt, endBefore } = {}) {
  const qs = new URLSearchParams({ tmdbId: String(tmdbId) });
  if (startAt) qs.set("startAt", String(startAt));
  if (endBefore) qs.set("endBefore", String(endBefore));

  const res = await fetch(`/api/trakt/show/plays?${qs.toString()}`, {
    cache: "no-store",
  });
  const json = await safeJson(res);
  if (!res.ok)
    throw new Error(json?.error || `Trakt show plays HTTP ${res.status}`);
  return json;
}

export async function traktRemoveHistoryEntries({ ids } = {}) {
  const safeIds = Array.isArray(ids)
    ? ids.map((x) => Number(x)).filter((n) => Number.isFinite(n) && n > 0)
    : [];

  if (!safeIds.length) return { ok: true, data: { deleted: 0 } };

  const res = await fetch("/api/trakt/history/remove", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids: safeIds }),
  });

  const json = await safeJson(res);
  if (!res.ok)
    throw new Error(
      json?.error || `Trakt remove history entries HTTP ${res.status}`,
    );
  return json;
}

// ✅ Añadir "visionado completo" (play) como HISTORIAL (ISO, no YYYY-MM-DD)
export async function traktAddShowPlay({ tmdbId, watchedAt }) {
  const watchedAtIso = normalizeWatchedAtForHistoryApi(watchedAt);
  const payload = { tmdbId };
  if (watchedAtIso) payload.watchedAt = watchedAtIso;

  const res = await fetch("/api/trakt/show/plays", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const json = await safeJson(res);
  if (!res.ok)
    throw new Error(json?.error || `Trakt add show play HTTP ${res.status}`);
  return json;
}
/**
 * Obtiene las series en progreso del usuario
 */
export async function traktGetInProgress() {
  const res = await fetch("/api/trakt/show/in-progress", { cache: "no-store" });
  const json = await safeJson(res);
  if (!res.ok)
    throw new Error(json?.error || `Trakt in-progress HTTP ${res.status}`);
  return json;
}
/**
 * Obtiene las series completadas del usuario
 */
export async function traktGetCompleted() {
  const res = await fetch("/api/trakt/show/completed", { cache: "no-store" });
  const json = await safeJson(res);
  if (!res.ok)
    throw new Error(json?.error || `Trakt completed HTTP ${res.status}`);
  return json;
}

/**
 * Obtiene recomendaciones relacionadas desde Trakt para una película o serie
 * @param {Object} params
 * @param {string} params.type - 'movie' o 'tv'
 * @param {string|number} params.tmdbId - ID de TMDb
 * @returns {Promise<{results: Array}>}
 */
export async function getTraktRelated({ type, tmdbId }) {
  const res = await fetch(`/api/trakt/related?type=${type}&tmdbId=${tmdbId}`);
  const json = await safeJson(res);
  if (!res.ok) {
    console.error(`Error fetching Trakt related: ${res.status}`);
    return { results: [] };
  }
  return json || { results: [] };
}
// ✅ Añadir play de episodio (rewatch-friendly) (ISO, no YYYY-MM-DD)
export async function traktAddEpisodePlay({
  tmdbId,
  season,
  episode,
  watchedAt,
}) {
  const watchedAtIso = normalizeWatchedAtForHistoryApi(watchedAt);

  const payload = { tmdbId, season, episode };
  if (watchedAtIso) payload.watchedAt = watchedAtIso;

  const res = await fetch("/api/trakt/episode/play", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const json = await safeJson(res);
  if (!res.ok)
    throw new Error(json?.error || `Trakt episode play HTTP ${res.status}`);
  return json;
}
