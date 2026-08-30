import assert from "node:assert/strict";
import test from "node:test";

import { getUserDetailsSequenceHref } from "./userDetailsSequence.js";
import { readFile } from "node:fs/promises";

test("getUserDetailsSequenceHref only accepts root DetailsClient routes", () => {
  assert.equal(getUserDetailsSequenceHref("movie", 550), "/details/movie/550");
  assert.equal(getUserDetailsSequenceHref("tv", "1399"), "/details/tv/1399");
  assert.equal(getUserDetailsSequenceHref("episode", 1), null);
});

test("la secuencia puede tomar el contenedor completo de una página personal", async () => {
  const source = await readFile(new URL("./userDetailsSequence.js", import.meta.url), "utf8");

  assert.match(source, /saveUserDetailsSequenceFromLink\(link, sequenceScope = null\)/);
  assert.match(source, /sequenceScope instanceof Element && sequenceScope\.contains\(link\)/);
});
