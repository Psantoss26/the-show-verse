import test from "node:test";
import assert from "node:assert/strict";
import { clearRatingScoreCache, isRatingScoreSource, loadRatingScore } from "./ratingScoresLoader.js";

const RT_HTML = `<script data-json="mediaScorecard">{"audienceScore":{"scorePercent":"91%","bandedRatingCount":"250,000+ Ratings"}}</script>`;
const LINKS = { rt: "https://www.rottentomatoes.com/m/x", mc: "https://www.metacritic.com/movie/x/", lb: "https://letterboxd.com/film/x/" };

test("cada fuente responde por su cuenta: Rotten Tomatoes no espera a Metacritic", async () => {
  clearRatingScoreCache();
  let releaseMc;
  const mcGate = new Promise((resolve) => { releaseMc = resolve; });
  const fetchImpl = async (url) => {
    if (String(url).includes("metacritic")) await mcGate;
    return { ok: true, text: async () => RT_HTML };
  };
  const deps = { getLinks: async () => LINKS, fetchImpl };
  const mc = loadRatingScore({ type: "movie", tmdbId: "1", source: "mc" }, deps);
  const rt = await loadRatingScore({ type: "movie", tmdbId: "1", source: "rt" }, deps);
  assert.equal(rt.audienceScore, 9.1);
  releaseMc();
  assert.equal(await mc, null);
});

test("Letterboxd arranca sin esperar a los enlaces de Wikidata", async () => {
  clearRatingScoreCache();
  let started = false;
  const never = new Promise(() => {});
  const pending = loadRatingScore({ type: "movie", tmdbId: "2", source: "lb" }, {
    getLinks: () => never,
    fetchLetterboxd: async ({ webUrl }) => { started = true; assert.ok(webUrl instanceof Promise); return { audienceScore: 4 }; },
  });
  assert.deepEqual(await pending, { audienceScore: 4 });
  assert.equal(started, true);
});

test("una segunda petición del mismo título y fuente sale de la caché", async () => {
  clearRatingScoreCache();
  let pages = 0;
  const deps = { getLinks: async () => LINKS, fetchImpl: async () => { pages += 1; return { ok: true, text: async () => RT_HTML }; } };
  await Promise.all([
    loadRatingScore({ type: "movie", tmdbId: "3", source: "rt" }, deps),
    loadRatingScore({ type: "movie", tmdbId: "3", source: "rt" }, deps),
  ]);
  await loadRatingScore({ type: "movie", tmdbId: "3", source: "rt" }, deps);
  assert.equal(pages, 1);
});

test("fuentes válidas: Letterboxd solo en películas; Wikidata caído no se guarda", async () => {
  assert.equal(isRatingScoreSource("tv", "lb"), false);
  assert.equal(isRatingScoreSource("movie", "imdb"), false);
  assert.equal(await loadRatingScore({ type: "tv", tmdbId: "1", source: "lb" }, { getLinks: () => assert.fail() }), null);
  clearRatingScoreCache();
  let calls = 0;
  const deps = { getLinks: async () => { calls += 1; throw new Error("wikidata"); }, fetchImpl: () => assert.fail() };
  await assert.rejects(loadRatingScore({ type: "movie", tmdbId: "4", source: "rt" }, deps));
  await assert.rejects(loadRatingScore({ type: "movie", tmdbId: "4", source: "rt" }, deps));
  assert.equal(calls, 2);
});
