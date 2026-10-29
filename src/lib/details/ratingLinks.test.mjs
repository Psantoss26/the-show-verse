import test from "node:test";
import assert from "node:assert/strict";
import { buildImdbEpisodeHref } from "./ratingLinks.js";

const fallbackHref = "https://www.imdb.com/title/tt0944947/episodes?season=1";

test("abre la ficha exacta del episodio en IMDb", () => {
  assert.equal(
    buildImdbEpisodeHref({
      episodeImdbIds: ["tt1480055", "tt1480055"],
      showImdbId: "tt0944947",
      fallbackHref,
    }),
    "https://www.imdb.com/es-es/title/tt1480055/",
  );
});

test("sin id en TMDb usa el emparejado por SeriesGraph u OMDb", () => {
  assert.equal(
    buildImdbEpisodeHref({
      episodeImdbIds: [null, "tt1668746", "tt9999999"],
      showImdbId: "tt0944947",
      fallbackHref,
    }),
    "https://www.imdb.com/es-es/title/tt1668746/",
  );
});

test("ignora el id de la serie y cae a la lista de episodios", () => {
  assert.equal(
    buildImdbEpisodeHref({
      episodeImdbIds: [undefined, "tt0944947", ""],
      showImdbId: "tt0944947",
      fallbackHref,
    }),
    fallbackHref,
  );
});
