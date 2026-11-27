import assert from "node:assert/strict";
import test from "node:test";

import { flipFrames, shownActivityTile } from "./tilesLayoutFlip.js";

test("mientras no se sabe si va Actividad se conservan los bloques anteriores", () => {
  assert.equal(shownActivityTile({ resolved: false, hasActivity: false, previous: true }), true);
  assert.equal(shownActivityTile({ resolved: false, hasActivity: false, previous: false }), false);
});

test("al saberlo manda lo que tiene el título nuevo", () => {
  assert.equal(shownActivityTile({ resolved: true, hasActivity: true, previous: false }), true);
  assert.equal(shownActivityTile({ resolved: true, hasActivity: false, previous: true }), false);
});

test("un bloque que no se mueve ni cambia de tamaño no se anima", () => {
  const rect = { x: 10, y: 20, width: 100, height: 40 };
  assert.equal(flipFrames(rect, { ...rect, x: 10.4 }), null);
});

test("un bloque que se recoloca arranca en su sitio y tamaño anteriores", () => {
  const frames = flipFrames(
    { x: 0, y: 0, width: 200, height: 40 },
    { x: 100, y: 50, width: 100, height: 80 },
  );
  assert.deepEqual(frames.tile, [
    { transformOrigin: "0 0", transform: "translate(-100px, -50px) scale(2, 0.5)" },
    { transformOrigin: "0 0", transform: "translate(0px, 0px) scale(1, 1)" },
  ]);
  // El contenido deshace la escala del bloque: icono y nombre no se deforman.
  assert.deepEqual(frames.content, [
    { transform: "scale(0.5, 2)" },
    { transform: "scale(1, 1)" },
  ]);
});
