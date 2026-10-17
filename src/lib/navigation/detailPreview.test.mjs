import assert from "node:assert/strict";
import test from "node:test";
import { detailPreviewFromHref, panelDetailsHref, subrouteDetailsHref } from "./detailPreview.js";

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
  for (const href of ["https://other.example/details/tv/1399", "/details/person/0", "/details/movie/1/season/2", "/details/tv/0", "/details/tv/1/season/1/episode/0", "javascript:alert(1)"]) {
    assert.equal(detailPreviewFromHref(href, origin), null);
  }
  assert.deepEqual(detailPreviewFromHref("/details/movie/1", origin), { id: 1, media_type: "movie" });
});

test("person pages open in the iframe panel but are not season/episode subroutes", () => {
  const item = detailPreviewFromHref("/details/person/1253360", origin);
  assert.deepEqual(item, { id: 1253360, media_type: "person" });
  assert.equal(subrouteDetailsHref(item), null);
  assert.equal(panelDetailsHref(item), "/details/person/1253360");
  assert.equal(panelDetailsHref({ media_type: "season", id: 1, showId: 1, seasonNumber: 2 }), "/details/tv/1/season/2");
  assert.equal(panelDetailsHref({ media_type: "movie", id: 1 }), null);
});
