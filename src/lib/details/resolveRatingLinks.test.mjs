import test from "node:test";
import assert from "node:assert/strict";
import { isRatingLinksIdentity, pickRatingLinks, resolveRatingLinks } from "./resolveRatingLinks.js";

const claim = (value, rank = "normal") => ({ rank, mainsnak: { snaktype: "value", datavalue: { value } } });
const movie = { claims: {
  P4947: [claim("27205")],
  P1258: [claim("m/inception")],
  P1712: [claim("movie/inception")],
} };

test("resolves canonical movie links only for the exact TMDb identity", () => {
  assert.deepEqual(pickRatingLinks({ Q1: movie }, { type: "movie", tmdbId: 27205 }), {
    rt: "https://www.rottentomatoes.com/m/inception",
    mc: "https://www.metacritic.com/movie/inception/",
  });
  for (const identity of [{ type: "tv", tmdbId: 27205 }, { type: "movie", tmdbId: 1 }]) {
    assert.deepEqual(pickRatingLinks({ Q1: movie }, identity), { rt: null, mc: null });
  }
});

test("uses series links and excludes season, game, search and unsafe destinations", () => {
  const entity = { claims: {
    P4983: [claim("1396")],
    P1258: [claim("tv/breaking_bad"), claim("tv/breaking_bad/s01"), claim("//evil.test")],
    P1712: [claim("tv/breaking-bad"), claim("game/breaking-bad"), claim("search/breaking-bad")],
  } };
  assert.deepEqual(pickRatingLinks({ Q1: entity }, { type: "tv", tmdbId: 1396 }), {
    rt: "https://www.rottentomatoes.com/tv/breaking_bad",
    mc: "https://www.metacritic.com/tv/breaking-bad/",
  });
});

test("ignores deprecated claims and refuses ambiguous matches", () => {
  const entity = { claims: {
    ...movie.claims,
    P1258: [claim("m/old", "deprecated"), claim("m/inception", "preferred"), claim("m/other")],
    P1712: [claim("movie/first"), claim("movie/second")],
  } };
  assert.deepEqual(pickRatingLinks({ Q1: entity }, { type: "movie", tmdbId: 27205 }), {
    rt: "https://www.rottentomatoes.com/m/inception", mc: null,
  });
  assert.deepEqual(pickRatingLinks({ Q1: movie, Q2: movie }, { type: "movie", tmdbId: 27205 }), { rt: null, mc: null });
});

test("validates identifiers before any upstream request", async () => {
  for (const [type, tmdbId] of [["person", 1], ["movie", "1 OR 2"], ["tv", 0], ["movie", null]]) {
    assert.equal(isRatingLinksIdentity(type, tmdbId), false);
    await assert.rejects(resolveRatingLinks({ type, tmdbId }, () => assert.fail("Unexpected fetch")));
  }
});

test("looks up by TMDb property and verifies the returned entity claims", async () => {
  const urls = [];
  const links = await resolveRatingLinks({ type: "movie", tmdbId: 27205 }, async (url) => {
    urls.push(url);
    return { ok: true, json: async () => urls.length === 1
      ? { query: { search: [{ title: "Q25188" }] } }
      : { entities: { Q25188: movie } } };
  });
  assert.equal(urls[0].searchParams.get("srsearch"), "haswbstatement:P4947=27205");
  assert.equal(urls[1].searchParams.get("ids"), "Q25188");
  assert.equal(links.mc, "https://www.metacritic.com/movie/inception/");
});

test("missing entries return no links; upstream failures remain retryable errors", async () => {
  assert.deepEqual(await resolveRatingLinks({ type: "movie", tmdbId: 1 }, async () => ({
    ok: true, json: async () => ({ query: { search: [] } }),
  })), { rt: null, mc: null });
  await assert.rejects(resolveRatingLinks({ type: "movie", tmdbId: 1 }, async () => ({ ok: false })));
  await assert.rejects(resolveRatingLinks({ type: "movie", tmdbId: 1 }, async () => ({
    ok: true, json: async () => ({ error: { code: "ratelimited" } }),
  })));
});
