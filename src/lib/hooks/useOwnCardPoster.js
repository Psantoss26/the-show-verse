"use client";

import { useSyncExternalStore } from "react";
import { getCardArtwork, subscribeOwnCardPosters } from "@/lib/artworkApi";

// Imagen de la tarjeta de un título: la elegida en la ficha y, sin ella, la
// más votada por todos (`getCardArtwork`), como en la ficha. Se suscribe a la
// instantánea de la cuenta y a la caché por lotes de votos: al elegir otra en
// la ficha o al llegar los votos, solo vuelven a renderizar las tarjetas de
// ESE título, también en las páginas que siguen vivas en segundo plano. En el
// servidor y al hidratar vale `null`, igual que sin elección ni votos.
export default function useOwnCardPoster(type, id) {
  return useOwnArtwork(type, id, "poster");
}

// Backdrop de las tarjetas backdrop (pestaña «Backdrop» de la ficha, kind
// `cardBackdrop`): el backdrop CON idioma de la portada en modo backdrop.
export function useOwnCardBackdrop(type, id) {
  return useOwnArtwork(type, id, "cardBackdrop");
}

// La de la tarjeta según su modo de imagen: `backdrop` → `cardBackdrop`; el
// resto → la portada.
export function useOwnCardImage(type, id, mode) {
  return useOwnArtwork(type, id, mode === "backdrop" ? "cardBackdrop" : "poster");
}

// Lo mismo para cualquier capa (p. ej. el logo del destacado del dashboard).
export function useOwnArtwork(type, id, kind) {
  return useSyncExternalStore(
    subscribeOwnCardPosters,
    () => getCardArtwork(type, id, kind),
    () => null,
  );
}

// Para listas que pintan varios pósters en un mismo componente (donde no cabe
// un hook por tarjeta): vuelve a renderizar al cambiar cualquier elección o al
// llegar votos, y el componente lee cada una con `getOwnCardPoster`, que sale
// de memoria.
let ownCardPosterVersion = 0;
function subscribeVersion(listener) {
  return subscribeOwnCardPosters(() => {
    ownCardPosterVersion += 1;
    listener();
  });
}

export function useOwnCardPostersVersion() {
  return useSyncExternalStore(
    subscribeVersion,
    () => ownCardPosterVersion,
    () => 0,
  );
}
