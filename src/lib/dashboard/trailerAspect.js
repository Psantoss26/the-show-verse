// Formato real de la imagen de un tráiler de YouTube.
//
// Los tráileres de cine y muchas series llegan en un vídeo 16:9 con bandas
// negras de panorámico dentro de la propia imagen (2:1, 2,39:1…). El iframe
// es de otro origen y no se pueden leer sus píxeles, pero YouTube publica
// tres fotogramas reales del vídeo (al 25, 50 y 75 %: `hq1/2/3.jpg`, con
// CORS abierto). Se mide en ellos la franja con imagen y de ahí sale la
// proporción útil, que el hero usa para encajar el tráiler sin bandas.
//
// Los `hq` son 480×360 (4:3): un vídeo 16:9 ya viene con bandas añadidas
// arriba y abajo, así que basta medir la altura con imagen frente al ancho.

export const TRAILER_DEFAULT_ASPECT = 16 / 9;
const MAX_ASPECT = 2.76; // Ultra Panavision; más allá es una medida errónea
const SNAP_TOLERANCE = 0.03; // ±3 % de 16:9 cuenta como 16:9
const BLACK_ROW_MAX_LUMA = 34; // ruido de JPEG en las bandas
const MIN_CONTENT_FRACTION = 0.2; // fotograma casi negro: no sirve
const DETECT_TIMEOUT_MS = 1500;
const STORAGE_KEY = "sv:trailerAspect:v1";
const STORAGE_MAX_ENTRIES = 300;

const memory = new Map();
const inflight = new Map();

function readStore() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeStore(key, aspect) {
  try {
    const store = readStore();
    delete store[key];
    store[key] = aspect;
    const keys = Object.keys(store);
    for (let i = 0; i < keys.length - STORAGE_MAX_ENTRIES; i += 1) {
      delete store[keys[i]];
    }
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // Sin almacenamiento: queda la copia en memoria.
  }
}

/**
 * Filas con imagen de un fotograma: devuelve la altura de la franja entre la
 * primera y la última fila que no es negra. Recibe los píxeles RGBA.
 */
export function measureContentRows(data, width, height) {
  const rowIsBlack = (y) => {
    const base = y * width * 4;
    // Muestreo cada 2 px: sobra para bandas que son negro puro.
    for (let x = 0; x < width; x += 2) {
      const i = base + x * 4;
      const luma = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
      if (luma > BLACK_ROW_MAX_LUMA) return false;
    }
    return true;
  };
  let top = 0;
  while (top < height && rowIsBlack(top)) top += 1;
  let bottom = height - 1;
  while (bottom > top && rowIsBlack(bottom)) bottom -= 1;
  if (bottom <= top) return 0;
  // La fila del borde mezcla banda e imagen por el JPEG: se descarta una a
  // cada lado para que no quede una línea oscura en el hero.
  return Math.max(0, bottom - top + 1 - 2);
}

/** Proporción útil a partir de las alturas medidas en varios fotogramas. */
export function aspectFromMeasurements(contentHeights, width, height) {
  const valid = contentHeights.filter((h) => h >= height * MIN_CONTENT_FRACTION);
  if (!valid.length) return TRAILER_DEFAULT_ASPECT;
  // La franja más alta manda: una escena oscura puede parecer más estrecha
  // de lo que es, pero ningún fotograma tiene imagen dentro de las bandas.
  const aspect = width / Math.max(...valid);
  if (!Number.isFinite(aspect)) return TRAILER_DEFAULT_ASPECT;
  if (Math.abs(aspect / TRAILER_DEFAULT_ASPECT - 1) <= SNAP_TOLERANCE) {
    return TRAILER_DEFAULT_ASPECT;
  }
  return Math.min(MAX_ASPECT, Math.max(TRAILER_DEFAULT_ASPECT, aspect));
}

function loadFrame(url) {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.decoding = "async";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

function frameContentHeight(img) {
  const width = img.naturalWidth;
  const height = img.naturalHeight;
  if (!width || !height) return null;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0);
  try {
    const { data } = ctx.getImageData(0, 0, width, height);
    return { content: measureContentRows(data, width, height), width, height };
  } catch {
    return null; // lienzo contaminado: sin CORS
  }
}

async function detect(key) {
  const frames = await Promise.all(
    ["hq1", "hq2", "hq3"].map((name) =>
      loadFrame(`https://i.ytimg.com/vi/${encodeURIComponent(key)}/${name}.jpg`),
    ),
  );
  const measured = frames.filter(Boolean).map(frameContentHeight).filter(Boolean);
  if (!measured.length) return null;
  const { width, height } = measured[0];
  const same = measured.filter((m) => m.width === width && m.height === height);
  return aspectFromMeasurements(
    same.map((m) => m.content),
    width,
    height,
  );
}

/** Proporción guardada de un tráiler, sin esperar. */
export function getCachedTrailerAspect(key) {
  if (!key) return null;
  if (memory.has(key)) return memory.get(key);
  if (typeof window === "undefined") return null;
  const stored = Number(readStore()[key]);
  if (Number.isFinite(stored) && stored > 0) {
    memory.set(key, stored);
    return stored;
  }
  return null;
}

/**
 * Proporción útil (ancho / alto) de la imagen de un tráiler. Siempre
 * resuelve, como mucho en DETECT_TIMEOUT_MS; si no puede medir, 16:9.
 */
export function getTrailerContentAspect(key) {
  if (!key || typeof window === "undefined") {
    return Promise.resolve(TRAILER_DEFAULT_ASPECT);
  }
  const cached = getCachedTrailerAspect(key);
  if (cached) return Promise.resolve(cached);
  if (inflight.has(key)) return inflight.get(key);

  const measured = detect(key)
    .then((aspect) => {
      if (aspect) {
        memory.set(key, aspect);
        writeStore(key, aspect);
      }
      return aspect || TRAILER_DEFAULT_ASPECT;
    })
    .catch(() => TRAILER_DEFAULT_ASPECT)
    .finally(() => inflight.delete(key));
  inflight.set(key, measured);

  return Promise.race([
    measured,
    new Promise((resolve) =>
      window.setTimeout(() => resolve(TRAILER_DEFAULT_ASPECT), DETECT_TIMEOUT_MS),
    ),
  ]);
}
