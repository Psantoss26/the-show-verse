import assert from "node:assert/strict";
import test from "node:test";

import {
  instagramLink,
  pickExternalIds,
  pickWikipediaUrl,
  referenceLinks,
  withTitleExternalLinks,
} from "./titleExternalLinks.js";

test("de external_ids solo Instagram, IMDb y Wikidata (sin Facebook ni X)", () => {
  assert.deepEqual(
    pickExternalIds({ instagram_id: "@thematrixmovie", imdb_id: "tt0133093", wikidata_id: "Q83495", facebook_id: "TheMatrix", twitter_id: "matrix" }),
    { instagramId: "thematrixmovie", imdbId: "tt0133093", wikidataId: "Q83495" },
  );
  assert.deepEqual(pickExternalIds({ instagram_id: "bad handle!", imdb_id: "", wikidata_id: "x" }), {
    instagramId: null,
    imdbId: null,
    wikidataId: null,
  });
  assert.equal(instagramLink("strangerthingstv").href, "https://www.instagram.com/strangerthingstv/");
  assert.equal(instagramLink(null), null);
});

test("referencias: IMDb, TMDb, Trakt y Wikipedia", () => {
  const items = referenceLinks({ type: "tv", tmdbId: 1396, imdbId: "tt0903747", wikipediaUrl: "https://es.wikipedia.org/wiki/Breaking_Bad" });
  assert.deepEqual(items.map((item) => [item.id, item.href]), [
    ["imdb", "https://www.imdb.com/title/tt0903747/"],
    ["tmdb", "https://www.themoviedb.org/tv/1396"],
    ["trakt", "https://trakt.tv/search/tmdb/1396?id_type=show"],
    ["wiki", "https://es.wikipedia.org/wiki/Breaking_Bad"],
  ]);
  assert.deepEqual(referenceLinks({ type: "movie", tmdbId: 0, wikipediaUrl: "https://evil.example/wiki/x" }), []);
});

test("Instagram va junto a la web oficial y las referencias al final, sin repetir", () => {
  const base = [
    { id: "web", href: "https://a.com" },
    { id: "jw", href: "https://jw" },
    { id: "fa", href: "https://fa" },
  ];
  const result = withTitleExternalLinks(base, { instagramId: "a", type: "movie", tmdbId: 603, imdbId: "tt0133093" });
  assert.deepEqual(result.map((item) => item.id), ["web", "ig", "jw", "fa", "imdb", "tmdb", "trakt"]);
  // Sin web oficial, Instagram encabeza.
  assert.deepEqual(withTitleExternalLinks([{ id: "jw" }], { instagramId: "a" }).map((item) => item.id), ["ig", "jw"]);
  assert.deepEqual(withTitleExternalLinks([{ id: "imdb" }], { type: "movie", imdbId: "tt0133093" }).map((item) => item.id), ["imdb"]);
});

test("artículo de Wikipedia: en español y, si no, en inglés", () => {
  assert.equal(
    pickWikipediaUrl({ sitelinks: { enwiki: { url: "https://en.wikipedia.org/wiki/X" }, eswiki: { url: "https://es.wikipedia.org/wiki/X" } } }),
    "https://es.wikipedia.org/wiki/X",
  );
  assert.equal(pickWikipediaUrl({ sitelinks: { enwiki: { url: "https://en.wikipedia.org/wiki/X" } } }), "https://en.wikipedia.org/wiki/X");
  assert.equal(pickWikipediaUrl({}), null);
});
