"use client";

// Personalización CLIENTE del FeaturedHero.
//
// Las páginas (Inicio/Películas/Series) renderizan el `featured` de forma
// ESTÁTICA y anónima (force-static / revalidate), así que el servidor no conoce
// lo que cada usuario ha visto o tiene en favoritos. Aquí, ya en el cliente,
// leemos las cachés locales de sus listas y reducimos en el hero los títulos que
// ya ha visto o marcado como favoritos —para que aparezcan MENOS, sin vaciar el
// hero— complementando el criterio global (recencia/ventana de 20 años) que sí
// se aplica en el servidor (`buildFeatured`).

import { useEffect, useMemo, useState } from "react";
import { getMediaKey } from "./featured";

// Claves de las cachés optimistas (mismas que usan las páginas de usuario).
const FAVORITES_CACHE_KEY = "showverse:favorites:items:v3";
const HISTORY_CACHE_KEY = "showverse:history:items:v4";
const IN_PROGRESS_CACHE_KEY = "showverse:showverse:in-progress:v6";
const COMPLETED_CACHE_KEY = "showverse:showverse:completed:v4";

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
// usuario ya ha visto (historial, completadas, en progreso) o tiene en favoritos.
export function readSeenAndFavoriteKeys() {
  const keys = new Set();
  if (typeof window === "undefined") return keys;
  collectKeys(keys, readJson(FAVORITES_CACHE_KEY), { useMediaType: true, fallbackType: "movie" });
  collectKeys(keys, readJson(HISTORY_CACHE_KEY), { fallbackType: "movie" });
  collectKeys(keys, readJson(IN_PROGRESS_CACHE_KEY), { fallbackType: "tv" });
  collectKeys(keys, readJson(COMPLETED_CACHE_KEY), { fallbackType: "tv" });
  return keys;
}

// REORDENA el hero: los títulos ya vistos / en favoritos van al FINAL para que
// aparezcan menos (más tarde en la rotación), pero SIN quitar ninguno —el hero
// mantiene siempre el mismo nº de títulos (p. ej. 10)—. Conserva el orden
// relativo dentro de cada grupo (estable).
export function dampenSeenFeatured(items, seenKeys) {
  if (!Array.isArray(items) || items.length === 0) return items;
  if (!seenKeys || seenKeys.size === 0) return items;

  const fresh = [];
  const seen = [];
  for (const item of items) {
    const key = getMediaKey(item, item?.media_type || "movie");
    if (key && seenKeys.has(key)) seen.push(item);
    else fresh.push(item);
  }

  // Si están todos vistos (o ninguno), el orden no cambia; nunca se descarta.
  return [...fresh, ...seen];
}

// Hook para los dashboards: devuelve la lista del hero ya personalizada. En SSR y
// en el PRIMER render del cliente devuelve la lista cruda (evita desajustes de
// hidratación); tras montar, lee las cachés y aplica la reducción.
export function usePersonalizedFeatured(rawItems) {
  const [seenKeys, setSeenKeys] = useState(null);

  useEffect(() => {
    setSeenKeys(readSeenAndFavoriteKeys());
  }, []);

  return useMemo(() => {
    if (!seenKeys) return rawItems;
    return dampenSeenFeatured(rawItems, seenKeys);
  }, [rawItems, seenKeys]);
}
