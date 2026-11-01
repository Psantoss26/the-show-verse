// src/lib/ui/performanceMode.js
//
// MODO LIGERO PARA DISPOSITIVOS QUE NO PUEDEN CON EL CRISTAL.
//
// Casi todo lo caro de la web es el cristal (`backdrop-filter`): cada zona con
// desenfoque de fondo se vuelve a muestrear en CADA fotograma en el que se
// mueve lo que tiene detrás, o ella misma (scroll, modales, menús, tarjetas que
// crecen). Un móvil o un portátil potente lo aguanta sin despeinarse; uno
// modesto baja a 20-30 fps y todo parece ir a cámara lenta. La app nativa de
// Android ya lo quita siempre (`data-android-app`, globals.css) por lo mismo.
//
// Aquí se hace lo mismo SOLO donde hace falta: `data-sv-lite` en <html> apaga
// los desenfoques de fondo (los tintes se quedan, como en Android). Se activa:
//   - porque el usuario lo elige en Ajustes («Ligero»), o
//   - en «Automático» (por defecto), cuando el dispositivo ha demostrado que va
//     a tirones: se miden los fotogramas mientras se desplaza algo y, si la
//     mayoría de las rachas recientes pierden muchos, queda marcado. También
//     de entrada si declara ≤ 2 GB de memoria (`navigator.deviceMemory`).
// Un equipo que va fluido nunca cruza los umbrales y se ve exactamente igual.
//
// Todo es por DISPOSITIVO (localStorage), no por cuenta: la misma cuenta puede
// ir fluida en el ordenador y necesitar el modo ligero en un móvil viejo.

export const PERF_MODE_KEY = "sv-perf-mode"; // "auto" | "full" | "lite"
export const PERF_PROBE_KEY = "sv-perf-probe-v1"; // { windows: [0|1], verdict }
export const PERF_LITE_ATTR = "data-sv-lite";
export const PERF_MODES = ["auto", "full", "lite"];

// Una racha de scroll cuenta si tiene al menos estos intervalos de fotograma.
export const MIN_WINDOW_FRAMES = 15;
// Fotograma «perdido»: ≥ 50 ms. No 34 ms a propósito: con ahorro de batería
// (iOS, Android) el navegador limita a 30 Hz y cada fotograma dura 33 ms sin
// que la página vaya mal; 50 ms ya son tirones a cualquier frecuencia.
export const SLOW_FRAME_MS = 50;
// Racha a tirones: al menos este tanto por uno de fotogramas perdidos.
export const JANKY_WINDOW_SHARE = 0.2;
// Veredicto: de las últimas WINDOW_HISTORY rachas (y con al menos
// MIN_WINDOWS medidas, que pueden venir de varias visitas), LITE_MIN_JANKY a
// tirones. Un pico suelto —una carga pesada, el recolector de basura— no basta.
export const WINDOW_HISTORY = 10;
export const MIN_WINDOWS = 8;
export const LITE_MIN_JANKY = 6;

export function normalizeMode(value) {
  return PERF_MODES.includes(value) ? value : "auto";
}

/** ¿Esta racha de intervalos entre fotogramas (ms) va a tirones? `null` si es corta. */
export function isJankyWindow(intervals) {
  // Más de un segundo entre fotogramas no es la página: es la pestaña oculta
  // o el sistema congelándola.
  const frames = intervals.filter((ms) => ms > 0 && ms < 1000);
  if (frames.length < MIN_WINDOW_FRAMES) return null;
  const slow = frames.filter((ms) => ms >= SLOW_FRAME_MS).length;
  return slow / frames.length >= JANKY_WINDOW_SHARE;
}

/** Historial nuevo tras medir una racha (0 = fluida, 1 = a tirones) y su veredicto. */
export function recordWindow(probe, janky) {
  const prev = Array.isArray(probe?.windows) ? probe.windows : [];
  const windows = [...prev, janky ? 1 : 0].slice(-WINDOW_HISTORY);
  const jankyCount = windows.reduce((sum, w) => sum + w, 0);
  const verdict =
    probe?.verdict === "lite" || (windows.length >= MIN_WINDOWS && jankyCount >= LITE_MIN_JANKY)
      ? "lite"
      : null;
  return { windows, verdict };
}

/** ¿Debe ir en modo ligero? (`mode` elegido, veredicto medido, memoria declarada) */
export function shouldUseLite({ mode, verdict, deviceMemory } = {}) {
  const m = normalizeMode(mode);
  if (m === "lite") return true;
  if (m === "full") return false;
  if (verdict === "lite") return true;
  return typeof deviceMemory === "number" && deviceMemory > 0 && deviceMemory <= 2;
}

// Lo mismo, en el <head> antes del primer pintado (layout raíz): sin él, un
// dispositivo ya marcado pintaría el cristal y lo perdería al hidratar.
export const PERF_BOOT_SCRIPT = `(function(){try{
var m=localStorage.getItem(${JSON.stringify(PERF_MODE_KEY)});
if(m!=="full"&&m!=="lite")m="auto";
var p=null;try{p=JSON.parse(localStorage.getItem(${JSON.stringify(PERF_PROBE_KEY)})||"null")}catch(e){}
var dm=navigator.deviceMemory;
var lite=m==="lite"||(m==="auto"&&((p&&p.verdict==="lite")||(typeof dm==="number"&&dm>0&&dm<=2)));
if(lite)document.documentElement.setAttribute(${JSON.stringify(PERF_LITE_ATTR)},"");
}catch(e){}})();`;

function storage() {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

export function readPerfMode() {
  try {
    return normalizeMode(storage()?.getItem(PERF_MODE_KEY));
  } catch {
    return "auto";
  }
}

export function readPerfProbe() {
  try {
    const parsed = JSON.parse(storage()?.getItem(PERF_PROBE_KEY) || "null");
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

export function writePerfProbe(probe) {
  try {
    if (probe) storage()?.setItem(PERF_PROBE_KEY, JSON.stringify(probe));
    else storage()?.removeItem(PERF_PROBE_KEY);
  } catch {
    // Sin almacenamiento (privado, bloqueado): se mide solo esta visita.
  }
}

export const PERF_MODE_EVENT = "sv-perf-mode-change";

/** Pone o quita `data-sv-lite` según lo guardado. Devuelve si queda en ligero. */
export function applyPerformanceMode() {
  if (typeof document === "undefined") return false;
  const lite = shouldUseLite({
    mode: readPerfMode(),
    verdict: readPerfProbe()?.verdict,
    deviceMemory: typeof navigator !== "undefined" ? navigator.deviceMemory : undefined,
  });
  document.documentElement.toggleAttribute(PERF_LITE_ATTR, lite);
  return lite;
}

/**
 * Guarda la elección de Ajustes. Volver a «Automático» olvida lo medido: el
 * dispositivo vuelve a la calidad completa y se mide de nuevo desde cero.
 */
export function setPerfMode(mode) {
  const m = normalizeMode(mode);
  try {
    if (m === "auto") {
      storage()?.removeItem(PERF_MODE_KEY);
      writePerfProbe(null);
    } else {
      storage()?.setItem(PERF_MODE_KEY, m);
    }
  } catch {
    // Igual que arriba: vale para esta visita.
  }
  const lite = applyPerformanceMode();
  try {
    window.dispatchEvent(new CustomEvent(PERF_MODE_EVENT, { detail: { mode: m, lite } }));
  } catch {
    // Sin CustomEvent no hay nada que avisar.
  }
  return lite;
}
