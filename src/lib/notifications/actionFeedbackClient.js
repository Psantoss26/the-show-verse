"use client";

// Canal ÚNICO de ventanas emergentes de la app (InAppNotifications).
//
//   showToast({ icon, label, title?, text, posterPath?, image?, url?, key? })
//     → cualquier parte de la web puede avisar.
//   installActionFeedback()
//     → envuelve `fetch` para avisar de TODA acción que termine bien
//       (reglas en actionFeedback.js), sin tocar cada botón.

import { activityTypeOf, describeAction } from "@/lib/notifications/actionFeedback";

export const TOAST_EVENT = "tsv:toast";

// Acciones hechas en ESTE dispositivo hace poco, para no repetirlas cuando la
// campana las traiga como actividad propia ("Has añadido a Favoritas…").
const LOCAL_ACTION_TTL_MS = 5 * 60 * 1000;
const localActions = new Map();

export function showToast(toast) {
  if (typeof window === "undefined" || !toast) return;
  window.dispatchEvent(new CustomEvent(TOAST_EVENT, { detail: toast }));
}

/** ¿Esta actividad de la campana es una acción que ya se avisó aquí? */
export function isRecentLocalAction({ type, mediaType, tmdbId } = {}) {
  const at = localActions.get(`${type}:${mediaType}:${Number(tmdbId)}`);
  return at != null && Date.now() - at < LOCAL_ACTION_TTL_MS;
}

/**
 * Marca una actividad como ya avisada en este dispositivo (`type`: watched,
 * rating, favorite, watchlist), para que la campana no la repita.
 */
export function rememberLocalActivity(type, mediaType, tmdbId) {
  if (!type || !Number(tmdbId)) return;
  const now = Date.now();
  localActions.set(`${type}:${mediaType}:${Number(tmdbId)}`, now);
  for (const [key, at] of localActions) if (now - at > LOCAL_ACTION_TTL_MS) localActions.delete(key);
}

function rememberLocalAction(descriptor) {
  rememberLocalActivity(activityTypeOf(descriptor), descriptor.mediaType, descriptor.tmdbId);
}

function requestParts(input, init) {
  const method = init?.method || (typeof Request !== "undefined" && input instanceof Request ? input.method : "GET");
  const url =
    typeof input === "string" ? input : input instanceof URL ? input.href : input?.url || "";
  return { method, url, body: init?.body };
}

// Algunas rutas responden 200 con `{ ok: false }` o `{ error }`: eso no es un
// éxito. Se mira sin retrasar la respuesta a quien hizo la petición.
async function succeeded(response) {
  if (!response.ok) return false;
  if (!String(response.headers.get("content-type") || "").includes("json")) return true;
  try {
    const json = await response.clone().json();
    return !(json && typeof json === "object" && (json.ok === false || (json.error && !json.ok)));
  } catch {
    return true;
  }
}

let installed = false;

/** Envuelve `window.fetch` una sola vez. */
export function installActionFeedback() {
  if (installed || typeof window === "undefined" || typeof window.fetch !== "function") return;
  installed = true;
  const originalFetch = window.fetch.bind(window);

  window.fetch = async function fetchWithActionFeedback(input, init) {
    const response = await originalFetch(input, init);
    try {
      const parts = requestParts(input, init);
      const descriptor = describeAction({ ...parts, origin: window.location.origin });
      if (descriptor) {
        succeeded(response)
          .then((ok) => {
            if (!ok) return;
            rememberLocalAction(descriptor);
            showToast(descriptor);
          })
          .catch(() => {});
      }
    } catch {
      /* el aviso nunca rompe la petición */
    }
    return response;
  };
}

// ── Título y cartel ────────────────────────────────────────────────────────
// Muchas acciones solo mandan el id. El aviso sale al momento y se completa con
// el título y el cartel en cuanto llegan (TMDb, con caché en memoria).
const artCache = new Map();

export function resolveTitleArt(mediaType, tmdbId) {
  const type = mediaType === "tv" ? "tv" : mediaType === "movie" ? "movie" : null;
  const id = Number(tmdbId);
  const apiKey = process.env.NEXT_PUBLIC_TMDB_API_KEY;
  if (!type || !Number.isInteger(id) || id <= 0 || !apiKey) return Promise.resolve(null);
  const key = `${type}:${id}`;
  if (!artCache.has(key)) {
    const url = `https://api.themoviedb.org/3/${type}/${id}?api_key=${encodeURIComponent(apiKey)}&language=es-ES`;
    artCache.set(
      key,
      fetch(url, { cache: "force-cache" })
        .then((res) => (res.ok ? res.json() : null))
        .then((json) =>
          json ? { title: json.title || json.name || null, posterPath: json.poster_path || null } : null,
        )
        .catch(() => {
          artCache.delete(key);
          return null;
        }),
    );
  }
  return artCache.get(key);
}
