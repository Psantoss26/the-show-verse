"use client";

// Pósters de la imagen compartible de un perfil, con el MISMO criterio que las
// tarjetas de las páginas de usuario (`getCardArtwork`): la portada elegida en
// la ficha, si no la MÁS VOTADA por todos y, sin ninguna, la guardada en el
// favorito. La hoja de compartir lo llama al abrirse, antes de pedir la imagen.

import { resolveCardArtwork } from "@/lib/artworkApi";

export async function prepareProfileShare(card, story) {
  const items = [...(card?.movies || []), ...(card?.series || [])];
  const voted = await resolveCardArtwork(items, "poster");
  const withPoster = (item) => {
    const path = item?.id != null ? voted.get(`${item.mediaType === "tv" ? "tv" : "movie"}:${item.id}`) : null;
    return path ? { ...item, posterPath: path } : item;
  };
  return {
    card: { ...card, movies: (card?.movies || []).map(withPoster), series: (card?.series || []).map(withPoster) },
    story,
  };
}
