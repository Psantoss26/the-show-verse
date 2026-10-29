// Transición de la galería de «Portadas y fondos» (ficha y su vista lateral) al
// cambiar de tipo de imagen o de filtro.
//
// La fila que se ve se queda hasta que las imágenes de la nueva están
// descargadas Y decodificadas; entonces la vieja se apaga y la nueva entra en
// cascada. Antes se cambiaba al momento por un esqueleto (tarjetas grises) y
// después cada tarjeta aparecía en negro hasta pintar su imagen.

// Precarga con el MISMO `srcset` y `sizes` que la tarjeta: el navegador elige
// el mismo candidato y la `<img>` lo encuentra ya en memoria. Con solo `src`
// se descargaba otra URL (`w342` frente a la de `srcset`) y la tarjeta volvía
// a esperar.
function loadImage({ src, srcSet, sizes }) {
  const img = new Image();
  img.decoding = "async";
  if (sizes) img.sizes = sizes;
  if (srcSet) img.srcset = srcSet;
  img.src = src;
  return img;
}

/** ¿Están ya todas en la caché de memoria (se pintarían sin esperar)? */
export function artworkImagesReady(images) {
  if (typeof window === "undefined") return true;
  return images.every((image) => {
    const img = loadImage(image);
    return img.complete && img.naturalWidth > 0;
  });
}

/**
 * Descarga y decodifica las imágenes. Resuelve cuando lo están todas (una que
 * falla no bloquea al resto) o al pasar `timeout` ms, para no dejar la fila
 * vieja indefinidamente con una red lenta.
 */
export function preloadArtworkImages(images, { timeout = 4000 } = {}) {
  if (typeof window === "undefined" || !images.length) return Promise.resolve();
  const all = Promise.all(
    images.map((image) => {
      const img = loadImage(image);
      try {
        img.fetchPriority = "high";
      } catch {}
      return img.decode().catch(() => {});
    }),
  );
  return Promise.race([all, new Promise((resolve) => setTimeout(resolve, timeout))]);
}

const prefersReducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/** Apaga la fila saliente. Resuelve al terminar (o al momento sin animación). */
export function fadeOutArtworkRow(element, { duration = 140 } = {}) {
  if (!element || prefersReducedMotion() || !element.animate) return Promise.resolve();
  const animation = element.animate([{ opacity: 0, transform: "translateY(-4px)" }], {
    duration,
    easing: "cubic-bezier(0.4, 0, 1, 1)",
    fill: "forwards",
  });
  return animation.finished.catch(() => {});
}

/**
 * Entrada de la fila nueva: sus tarjetas visibles aparecen en cascada (solo
 * `opacity` y `transform`, en el compositor). `fill: backwards` las mantiene
 * ocultas durante su retraso. Cancela antes el apagado de la fila.
 */
export function playArtworkRowEntrance(row, cards, { stagger = 35, duration = 360 } = {}) {
  if (!row) return;
  row.getAnimations?.().forEach((animation) => animation.cancel());
  if (prefersReducedMotion()) return;
  // Primero TODAS las lecturas y después las animaciones: medir una tarjeta
  // tras animar la anterior obligaba a recalcular estilos y layout de la
  // ficha entera por cada tarjeta (~40 ms en mitad del relevo).
  const viewport = row.getBoundingClientRect();
  const bottom = window.innerHeight;
  const visible = [...cards].filter((card) => {
    const rect = card.getBoundingClientRect();
    // Solo las que se ven: las de fuera del carrusel (o, en una cuadrícula,
    // bajo la pantalla) no tienen nada que animar.
    if (rect.right < viewport.left || rect.left > viewport.right + 1) return false;
    return rect.bottom >= 0 && rect.top <= bottom;
  });
  visible.forEach((card, index) => {
    card.animate(
      [
        { opacity: 0, transform: "translateY(10px) scale(0.98)" },
        { opacity: 1, transform: "none" },
      ],
      {
        duration,
        delay: index * stagger,
        easing: "cubic-bezier(0.22, 1, 0.36, 1)",
        fill: "backwards",
      },
    );
  });
}

