"use client";

import { useSyncExternalStore } from "react";
import { getOwnArtwork, subscribeOwnCardPosters } from "@/lib/artworkApi";

// Portada elegida para la tarjeta de un título (ver `getOwnCardPoster`). Se
// suscribe a la instantánea de la cuenta: al elegir otra en la ficha, solo
// vuelven a renderizar las tarjetas de ESE título, también en las páginas que
// siguen vivas en segundo plano. En el servidor y al hidratar vale `null`,
// igual que antes de existir la elección.
export default function useOwnCardPoster(type, id) {
  return useOwnArtwork(type, id, "poster");
}

// Lo mismo para cualquier capa (p. ej. el logo del destacado del dashboard).
export function useOwnArtwork(type, id, kind) {
  return useSyncExternalStore(
    subscribeOwnCardPosters,
    () => getOwnArtwork(type, id, kind),
    () => null,
  );
}

// Para listas que pintan varios pósters en un mismo componente (donde no cabe
// un hook por tarjeta): vuelve a renderizar al cambiar cualquier elección y el
// componente lee cada una con `getOwnCardPoster`, que sale de memoria.
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
