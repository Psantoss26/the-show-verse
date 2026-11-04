import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const assistantPath = new URL("../../components/WatchNextAssistant.jsx", import.meta.url);
const pagePath = new URL("../../app/assistant/page.jsx", import.meta.url);

test("la página del asistente usa el cristal compartido y LiquidButton", async () => {
  const assistant = await readFile(assistantPath, "utf8");

  assert.match(assistant, /import \{ LIQUID_GLASS_PANEL \} from "@\/lib\/ui\/liquidGlass"/);
  assert.match(assistant, /import LiquidButton from "@\/components\/LiquidButton"/);
  // La receta a mano del panel antiguo no vuelve.
  assert.doesNotMatch(assistant, /backdrop-blur-3xl|bg-black\/45/);
  // Ya no es un modal.
  assert.doesNotMatch(assistant, /role="dialog"|createPortal|useModalGuard/);
});

test("la caja de texto: Enter envía y Shift+Enter hace salto de línea", async () => {
  const assistant = await readFile(assistantPath, "utf8");
  assert.match(assistant, /<textarea/);
  assert.match(
    assistant,
    /event\.key !== "Enter" \|\| event\.shiftKey \|\| event\.nativeEvent\.isComposing/,
  );
});

test("las recomendaciones son tarjetas de título de la app con ficha rápida", async () => {
  const [assistant, page] = await Promise.all([
    readFile(assistantPath, "utf8"),
    readFile(pagePath, "utf8"),
  ]);
  assert.match(assistant, /<PosterTile item=\{item\} \/>/);
  assert.match(page, /<DetailModalProvider placement="right">/);
});

test("la página descuenta las barras de la app y sigue al teclado del móvil", async () => {
  const assistant = await readFile(assistantPath, "utf8");
  assert.match(assistant, /useFitViewportPage\(\)/);
  assert.match(assistant, /100svh-9rem-var\(--sv-safe-top,0px\)-var\(--sv-safe-bottom,0px\)/);
  assert.match(assistant, /desktop:h-\[calc\(100svh-4rem/);
  assert.match(assistant, /window\.visualViewport/);
});
