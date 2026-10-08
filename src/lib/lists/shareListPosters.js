"use client";

// Pósters de la imagen y el vídeo compartibles de una lista, con el MISMO
// criterio que las tarjetas de la página (ListDetailsTools →
// useEnglishPosterItems): el póster inglés elegido por
// pickBestFavoriteEnglishPoster, y ninguno si el título no lo tiene (la
// tarjeta tampoco pinta el póster guardado, que puede estar en español).
//
// La hoja de compartir lo llama al abrirse, antes de pedir nada al servidor.
// Comparte caché con la parrilla: los títulos ya pintados no se piden otra vez.

import { LIST_COLLAGE_MAX } from "@/lib/lists/shareList";
import { englishPosterKey, resolveEnglishPosterPath } from "@/lib/tmdb/englishPosters";

export async function prepareListShare(card, story) {
  const refs = [
    ...(card?.preview || []),
    ...(card?.collageRefs || []),
    ...(story?.items || []),
    ...(story?.top || []),
  ];
  const keys = [...new Set(refs.map(englishPosterKey).filter(Boolean))];
  const resolved = new Map(
    await Promise.all(
      keys.map(async (key) => {
        const [mediaType, id] = key.split(":");
        return [key, await resolveEnglishPosterPath({ id, mediaType }, { priority: "high" })];
      }),
    ),
  );
  // Sin identidad (no debería pasar) se queda el póster que traía.
  const withPoster = (item) => {
    const key = englishPosterKey(item);
    return key ? { ...item, posterPath: resolved.get(key) || null } : item;
  };

  const { collageRefs = [], ...rest } = card || {};
  const nextCard = {
    ...rest,
    preview: (card?.preview || []).map(withPoster),
    collage: card?.coverPath
      ? []
      : collageRefs.map(withPoster).map((item) => item.posterPath).filter(Boolean).slice(0, LIST_COLLAGE_MAX),
  };
  const nextStory = story
    ? { ...story, items: (story.items || []).map(withPoster), top: (story.top || []).map(withPoster) }
    : story;
  return { card: nextCard, story: nextStory };
}
