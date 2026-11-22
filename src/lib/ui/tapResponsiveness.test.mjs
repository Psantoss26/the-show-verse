import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// Respuesta inmediata al toque: el siguiente toque no debe esperar a que
// termine el render de la acción anterior (medido con CPU ×4 en Favoritos:
// «Por año» bloqueaba el hilo 1,9 s dentro del propio clic).

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

const optionBody = (() => {
  const src = read("components/ui/MobileOptionsSheet.jsx");
  const start = src.indexOf("export function SheetOption(");
  const end = src.indexOf("\nexport function", start + 1);
  return src.slice(start, end);
})();

test("las opciones de la hoja aplican el cambio como transición", () => {
  assert.match(optionBody, /startTransition\(/, "el render pesado debe poder ceder el hilo");
  assert.doesNotMatch(optionBody, /onClick=\{onClick\}/, "el clic no debe renderizar la página de forma síncrona");
});

test("la píldora tocada se marca al instante, sin esperar al render", () => {
  assert.match(optionBody, /useOptimistic\(/);
  assert.match(optionBody, /aria-pressed=\{shownActive/);
});

test("useStickyGroup no alterna escrituras y lecturas de layout en el commit", () => {
  const src = read("lib/hooks/useStickyGroup.js");
  assert.doesNotMatch(src, /offsetHeight/, "leer offsetHeight tras escribir minHeight fuerza un layout por grupo");
  assert.match(src, /borderBoxSize/, "la altura sale del ResizeObserver, sin forzar layout");
});

test("HoverExpandCard no fuerza un layout por tarjeta al montar", () => {
  const src = read("components/ui/HoverExpandCard.jsx");
  assert.match(src, /cellWidth \|\| cell\.offsetWidth/, "el ancho sale del ResizeObserver");
  assert.match(src, /borderBoxSize/);
  assert.doesNotMatch(src, /\n    update\(\);\n    \/\/ Solo `src`/, "sin la llamada síncrona del efecto de montaje");
});

test("DetailModal no captura toques mientras se cierra", () => {
  const src = read("components/dashboard/DetailModal.jsx");
  assert.match(src, /isPresent \? "" : "pointer-events-none \[&_\*\]:pointer-events-none "/);
});
