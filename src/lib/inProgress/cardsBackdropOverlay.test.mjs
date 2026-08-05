import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const clientPath = new URL(
  "../../app/in-progress/InProgressClient.jsx",
  import.meta.url,
);

test("la vista de tarjetas no superpone título, año ni géneros al backdrop", async () => {
  const source = await readFile(clientPath, "utf8");
  const cardsStart = source.indexOf("// ==== CARDS VIEW (default) ====");
  const progressStart = source.indexOf("{/* Progress section */}", cardsStart);

  assert.ok(cardsStart >= 0 && progressStart > cardsStart);

  const backdropArea = source.slice(cardsStart, progressStart);
  assert.doesNotMatch(backdropArea, /<h3\b/);
  assert.doesNotMatch(backdropArea, /item\.year/);
  assert.doesNotMatch(backdropArea, /item\.genres/);
  assert.match(backdropArea, /nextEpCode/);
  assert.match(backdropArea, /CircularProgress/);
});
