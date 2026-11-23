// src/lib/ui/measureGlyphOffset.js
// Centra la TINTA de un texto (números de los botones de acción: veces vista,
// progreso de serie con "%", puntuación decimal) dentro de su botón, en los
// dos ejes.
//
// Flexbox centra CAJAS, no lo que se dibuja: la caja de línea de la fuente
// reserva más arriba (tildes, mayúsculas) que abajo, cada cifra tiene sus
// márgenes laterales, el `tracking-tighter` deja un espaciado negativo
// DESPUÉS de la última cifra y el "%" pequeño pesa a la derecha. Medido en
// capturas reales (botón de 52 px): con el centrado anterior —solo vertical y
// con métricas teóricas— la tinta quedaba hasta 1,25 px arriba y 1,25 px a la
// derecha según el número.
//
// Por eso se mide en el DOM dónde empieza cada trozo de texto y dónde cae su
// línea base (sonda de 0×0 alineada a la base), y con Canvas qué ocupa la
// tinta desde ese origen (`actualBoundingBox*`, con el mismo `letter-spacing`).
// El desplazamiento lleva la unión de esas tintas al centro del contenedor.

let sharedCtx = null;
function getContext() {
  if (typeof document === "undefined") return null;
  if (!sharedCtx) sharedCtx = document.createElement("canvas").getContext("2d");
  return sharedCtx;
}

const metricsCache = new Map();

// Canvas redondea la caja de tinta HACIA FUERA al píxel entero: a 20-24 px eso
// es hasta 1 px de error, y como las cifras apoyan en la base (descendente
// ~0,2 → 1) sesgaba el centrado medio píxel hacia arriba. Se mide a 10× y se
// divide: el redondeo queda en 0,1 px.
const MEASURE_SCALE = 10;

function measureInk(cs, text) {
  const ctx = getContext();
  if (!ctx) return null;
  const size = parseFloat(cs.fontSize) || 16;
  const spacing = parseFloat(cs.letterSpacing) || 0; // "normal" → 0
  const k = MEASURE_SCALE;
  const font = `${cs.fontStyle} ${cs.fontWeight} ${size * k}px ${cs.fontFamily}`;
  const key = `${font}|${spacing}|${text}`;
  if (metricsCache.has(key)) return metricsCache.get(key);
  ctx.font = font;
  if ("letterSpacing" in ctx) ctx.letterSpacing = `${spacing * k}px`;
  const m = ctx.measureText(text);
  const ink = {
    left: (m.actualBoundingBoxLeft ?? 0) / k,
    right: (m.actualBoundingBoxRight ?? m.width) / k,
    ascent: (m.actualBoundingBoxAscent ?? 0) / k,
    descent: (m.actualBoundingBoxDescent ?? 0) / k,
  };
  metricsCache.set(key, ink);
  return ink;
}

/**
 * Parte pura (testeable): dado el centro del contenedor y los trozos de texto
 * —cada uno con su origen (x de inicio, y de la línea base) y su tinta medida
 * desde ese origen—, el desplazamiento {x, y} que centra la unión de tintas.
 * `current` es el desplazamiento que ya lleva aplicado el elemento (las
 * medidas lo incluyen) y `scale` la escala del botón en ese instante (hover,
 * pulsado): todo se devuelve en px CSS sin escalar, en cuartos de píxel.
 */
export function inkCenterShift({ center, runs, current = { x: 0, y: 0 }, scale = 1 }) {
  if (!runs?.length) return { x: 0, y: 0 };
  let left = Infinity;
  let right = -Infinity;
  let top = Infinity;
  let bottom = -Infinity;
  for (const r of runs) {
    left = Math.min(left, r.originX - r.ink.left * scale);
    right = Math.max(right, r.originX + r.ink.right * scale);
    top = Math.min(top, r.baselineY - r.ink.ascent * scale);
    bottom = Math.max(bottom, r.baselineY + r.ink.descent * scale);
  }
  const dx = (center.x - (left + right) / 2) / scale;
  const dy = (center.y - (top + bottom) / 2) / scale;
  const q = (v) => Math.round(v * 4) / 4 || 0;
  return { x: q(current.x + dx), y: q(current.y + dy) };
}

function textRuns(root) {
  const runs = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node.nodeValue.trim();
    if (text) runs.push({ node, text });
  }
  return runs;
}

/**
 * Desplazamiento {x, y} (px CSS) para centrar la tinta de `el` dentro del área
 * de contenido de su padre. `current` es el que ya tiene aplicado. Devuelve
 * null si no se puede medir (SSR, nada que medir o elemento oculto).
 */
export function measureInkCenterShift(el, current = { x: 0, y: 0 }) {
  const container = el?.parentElement;
  if (!container || typeof document === "undefined") return null;
  const box = container.getBoundingClientRect();
  // Medidas de layout SIN redondear: `offsetWidth`/`clientWidth` van en px
  // enteros y en el móvil el botón mide 41,2 px, lo que torcía la escala y el
  // centro unas décimas siempre hacia el mismo lado.
  const style = getComputedStyle(container);
  const px = (v) => parseFloat(v) || 0;
  const padX = px(style.paddingLeft) + px(style.paddingRight);
  const padY = px(style.paddingTop) + px(style.paddingBottom);
  const borderX = px(style.borderLeftWidth) + px(style.borderRightWidth);
  const borderY = px(style.borderTopWidth) + px(style.borderBottomWidth);
  const borderBox = style.boxSizing === "border-box";
  const width = px(style.width);
  const height = px(style.height);
  const outerW = borderBox ? width : width + padX + borderX;
  if (!box.width || !outerW) return null;
  const scale = box.width / outerW;
  const contentW = borderBox ? width - padX - borderX : width;
  const contentH = borderBox ? height - padY - borderY : height;
  const center = {
    x: box.left + (px(style.borderLeftWidth) + px(style.paddingLeft) + contentW / 2) * scale,
    y: box.top + (px(style.borderTopWidth) + px(style.paddingTop) + contentH / 2) * scale,
  };

  const runs = [];
  for (const { node, text } of textRuns(el)) {
    const host = node.parentElement;
    const ink = measureInk(getComputedStyle(host), text);
    if (!ink) return null;
    // Sonda 0×0 en la línea base justo antes del texto: su esquina inferior
    // izquierda es el origen de dibujo del primer glifo.
    const probe = document.createElement("span");
    probe.style.cssText =
      "display:inline-block;width:0;height:0;vertical-align:baseline;padding:0;margin:0;border:0";
    host.insertBefore(probe, node);
    const p = probe.getBoundingClientRect();
    probe.remove();
    runs.push({ originX: p.left, baselineY: p.bottom, ink });
  }
  if (!runs.length) return null;
  return inkCenterShift({ center, runs, current, scale });
}
