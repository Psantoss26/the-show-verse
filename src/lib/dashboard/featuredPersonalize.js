"use client";

// Personalización CLIENTE del FeaturedHero.
//
// Las páginas (Inicio/Películas/Series) renderizan el `featured` de forma
// ESTÁTICA y anónima (force-static / revalidate), así que el servidor no conoce
// la biblioteca de cada usuario. Por eso `buildFeatured` envía la selección
// normal SEGUIDA de una reserva de candidatos, y aquí, ya en el cliente, el hero
// se queda sobre todo con títulos que el usuario NO ha visto, puntuado ni
// marcado como favoritos. Los ya vistos solo vuelven si no hay bastantes nuevos.
//
// De dónde sale "ya visto":
//   1. Las cachés locales de sus listas (síncronas: el primer pase ya filtra).
//   2. Su biblioteca real (`/api/backend/items/states`) para los candidatos
//      del hero, que corrige lo que las cachés no sepan. El resultado se guarda
//      para que la próxima visita filtre bien desde el primer pase y el hero no
//      cambie de título después de pintarse.

import { useEffect, useMemo, useState } from "react";
import { FEATURED_HERO_SIZE, getMediaKey } from "./featured.js";

// Claves de las cachés optimistas (mismas que usan las páginas de usuario).
const FAVORITES_CACHE_KEY = "showverse:favorites:items:v3";
const HISTORY_CACHE_KEY = "showverse:history:items:v4";
const IN_PROGRESS_CACHE_KEY = "showverse:showverse:in-progress:v6";
const COMPLETED_CACHE_KEY = "showverse:showverse:completed:v4";
// Títulos que la biblioteca real confirmó como vistos/puntuados/favoritos.
const LIBRARY_SEEN_CACHE_KEY = "showverse:featured:library-seen:v1";
const LIBRARY_SEEN_CACHE_LIMIT = 400;
const STATES_BATCH_SIZE = 100;
// Títulos que acaba de mostrar el hero de cada dashboard (`home`, …). Películas
// y Series evitan los de Inicio para no repetir hero entre dashboards.
const SHOWN_CACHE_PREFIX = "showverse:featured:shown:";

function readJson(key) {
  try {
    if (typeof window === "undefined") return null;
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

// Normaliza el tipo de medio a partir de los distintos campos que usan las listas
// (favorites usa `media_type`; historial/En progreso usan `type`).
function mediaKeyFrom(rawId, rawType, fallbackType) {
  const id = Number(rawId);
  if (!Number.isFinite(id)) return null;
  const type =
    rawType === "tv" || rawType === "show" ? "tv" : rawType === "movie" ? "movie" : fallbackType;
  return getMediaKey({ id, media_type: type }, type || "movie");
}

// Recorre los items de una caché (envelope `{ items }` o `{ data: { items } }`)
// y añade sus claves `tipo:id` al Set.
function collectKeys(keys, envelope, { fallbackType, useMediaType = false } = {}) {
  const items = Array.isArray(envelope?.items)
    ? envelope.items
    : Array.isArray(envelope?.data?.items)
      ? envelope.data.items
      : [];
  for (const it of items) {
    const id = it?.tmdbId ?? it?.id;
    const type = useMediaType ? it?.media_type : it?.type;
    const key = mediaKeyFrom(id, type, fallbackType);
    if (key) keys.add(key);
  }
}

// Lee las cachés locales y devuelve el conjunto de claves `tipo:id` que el
// usuario ya ha visto (historial, completadas, en progreso), tiene en
// favoritos o ya consta como visto/puntuado en su biblioteca.
export function readSeenAndFavoriteKeys() {
  const keys = new Set();
  if (typeof window === "undefined") return keys;
  collectKeys(keys, readJson(FAVORITES_CACHE_KEY), { useMediaType: true, fallbackType: "movie" });
  collectKeys(keys, readJson(HISTORY_CACHE_KEY), { fallbackType: "movie" });
  collectKeys(keys, readJson(IN_PROGRESS_CACHE_KEY), { fallbackType: "tv" });
  collectKeys(keys, readJson(COMPLETED_CACHE_KEY), { fallbackType: "tv" });
  const librarySeen = readJson(LIBRARY_SEEN_CACHE_KEY);
  if (Array.isArray(librarySeen)) {
    for (const key of librarySeen) if (typeof key === "string") keys.add(key);
  }
  return keys;
}

// Un estado de `/items/states` cuenta como "ya conocido" si lo ha visto, lo ha
// puntuado o lo tiene en favoritos. Estar en Pendientes NO: precisamente quiere
// verlo, así que el hero puede recordárselo.
export function isKnownTitleState(state) {
  return Boolean(
    state && (state.watched || state.favorite || (state.rating != null && Number(state.rating) > 0)),
  );
}

// Guarda lo que confirmó la biblioteca. Las claves NO confirmadas se retiran
// (p. ej. un visionado borrado) y se conserva un máximo para no crecer sin fin.
function storeLibrarySeen(checkedKeys, knownKeys) {
  try {
    const previous = readJson(LIBRARY_SEEN_CACHE_KEY);
    const kept = (Array.isArray(previous) ? previous : []).filter(
      (key) => typeof key === "string" && !checkedKeys.has(key),
    );
    const next = [...knownKeys, ...kept].slice(0, LIBRARY_SEEN_CACHE_LIMIT);
    window.localStorage.setItem(LIBRARY_SEEN_CACHE_KEY, JSON.stringify(next));
  } catch {
    // Almacenamiento no disponible: el filtrado sigue funcionando en memoria.
  }
}

// Consulta la biblioteca real para los candidatos del hero. Devuelve null sin
// sesión o si falla la red (el hero se queda con lo que dicen las cachés).
async function fetchKnownKeys(items, signal) {
  const requested = [];
  const seen = new Set();
  for (const item of items) {
    const key = getMediaKey(item, item?.media_type || "movie");
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const [mediaType, tmdbId] = key.split(":");
    requested.push({ mediaType, tmdbId: Number(tmdbId) });
  }
  if (!requested.length) return null;

  const batches = [];
  for (let index = 0; index < requested.length; index += STATES_BATCH_SIZE) {
    batches.push(requested.slice(index, index + STATES_BATCH_SIZE));
  }
  const responses = await Promise.all(
    batches.map(async (batch) => {
      const response = await fetch("/api/backend/items/states", {
        method: "POST",
        cache: "no-store",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: batch }),
        signal,
      });
      if (!response.ok) return null;
      const payload = await response.json();
      return payload?.states && typeof payload.states === "object" ? payload.states : null;
    }),
  );
  const states = Object.assign({}, ...responses.filter(Boolean));
  // Sin sesión la ruta responde `{ states: {} }`: no hay nada que confirmar.
  if (!Object.keys(states).length) return null;

  const known = new Set();
  for (const [key, state] of Object.entries(states)) {
    if (isKnownTitleState(state)) known.add(key);
  }
  storeLibrarySeen(new Set(Object.keys(states)), known);
  return known;
}

