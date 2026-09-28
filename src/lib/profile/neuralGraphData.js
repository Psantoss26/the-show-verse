"use client";

// Datos de la vista neuronal del perfil, en un módulo LIGERO (sin canvas ni
// d3-force) para poder precargarlos desde el perfil antes de abrir la pestaña.
//
// Mismo esquema que las demás secciones del perfil (ProfileSection):
//   - la última versión se pinta al instante desde memoria o sessionStorage;
//   - después se revalida en segundo plano. Aquí con la firma del grafo: si no
//     ha cambiado, el servidor responde `{ unchanged }` con unos bytes.
// Y además se guarda la DISPOSICIÓN de la red (posiciones y cámara) para que
// al volver a la pestaña o recargar aparezca tal como estaba, sin recolocarse.

import { useEffect, useState } from "react";

const PAYLOAD_PREFIX = "showverse:neural:v1:";
const LAYOUT_PREFIX = "showverse:neural:layout:v1:";
// Una revalidación reciente (por ejemplo, la precarga al pasar por la pestaña)
// sirve para la visita inmediata: no se repite la petición.
const REVALIDATE_AFTER_MS = 30_000;

const payloadCache = new Map();
const validatedAt = new Map();
const inflight = new Map();
const layoutCache = new Map();

const normalize = (username) => String(username || "").trim().toLowerCase();

function readSession(key) {
  try {
    return JSON.parse(window.sessionStorage.getItem(key) || "null");
  } catch {
    return null;
  }
}

function writeSession(key, value) {
  try {
    window.sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* sin hueco: queda la copia en memoria de esta pestaña */
  }
}

/** Grafo guardado de este usuario (memoria o sessionStorage), o null. */
export function getCachedNeuralGraph(username) {
  const key = normalize(username);
  if (payloadCache.has(key)) return payloadCache.get(key);
  if (typeof window === "undefined") return null;
  const stored = readSession(`${PAYLOAD_PREFIX}${key}`);
  if (!stored?.v) return null;
  payloadCache.set(key, stored);
  return stored;
}

/**
 * Pide el grafo (una sola petición a la vez por usuario). Con la versión
 * guardada completa manda su firma. Devuelve el grafo vigente.
 */
export function fetchNeuralGraph(username, { force = false } = {}) {
  const key = normalize(username);
  if (!force && inflight.has(key)) return inflight.get(key);
  const cached = getCachedNeuralGraph(username);
  if (!force && cached && !cached.missing && Date.now() - (validatedAt.get(key) || 0) < REVALIDATE_AFTER_MS) {
    return Promise.resolve(cached);
  }
  const stamp = cached && !cached.missing ? cached.v : null;
  const request = fetch(
    `/api/users/${encodeURIComponent(username)}/neural${stamp ? `?v=${encodeURIComponent(stamp)}` : ""}`,
    { credentials: "include", cache: "no-store", ...(cached ? { priority: "low" } : {}) },
  )
    .then(async (res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      validatedAt.set(key, Date.now());
      if (json.unchanged && cached) return cached;
      payloadCache.set(key, json);
      writeSession(`${PAYLOAD_PREFIX}${key}`, json);
      return json;
    })
    .finally(() => inflight.delete(key));
  inflight.set(key, request);
  return request;
}

/** Precarga sin esperar ni fallar (intención de abrir la pestaña). */
export function prefetchNeuralGraph(username) {
  if (!username || typeof window === "undefined") return;
  fetchNeuralGraph(username).catch(() => {});
}

/** Estado de carga del grafo para la vista: `{ status, payload }`. */
export function useNeuralPayload(username) {
  const [state, setState] = useState(() => {
    const cached = getCachedNeuralGraph(username);
    return { status: cached ? "ready" : "loading", payload: cached };
  });

  useEffect(() => {
    let cancelled = false;
    let retryTimer = null;
    const cached = getCachedNeuralGraph(username);
    if (cached) setState((current) => (current.payload === cached ? current : { status: "ready", payload: cached }));

    const apply = (json, retry) => {
      if (cancelled || !json) return;
      setState((current) => (current.payload === json ? { ...current, status: "ready" } : { status: "ready", payload: json }));
      // Títulos aún sin clasificar: el servidor los completa en segundo plano.
      // Se vuelve a pedir UNA vez para recibirlos.
      if (json.missing > 0 && retry) {
        retryTimer = window.setTimeout(() => {
          fetchNeuralGraph(username, { force: true }).then((next) => apply(next, false)).catch(() => {});
        }, 7000);
      }
    };

    fetchNeuralGraph(username)
      .then((json) => apply(json, true))
      .catch(() => {
        if (!cancelled) setState((current) => ({ ...current, status: current.payload ? "ready" : "error" }));
      });
    return () => {
      cancelled = true;
      window.clearTimeout(retryTimer);
    };
  }, [username]);

  return state;
}

// ── Disposición guardada ────────────────────────────────────────────────────

function toBase64(floats) {
  const bytes = new Uint8Array(floats.buffer, floats.byteOffset, floats.byteLength);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

function fromBase64(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Float32Array(bytes.buffer);
}

/** Clave de una disposición: la misma red (versión y agrupación) de un usuario. */
export function neuralLayoutKey(username, payload, groupBy) {
  return payload?.v ? `${normalize(username)}:${payload.v}:${groupBy}` : null;
}

/** `{ positions: Float32Array, camera }` guardado, o null si no encaja. */
export function getNeuralLayout(layoutKey, nodeCount) {
  if (!layoutKey) return null;
  let layout = layoutCache.get(layoutKey);
  if (!layout && typeof window !== "undefined") {
    const stored = readSession(`${LAYOUT_PREFIX}${layoutKey}`);
    if (stored?.positions) {
      try {
        layout = { positions: fromBase64(stored.positions), camera: stored.camera || null };
        layoutCache.set(layoutKey, layout);
      } catch {
        layout = null;
      }
    }
  }
  if (!layout || layout.positions.length !== nodeCount * 2) return null;
  return layout;
}

export function saveNeuralLayout(layoutKey, { positions, camera }) {
  if (!layoutKey || !positions?.length) return;
  const copy = new Float32Array(positions);
  layoutCache.set(layoutKey, { positions: copy, camera: camera || null });
  if (typeof window === "undefined") return;
  writeSession(`${LAYOUT_PREFIX}${layoutKey}`, { positions: toBase64(copy), camera: camera || null });
}
