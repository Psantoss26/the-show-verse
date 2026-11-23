"use client";

// /src/hooks/useHeldWhileOpen.js
// Lo que pinta un modal mientras está abierto se CONGELA durante su salida.
//
// Los modales con salida animada (useActionModalMotion) siguen montados un rato
// tras cerrarse, pero el padre suele limpiar en el mismo clic lo que los
// describía (`confirmKind = null`, `activeVideo = null`) o cambiarlo al
// confirmar (favorito ya añadido → «Quitar»). Sin congelarlo, el panel cambia de
// aspecto a mitad de la salida (p. ej. «Quitar de pendientes» pasaba a «Añadir a
// favoritos»).
//
// `values` es un objeto de valores (se compara campo a campo, así que puede
// crearse en cada render). Mientras `open`, devuelve los actuales; cerrado,
// los últimos que tuvo abierto.

import { useState } from "react";

function shallowEqual(a, b) {
  if (a === b) return true;
  const keys = Object.keys(a);
  if (keys.length !== Object.keys(b).length) return false;
  return keys.every((key) => Object.is(a[key], b[key]));
}

export default function useHeldWhileOpen(values, open) {
  const [held, setHeld] = useState(values);
  // Actualizar el estado durante el render (patrón de React para estado
  // derivado de props): sin efecto, así el primer fotograma de la salida ya
  // usa lo congelado.
  if (open && !shallowEqual(held, values)) setHeld(values);
  return open ? values : held;
}
