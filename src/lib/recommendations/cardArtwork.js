"use client";

// Arte de cada carta de recomendaciones: póster SIN IDIOMA + logo del título,
// que es lo que da la vista limpia de la ficha móvil (el logo aporta el título,
// así que el póster no debe traerlo "quemado" en ningún idioma).
//
// Una sola petición por título: /images trae pósters y logos a la vez, y se pide
// a través del cliente compartido (cola con tope de concurrencia, reintento de
// 429 y deduplicación), de modo que precargar cartas por adelantado no compite
// con el resto de imágenes de la app.
//
// El criterio de selección es el MISMO que el hero de DetailsClient, a propósito:
// si la baraja eligiera otro arte, la ficha a la que se navega mostraría una
// imagen distinta de la que acabas de ver.

import { useEffect, useState } from "react";
import { fetchTmdbImages } from "@/lib/tmdb/imageRequests";
import {
  pickBestNeutralPosterByResVotes,
  resolveNeutralBackdropPath,
} from "@/lib/details/tmdbImages";

const artworkCache = new Map(); // "movie:123" -> { posterPath, logoPath }

function cacheKey(mediaType, tmdbId) {
  return `${mediaType === "tv" ? "tv" : "movie"}:${tmdbId}`;
}

// Mismo criterio visual que el hero de la ficha: PNG primero (conserva el color
// original), después inglés, sin idioma y español; a igualdad, votos de TMDb.
function pickLogo(logos) {
  if (!Array.isArray(logos) || logos.length === 0) return null;
  const languageOrder = ["en", null, "es"];
  const score = (logo) => {
    const lang = logo?.iso_639_1 ?? null;
    const languageIndex = languageOrder.indexOf(lang);
    const languageScore =
      languageIndex === -1 ? 0 : (languageOrder.length - languageIndex) * 1000;
    const pngScore = /\.png$/i.test(logo?.file_path || "") ? 1_000_000 : 0;
    return pngScore + languageScore + (logo?.vote_count || 0);
  };
  return [...logos].sort((a, b) => score(b) - score(a))[0]?.file_path || null;
}

export async function loadCardArtwork(item, { priority = "normal" } = {}) {
  if (!item?.tmdbId) return null;
  const key = cacheKey(item.mediaType, item.tmdbId);
  if (artworkCache.has(key)) return artworkCache.get(key);

  const images = await fetchTmdbImages(
    item.mediaType === "tv" ? "tv" : "movie",
    item.tmdbId,
    { allLanguages: true, priority },
  ).catch(() => null);

  // Sin arte neutro se cae al póster que ya venía en la recomendación: es mejor
  // enseñar el póster con título que dejar la pantalla vacía.
  const chosenPoster = pickBestNeutralPosterByResVotes(
    (images?.posters || []).filter((poster) => poster?.file_path),
  );

  // OJO: ese selector NO garantiza un póster sin idioma. Cuando el título no
  // tiene ninguno textless cae al mejor disponible, que viene localizado y ya
  // trae el título impreso; poner el logo encima lo duplicaría. Se comprueba el
  // idioma real del póster elegido, igual que hace el hero de la ficha.
  // Ante la duda (sin metadatos de idioma) se MANTIENE el logo: ocultarlo por
  // defecto dejaría títulos sin identificar.
  const posterLang = chosenPoster?.iso_639_1;
  const posterHasBurnedTitle =
    typeof posterLang === "string" && posterLang.trim() !== "";

  // El backdrop (vista de escritorio) también se quiere SIN idioma: encima va el
  // logo, y un fondo con el título impreso lo duplicaría. Sale de la misma
  // respuesta, así que no cuesta ninguna petición extra.
  const neutralBackdrop = resolveNeutralBackdropPath(images?.backdrops || []);
  const logoPath = pickLogo(images?.logos);

  const artwork = {
    posterPath: chosenPoster?.file_path || item.posterPath || null,
    backdropPath: neutralBackdrop || item.backdropPath || null,
    // En móvil el logo solo se muestra si el póster elegido NO trae el título
    // impreso; en escritorio el fondo es el backdrop neutro, así que el logo
    // siempre procede.
    logoPath: chosenPoster && !posterHasBurnedTitle ? logoPath : null,
    backdropLogoPath: logoPath,
  };

  artworkCache.set(key, artwork);
  return artwork;
}

/** Precarga el arte de las siguientes cartas para que no aparezcan "desnudas". */
export function prefetchCardArtwork(items = []) {
  for (const item of items) {
    if (!item?.tmdbId) continue;
    if (artworkCache.has(cacheKey(item.mediaType, item.tmdbId))) continue;
    loadCardArtwork(item, { priority: "low" }).catch(() => {});
  }
}

export function useCardArtwork(item) {
  const key = item ? cacheKey(item.mediaType, item.tmdbId) : null;
  // Si ya está en caché se devuelve en el PRIMER render: al deslizar, la carta
  // siguiente ya estaba precargada y no debe pasar por un estado intermedio.
  const [artwork, setArtwork] = useState(() =>
    key && artworkCache.has(key) ? artworkCache.get(key) : null,
  );

  useEffect(() => {
    if (!item?.tmdbId) {
      setArtwork(null);
      return undefined;
    }
    const cached = artworkCache.get(key);
    if (cached) {
      setArtwork(cached);
      return undefined;
    }

    let cancelled = false;
    setArtwork(null);
    loadCardArtwork(item, { priority: "high" }).then((result) => {
      if (!cancelled) setArtwork(result);
    });
    return () => {
      cancelled = true;
    };
  }, [key, item]);

  return artwork;
}
