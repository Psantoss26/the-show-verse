"use client";

import { useMemo } from "react";
import { useEnglishPosterItems } from "@/lib/tmdb/useEnglishPosterItems";

// Portadas apiladas de las tarjetas «Listas» de una ficha (ficha completa y
// vista teléfono del drawer) con la escalera de idioma de toda la app (inglés
// → español → original → sin idioma). El backend guarda los pósters de la
// importación, a menudo en español; con `previewItems` (los títulos de esa
// portada) se eligen los de la escalera por el lote de /api/tmdb/artwork: una
// petición para todas las listas, no una por tarjeta.
//
// Mientras llegan, la fila lleva `previewPosters: []` y `_previewPending`
// (la tarjeta no enseña los guardados para no cambiarlos delante del usuario).
// Las filas sin `previewItems` (respuestas antiguas en caché) quedan igual.

const posterUrl = (path) => (path ? `https://image.tmdb.org/t/p/w342${path}` : null);

export function useLadderListPreviews(rows) {
  const previewItems = useMemo(
    () =>
      (Array.isArray(rows) ? rows : []).flatMap((row) =>
        Array.isArray(row?.previewItems) ? row.previewItems : [],
      ),
    [rows],
  );
  const ladderItems = useEnglishPosterItems(previewItems, true, {
    holdOriginalPosters: true,
  });

  return useMemo(() => {
    const list = Array.isArray(rows) ? rows : [];
    const counts = list.map((row) => (Array.isArray(row?.previewItems) ? row.previewItems.length : 0));
    return list.map((row, index) => {
      const count = counts[index];
      if (!count) return row;
      const start = counts.slice(0, index).reduce((sum, value) => sum + value, 0);
      const items = ladderItems.slice(start, start + count);
      if (items.some((item) => item?._englishPosterPending)) {
        return { ...row, previewPosters: [], _previewPending: true };
      }
      const previewPosters = items.map((item) => posterUrl(item?.posterPath)).filter(Boolean);
      return previewPosters.length ? { ...row, previewPosters } : row;
    });
  }, [rows, ladderItems]);
}
