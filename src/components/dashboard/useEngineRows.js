"use client";
// Hook + conversor compartidos para las filas de la engine de dashboards.
// Cada dashboard (Inicio/Películas/Series) obtiene aquí sus filas genéricas +
// recomendaciones (ya deduplicadas y rotadas por el backend) y las pinta con
// SU propio componente de fila nativo.
import { useEffect, useState } from "react";

// Convierte el "card" de la engine a la forma TMDb que esperan las tarjetas de
// los dashboards (id, media_type, poster_path, etc.).
export function toTmdbShape(card) {
  if (!card || card.tmdbId == null) return null;
  const year = card.year || null;
  const dateStr = year ? `${year}-01-01` : undefined;
  const isTv = card.mediaType === "tv";
  return {
    id: card.tmdbId,
    media_type: card.mediaType,
    title: card.title,
    name: card.title,
    original_title: card.title,
    original_name: card.title,
    poster_path: card.posterPath || null,
    backdrop_path: card.backdropPath || null,
    vote_average: typeof card.voteAverage === "number" ? card.voteAverage : 0,
    genre_ids: Array.isArray(card.genreIds) ? card.genreIds : [],
    popularity: card.popularity || 0,
    release_date: isTv ? undefined : dateStr,
    first_air_date: isTv ? dateStr : undefined,
  };
}

function mapRows(json) {
  if (!json || !Array.isArray(json.rows)) return [];
  return json.rows
    .map((row) => ({
      key: row.key,
      title: row.title,
      reason: row.reason || null,
      mediaType: row.mediaType,
      items: (Array.isArray(row.items) ? row.items : [])
        .map(toTmdbShape)
        .filter(Boolean),
    }))
    .filter((row) => row.items.length > 0);
}

// Obtiene las filas de la engine para una superficie ('home'|'movies'|'series').
// Hace fetch en cliente al proxy /api/dashboard/:surface (que reenvía la auth
// para personalizar, o sirve genérico si el usuario es anónimo).
export function useEngineRows(surface) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [personalized, setPersonalized] = useState(false);

  useEffect(() => {
    if (!surface) return;
    let cancel = false;
    setLoading(true);

    fetch(`/api/dashboard/${surface}`, {
      cache: "no-store",
      credentials: "include",
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (cancel) return;
        setRows(mapRows(json));
        setPersonalized(!!json?.personalized);
      })
      .catch(() => {
        if (!cancel) setRows([]);
      })
      .finally(() => {
        if (!cancel) setLoading(false);
      });

    return () => {
      cancel = true;
    };
  }, [surface]);

  return { rows, loading, personalized };
}
