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
    lb: null,
  });
  for (const identity of [{ type: "tv", tmdbId: 27205 }, { type: "movie", tmdbId: 1 }]) {
    assert.deepEqual(pickRatingLinks({ Q1: movie }, identity), { rt: null, mc: null, lb: null });
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
    lb: null,
  });
});

test("ignores deprecated claims and refuses ambiguous matches", () => {
  const entity = { claims: {
    ...movie.claims,
    P1258: [claim("m/old", "deprecated"), claim("m/inception", "preferred"), claim("m/other")],
    P1712: [claim("movie/first"), claim("movie/second")],
  } };
  assert.deepEqual(pickRatingLinks({ Q1: entity }, { type: "movie", tmdbId: 27205 }), {
    rt: "https://www.rottentomatoes.com/m/inception", mc: null, lb: null,
  });
  assert.deepEqual(pickRatingLinks({ Q1: movie, Q2: movie }, { type: "movie", tmdbId: 27205 }), { rt: null, mc: null, lb: null });
});

test("validates identifiers before any upstream request", async () => {
  for (const [type, tmdbId] of [["person", 1], ["movie", "1 OR 2"], ["tv", 0], ["movie", null]]) {
    assert.equal(isRatingLinksIdentity(type, tmdbId), false);
    await assert.rejects(resolveRatingLinks({ type, tmdbId }, () => assert.fail("Unexpected fetch")));
  }
});

test("looks up by TMDb property in ONE request and verifies the returned entity claims", async () => {
  const urls = [];
  const links = await resolveRatingLinks({ type: "movie", tmdbId: 27205 }, async (url) => {
    urls.push(url);
    return { ok: true, json: async () => ({ query: { pages: [
      { title: "Q25188", revisions: [{ slots: { main: { content: JSON.stringify(movie) } } }] },
    ] } }) };
  });
  assert.equal(urls.length, 1);
  assert.equal(urls[0].searchParams.get("generator"), "search");
  assert.equal(urls[0].searchParams.get("gsrsearch"), "haswbstatement:P4947=27205");
  assert.equal(links.mc, "https://www.metacritic.com/movie/inception/");
});

test("ignores pages that are not items or whose content is not valid JSON", async () => {
  const links = await resolveRatingLinks({ type: "movie", tmdbId: 27205 }, async () => ({
    ok: true, json: async () => ({ query: { pages: [
      { title: "Q1", revisions: [{ slots: { main: { content: "{not json" } } }] },
      { title: "Property:P1", revisions: [{ slots: { main: { content: JSON.stringify(movie) } } }] },
      { title: "Q25188", revisions: [{ slots: { main: { content: JSON.stringify(movie) } } }] },
    ] } }),
  }));
  assert.equal(links.rt, "https://www.rottentomatoes.com/m/inception");
});

test("missing entries return no links; upstream failures remain retryable errors", async () => {
  assert.deepEqual(await resolveRatingLinks({ type: "movie", tmdbId: 1 }, async () => ({
    ok: true, json: async () => ({ batchcomplete: true }),
  })), { rt: null, mc: null, lb: null });
  await assert.rejects(resolveRatingLinks({ type: "movie", tmdbId: 1 }, async () => ({ ok: false })));
  await assert.rejects(resolveRatingLinks({ type: "movie", tmdbId: 1 }, async () => ({
    ok: true, json: async () => ({ error: { code: "ratelimited" } }),
  })));
});

test("Letterboxd: ficha por su slug (P6127) o, si no, por IMDb (P345); solo películas", () => {
  const withSlug = { claims: { ...movie.claims, P6127: [claim("inception")], P345: [claim("tt1375666")] } };
  assert.equal(pickRatingLinks({ Q1: withSlug }, { type: "movie", tmdbId: 27205 }).lb, "https://letterboxd.com/film/inception/");
  const imdbOnly = { claims: { ...movie.claims, P345: [claim("tt1375666")] } };
  assert.equal(pickRatingLinks({ Q1: imdbOnly }, { type: "movie", tmdbId: 27205 }).lb, "https://letterboxd.com/imdb/tt1375666/");
  const unsafe = { claims: { ...movie.claims, P6127: [claim("../evil")], P345: [claim("nm0000001")] } };
  assert.equal(pickRatingLinks({ Q1: unsafe }, { type: "movie", tmdbId: 27205 }).lb, null);
  const ambiguous = { claims: { ...movie.claims, P6127: [claim("a"), claim("b")] } };
  assert.equal(pickRatingLinks({ Q1: ambiguous }, { type: "movie", tmdbId: 27205 }).lb, null);
  const series = { claims: { P4983: [claim("1396")], P345: [claim("tt0903747")] } };
  assert.equal(pickRatingLinks({ Q1: series }, { type: "tv", tmdbId: 1396 }).lb, null);
});
