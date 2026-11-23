import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const sourceUrl = new URL("./ExternalLinksModal.jsx", import.meta.url);

test("el modal de plataformas entra y sale con el movimiento común de los modales de acción", async () => {
  const source = await readFile(sourceUrl, "utf8");

  // Nace del botón pulsado y vuelve a él (WAAPI en el primer frame, sin Framer).
  assert.match(source, /useActionModalMotion\(open\)/);
  assert.match(source, /if \(!actionMotion\.present\) return null/);
  assert.match(source, /ref=\{actionMotion\.backdropRef\}/);
  assert.match(source, /ref=\{actionMotion\.panelRef\}/);
  // El panel no lleva animaciones CSS propias que compitan con la del hook.
  assert.doesNotMatch(source, /animate-in zoom-in-95/);
  assert.doesNotMatch(source, /AnimatePresence|motion\./);
});

test("el modal de plataformas amplía sus iconos sin alterar los enlaces externos", async () => {
  const source = await readFile(sourceUrl, "utf8");

  assert.match(source, /isPlatformsMode \? "h-9 w-9" : "h-8 w-8"/);
});

test("el modal de enlaces se monta sobre DetailModal y cubre todo el viewport", async () => {
  const source = await readFile(sourceUrl, "utf8");

  assert.match(source, /import\s*\{\s*createPortal\s*\}\s*from\s*["']react-dom["']/);
  assert.match(source, /return createPortal\(/);
  assert.match(source, /document\.body/);
  assert.match(source, /data-detail-modal-layer=""/);
  assert.match(source, /fixed inset-0 z-\[10000\]/);
});
