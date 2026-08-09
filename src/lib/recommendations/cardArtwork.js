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

/**
 * Espera a que la carta esté LISTA PARA ENSEÑARSE: su arte resuelto y sus
 * imágenes descargadas y decodificadas.
 *
 * Sin esto, al entrar en Recomendaciones se veía la baraja montarse a trozos:
 * primero los marcos vacíos, luego el póster que traía la recomendación, y
 * encima el arte neutro y el logo según iban llegando. Aquí se aguanta el
 * spinner hasta que la primera carta puede aparecer entera.
 *
 * Con TOPE de tiempo a propósito: si TMDb va lento, más vale enseñar la carta
 * aunque le falte una imagen que dejar la página en blanco indefinidamente.
 */
export async function preloadCardImages(item, { limiteMs = 3000 } = {}) {
  if (!item?.tmdbId) return null;

  const artwork = await conTope(
    loadCardArtwork(item, { priority: "high" }).catch(() => null),
    limiteMs,
  );

  const esEscritorio =
    typeof window !== "undefined" &&
    window.matchMedia?.("(min-width: 640px)")?.matches;

  // Solo lo que se va a ver: en escritorio manda el backdrop; en móvil, el
  // póster. El logo va encima en ambos casos.
  const rutas = [
    esEscritorio
      ? artwork?.backdropPath && `https://image.tmdb.org/t/p/w1280${artwork.backdropPath}`
      : artwork?.posterPath && `https://image.tmdb.org/t/p/w780${artwork.posterPath}`,
    esEscritorio
      ? artwork?.backdropLogoPath && `https://image.tmdb.org/t/p/w500${artwork.backdropLogoPath}`
      : artwork?.logoPath && `https://image.tmdb.org/t/p/w500${artwork.logoPath}`,
  ].filter(Boolean);

  // El tope se cuenta APARTE para la consulta y para las imágenes: si se
  // compartiera, una consulta lenta se comería el presupuesto entero y la
  // portada volvería a aparecer sin descargar, que es justo lo que se evita.
  await conTope(Promise.all(rutas.map(descargarImagen)), limiteMs);
  return artwork;
}

/**
 * Precarga las portadas de las cartas de la pila (las de detrás). Usan el
 * backdrop QUE YA TRAE la recomendación en w780 —no el arte neutro—, así que su
 * URL se construye aquí igual que en la baraja; pedir otra no calentaría nada.
 */
export function preloadStackImages(items = []) {
  for (const item of items) {
    if (!item?.backdropPath) continue;
    descargarImagen(`https://image.tmdb.org/t/p/w780${item.backdropPath}`);
  }
}

/** Resuelve con lo que haya si [promesa] tarda más de [ms]. */
function conTope(promesa, ms) {
  return Promise.race([
    promesa,
    new Promise((resolve) => setTimeout(() => resolve(null), ms)),
  ]);
}

/** Descarga y decodifica una imagen. Nunca falla: un error no debe bloquear. */
function descargarImagen(src) {
  if (typeof window === "undefined") return Promise.resolve();
  return new Promise((resolve) => {
    const img = new window.Image();
    img.decoding = "async";
    img.onload = () => {
      // `decode` evita el parpadeo de pintar mientras aún se descomprime.
      if (typeof img.decode === "function") img.decode().then(resolve, resolve);
      else resolve();
    };
    img.onerror = () => resolve();
    img.src = src;
  });
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
