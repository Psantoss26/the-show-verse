import assert from "node:assert/strict";
import test from "node:test";

import { getUserDetailsSequenceHref } from "./userDetailsSequence.js";

test("getUserDetailsSequenceHref only accepts root DetailsClient routes", () => {
  assert.equal(getUserDetailsSequenceHref("movie", 550), "/details/movie/550");
  assert.equal(getUserDetailsSequenceHref("tv", "1399"), "/details/tv/1399");
  assert.equal(getUserDetailsSequenceHref("episode", 1), null);
});
