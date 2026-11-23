import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { SHEET_ENTER, SHEET_EXIT, SHEET_ENTER_FRAMER, SHEET_EXIT_FRAMER } from "./sectionSheetMotion.js";
import {
  backdropVariants,
  createPanelVariants,
  createPanelVariantsRight,
} from "../../components/dashboard/detailPanelMotion.js";

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

test("la versión para framer es la misma curva y duración que la de WAAPI", () => {
  assert.equal(SHEET_ENTER_FRAMER.duration * 1000, SHEET_ENTER.duration);
  assert.equal(SHEET_EXIT_FRAMER.duration * 1000, SHEET_EXIT.duration);
  assert.equal(SHEET_ENTER.easing, `cubic-bezier(${SHEET_ENTER_FRAMER.ease.join(", ")})`);
  assert.equal(SHEET_EXIT.easing, `cubic-bezier(${SHEET_EXIT_FRAMER.ease.join(", ")})`);
});

test("DetailModal (hoja de abajo y drawer derecho) entra y sale como las vistas laterales", () => {
  for (const create of [createPanelVariants, createPanelVariantsRight]) {
    const variants = create(false);
    assert.deepEqual(variants.visible(false).transition, SHEET_ENTER_FRAMER);
    assert.deepEqual(variants.exit(false).transition, SHEET_EXIT_FRAMER);
    // Sin fundido del panel al abrir/cerrar (aplanaría el cristal).
    assert.equal(variants.hidden(false).opacity, 1);
    assert.equal(variants.exit(false).opacity, 1);
  }
  // El velo acompaña al panel en el mismo tiempo.
  assert.equal(backdropVariants.visible.transition.duration, SHEET_ENTER_FRAMER.duration);
  assert.equal(backdropVariants.exit.transition.duration, SHEET_EXIT_FRAMER.duration);
});

test("la vista previa móvil crece y vuelve con las mismas curvas, sin valores propios", () => {
  const peek = read("components/preview/DetailPeekLayout.jsx");
  assert.match(peek, /SHEET_ENTER/);
  assert.match(peek, /SHEET_EXIT/);
  assert.doesNotMatch(peek, /PEEK_SPRING|PEEK_EXIT_EASING|PEEK_EXIT_MS/);
});
