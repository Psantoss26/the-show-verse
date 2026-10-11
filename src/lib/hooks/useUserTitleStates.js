"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { fetchRatedForUser } from "@/lib/api/tmdb";
import { LIST_CHANGED_EVENT } from "@/lib/userLists/optimisticListCache";

// Estado del usuario con CUALQUIER título, para pintar en páginas que no son
// suyas —las secciones del dashboard— la píldora de hover de Favoritos y
// Pendientes en una sola. Sale de las MISMAS fuentes que esas páginas:
//  - visionados: todo el historial de Trakt (`/api/trakt/history`), contado por
//    título; en series basta con que haya alguno para el ojo;
//  - nota: las valoraciones de Trakt en cuentas Showverse
//    (`/api/trakt/ratings`) o las de TMDb en las demás;
//  - favoritos y pendientes: `/api/tmdb/account/favorite` y `.../watchlist`.
// Los cambios que se hacen desde la ficha rápida (añadir a favoritos, puntuar,
// marcar como visto…) llegan por LIST_CHANGED_EVENT y se aplican al momento.
// Sin sesión no se pide nada y todo queda vacío.

const EMPTY_MAP = new Map();
const EMPTY_SET = new Set();

/** Clave de un título: "movie:<id>" o "tv:<id>". */
export function userTitleKey(type, id) {
  return `${type === "tv" || type === "show" ? "tv" : "movie"}:${Number(id)}`;
}

async function getJson(url, signal) {
  const response = await fetch(url, { signal });
  if (!response.ok) return null;
  return response.json().catch(() => null);
}

async function loadWatchCounts(signal) {
  const data = await getJson("/api/trakt/history?type=all&limit=all&enrich=0", signal);
  if (!data?.connected || !Array.isArray(data.items)) return EMPTY_MAP;
  const counts = new Map();
  for (const entry of data.items) {
    if (!entry?.watched_at) continue;
    const key = userTitleKey(entry.type, entry.tmdbId);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return counts;
}

async function loadRatings({ isShowverse, accountId, session, signal }) {
  let rated = [];
  if (isShowverse) {
    const data = await getJson("/api/trakt/ratings?limit=1000", signal);
    rated = (Array.isArray(data?.results) ? data.results : [])
      .filter((item) => item?.mediaType === "movie" || item?.mediaType === "tv")
      .map((item) => ({ id: item.tmdbId, media_type: item.mediaType, user_rating: item.rating ?? null }));
  } else {
    rated = await fetchRatedForUser(accountId, session);
  }
  const ratings = new Map();
  for (const item of Array.isArray(rated) ? rated : []) {
    if (item?.user_rating == null || item?.id == null) continue;
    ratings.set(userTitleKey(item.media_type, item.id), item.user_rating);
  }
  return ratings;
}

async function loadKeySet(url, field, signal) {
  const data = await getJson(url, signal);
  const list = Array.isArray(data?.[field]) ? data[field] : null;
  if (!list) return EMPTY_SET;
  return new Set(
    list
      .filter((item) => item?.id != null)
      .map((item) => userTitleKey(item.media_type || (item.title ? "movie" : "tv"), item.id)),
  );
}

export default function useUserTitleStates() {
  const { session, account, hydrated } = useAuth();
  const [watchCounts, setWatchCounts] = useState(EMPTY_MAP);
  const [ratings, setRatings] = useState(EMPTY_MAP);
  const [favorites, setFavorites] = useState(EMPTY_SET);
  const [watchlist, setWatchlist] = useState(EMPTY_SET);
  const accountId = account?.id ?? null;
  const isShowverse = session === "showverse" || account?.provider === "showverse";
  const signedIn = Boolean(hydrated && session && accountId);

  useEffect(() => {
    if (!signedIn) {
      setWatchCounts(EMPTY_MAP);
      setRatings(EMPTY_MAP);
      setFavorites(EMPTY_SET);
      setWatchlist(EMPTY_SET);
      return undefined;
    }
    const controller = new AbortController();
    const { signal } = controller;
    // Cada petición por su cuenta: la píldora se completa en cuanto llega su
    // parte, sin esperar a las demás.
    const apply = (promise, setter) =>
      promise.then((value) => { if (!signal.aborted) setter(value); }).catch(() => {});
    apply(loadWatchCounts(signal), setWatchCounts);
    apply(loadRatings({ isShowverse, accountId, session, signal }), setRatings);
    apply(loadKeySet("/api/tmdb/account/favorite", "favorites", signal), setFavorites);
    apply(loadKeySet("/api/tmdb/account/watchlist", "watchlist", signal), setWatchlist);
    return () => controller.abort();
  }, [signedIn, session, accountId, isShowverse]);

  // Cambios hechos en esta pestaña (ficha rápida, otras páginas).
  useEffect(() => {
    if (!signedIn) return undefined;
    const toggleIn = (setter, key, added) =>
      setter((prev) => {
        if (prev.has(key) === added) return prev;
        const next = new Set(prev);
        if (added) next.add(key);
        else next.delete(key);
        return next;
      });
    const onChange = (event) => {
      const detail = event?.detail;
      const lists = Array.isArray(detail?.listTypes) ? detail.listTypes : [];
      if (!detail?.key) return;
      const key = userTitleKey(detail.mediaType, detail.tmdbId);
      if (lists.includes("favorites")) toggleIn(setFavorites, key, !!detail.added);
      if (lists.includes("watchlist")) toggleIn(setWatchlist, key, !!detail.added);
      if (lists.includes("ratings")) {
        setRatings((prev) => {
          const next = new Map(prev);
          if (detail.added && typeof detail.rating === "number") next.set(key, detail.rating);
          else next.delete(key);
          return next;
        });
      }
      // Un visionado nuevo suma uno. Las bajas del historial llegan por id de
      // historial, sin título: se corrigen en la próxima carga.
      if (lists.includes("history") && detail.added) {
        setWatchCounts((prev) => new Map(prev).set(key, (prev.get(key) || 0) + 1));
      }
    };
    window.addEventListener(LIST_CHANGED_EVENT, onChange);
    return () => window.removeEventListener(LIST_CHANGED_EVENT, onChange);
  }, [signedIn]);

  return { watchCounts, ratings, favorites, watchlist, signedIn };
}