// Claves que mostró por última vez el hero de otro dashboard.
function readShownKeys(scopes) {
  const keys = new Set();
  for (const scope of scopes) {
    const stored = readJson(`${SHOWN_CACHE_PREFIX}${scope}`);
    if (!Array.isArray(stored)) continue;
    for (const key of stored) if (typeof key === "string") keys.add(key);
  }
  return keys;
}

function storeShownKeys(scope, items) {
  try {
    const keys = items
      .map((item) => getMediaKey(item, item?.media_type || "movie"))
      .filter(Boolean);
    window.localStorage.setItem(`${SHOWN_CACHE_PREFIX}${scope}`, JSON.stringify(keys));
  } catch {
    // Almacenamiento no disponible: queda la exclusión del servidor.
  }
}

// ELIGE el hero, en este orden de preferencia:
//   1. títulos que el usuario no conoce (en el orden en que llegan: la
//      selección normal y después la reserva);
//   2. si no hay bastantes, los ya vistos;
//   3. y solo como último recurso, los que ya muestra el hero de otro
//      dashboard (`avoidKeys`): no repetir pesa más que no haberlo visto.
// Siempre devuelve `size` títulos si los candidatos alcanzan.
export function pickFreshFeatured(
  items,
  seenKeys,
  size = FEATURED_HERO_SIZE,
  avoidKeys = null,
) {
  if (!Array.isArray(items) || items.length === 0) return items || [];
  const hasSeen = seenKeys && seenKeys.size > 0;
  const hasAvoid = avoidKeys && avoidKeys.size > 0;
  if (!hasSeen && !hasAvoid) return items.slice(0, size);

  const fresh = [];
  const seen = [];
  const avoided = [];
  for (const item of items) {
    const key = getMediaKey(item, item?.media_type || "movie");
    if (key && hasAvoid && avoidKeys.has(key)) avoided.push(item);
    else if (key && hasSeen && seenKeys.has(key)) seen.push(item);
    else fresh.push(item);
  }
  return [...fresh, ...seen, ...avoided].slice(0, size);
}

// Hook para los dashboards: devuelve la lista del hero ya personalizada. En SSR y
// en el PRIMER render del cliente devuelve la selección normal (evita desajustes
// de hidratación); tras montar, filtra con las cachés y, después, con la
// biblioteca real.
//
// `publishAs` guarda lo que acaba mostrando este hero (Inicio) y `avoid` lista
// los dashboards cuyo hero no hay que repetir (Películas y Series evitan el de
// Inicio). El servidor ya excluye todos los candidatos de Inicio; esto cubre
// las regeneraciones de páginas estáticas con datos de TMDB algo distintos.
export function usePersonalizedFeatured(
  rawItems,
  { size = FEATURED_HERO_SIZE, publishAs = null, avoid = null } = {},
) {
  const [seenKeys, setSeenKeys] = useState(null);
  const [avoidKeys, setAvoidKeys] = useState(null);
  const avoidScopes = Array.isArray(avoid) ? avoid.join(",") : "";

  useEffect(() => {
    setSeenKeys(readSeenAndFavoriteKeys());
    setAvoidKeys(avoidScopes ? readShownKeys(avoidScopes.split(",")) : null);
    if (!Array.isArray(rawItems) || rawItems.length === 0) return undefined;

    const controller = new AbortController();
    fetchKnownKeys(rawItems, controller.signal)
      .then((known) => {
        if (!known || controller.signal.aborted) return;
        // Lo local se mantiene (puede ir por delante de la BD) y se suma lo
        // que confirma la biblioteca.
        setSeenKeys(readSeenAndFavoriteKeys());
      })
      .catch(() => {
        // Sin red o abortado: el hero se queda con el filtrado local.
      });
    return () => controller.abort();
  }, [rawItems, avoidScopes]);

  const picked = useMemo(() => {
    if (!seenKeys) return Array.isArray(rawItems) ? rawItems.slice(0, size) : rawItems;
    return pickFreshFeatured(rawItems, seenKeys, size, avoidKeys);
  }, [rawItems, seenKeys, avoidKeys, size]);

  useEffect(() => {
    if (!publishAs || !seenKeys || !Array.isArray(picked) || !picked.length) return;
    storeShownKeys(publishAs, picked);
  }, [publishAs, seenKeys, picked]);

  return picked;
}
