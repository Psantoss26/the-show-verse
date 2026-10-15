import assert from "node:assert/strict";
import test from "node:test";
import { detailPreviewFromHref, subrouteDetailsHref } from "./detailPreview.js";

const origin = "https://showverse.example";
test("season and episode routes retain the show's ID, including specials", () => {
  for (const href of ["/details/tv/1399/season/0", "/details/tv/1399/season/1/episode/2"]) {
    const item = detailPreviewFromHref(href, origin);
    assert.equal(item.showId, 1399);
    assert.equal(subrouteDetailsHref(item), href);
    assert.equal(subrouteDetailsHref({ ...item, id: 999 }), href);
  }
});
test("only supported same-origin detail pages can open previews", () => {
  for (const href of ["https://other.example/details/tv/1399", "/details/person/1", "/details/movie/1/season/2", "/details/tv/0", "/details/tv/1/season/1/episode/0", "javascript:alert(1)"]) {
    assert.equal(detailPreviewFromHref(href, origin), null);
  }
  assert.deepEqual(detailPreviewFromHref("/details/movie/1", origin), { id: 1, media_type: "movie" });
});
