"use client";

// Pósters de la imagen y el vídeo compartibles de una lista, una colección o
// una persona, con el MISMO criterio que las tarjetas de las páginas de
// usuario (`getCardArtwork`): la portada elegida en la ficha, si no la MÁS
// VOTADA por todos y, sin ninguna, el póster de la escalera de idioma (inglés →
// español → original → sin idioma), y ninguno si el título no tiene ninguno
// (la tarjeta tampoco pinta entonces el póster guardado).
//
// El MOSAICO de fondo, en cambio, es el de la página de la lista: arte SIN
// TEXTO (`resolveCoverArt`, el lote y la caché de su portada), con la misma
// selección de títulos y el mismo muestreo de la portada.
//
// La hoja de compartir lo llama al abrirse, antes de pedir nada al servidor.
// Comparte caché con la parrilla y la portada: los títulos ya pintados no se
// piden otra vez.

import { resolveCoverArt } from "@/components/lists/listCoverArt";
import { resolveCardArtwork } from "@/lib/artworkApi";
import { LIST_COLLAGE_EXTRA_MAX } from "@/lib/lists/shareList";
import { buildPosterCollageTiles } from "@/lib/lists/posterCollage";
import { englishPosterKey, resolveEnglishPosterPath } from "@/lib/tmdb/englishPosters";

// Arte sin texto de cada título (`ref`: { id, mediaType }), sin los que no tienen.
async function resolveCollageArt(refs) {
  const paths = await Promise.all(
    refs.map((item) => {
      const key = englishPosterKey(item);
      if (!key) return null;
      const [mediaType, id] = key.split(":");
      return resolveCoverArt({ key, mediaType, tmdbId: Number(id) }, "high");
    }),
  );
  return paths.filter(Boolean);
}

/**
 * Mosaico de la imagen: las celdas de la portada de la página (sus títulos,
 * muestreados igual) y, detrás, los siguientes de su fondo móvil sin repetir.
 */
export async function prepareListCollage(card) {
  if (card?.coverPath) return { collage: [], collageExtra: [] };
  const [cover, background] = await Promise.all([
    resolveCollageArt(card?.collageRefs || []),
    resolveCollageArt(card?.collageExtraRefs || []),
  ]);
  const collage = buildPosterCollageTiles(cover);
  const used = new Set(collage);
  const collageExtra = [...new Set(background)].filter((path) => !used.has(path)).slice(0, LIST_COLLAGE_EXTRA_MAX);
  return { collage, collageExtra };
}

function refOfKey(key) {
  const [mediaType, id] = key.split(":");
  return { id, mediaType };
}

export async function prepareListShare(card, story) {
  const collagePromise = prepareListCollage(card);
  const refs = [
    ...(card?.preview || []),
    ...(story?.items || []),
    ...(story?.top || []),
  ];
  const keys = [...new Set(refs.map(englishPosterKey).filter(Boolean))];
  const [voted, ...ladder] = await Promise.all([
    resolveCardArtwork(keys.map(refOfKey), "poster"),
    ...keys.map(async (key) => [key, await resolveEnglishPosterPath(refOfKey(key), { priority: "high" })]),
  ]);
  const resolved = new Map(ladder.map(([key, path]) => [key, voted.get(key) || path]));
  // Sin identidad (no debería pasar) se queda el póster que traía.
  const withPoster = (item) => {
    const key = englishPosterKey(item);
    return key ? { ...item, posterPath: resolved.get(key) || null } : item;
  };

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { collageRefs, collageExtraRefs, ...rest } = card || {};
  const nextCard = {
    ...rest,
    preview: (card?.preview || []).map(withPoster),
    ...(await collagePromise),
  };
  const nextStory = story
    ? { ...story, items: (story.items || []).map(withPoster), top: (story.top || []).map(withPoster) }
    : story;
  return { card: nextCard, story: nextStory };
}
