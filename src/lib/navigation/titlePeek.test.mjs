import assert from "node:assert/strict";
import test from "node:test";

import {
  exceedsPeekMoveTolerance,
  titlePeekAttrs,
  titlePeekItemFromAttr,
  titlePeekItemFromHref,
  titlePeekSeasonAttrs,
} from "./titlePeek.mjs";

test("reconoce los enlaces a fichas de películas, series y episodios", () => {
  assert.deepEqual(titlePeekItemFromHref("/details/movie/603"), {
    id: 603,
    media_type: "movie",
    detailsHref: "/details/movie/603",
  });
  assert.deepEqual(titlePeekItemFromHref("/details/tv/1399/?from=home"), {
    id: 1399,
    media_type: "tv",
    detailsHref: "/details/tv/1399/",
  });
  assert.deepEqual(titlePeekItemFromHref("/details/tv/1399/season/1/episode/2"), {
    media_type: "episode",
    id: 1399,
    showId: 1399,
    seasonNumber: 1,
    episodeNumber: 2,
    detailsHref: "/details/tv/1399/season/1/episode/2",
  });
});

test("ignora personas, temporadas, otras webs y enlaces rotos", () => {
  assert.equal(titlePeekItemFromHref("/details/person/287"), null);
  assert.equal(titlePeekItemFromHref("/details/tv/1399/season/1"), null);
  assert.equal(titlePeekItemFromHref("/details/movie/abc"), null);
  assert.equal(titlePeekItemFromHref("/details/movie/0"), null);
  assert.equal(
    titlePeekItemFromHref("https://example.com/details/movie/603"),
    null,
  );
  assert.equal(titlePeekItemFromHref(""), null);
  assert.equal(titlePeekItemFromHref(null), null);
});

test("lee y escribe el atributo de las tarjetas sin enlace", () => {
  assert.deepEqual(titlePeekAttrs({ id: 603, media_type: "movie" }), {
    "data-sv-peek": "movie:603",
  });
  assert.deepEqual(titlePeekAttrs({ id: 1399, first_air_date: "2011-04-17" }), {
    "data-sv-peek": "tv:1399",
  });
  assert.deepEqual(titlePeekAttrs({ id: 1399 }, "tv"), {
    "data-sv-peek": "tv:1399",
  });
  assert.deepEqual(titlePeekAttrs({}), {});

  assert.deepEqual(titlePeekItemFromAttr("movie:603"), {
    id: 603,
    media_type: "movie",
  });
  assert.equal(titlePeekItemFromAttr("tv:1399:1:2")?.media_type, "episode");
  assert.equal(titlePeekItemFromAttr("person:287"), null);
  assert.equal(titlePeekItemFromAttr("movie:"), null);
});

test("las temporadas solo se reconocen por el atributo", () => {
  assert.deepEqual(titlePeekSeasonAttrs(1399, 0), {
    "data-sv-peek": "season:1399:0",
  });
  assert.deepEqual(titlePeekSeasonAttrs(null, 1), {});
  assert.deepEqual(titlePeekItemFromAttr("season:1399:2"), {
    media_type: "season",
    id: 1399,
    showId: 1399,
    seasonNumber: 2,
    detailsHref: "/details/tv/1399/season/2",
  });
  assert.equal(titlePeekItemFromAttr("season:1399"), null);
  assert.equal(titlePeekItemFromAttr("season:1399:-1"), null);
  assert.equal(titlePeekItemFromAttr("season:abc:1"), null);
});

test("un desplazamiento de más de 10 px cancela la pulsación larga", () => {
  const start = { x: 100, y: 100 };
  assert.equal(exceedsPeekMoveTolerance(start, { x: 106, y: 106 }), false);
  assert.equal(exceedsPeekMoveTolerance(start, { x: 100, y: 112 }), true);
});
