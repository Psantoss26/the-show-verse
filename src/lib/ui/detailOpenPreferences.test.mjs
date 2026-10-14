import assert from "node:assert/strict";
import test from "node:test";

import {
  DETAIL_OPEN_DEFAULTS,
  readDetailOpen,
  resolveDetailOpen,
  withDetailOpen,
} from "./detailOpenPreferences.js";

test("sin preferencia guardada no hay campos (se usa lo de antes)", () => {
  assert.deepEqual(readDetailOpen({}, "dashboard"), {});
  assert.deepEqual(readDetailOpen(undefined, "userPages"), {});
});

test("los valores por defecto por ámbito: dashboard centrado, páginas de usuario lateral", () => {
  assert.equal(resolveDetailOpen({}, "dashboard").placement, "center");
  assert.equal(resolveDetailOpen({}, "userPages").placement, "right");
  assert.deepEqual(resolveDetailOpen({}, "dashboard"), DETAIL_OPEN_DEFAULTS.dashboard);
});

test("guardar un campo no toca el resto de ajustes ni el otro ámbito", () => {
  const ui = { soundtrackAutoplay: false, detailOpen: { userPages: { drawerView: "docked" } } };
  const next = withDetailOpen(ui, "dashboard", { target: "page" });
  assert.equal(next.soundtrackAutoplay, false);
  assert.deepEqual(next.detailOpen.userPages, { drawerView: "docked" });
  assert.deepEqual(next.detailOpen.dashboard, { target: "page" });
  // Se acumula sobre lo que ya había en el ámbito.
  const again = withDetailOpen(next, "dashboard", { placement: "right" });
  assert.deepEqual(again.detailOpen.dashboard, { target: "page", placement: "right" });
});

test("los valores no válidos se descartan", () => {
  const next = withDetailOpen({}, "userPages", { target: "popup", drawerView: "docked", contentView: 3 });
  assert.deepEqual(next.detailOpen.userPages, { drawerView: "docked" });
  assert.deepEqual(readDetailOpen({ detailOpen: { userPages: { placement: "left" } } }, "userPages"), {});
  assert.deepEqual(withDetailOpen({}, "otro", { target: "page" }), {});
});
