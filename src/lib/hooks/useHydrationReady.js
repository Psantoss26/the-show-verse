"use client";

import { useSyncExternalStore } from "react";

// ¿Ha TERMINADO ya la hidratación? Devuelve `false` en el servidor y también en
// el PRIMER render del cliente (el que React compara con el HTML del servidor),
// y `true` a partir del siguiente.
//
// PARA QUÉ SIRVE
// El servidor no ve `localStorage` ni `sessionStorage`. Un componente que decida
// QUÉ RENDERIZAR a partir de ellos (caché de la lista, marca de navegación
// atrás/adelante...) produce en su primer render del cliente un árbol distinto
// al del servidor: React tira el HTML recibido y vuelve a construir la página
// entera ("Hydration failed... this tree will be regenerated on the client").
//
// Con esto se pinta en el render de hidratación lo mismo que mandó el servidor y
// el valor del cliente entra en el render siguiente, que React programa solo y
// de inmediato. No añade parpadeo: lo que se ve durante ese instante es
// exactamente el HTML que el navegador ya tenía en pantalla.
//
// `useSyncExternalStore` es lo que da esa garantía: React usa la lectura del
// SERVIDOR durante el SSR y durante la hidratación, y solo después cambia a la
// del cliente. No hay suscripción porque el valor no vuelve a cambiar.
const subscribe = () => () => {};
const readClient = () => true;
const readServer = () => false;

export function useHydrationReady() {
  return useSyncExternalStore(subscribe, readClient, readServer);
}
