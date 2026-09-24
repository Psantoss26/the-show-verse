// Inicio y fin del ARRASTRE EN DIRECTO del tirador del panel lateral.
//
// Mientras dura, el ancho del panel (y el margen de la página acoplada) cambia
// en cada fotograma. Lo que se reorganiza solo con CSS sigue al tirador sin
// problema, pero lo que se recalcula desde JS en cada cambio de tamaño
// —sobre todo los carruseles de Swiper, que leen el estilo de cada tarjeta—
// multiplica el coste de cada fotograma y el gesto va a tirones. Esas piezas
// escuchan este aviso para esperar al final del gesto y recolocarse UNA vez.
//
// Lo emite `beginResize` en DetailModal (solo en el modo en directo, con
// ratón; el modo guía de tablet no cambia el ancho hasta soltar).

const DRAWER_RESIZE_EVENT = "showverse:drawer-resize";

export function isDrawerResizeActive() {
  return (
    typeof document !== "undefined" &&
    document.documentElement.hasAttribute("data-sv-drawer-resizing")
  );
}

export function emitDrawerResize(active) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(DRAWER_RESIZE_EVENT, { detail: { active: Boolean(active) } }),
  );
}

// `listener(active)` recibe `true` al empezar el arrastre y `false` al soltar.
// Devuelve la función para dejar de escuchar.
export function onDrawerResize(listener) {
  if (typeof window === "undefined") return () => {};
  const handler = (event) => listener(Boolean(event?.detail?.active));
  window.addEventListener(DRAWER_RESIZE_EVENT, handler);
  return () => window.removeEventListener(DRAWER_RESIZE_EVENT, handler);
}
