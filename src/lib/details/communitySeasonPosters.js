"use client";

// Póster MÁS VOTADO de cada temporada («Editar portada»): cada elección de un
// usuario es un voto y la ganadora es la portada por defecto de la temporada
// para todo el mundo (backend/src/lib/artworkVotes.js), siempre por detrás de
// la elección propia. Mismo criterio que «Portadas y fondos» de la ficha.
//
// Por LOTES (/api/community/seasons/artwork?ids=…): las tarjetas de
// «Temporadas» de una serie montan a la vez y van en una sola petición. Lo
// resuelto se recuerda un minuto (como la caché del backend); un fallo no se
// recuerda y se distingue de «sin votos» (`failed`), para que quien ya tenía
// un valor (el del SSR) lo conserve.

import { useEffect, useState } from "react";
import { useSeededCommunityPoster } from "@/lib/details/seasonPosterSeeds";

const BATCH_WINDOW_MS = 16;
const MAX_PER_REQUEST = 100;
const TTL_MS = 60_000;
// Quien espera el voto no enseña aún la portada: si el servidor tarda más que
// esto, vale como «sin votos» y se ve la automática.
const TIMEOUT_MS = 1500;

const resolved = new Map(); // seasonId -> { poster, at }
const waiting = new Map(); // seasonId -> [resolve, …]
let timer = 0;

const normalizeId = (id) => {
  const value = Number(id);
  return Number.isInteger(value) && value > 0 ? value : null;
};

function settle(id, poster, remember) {
  if (remember) resolved.set(id, { poster, at: Date.now() });
  for (const done of waiting.get(id) || []) done(poster);
  waiting.delete(id);
}

async function send(ids) {
  const controller = new AbortController();
  const abortTimer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`/api/community/seasons/artwork?ids=${ids.join(",")}`, {
      cache: "no-store",
      signal: controller.signal,
    });
    const json = res.ok ? await res.json() : null;
    const posters = json?.posters && typeof json.posters === "object" ? json.posters : null;
    for (const id of ids) settle(id, posters ? posters[id] || null : undefined, Boolean(posters));
  } catch {
    for (const id of ids) settle(id, undefined, false);
  } finally {
    clearTimeout(abortTimer);
  }
}

function flush() {
  timer = 0;
  const ids = [...waiting.keys()];
  for (let start = 0; start < ids.length; start += MAX_PER_REQUEST) {
    void send(ids.slice(start, start + MAX_PER_REQUEST));
  }
}

/** Lo ya resuelto (ruta o `null` sin votos), o `undefined` si no se sabe. */
export function peekCommunitySeasonPoster(seasonId) {
  const id = normalizeId(seasonId);
  const entry = id ? resolved.get(id) : undefined;
  if (!entry) return undefined;
  if (Date.now() - entry.at > TTL_MS) {
    resolved.delete(id);
    return undefined;
  }
  return entry.poster;
}

/** Póster más votado de la temporada (`null` sin votos, `undefined` si falla). */
export function requestCommunitySeasonPoster(seasonId) {
  const id = normalizeId(seasonId);
  if (!id) return Promise.resolve(null);
  const known = peekCommunitySeasonPoster(id);
  if (known !== undefined) return Promise.resolve(known);
  return new Promise((resolve) => {
    const list = waiting.get(id);
    if (list) {
      list.push(resolve);
      return;
    }
    waiting.set(id, [resolve]);
    if (!timer) timer = setTimeout(flush, BATCH_WINDOW_MS);
  });
}

// Hooks montados por temporada: lo leído al entrar incluye el voto PROPIO de
// visitas anteriores, y sin avisarles restablecer la portada caía justo en esa
// imagen (ahora «la más votada») hasta recargar.
const listeners = new Map(); // seasonId -> Set<fn>

function notify(id, event) {
  for (const listener of listeners.get(id) || []) listener(event);
}

function subscribe(id, listener) {
  let set = listeners.get(id);
  if (!set) {
    set = new Set();
    listeners.set(id, set);
  }
  set.add(listener);
  return () => {
    set.delete(listener);
    if (!set.size) listeners.delete(id);
  };
}

/**
 * El voto propio (`path`) deja de contar ya: quien lo tenga como más votado
 * pasa a «sin votos» hasta que el servidor diga otra cosa (si otros votaron
 * la misma, la consulta tras guardar la devuelve).
 */
export function retractCommunitySeasonPoster(seasonId, path) {
  const id = normalizeId(seasonId);
  if (!id || !path) return;
  if (resolved.get(id)?.poster === path) resolved.set(id, { poster: null, at: Date.now() });
  notify(id, { retract: path });
}

/** Tras votar: la siguiente consulta vuelve a preguntar al servidor, y los hooks montados ya. */
export function forgetCommunitySeasonPoster(seasonId) {
  const id = normalizeId(seasonId);
  if (!id) return;
  resolved.delete(id);
  notify(id, { refresh: true });
}

/**
 * `{ pending, poster, failed }` del póster más votado. `pending` mientras se
 * consulta (quien lo usa no enseña aún la automática, para no cambiarla
 * delante del usuario); `failed` si no se pudo saber (entonces `poster` es
 * `null`); sin `seasonId` no se consulta nada.
 */
export function useCommunitySeasonPoster(seasonId) {
  const id = normalizeId(seasonId);
  const [result, setResult] = useState({ id: null, poster: undefined });
  // Sembrado por el SSR de la ficha (seasonPosterSeeds): sin petición. Lo
  // recordado aquí (p. ej. tras votar) es más reciente y va primero.
  const seeded = useSeededCommunityPoster(id);
  const known = id ? peekCommunitySeasonPoster(id) : undefined;
  const peeked = known !== undefined ? known : seeded;
  const settled = result.id === id;

  useEffect(() => {
    if (!id || seeded !== undefined || peekCommunitySeasonPoster(id) !== undefined) return undefined;
    let cancelled = false;
    void requestCommunitySeasonPoster(id).then((poster) => {
      if (!cancelled) setResult({ id, poster });
    });
    return () => {
      cancelled = true;
    };
  }, [id, seeded]);

  useEffect(() => {
    if (!id) return undefined;
    let cancelled = false;
    const unsubscribe = subscribe(id, (event) => {
      if (event.retract) {
        // También si aún se consultaba o falló: la portada del SSR que se
        // usaría entonces puede ser ese mismo voto.
        setResult((current) =>
          current.id === id && current.poster && current.poster !== event.retract
            ? current
            : { id, poster: null },
        );
      }
      if (event.refresh) {
        void requestCommunitySeasonPoster(id).then((poster) => {
          // Un fallo conserva lo que hay (no se vuelve a la portada del SSR).
          if (!cancelled && poster !== undefined) setResult({ id, poster });
        });
      }
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [id]);

  return {
    pending: Boolean(id) && !settled && peeked === undefined,
    failed: settled && result.poster === undefined,
    poster: (settled ? result.poster : peeked) || null,
  };
}
