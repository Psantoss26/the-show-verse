// Entradas de tarjeta en curso (useCardEntrance), por elemento.
//
// Una tarjeta que cambia de grupo al reagrupar (p. ej. llega su plataforma) se
// monta de nuevo en otro contenedor y su entrada volvería a fundirla desde
// opacidad 0 mientras <FlipReorder> la traslada desde su sitio anterior: se veía
// parpadear. FlipReorder cancela aquí la entrada de las tarjetas que reconoce
// como movidas. WeakMap: no retiene nodos desmontados.
const entrances = new WeakMap();

export function registerCardEntrance(el, animation) {
  entrances.set(el, animation);
  animation.addEventListener?.("finish", () => {
    if (entrances.get(el) === animation) entrances.delete(el);
  });
}

export function hasCardEntrance(el) {
  return entrances.has(el);
}

export function cancelCardEntrance(el) {
  const animation = entrances.get(el);
  if (!animation) return;
  entrances.delete(el);
  animation.cancel();
}
