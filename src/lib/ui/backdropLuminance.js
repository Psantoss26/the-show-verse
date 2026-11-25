// ¿QUÉ HAY DETRÁS DE UN RECTÁNGULO DE LA PANTALLA, Y ES CLARO?
//
// Los paneles de cristal (`LIQUID_GLASS_PANEL`) llevan texto blanco/gris claro:
// sobre fondos oscuros se lee, pero sobre un backdrop luminoso (cielo, nieve,
// fondos blancos) se pierde. El estilo del panel no se toca (ver la memoria del
// proyecto: oscurecer el cristal fue rechazado), así que solo se refuerza el
// texto cuando de verdad hace falta. Para saberlo se MIDE lo que hay detrás.
//
// Cómo: se toma una rejilla de puntos sobre el rectángulo y, en cada punto, se
// apilan las capas que hay debajo (`elementsFromPoint`) de arriba abajo:
// colores de fondo (con su alfa y la opacidad heredada), degradados (su color
// medio) e imágenes (`<img>` y `background-image: url()`), de las que se lee el
// píxel real con una copia reducida en un canvas. Se mezclan como lo haría el
// navegador hasta que la pila es opaca, y la luminancia relativa (WCAG, lineal)
// resultante es la del punto. Vídeos, iframes y canvas cuentan como oscuros:
// no se pueden leer y casi siempre lo son.
//
// `elementsFromPoint` se salta lo que tiene `pointer-events: none`, que es
// justo lo habitual en fondos y velos decorativos. Durante la medida (síncrona)
// se fuerza `pointer-events: auto` en todo el documento con un atributo en
// <html> y se quita en el mismo tick: no llega a pintarse.

const PROBE_ATTR = "data-sv-luminance-probe";
const SAMPLE_MAX = 64;
const imageSamples = new Map();

function srgbToLinear(value) {
  const c = value / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function luminanceOf(r, g, b) {
  return 0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b);
}

// Lee "rgb(…)", "rgba(…)" y las formas `color(srgb …)`/`oklab(…)` que devuelve
// Chrome en `getComputedStyle`. Para oklab se usa su L como aproximación.
function parseColor(text) {
  if (!text) return null;
  let m = text.match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)/);
  if (m) {
    const alpha = m[4] == null ? 1 : m[4].endsWith("%") ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
    return { luminance: luminanceOf(+m[1], +m[2], +m[3]), alpha };
  }
  m = text.match(/oklab\(\s*([\d.]+)\s+[-\d.e]+\s+[-\d.e]+(?:\s*\/\s*([\d.]+%?))?\s*\)/);
  if (m) {
    const alpha = m[2] == null ? 1 : m[2].endsWith("%") ? parseFloat(m[2]) / 100 : parseFloat(m[2]);
    // L de oklab es ~ raíz cúbica de la luminancia.
    return { luminance: Math.min(1, parseFloat(m[1]) ** 3), alpha };
  }
  m = text.match(/color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+))?\)/);
  if (m) {
    return {
      luminance: luminanceOf(m[1] * 255, m[2] * 255, m[3] * 255),
      alpha: m[4] == null ? 1 : parseFloat(m[4]),
    };
  }
  return null;
}

// Color medio de los degradados de `background-image` (aproximación: media de
// sus paradas de color).
function gradientLayer(backgroundImage) {
  const colors = backgroundImage.match(/(rgba?\([^)]*\)|oklab\([^)]*\)|color\(srgb[^)]*\))/g);
  if (!colors?.length) return null;
  let luminance = 0;
  let alpha = 0;
  let count = 0;
  for (const text of colors) {
    const c = parseColor(text);
    if (!c) continue;
    luminance += c.luminance * c.alpha;
    alpha += c.alpha;
    count += 1;
  }
  if (!count || alpha <= 0) return null;
  return { luminance: luminance / alpha, alpha: alpha / count };
}

