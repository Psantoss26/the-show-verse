// Relevo de temporada en el modal de episodios vistos (lista de episodios).
//
// Al elegir otra temporada (pestaña, barra lateral o deslizando en el móvil),
// los episodios visibles salen hacia el lado contrario al que vas y los de la
// temporada nueva entran desde ese lado, en cascada. Solo se animan `opacity`
// y `transform` de cada FILA, nunca de un ancestro: las filas son de cristal
// (`backdrop-filter`) y una opacidad en el contenedor las dejaría planas
// durante el relevo. El alto del panel es fijo (la lista se desplaza dentro),
// así que no hay alto que animar.

const EXIT_MS = 140;
const ENTER_MS = 340;
const ENTER_STAGGER_MS = 28;
const ENTER_STAGGER_MAX = 8;
const EXIT_SHIFT = 24;
const ENTER_SHIFT = 36;
const EASE_OUT = "cubic-bezier(0.22, 1, 0.36, 1)";
const EASE_IN = "cubic-bezier(0.4, 0, 1, 1)";

export const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);

/** Filas que se ven dentro de la lista desplazable (las demás no se animan). */
function visibleRows(list) {
  const rows = [...list.querySelectorAll("[data-season-episode-row]")];
  const viewport = list.getBoundingClientRect();
  return rows.filter((row) => {
    const rect = row.getBoundingClientRect();
    return rect.bottom > viewport.top && rect.top < viewport.bottom;
  });
}

/**
 * Salida de la temporada que se ve. `direction` = 1 si vas a una posterior
 * (las filas se van hacia la izquierda), -1 si vas a una anterior. Si una
 * entrada estaba a medias, cada fila sale desde donde estaba (se lee su
 * estilo animado antes de cancelarla), sin saltos. Resuelve al terminar;
 * rechaza si otro relevo la cancela.
 */
export function playSeasonExit(list, direction) {
  if (!list || prefersReducedMotion() || typeof list.animate !== "function") {
    return Promise.resolve();
  }
  const rows = visibleRows(list);
  // Primero todas las lecturas y después las animaciones (ver
  // `playArtworkRowEntrance`): leer tras animar fuerza un recálculo por fila.
  const from = rows.map((row) => {
    const style = getComputedStyle(row);
    return { opacity: style.opacity, transform: style.transform };
  });
  const animations = rows.map((row, index) => {
    row.getAnimations().forEach((animation) => animation.cancel());
    return row.animate(
      [
        from[index],
        { opacity: 0, transform: `translateX(${-direction * EXIT_SHIFT}px)` },
      ],
      { duration: EXIT_MS, easing: EASE_IN, fill: "forwards" },
    );
  });
  return Promise.all(animations.map((animation) => animation.finished));
}

/**
 * Entrada de la temporada nueva, ya pintada por React. Cancela antes lo que
 * quedase de la salida (las filas se reutilizan entre temporadas: van con
 * `key` por número de episodio) y anima las visibles desde el lado `direction`.
 * `fill: backwards` las mantiene ocultas durante su retraso.
 */
export function playSeasonEntrance(list, direction) {
  if (!list) return;
  const rows = [...list.querySelectorAll("[data-season-episode-row]")];
  rows.forEach((row) => row.getAnimations().forEach((animation) => animation.cancel()));
  if (!direction || prefersReducedMotion() || typeof list.animate !== "function") return;
  visibleRows(list).forEach((row, index) => {
    row.animate(
      [
        { opacity: 0, transform: `translateX(${direction * ENTER_SHIFT}px)` },
        { opacity: 1, transform: "none" },
      ],
      {
        duration: ENTER_MS,
        delay: Math.min(index, ENTER_STAGGER_MAX) * ENTER_STAGGER_MS,
        easing: EASE_OUT,
        fill: "backwards",
      },
    );
  });
}
