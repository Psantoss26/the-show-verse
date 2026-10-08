"use client";

// PRECARGA de una ficha de lista o colección desde el índice de /lists.
//
// Al pasar el ratón, enfocar o tocar una tarjeta, se descargan sus datos y se
// guardan en la MISMA caché que la ficha lee antes de pintar (ver
// detailsInitialState): al abrirla está completa desde el primer fotograma, sin
// estados de carga. También se calientan los pósters de sus primeros títulos
// (/api/tmdb/artwork, en lote): las tarjetas los encuentran ya resueltos.
//
// La ficha sigue revalidando en segundo plano al montar, así que lo precargado
// nunca queda desactualizado más allá de esa visita.

import { getListDetails } from "@/lib/api/backendLists";
import { requestListArtwork } from "@/lib/tmdb/artworkBatch";
import {
  LIST_DETAILS_CACHE_TTL_MS,
  getCollectionDetailsCacheKey,
  getCommunityListDetailsCacheKey,
  getPersonalListDetailsCacheKey,
  listDetailsTargetFromHref,
} from "@/lib/lists/detailsInitialState";

// Las fichas de comunidad piden de 48 en 48 (TraktListDetailsClient).
const COMMUNITY_PAGE_SIZE = 48;
// Títulos cuyo póster se calienta: lo que cabe en la primera pantalla y algo más.
const WARM_ARTWORK_ITEMS = 24;
// Y de ellos, cuántas IMÁGENES se descargan ya (la primera pantalla), en el
// tamaño exacto que pintan las tarjetas (ListPosterCard: w500).
const WARM_IMAGE_ITEMS = 12;

const inFlight = new Map();

function readFresh(key, ttlMs) {
  try {
    const parsed = JSON.parse(window.sessionStorage.getItem(key) || "null");
    return parsed && Date.now() - Number(parsed.t || 0) <= ttlMs ? parsed.data : null;
  } catch {
    return null;
  }
}

function write(key, data) {
  try {
    window.sessionStorage.setItem(key, JSON.stringify({ t: Date.now(), data }));
  } catch {
    // sessionStorage lleno o no disponible: la ficha cargará como siempre.
  }
}

function preloadPoster(posterPath) {
  if (!posterPath) return;
  const image = new Image();
  image.decoding = "async";
  image.src = `https://image.tmdb.org/t/p/w500${posterPath}`;
}

function warmArtwork(items, toRef) {
  (Array.isArray(items) ? items : []).slice(0, WARM_ARTWORK_ITEMS).forEach((item, index) => {
    const ref = toRef(item);
    if (!ref) return;
    const request = requestListArtwork(ref.mediaType, ref.id);
    if (index < WARM_IMAGE_ITEMS) request.then((picks) => preloadPoster(picks?.poster));
  });
}

async function prefetchCollection(id) {
  const key = getCollectionDetailsCacheKey(id);
  const cached = readFresh(key, LIST_DETAILS_CACHE_TTL_MS.collection);
  if (cached) return warmArtwork(cached.parts, (part) => ({ mediaType: "movie", id: part?.id }));
  const res = await fetch(`/api/tmdb/collection?id=${encodeURIComponent(id)}`);
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.collection) return;
  const parts = Array.isArray(json.items) ? json.items : [];
  write(key, { loading: false, error: null, collection: json.collection, parts });
  warmArtwork(parts, (part) => ({ mediaType: "movie", id: part?.id }));
}

async function prefetchCommunity(id) {
  const key = getCommunityListDetailsCacheKey(id);
  const toRef = (item) => ({ mediaType: item?.mediaType === "tv" ? "tv" : "movie", id: item?.tmdbId });
  const cached = readFresh(key, LIST_DETAILS_CACHE_TTL_MS.community);
  if (cached) return warmArtwork(cached.items, toRef);
  const res = await fetch(`/api/community/lists/${encodeURIComponent(id)}?page=1&limit=${COMMUNITY_PAGE_SIZE}`, {
    cache: "no-store",
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.list) return;
  // Mismo estado que guarda la ficha (TraktListDetailsClient): títulos sin
  // repetir por (tipo, id) y «hay más» según el total de la lista.
  const seen = new Set();
  const items = (Array.isArray(json.items) ? json.items : []).filter((item) => {
    const itemKey = `${item?.mediaType || "item"}:${item?.tmdbId ?? ""}`;
    if (seen.has(itemKey)) return false;
    seen.add(itemKey);
    return true;
  });
  const total = Number(json.list?.item_count || 0);
  write(key, {
    loading: false,
    loadingMore: false,
    error: null,
    list: json.list,
    ratingSummary: json.ratingSummary || null,
    imdbRatingItems: Array.isArray(json.imdbRatingItems) ? json.imdbRatingItems : [],
    items,
    page: 1,
    hasMore: total > 0 && items.length < total,
  });
  warmArtwork(items, toRef);
}

async function prefetchPersonal(id) {
  const key = getPersonalListDetailsCacheKey(id);
  const toRef = (item) => ({ mediaType: item?.media_type === "tv" ? "tv" : "movie", id: item?.id });
  const cached = readFresh(key, LIST_DETAILS_CACHE_TTL_MS.personal);
  if (cached) return warmArtwork(cached.items, toRef);
  const json = await getListDetails({ listId: id, page: 1, language: "es-ES" });
  if (!json) return;
  write(key, json);
  warmArtwork(json.items, toRef);
}

/** Precarga la ficha de `href` (una sola vez a la vez por ficha). */
export function prefetchListDetails(href) {
  if (typeof window === "undefined") return;
  const target = listDetailsTargetFromHref(href);
  if (!target?.id) return;
  const flightKey = `${target.source}:${target.id}`;
  if (inFlight.has(flightKey)) return;
  const run =
    target.source === "collections"
      ? prefetchCollection
      : target.source === "trakt"
        ? prefetchCommunity
        : prefetchPersonal;
  const promise = run(target.id)
    .catch(() => {})
    .finally(() => inFlight.delete(flightKey));
  inFlight.set(flightKey, promise);
}