function urlOf(backgroundImage) {
  const m = backgroundImage?.match(/url\(["']?([^"')]+)["']?\)/);
  return m ? m[1] : null;
}

// Copia reducida de la imagen (≤64 px de lado) como ImageData. Las de TMDb se
// piden en w300 (TMDb sirve CORS); las del mismo origen (`/_next/image`) se
// leen tal cual.
function loadImageSample(src) {
  if (!src) return Promise.resolve(null);
  const key = src.replace(/(image\.tmdb\.org\/t\/p\/)[^/]+\//, "$1w300/");
  if (imageSamples.has(key)) return imageSamples.get(key);
  const request = new Promise((resolve) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.decoding = "async";
    image.onload = () => {
      try {
        const scale = Math.min(1, SAMPLE_MAX / Math.max(image.naturalWidth, image.naturalHeight));
        const width = Math.max(1, Math.round(image.naturalWidth * scale));
        const height = Math.max(1, Math.round(image.naturalHeight * scale));
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext("2d", { willReadFrequently: true });
        context.drawImage(image, 0, 0, width, height);
        resolve({ data: context.getImageData(0, 0, width, height).data, width, height });
      } catch {
        resolve(null);
      }
    };
    image.onerror = () => resolve(null);
    image.src = key;
  });
  imageSamples.set(key, request);
  return request;
}

function parsePosition(value, axisIndex) {
  const parts = (value || "50% 50%").split(/\s+/);
  const part = parts[axisIndex] ?? parts[0] ?? "50%";
  if (part.endsWith("%")) return parseFloat(part) / 100;
  if (part === "left" || part === "top") return 0;
  if (part === "right" || part === "bottom") return 1;
  return 0.5;
}

// Punto de la pantalla → coordenada relativa (0…1) dentro de la imagen, según
// cómo la encaja la caja (object-fit / background-size).
function mapToImage(x, y, rect, fit, position, ratio) {
  if (!rect.width || !rect.height) return null;
  let drawW = rect.width;
  let drawH = rect.height;
  if (ratio && (fit === "cover" || fit === "contain")) {
    const boxRatio = rect.width / rect.height;
    const wider = ratio > boxRatio;
    if ((fit === "cover") === wider) {
      drawH = rect.height;
      drawW = rect.height * ratio;
    } else {
      drawW = rect.width;
      drawH = rect.width / ratio;
    }
  }
  const offsetX = (rect.width - drawW) * parsePosition(position, 0);
  const offsetY = (rect.height - drawH) * parsePosition(position, 1);
  const u = (x - rect.left - offsetX) / drawW;
  const v = (y - rect.top - offsetY) / drawH;
  if (u < 0 || u > 1 || v < 0 || v > 1) return null;
  return { u, v };
}

function effectiveOpacity(element, cache) {
  if (cache.has(element)) return cache.get(element);
  const style = getComputedStyle(element);
  let value = style.visibility === "hidden" ? 0 : parseFloat(style.opacity) || 0;
  if (value > 0 && element.parentElement) value *= effectiveOpacity(element.parentElement, cache);
  cache.set(element, value);
  return value;
}

