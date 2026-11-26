// /src/lib/ui/actionModalMotion.js
// Movimiento de entrada y salida de los modales que abren los botones de acción
// de las fichas (tráiler, soundtrack, visto, puntuación, listas, reseñas…).
//
// Idea: el panel NACE del botón pulsado y VUELVE a él al cerrar (un «container
// transform»): parte del centro del botón, escalado a su tamaño, y se expande
// hasta su sitio con un muelle corto. Sin botón de origen (atajo de teclado,
// apertura programática) sube unos píxeles desde abajo.
//
// Reglas que impone el resto de la app:
// - Solo `transform` y `opacity`, animados con WAAPI: corren en el compositor,
//   también en la WebView de la APK a 120 Hz.
// - El PANEL no anima `opacity` mientras crece: un ancestro (o él mismo) con
//   opacidad < 1 se vuelve backdrop root y el liquid glass se ve plano. Solo en
//   el último tramo de la salida, cuando ya tiene el tamaño del botón, se funde
//   para no desaparecer de golpe.
// - Con `prefers-reduced-motion`, solo un fundido corto del fondo.
//
// Este módulo es puro (sin DOM) para poder probarlo con node --test; el hook
// `useActionModalMotion` lo conecta con el DOM.

/** Atributo que lleva el panel MIENTRAS entra o sale. En la app de Android
 * (globals.css) apaga los `backdrop-filter` de sus descendientes: dentro de un
 * panel de cristal no se ven (medido en el teléfono: ≤ 16/255) pero cada uno es
 * una pasada más por fotograma, y el panel, al moverse, los obliga a recalcular
 * todos en cada uno. En el modal de episodios vistos (~20 piezas) bajaba los
 * fotogramas tarde a 120 Hz del 24-37 % al 5-7 % al abrir. El cristal del propio panel
 * se queda. */
export const MOVING_PANEL_ATTR = "data-sv-modal-moving";

/** Ventana durante la que un clic cuenta como origen del modal que se abre
 * (algunos esperan a cargar datos antes de abrir, p. ej. episodios vistos). */
export const ORIGIN_MAX_AGE_MS = 5000;

/** Curva de entrada: arranque rápido y un rebase mínimo (y > 1) al asentarse. */
export const ENTER_EASING = "cubic-bezier(0.25, 0.9, 0.3, 1.04)";
/** Curva de salida: acelera hacia el botón, como si lo absorbiera. */
export const EXIT_EASING = "cubic-bezier(0.4, 0, 0.7, 0.2)";
export const FADE_EASING = "cubic-bezier(0.2, 0, 0, 1)";

export const DURATIONS = Object.freeze({
  enterFromOrigin: 520,
  enterFallback: 380,
  exitToOrigin: 340,
  exitFallback: 240,
  backdropIn: 280,
  backdropOut: 260,
  reducedFade: 140,
});

/** Escala mínima/máxima del panel en el punto del botón. */
const MIN_ORIGIN_SCALE = 0.06;
const MAX_ORIGIN_SCALE = 0.5;

function isUsableRect(rect) {
  return (
    !!rect &&
    Number.isFinite(rect.left) &&
    Number.isFinite(rect.top) &&
    rect.width > 0 &&
    rect.height > 0
  );
}

/**
 * ¿Sirve el rectángulo del botón como origen? Debe tener tamaño y verse, al
 * menos en parte, dentro de la ventana (un botón fuera de pantalla haría que
 * el panel entrara volando desde fuera).
 */
export function isVisibleOrigin(rect, viewport) {
  if (!isUsableRect(rect) || !viewport) return false;
  const right = rect.left + rect.width;
  const bottom = rect.top + rect.height;
  return right > 0 && bottom > 0 && rect.left < viewport.width && rect.top < viewport.height;
}

/**
 * Transformación que lleva el panel (en su sitio final, `panelRect`) al botón
 * (`originRect`): mismo centro y una escala uniforme que lo deja del tamaño del
 * botón. Uniforme para que el contenido no se deforme.
 */
export function originTransform(panelRect, originRect, { anchor = "center" } = {}) {
  if (!isUsableRect(panelRect) || !isUsableRect(originRect)) return null;
  const dx = originRect.left + originRect.width / 2 - (panelRect.left + panelRect.width / 2);
  const fit = Math.max(originRect.width / panelRect.width, originRect.height / panelRect.height);
  const scale = Math.min(MAX_ORIGIN_SCALE, Math.max(MIN_ORIGIN_SCALE, fit));
  // `below` (desplegables de la barra superior): el panel encogido no sube al
  // centro del botón, se queda con su borde superior donde empieza el panel
  // abierto, bajo el botón. Así nunca pisa la barra ni sus botones.
  const dy =
    anchor === "below"
      ? (scale - 1) * (panelRect.height / 2)
      : originRect.top + originRect.height / 2 - (panelRect.top + panelRect.height / 2);
  return {
    dx: Math.round(dx * 100) / 100,
    dy: Math.round(dy * 100) / 100,
    scale: Math.round(scale * 1000) / 1000,
  };
}

