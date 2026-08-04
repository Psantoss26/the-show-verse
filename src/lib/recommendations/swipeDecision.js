// src/lib/recommendations/swipeDecision.js
//
// Decide qué acción dispara un gesto de deslizar sobre una carta de
// recomendaciones. Se mantiene aparte del componente porque es la única parte
// con reglas de verdad (umbrales, prioridad entre ejes) y así puede probarse
// sin montar React ni simular gestos.
//
// Dos criterios, no uno: además de la DISTANCIA se acepta por VELOCIDAD, porque
// un gesto corto y rápido ("flick") es una intención clara del usuario y exigirle
// recorrer media pantalla lo haría sentir pesado.

export const SWIPE_ACTIONS = {
  DISMISS: "dismiss", // ← izquierda
  WATCHLIST: "watchlist", // → derecha
  FAVORITE: "favorite", // ↑ arriba
};

// Distancia mínima en píxeles para aceptar por recorrido.
export const SWIPE_DISTANCE_THRESHOLD = 110;
// Velocidad mínima en px/s para aceptar por impulso, aunque el recorrido sea corto.
export const SWIPE_VELOCITY_THRESHOLD = 520;

/**
 * @param {{ offset: {x:number, y:number}, velocity: {x:number, y:number} }} gesture
 * @returns {"dismiss"|"watchlist"|"favorite"|null} acción, o null si el gesto
 *          no llega a los umbrales y la carta debe volver a su sitio.
 */
export function resolveSwipeAction(gesture) {
  const offsetX = gesture?.offset?.x ?? 0;
  const offsetY = gesture?.offset?.y ?? 0;
  const velocityX = gesture?.velocity?.x ?? 0;
  const velocityY = gesture?.velocity?.y ?? 0;

  const passedX =
    Math.abs(offsetX) >= SWIPE_DISTANCE_THRESHOLD ||
    Math.abs(velocityX) >= SWIPE_VELOCITY_THRESHOLD;
  // Solo cuenta hacia ARRIBA: hacia abajo compite con el scroll de la página.
  const passedUp =
    offsetY <= -SWIPE_DISTANCE_THRESHOLD ||
    velocityY <= -SWIPE_VELOCITY_THRESHOLD;

  if (!passedX && !passedUp) return null;

  // Con ambos ejes superados gana el dominante: comparar los recorridos evita
  // que un gesto claramente lateral con algo de deriva vertical acabe marcando
  // favorito (y al revés).
  if (passedX && passedUp) {
    return Math.abs(offsetX) >= Math.abs(offsetY)
      ? horizontalAction(offsetX, velocityX)
      : SWIPE_ACTIONS.FAVORITE;
  }

  if (passedUp) return SWIPE_ACTIONS.FAVORITE;
  return horizontalAction(offsetX, velocityX);
}

function horizontalAction(offsetX, velocityX) {
  // Si el recorrido es ~0 pero hay impulso (flick puro), manda la velocidad.
  const direction = offsetX !== 0 ? offsetX : velocityX;
  return direction > 0 ? SWIPE_ACTIONS.WATCHLIST : SWIPE_ACTIONS.DISMISS;
}

/**
 * Punto final de la animación de salida de la carta, fuera de la pantalla.
 * Se calcula a partir del ancho de la ventana para que la carta salga entera
 * en cualquier tamaño de pantalla.
 */
export function exitTargetFor(action, viewportWidth = 1024) {
  const distance = Math.max(viewportWidth, 480) * 1.15;
  if (action === SWIPE_ACTIONS.FAVORITE) return { x: 0, y: -distance };
  if (action === SWIPE_ACTIONS.WATCHLIST) return { x: distance, y: 0 };
  return { x: -distance, y: 0 };
}
