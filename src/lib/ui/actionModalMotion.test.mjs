import assert from "node:assert/strict";
import test from "node:test";

import {
  buildModalMotion,
  isVisibleOrigin,
  originTransform,
} from "./actionModalMotion.js";

const viewport = { width: 1000, height: 800 };
const panel = { left: 300, top: 100, width: 400, height: 600 };
const button = { left: 100, top: 700, width: 48, height: 48 };

test("originTransform lleva el centro del panel al del botón con escala uniforme", () => {
  const t = originTransform(panel, button);
  assert.equal(t.dx, 124 - 500);
  assert.equal(t.dy, 724 - 400);
  // 48/400 = 0.12 vs 48/600 = 0.08 → la mayor, para cubrir el botón
  assert.equal(t.scale, 0.12);
});

test("la escala de origen se acota", () => {
  assert.equal(originTransform(panel, { left: 0, top: 0, width: 1, height: 1 }).scale, 0.06);
  assert.equal(originTransform(panel, { left: 0, top: 0, width: 400, height: 600 }).scale, 0.5);
});

test("un botón fuera de la ventana o sin tamaño no sirve de origen", () => {
  assert.equal(isVisibleOrigin(button, viewport), true);
  assert.equal(isVisibleOrigin({ ...button, top: 900 }, viewport), false);
  assert.equal(isVisibleOrigin({ ...button, width: 0 }, viewport), false);
  assert.equal(isVisibleOrigin(null, viewport), false);
});

test("entrada desde el botón: solo transform en el panel, sin fundido", () => {
  const m = buildModalMotion({ phase: "enter", panelRect: panel, originRect: button, viewport });
  assert.equal(m.kind, "origin");
  assert.equal(m.panelFade, null);
  assert.match(m.panel.keyframes[0].transform, /scale\(0\.12\)/);
  assert.match(m.panel.keyframes[1].transform, /scale\(1\)/);
  assert.equal(m.backdrop.keyframes[0].opacity, 0);
});

test("salida hacia el botón: fundido solo en el último tramo y estado final retenido", () => {
  const m = buildModalMotion({ phase: "exit", panelRect: panel, originRect: button, viewport });
  assert.equal(m.kind, "origin");
  assert.equal(m.panel.options.fill, "forwards");
  assert.ok(m.panelFade.options.delay >= m.duration * 0.6);
  assert.ok(m.panelFade.options.delay + m.panelFade.options.duration <= m.duration);
});

test("sin origen usa la subida de respaldo", () => {
  const m = buildModalMotion({ phase: "enter", panelRect: panel, originRect: null, viewport });
  assert.equal(m.kind, "fallback");
  assert.match(m.panel.keyframes[0].transform, /28px/);
});

test("movimiento reducido: sin transform, solo fundidos cortos", () => {
  const m = buildModalMotion({ phase: "enter", panelRect: panel, originRect: button, viewport, reducedMotion: true });
  assert.equal(m.kind, "reduced");
  assert.equal(m.panel, null);
  assert.ok(m.duration <= 160);
});

test("el modal de puntuación nace del botón y vuelve a él", async () => {
  const { readFileSync } = await import("node:fs");
  const source = readFileSync(new URL("../../components/StarRating.jsx", import.meta.url), "utf8");
  assert.match(source, /useActionModalMotion\(open\)/);
  assert.match(source, /ref=\{modalPanelRef\}/);
  assert.match(source, /ref=\{modalBackdropRef\}/);
  assert.doesNotMatch(source, /animate-in/);
});

test("anchor below: el panel encogido conserva su borde superior bajo el botón", () => {
  const panelRect = { left: 1000, top: 92, width: 256, height: 475 };
  const originRect = { left: 1180, top: 20, width: 52, height: 52 };
  const t = originTransform(panelRect, originRect, { anchor: "below" });
  const centerY = panelRect.top + panelRect.height / 2 + t.dy;
  const topEdge = centerY - (t.scale * panelRect.height) / 2;
  assert.ok(Math.abs(topEdge - panelRect.top) < 0.5, `borde superior ${topEdge}`);
  assert.ok(topEdge >= originRect.top + originRect.height, "no sube sobre el botón");
  const centerX = panelRect.left + panelRect.width / 2 + t.dx;
  assert.equal(centerX, originRect.left + originRect.width / 2);
});

test("en la app de Android, el contenido de los modales pesados va sin desenfoques anidados, siempre", async () => {
  const { readFile } = await import("node:fs/promises");
  const css = await readFile(new URL("../../app/globals.css", import.meta.url), "utf8");
  assert.match(css, /html\[data-android-app\] \.sv-modal-flat-glass \*\s*\{\s*backdrop-filter:\s*none/);
  // Conmutarlo durante la animación hacía parpadear el contenido al terminar.
  assert.doesNotMatch(css, /data-sv-modal-moving/);
  for (const rel of ["../../components/trakt/TraktEpisodesWatchedModal.jsx", "../../components/details/EpisodeRatingsModal.jsx"]) {
    const src = await readFile(new URL(rel, import.meta.url), "utf8");
    assert.match(src, /sv-modal-flat-glass/);
  }
});

test("el velo de los episodios vistos desenfoca la imagen con filter, no con backdrop-filter", async () => {
  const { readFile } = await import("node:fs/promises");
  const src = await readFile(
    new URL("../../components/trakt/TraktEpisodesWatchedModal.jsx", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(src, /backdrop-blur-\[1px\]/);
  assert.match(src, /\[&_img\]:blur-\[1px\]/);
});
