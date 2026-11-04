import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const assistantPath = new URL("../../components/WatchNextAssistant.jsx", import.meta.url);
const cssPath = new URL("../../app/globals.css", import.meta.url);

function block(css, selector) {
  const i = css.indexOf(`${selector} {`);
  assert.ok(i > -1, `no se localiza ${selector}`);
  return css.slice(i, css.indexOf("}", i));
}

test("las entradas del asistente usan relleno backwards, no both", async () => {
  const css = await readFile(cssPath, "utf8");
  // `both` dejaría el transform del último fotograma y el cristal plano para
  // siempre (ver `.sv-details-entry`).
  for (const sel of [".sv-assistant-rise", ".sv-assistant-side-in", ".sv-assistant-fade"]) {
    const rule = block(css, sel);
    assert.match(rule, /var\(--sv-enter-delay, 0ms\)\s+backwards/);
    assert.doesNotMatch(rule, /\bboth\b|\bforwards\b/);
  }
  assert.match(css, /@keyframes sv-assistant-rise/);
  assert.match(css, /@keyframes sv-assistant-side-in/);
  assert.match(
    css,
    /@media \(prefers-reduced-motion: reduce\) \{\s*\.sv-assistant-rise,\s*\.sv-assistant-side-in,\s*\.sv-assistant-fade \{\s*animation: none;/,
  );
});

test("el fundido va en las piezas de cristal, no en un envoltorio suyo", async () => {
  const assistant = await readFile(assistantPath, "utf8");
  // El panel y la caja de texto llevan la animación en el mismo elemento que
  // el cristal.
  assert.match(assistant, /className=\{`sv-assistant-side-in [^`]*\$\{LIQUID_GLASS_BAR\}/);
  assert.match(assistant, /className=\{`sv-assistant-rise relative isolate mx-auto [^`]*\$\{LIQUID_GLASS_PANEL\}/);
  // La cabecera móvil no se funde entera (lleva botones de cristal): cada
  // botón hace su propia entrada.
  assert.doesNotMatch(assistant, /<header className="sv-assistant/);
  assert.match(assistant, /className=\{`sv-assistant-rise grid h-10 w-10 [^`]*\$\{LIQUID_GLASS_PANEL\}/);
});

test("al cambiar de conversación los mensajes vuelven a entrar en cascada", async () => {
  const assistant = await readFile(assistantPath, "utf8");
  // La lista se remonta por conversación y cada mensaje lleva su retardo.
  assert.match(assistant, /key=\{conversationId\}\s+className="mx-auto w-full max-w-3xl space-y-6/);
  assert.match(assistant, /style=\{enterDelay\(messageDelay\(index, entryCount\)\)\}/);
  assert.match(assistant, /setEntryCount\(found\.messages\.length\)/);
  assert.match(assistant, /setEntryCount\(0\)/);
});

test("la cascada solo retrasa los últimos mensajes de la conversación abierta", async () => {
  const assistant = await readFile(assistantPath, "utf8");
  const src = assistant.slice(
    assistant.indexOf("const MESSAGE_STAGGER_VISIBLE"),
    assistant.indexOf("function relativeDay"),
  );
  const messageDelay = new Function(`${src}; return messageDelay;`)();
  // 8 mensajes al abrir: los 2 primeros sin retardo, luego de 70 en 70 ms.
  assert.deepEqual(
    Array.from({ length: 8 }, (_, i) => messageDelay(i, 8)),
    [0, 0, 0, 70, 140, 210, 280, 350],
  );
  // Un mensaje que llega después de abrirla entra sin esperar.
  assert.equal(messageDelay(8, 8), 0);
  assert.equal(messageDelay(0, 0), 0);
});

test("Recientes no dice que no hay conversaciones antes de leerlas", async () => {
  const assistant = await readFile(assistantPath, "utf8");
  assert.match(assistant, /if \(!loaded\) return null;/);
  assert.match(assistant, /setConversations\(readConversations\(\)\);\s*setConversationsLoaded\(true\);/);
  assert.equal(assistant.match(/loaded=\{conversationsLoaded\}/g)?.length, 2);
});