/**
 * Anima el alto de la fila entre dos tamaños (póster ↔ apaisada). `toHeight`
 * se mide ANTES de crear otras animaciones (ver `playArtworkRowEntrance`).
 */
export function animateArtworkRowHeight(element, fromHeight, toHeight, { duration = 360 } = {}) {
  if (!element || prefersReducedMotion() || !element.animate) return;
  if (!fromHeight || Math.abs(toHeight - fromHeight) < 2) return;
  element.animate([{ height: `${fromHeight}px` }, { height: `${toHeight}px` }], {
    duration,
    easing: "cubic-bezier(0.22, 1, 0.36, 1)",
  });
}

/**
 * FLIP de los controles de una barra: `capture()` antes del cambio, `play()`
 * tras pintarlo. Cada control lleva `data-flip-id`; los que se mueven se
 * deslizan a su sitio, los nuevos aparecen y los que desaparecen se apagan
 * desde donde estaban (una copia en su posición, porque React ya los quitó).
 */
export function createControlsFlip() {
  let snapshot = null;
  return {
    capture(container) {
      if (!container) return;
      const box = container.getBoundingClientRect();
      const items = new Map();
      container.querySelectorAll(":scope > [data-flip-id]").forEach((el) => {
        const rect = el.getBoundingClientRect();
        items.set(el.dataset.flipId, { rect, box, clone: el.cloneNode(true) });
      });
      snapshot = { items, at: performance.now() };
    },
    play(container) {
      const current = snapshot;
      snapshot = null;
      if (!container || !current || performance.now() - current.at > 1000) return;
      if (prefersReducedMotion()) return;
      const box = container.getBoundingClientRect();
      const seen = new Set();
      container.querySelectorAll(":scope > [data-flip-id]").forEach((el) => {
        const id = el.dataset.flipId;
        seen.add(id);
        const before = current.items.get(id);
        if (!before) {
          el.animate(
            [
              { opacity: 0, transform: "scale(0.92)" },
              { opacity: 1, transform: "none" },
            ],
            { duration: 260, delay: 80, easing: "cubic-bezier(0.22, 1, 0.36, 1)", fill: "backwards" },
          );
          return;
        }
        const after = el.getBoundingClientRect();
        const dx = before.rect.left - after.left;
        const dy = before.rect.top - after.top;
        if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
        el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }], {
          duration: 340,
          easing: "cubic-bezier(0.22, 1, 0.36, 1)",
        });
      });
      for (const [id, before] of current.items) {
        if (seen.has(id)) continue;
        const ghost = before.clone;
        ghost.removeAttribute("data-flip-id");
        ghost.setAttribute("aria-hidden", "true");
        ghost.inert = true;
        Object.assign(ghost.style, {
          position: "absolute",
          left: `${before.rect.left - box.left}px`,
          top: `${before.rect.top - box.top}px`,
          width: `${before.rect.width}px`,
          height: `${before.rect.height}px`,
          margin: "0",
          pointerEvents: "none",
        });
        container.appendChild(ghost);
        const fade = ghost.animate(
          [
            { opacity: 1, transform: "none" },
            { opacity: 0, transform: "scale(0.92)" },
          ],
          { duration: 200, easing: "cubic-bezier(0.4, 0, 1, 1)", fill: "forwards" },
        );
        fade.finished.catch(() => {}).finally(() => ghost.remove());
      }
    },
  };
}

/** Coloca la pastilla de la pestaña activa bajo su botón (se desliza por CSS). */
export function placeTabPill(pill, button, { animate = true } = {}) {
  if (!pill || !button) return;
  pill.style.transition = animate && !prefersReducedMotion() ? "" : "none";
  pill.style.width = `${button.offsetWidth}px`;
  pill.style.transform = `translateX(${button.offsetLeft}px)`;
  pill.style.opacity = button.offsetWidth ? "1" : "0";
}
