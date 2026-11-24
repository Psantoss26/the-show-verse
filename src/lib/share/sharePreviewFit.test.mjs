import assert from "node:assert/strict";
import test from "node:test";

import { fitSharePreviewHeight } from "./sharePreviewFit.js";

// Medidas reales del modal de compartir (cabecera 104, botones 155, relleno
// superior del cuerpo 8, selector Imagen/Vídeo 44 + 20 de margen).
const base = { head: 104, foot: 155, bodyExtra: 72, width: 376, cap: 512 };

test("la vista previa ocupa justo el alto libre del modal, sin desbordar", () => {
  // App de Android: tope del modal recortado por las zonas seguras.
  const h = fitSharePreviewHeight({ ...base, maxPanel: 560 });
  assert.equal(h, 560 - 104 - 155 - 72);
  assert.ok(base.head + base.foot + base.bodyExtra + h <= 560);
});

test("en pantallas altas se queda en el tope de diseño", () => {
  assert.equal(fitSharePreviewHeight({ ...base, maxPanel: 1400 }), 512);
});

test("en paneles estrechos manda el ancho (9:16) para no recortar los lados", () => {
  const h = fitSharePreviewHeight({ ...base, width: 200, maxPanel: 1400 });
  assert.equal(h, Math.floor((200 * 16) / 9));
});

test("botones en dos líneas: más alto de pie, menos vista previa", () => {
  const h = fitSharePreviewHeight({ ...base, foot: 190, maxPanel: 700 });
  assert.equal(h, 700 - 104 - 190 - 72);
});

test("medidas que aún no existen no dan alto", () => {
  assert.equal(fitSharePreviewHeight({ ...base, maxPanel: Number.NaN }), null);
  assert.equal(fitSharePreviewHeight({ ...base, maxPanel: 200 }), null);
});
