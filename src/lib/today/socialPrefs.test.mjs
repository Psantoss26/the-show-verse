import assert from "node:assert/strict";
import test from "node:test";

import { mergeSocialParams, readSocialPrefs, serializeSocialPrefs } from "./socialPrefs.js";

test("la cookie guarda y devuelve solo valores válidos", () => {
  const raw = serializeSocialPrefs({ view: "mine", scope: "community", day: "week", group: "person", filter: "review", order: "oldest" });
  assert.deepEqual(readSocialPrefs(raw), { view: "mine", scope: "community", day: "week", group: "person", filter: "review", order: "oldest" });
  // Un día concreto no se guarda, ni valores inventados.
  assert.deepEqual(readSocialPrefs(serializeSocialPrefs({ day: "2026-10-30", view: "x", order: "random" })), {});
  assert.deepEqual(readSocialPrefs("%%%"), {});
  assert.deepEqual(readSocialPrefs(undefined), {});
});

test("la URL gana a lo guardado; lo que falta sale de la cookie", () => {
  const prefs = { view: "activity", scope: "community", day: "week", group: "time" };
  assert.deepEqual(mergeSocialParams({}, prefs), { params: prefs, saved: true });
  assert.deepEqual(mergeSocialParams({ view: "mine" }, prefs).params.view, "mine");
  assert.deepEqual(mergeSocialParams({}, {}), { params: {}, saved: false });
});

test("un enlace a Actividad no cambia a la sección guardada", () => {
  const prefs = { view: "mine", group: "person" };
  const { params } = mergeSocialParams({ story: "movie:1" }, prefs);
  assert.equal(params.view, undefined);
  assert.equal(params.group, "person");
  assert.equal(mergeSocialParams({ scope: "community" }, prefs).params.view, undefined);
});