function transformString({ dx, dy, scale }) {
  return `translate3d(${dx}px, ${dy}px, 0) scale(${scale})`;
}

const REST = "translate3d(0px, 0px, 0) scale(1)";
const FALLBACK_FROM = "translate3d(0px, 28px, 0) scale(0.94)";
const FALLBACK_TO = "translate3d(0px, 18px, 0) scale(0.96)";

/**
 * Plan de animación para una fase (`enter` | `exit`). Devuelve fotogramas y
 * opciones WAAPI para el panel y el fondo, más un fundido opcional del panel
 * (solo en la salida, al final).
 */
export function buildModalMotion({
  phase,
  panelRect,
  originRect,
  viewport,
  reducedMotion = false,
  anchor = "center",
}) {
  const entering = phase === "enter";

  if (reducedMotion) {
    const duration = DURATIONS.reducedFade;
    return {
      kind: "reduced",
      panel: null,
      panelFade: {
        keyframes: entering ? [{ opacity: 0 }, { opacity: 1 }] : [{ opacity: 1 }, { opacity: 0 }],
        options: { duration, easing: "linear", fill: entering ? "none" : "forwards" },
      },
      backdrop: {
        keyframes: entering ? [{ opacity: 0 }, { opacity: 1 }] : [{ opacity: 1 }, { opacity: 0 }],
        options: { duration, easing: "linear", fill: entering ? "none" : "forwards" },
      },
      duration,
    };
  }

  const origin = isVisibleOrigin(originRect, viewport)
    ? originTransform(panelRect, originRect, { anchor })
    : null;

  if (origin) {
    const at = transformString(origin);
    const duration = entering ? DURATIONS.enterFromOrigin : DURATIONS.exitToOrigin;
    return {
      kind: "origin",
      origin,
      panel: {
        keyframes: entering
          ? [{ transform: at }, { transform: REST }]
          : [{ transform: REST }, { transform: at }],
        options: {
          duration,
          easing: entering ? ENTER_EASING : EXIT_EASING,
          fill: entering ? "none" : "forwards",
        },
      },
      // Solo en la salida y solo al final: el panel, ya del tamaño del botón,
      // se funde en él. En la entrada no hay fundido (mataría el cristal).
      panelFade: entering
        ? null
        : {
            keyframes: [{ opacity: 1 }, { opacity: 0 }],
            options: {
              duration: Math.round(duration * 0.3),
              delay: Math.round(duration * 0.7),
              easing: "linear",
              fill: "forwards",
            },
          },
      backdrop: backdropPlan(entering),
      duration,
    };
  }

  const duration = entering ? DURATIONS.enterFallback : DURATIONS.exitFallback;
  return {
    kind: "fallback",
    panel: {
      keyframes: entering
        ? [{ transform: FALLBACK_FROM }, { transform: REST }]
        : [{ transform: REST }, { transform: FALLBACK_TO }],
      options: {
        duration,
        easing: entering ? ENTER_EASING : EXIT_EASING,
        fill: entering ? "none" : "forwards",
      },
    },
    panelFade: {
      keyframes: entering ? [{ opacity: 0 }, { opacity: 1 }] : [{ opacity: 1 }, { opacity: 0 }],
      // Fundido corto solo en el tramo en el que el panel aún no se ve entero
      // (entrada) o ya se va (salida): el cristal queda vivo casi todo el rato.
      options: entering
        ? { duration: Math.round(duration * 0.35), easing: "linear", fill: "none" }
        : {
            duration: Math.round(duration * 0.5),
            delay: Math.round(duration * 0.5),
            easing: "linear",
            fill: "forwards",
          },
    },
    backdrop: backdropPlan(entering),
    duration,
  };
}

function backdropPlan(entering) {
  return {
    keyframes: entering ? [{ opacity: 0 }, { opacity: 1 }] : [{ opacity: 1 }, { opacity: 0 }],
    options: {
      duration: entering ? DURATIONS.backdropIn : DURATIONS.backdropOut,
      easing: FADE_EASING,
      fill: entering ? "none" : "forwards",
    },
  };
}
