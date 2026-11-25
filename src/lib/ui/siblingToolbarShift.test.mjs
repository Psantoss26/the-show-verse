import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { siblingShiftKeyframes } from "./siblingToolbarShift.js";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

test("llegando a Historial (aparece el calendario): selector desde la derecha, cristal desde el ancho anterior", () => {
  const f = siblingShiftKeyframes(52);
  assert.equal(f.extend, 52);
  assert.equal(f.follow[0].transform, "translate3d(52px,0,0)");
  assert.equal(f.follow[1].transform, "translate3d(0px,0,0)");
  // Capa alargada 52 px: enseña todo (ancho anterior) y acaba recortada al final.
  assert.match(f.glass[0].clipPath, /^inset\(0px 0px 0px 0px/);
  assert.match(f.glass[1].clipPath, /^inset\(0px 52px 0px 0px/);
});

test("llegando a Continuar viendo (se va el calendario): selector desde la izquierda, cristal recortado al anterior", () => {
  const f = siblingShiftKeyframes(-52);
  assert.equal(f.extend, 0);
  assert.equal(f.follow[0].transform, "translate3d(-52px,0,0)");
  assert.match(f.glass[0].clipPath, /^inset\(0px 52px 0px 0px/);
  assert.match(f.glass[1].clipPath, /^inset\(0px 0px 0px 0px/);
});

test("solo propiedades del compositor (sin width ni margin)", () => {
  const f = siblingShiftKeyframes(52);
  for (const frames of [f.follow, f.glass, f.fadeIn, f.fadeOut]) {
    for (const frame of frames) {
      for (const prop of Object.keys(frame)) {
        assert.ok(["transform", "opacity", "clipPath"].includes(prop), prop);
      }
    }
  }
});

test("Historial y Continuar viendo no animan el hueco del calendario con framer", () => {
  for (const path of [
    "../../app/history/HistoryClient.jsx",
    "../../app/continue-watching/ContinueWatchingClient.jsx",
  ]) {
    const src = read(path);
    assert.doesNotMatch(src, /CALENDAR_SLOT_TRANSITION/, path);
    assert.match(src, /useSiblingToolbarShift/, path);
  }
});

test("la pastilla usa la misma duración y curva que el relevo de la barra", () => {
  const hook = read("../../components/ui/useSlidingSectionIndicator.jsx");
  assert.match(hook, /import \{[^}]*SLIDE_MS[^}]*\} from "@\/lib\/ui\/siblingToolbarShift"/);
  assert.doesNotMatch(hook, /const SLIDE_MS =/);
});
