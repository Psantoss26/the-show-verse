import assert from "node:assert/strict";
import test from "node:test";

import { dashboardDetailHref } from "./detailHref.js";

test("routes dashboard calendar episode previews to the episode details page", () => {
  assert.equal(
    dashboardDetailHref(
      {
        id: 1399,
        media_type: "tv",
        nextEpisode: { season: 2, number: 9 },
      },
      "tv",
    ),
    "/details/tv/1399/season/2/episode/9",
  );
});

test("keeps regular tv items on the show details page", () => {
  assert.equal(
    dashboardDetailHref({ id: 1399, media_type: "tv" }, "tv"),
    "/details/tv/1399",
  );
});

test("preserves explicit detail hrefs from backend payloads", () => {
  assert.equal(
    dashboardDetailHref(
      {
        id: 1399,
        detailsHref: "/details/tv/1399/season/1/episode/1",
      },
      "tv",
    ),
    "/details/tv/1399/season/1/episode/1",
  );
});

test("keeps movie items on movie details pages", () => {
  assert.equal(
    dashboardDetailHref({ id: 550, media_type: "movie" }, "movie"),
    "/details/movie/550",
  );
});
