// Cliente de las detecciones de streaming (extensión del navegador y app
// Android) y de su corrección. Ver backend routes/streamingDetections.js.

const PLATFORM_LABELS = {
  netflix: "Netflix",
  primevideo: "Prime Video",
  prime: "Prime Video",
  max: "Max",
  hbomax: "Max",
  disney: "Disney+",
  disneyplus: "Disney+",
  appletv: "Apple TV+",
  movistar: "Movistar Plus+",
  crunchyroll: "Crunchyroll",
  plex: "Plex",
  filmin: "Filmin",
  skyshowtime: "SkyShowtime",
  plutotv: "Pluto TV",
  rakuten: "Rakuten TV",
  atresplayer: "Atresplayer",
  rtve: "RTVE Play",
};

/** Nombre legible de la plataforma de una detección. */
export function detectionPlatformLabel(detection) {
  const id = String(detection?.platform || "").toLowerCase();
  if (PLATFORM_LABELS[id]) return PLATFORM_LABELS[id];
  if (!id) return "Streaming";
  return id.charAt(0).toUpperCase() + id.slice(1);
}

async function readJson(res, fallbackMessage) {
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = new Error(json?.error || fallbackMessage);
    error.status = res.status;
    throw error;
  }
  return json;
}

export async function fetchRecentDetections({ days = 7, signal } = {}) {
  const res = await fetch(`/api/streaming/detections?days=${days}`, {
    cache: "no-store",
    credentials: "include",
    signal,
  });
  const json = await readJson(res, "No se pudieron cargar las detecciones");
  return Array.isArray(json?.results) ? json.results : [];
}

export async function fetchDetection(id, { signal } = {}) {
  const res = await fetch(`/api/streaming/detections/${encodeURIComponent(id)}`, {
    cache: "no-store",
    credentials: "include",
    signal,
  });
  const json = await readJson(res, "No se pudo cargar la detección");
  return json?.detection || null;
}

/**
 * Corrige una detección.
 * @param {string} id
 * @param {{ verdict: 'not_a_title' } | { verdict: 'wrong_title', item?: object,
 *   season?: number|null, episode?: number|null }} correction
 */
export async function correctDetection(id, correction) {
  const body = { verdict: correction.verdict };
  const item = correction.item;
  if (correction.verdict === "wrong_title" && item) {
    body.tmdbId = Number(item.id);
    body.mediaType = item.media_type === "tv" ? "tv" : "movie";
    body.title = item.title || item.name || null;
    body.posterPath = item.poster_path || null;
    if (body.mediaType === "tv" && Number(correction.season) > 0 && Number(correction.episode) > 0) {
      body.season = Number(correction.season);
      body.episode = Number(correction.episode);
    }
  }
  const res = await fetch(`/api/streaming/detections/${encodeURIComponent(id)}/correction`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await readJson(res, "No se pudo guardar la corrección");
  return json?.detection || null;
}