// Capas bajo cada punto, de arriba abajo, sin leer aún los píxeles.
function collectStacks(points, exclude) {
  const root = document.documentElement;
  root.setAttribute(PROBE_ATTR, "");
  try {
    const opacityCache = new Map();
    return points.map(([x, y]) => {
      const layers = [];
      for (const element of document.elementsFromPoint(x, y)) {
        if (exclude.some((node) => node?.contains(element))) continue;
        const opacity = effectiveOpacity(element, opacityCache);
        if (opacity < 0.02) continue;
        const style = getComputedStyle(element);
        const tag = element.tagName;
        if (tag === "VIDEO" || tag === "IFRAME" || tag === "CANVAS") {
          layers.push({ luminance: 0.03, alpha: opacity });
          continue;
        }
        if (tag === "IMG" && element.complete && element.naturalWidth) {
          layers.push({
            image: element.currentSrc || element.src,
            rect: element.getBoundingClientRect(),
            fit: style.objectFit,
            position: style.objectPosition,
            ratio: element.naturalWidth / element.naturalHeight,
            x,
            y,
            alpha: opacity,
          });
          continue;
        }
        const bgImage = style.backgroundImage;
        if (bgImage && bgImage !== "none") {
          const url = urlOf(bgImage);
          if (url) {
            const size = style.backgroundSize;
            layers.push({
              image: url,
              rect: element.getBoundingClientRect(),
              fit: size === "cover" || size === "contain" ? size : "fill",
              position: style.backgroundPosition,
              ratio: null,
              x,
              y,
              alpha: opacity,
            });
          } else {
            const gradient = gradientLayer(bgImage);
            if (gradient) layers.push({ ...gradient, alpha: gradient.alpha * opacity });
          }
        }
        const bg = parseColor(style.backgroundColor);
        if (bg && bg.alpha > 0) layers.push({ luminance: bg.luminance, alpha: bg.alpha * opacity });
      }
      return layers;
    });
  } finally {
    root.removeAttribute(PROBE_ATTR);
  }
}

async function resolveLayer(layer) {
  if (!layer.image) return layer;
  const sample = await loadImageSample(layer.image);
  if (!sample) return null;
  const ratio = layer.ratio ?? sample.width / sample.height;
  const at = mapToImage(layer.x, layer.y, layer.rect, layer.fit, layer.position, ratio);
  if (!at) return null;
  const px = Math.min(sample.width - 1, Math.floor(at.u * sample.width));
  const py = Math.min(sample.height - 1, Math.floor(at.v * sample.height));
  const i = (py * sample.width + px) * 4;
  const alpha = (sample.data[i + 3] / 255) * layer.alpha;
  return {
    luminance: luminanceOf(sample.data[i], sample.data[i + 1], sample.data[i + 2]),
    alpha,
  };
}

async function compositeStack(layers) {
  let luminance = 0;
  let remaining = 1;
  for (const raw of layers) {
    if (remaining < 0.02) break;
    const layer = await resolveLayer(raw);
    if (!layer || layer.alpha <= 0) continue;
    const alpha = Math.min(1, layer.alpha);
    luminance += remaining * alpha * layer.luminance;
    remaining *= 1 - alpha;
  }
  // Lo que queda sin cubrir es el negro de la página.
  return luminance;
}

// Luminancia (0…1, lineal) de lo que hay detrás de `rect`: percentil 80 de una
// rejilla de puntos, porque lo que estorba son las zonas claras detrás del
// texto, no la media. `exclude`: nodos que no cuentan (el propio panel, la
// barra). Resuelve null si no se puede medir (SSR, sin `elementsFromPoint`).
export async function measureBackdropLuminance(rect, { exclude = [], columns = 4, rows = 6 } = {}) {
  if (typeof document === "undefined" || !document.elementsFromPoint || !rect) return null;
  const points = [];
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < columns; c += 1) {
      const x = rect.left + ((c + 0.5) / columns) * rect.width;
      const y = rect.top + ((r + 0.5) / rows) * rect.height;
      if (x < 0 || y < 0 || x >= window.innerWidth || y >= window.innerHeight) continue;
      points.push([x, y]);
    }
  }
  if (!points.length) return null;
  const stacks = collectStacks(points, exclude);
  const values = await Promise.all(stacks.map(compositeStack));
  values.sort((a, b) => a - b);
  return values[Math.min(values.length - 1, Math.floor(values.length * 0.8))];
}

// A partir de qué luminancia el texto gris claro del cristal deja de leerse.
// El cristal oscurece un 28 % (`bg-black/[0.28]`); con 0,3 detrás, el fondo
// efectivo ronda 0,27 y el gris claro (`text-zinc-300`) baja de ~3:1.
export const LIGHT_BACKDROP_LUMINANCE = 0.3;
