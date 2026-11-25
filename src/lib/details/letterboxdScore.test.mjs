import test from "node:test";
import assert from "node:assert/strict";
import {
  fetchLetterboxdScore,
  hasLetterboxdApiCredentials,
  letterboxdScoreBadge,
  parseLetterboxdApiScore,
  parseLetterboxdFilmPage,
  resetLetterboxdTokenCache,
} from "./letterboxdScore.js";

// Forma real del JSON-LD de una ficha de Letterboxd (envuelto en CDATA).
const ldJson = (data) =>
  `<script type="application/ld+json">\n/* <![CDATA[ */\n${JSON.stringify(data)}\n/* ]]> */\n</script>`;
const filmPage = (rating, extra = {}) =>
  `<html><head><meta property="og:url" content="https://letterboxd.com/film/inception/">${ldJson({
    "@type": "Movie",
    url: "https://letterboxd.com/film/inception/",
    name: "Inception",
    ...(rating ? { aggregateRating: { "@type": "AggregateRating", bestRating: 5, worstRating: 0.5, ...rating } } : {}),
    ...extra,
  })}</head></html>`;

const response = (body, { status = 200, url = "", json = false } = {}) => ({
  ok: status >= 200 && status < 300,
  status,
  url,
  text: async () => (json ? JSON.stringify(body) : body),
  json: async () => body,
});

test("web: media 0–5 y recuento del JSON-LD de la ficha", () => {
  assert.deepEqual(parseLetterboxdFilmPage(filmPage({ ratingValue: 4.24, ratingCount: 4638530 })), {
    audienceScore: 4.24,
    audienceCount: 4638530,
    url: "https://letterboxd.com/film/inception/",
  });
});

test("web: sin nota, «IMDb ID Not found», JSON roto o fuera de rango no hay nota", () => {
  assert.equal(parseLetterboxdFilmPage(filmPage(null)), null);
  assert.equal(parseLetterboxdFilmPage("<title>IMDb ID Not found • Letterboxd</title>"), null);
  assert.equal(parseLetterboxdFilmPage('<script type="application/ld+json">{roto</script>'), null);
  assert.equal(parseLetterboxdFilmPage(filmPage({ ratingValue: 7.5, ratingCount: 10 })), null);
  assert.equal(parseLetterboxdFilmPage(filmPage({ ratingValue: 3.1, ratingCount: 10 }, { "@type": "TVSeries" })), null);
  assert.equal(parseLetterboxdFilmPage(""), null);
});

test("web: URL que no es una ficha /film/ de Letterboxd se descarta", () => {
  const html = filmPage({ ratingValue: 4, ratingCount: 5 }, { url: "https://evil.test/film/x/" })
    .replace("https://letterboxd.com/film/inception/", "https://evil.test/");
  assert.deepEqual(parseLetterboxdFilmPage(html), { audienceScore: 4, audienceCount: 5, url: null });
});

test("API: rating de la película y recuento de sus estadísticas", () => {
  assert.deepEqual(
    parseLetterboxdApiScore(
      { id: "2bbs", rating: 4.2412, link: "https://letterboxd.com/film/inception/" },
      { counts: { ratings: 4638530 } },
    ),
    { audienceScore: 4.2412, audienceCount: 4638530, url: "https://letterboxd.com/film/inception/" },
  );
  assert.deepEqual(parseLetterboxdApiScore({ id: "x", rating: 3, link: "https://letterboxd.com/film/x/" }, null), {
    audienceScore: 3, audienceCount: null, url: "https://letterboxd.com/film/x/",
  });
  assert.equal(parseLetterboxdApiScore({ id: "x", link: "https://letterboxd.com/film/x/" }, null), null);
  assert.equal(parseLetterboxdApiScore(null, null), null);
});

test("credenciales: solo con id y secreto", () => {
  assert.equal(hasLetterboxdApiCredentials({ LETTERBOXD_CLIENT_ID: "a", LETTERBOXD_CLIENT_SECRET: "b" }), true);
  assert.equal(hasLetterboxdApiCredentials({ LETTERBOXD_CLIENT_ID: "a" }), false);
  assert.equal(hasLetterboxdApiCredentials({ LETTERBOXD_CLIENT_ID: " ", LETTERBOXD_CLIENT_SECRET: "b" }), false);
  assert.equal(hasLetterboxdApiCredentials({}), false);
});

test("sin credenciales: lee la ficha web que da Wikidata y valida la URL final", async () => {
  const calls = [];
  const score = await fetchLetterboxdScore(
    { tmdbId: 27205, webUrl: "https://letterboxd.com/imdb/tt1375666/" },
    {
      env: {},
      fetchImpl: async (url) => {
        calls.push(String(url));
        return response(filmPage({ ratingValue: 4.24, ratingCount: 100 }), { url: "https://letterboxd.com/film/inception/" });
      },
    },
  );
  assert.deepEqual(calls, ["https://letterboxd.com/imdb/tt1375666/"]);
  assert.deepEqual(score, { audienceScore: 4.24, audienceCount: 100, url: "https://letterboxd.com/film/inception/", source: "web" });
});

test("web: redirección fuera de /film/, error HTTP, red caída o sin URL → null", async () => {
  const notFilm = async () => response(filmPage({ ratingValue: 4, ratingCount: 1 }), { url: "https://letterboxd.com/imdb/tt0903747/" });
  assert.equal(await fetchLetterboxdScore({ webUrl: "https://letterboxd.com/imdb/tt0903747/" }, { env: {}, fetchImpl: notFilm }), null);
  const http403 = async () => response("challenge", { status: 403, url: "https://letterboxd.com/film/inception/" });
  assert.equal(await fetchLetterboxdScore({ webUrl: "https://letterboxd.com/film/inception/" }, { env: {}, fetchImpl: http403 }), null);
  const down = async () => { throw new TypeError("fetch failed"); };
  assert.equal(await fetchLetterboxdScore({ webUrl: "https://letterboxd.com/film/inception/" }, { env: {}, fetchImpl: down }), null);
  assert.equal(await fetchLetterboxdScore({ tmdbId: 1, webUrl: null }, { env: {}, fetchImpl: () => assert.fail("sin URL no se pide nada") }), null);
  assert.equal(await fetchLetterboxdScore({ webUrl: "https://evil.test/film/x/" }, { env: {}, fetchImpl: () => assert.fail("solo letterboxd.com") }), null);
});

const apiEnv = { LETTERBOXD_CLIENT_ID: "id", LETTERBOXD_CLIENT_SECRET: "secret" };

function apiFetch(routes) {
  const calls = [];
  const impl = async (url, init = {}) => {
    const u = String(url);
    calls.push({ url: u, init });
    for (const [match, reply] of routes) if (u.includes(match)) return reply(init);
    throw new Error(`Unexpected ${u}`);
  };
  return { calls, impl };
}

test("con credenciales: token OAuth (client credentials), película por tmdb: y estadísticas", async () => {
  resetLetterboxdTokenCache();
  const { calls, impl } = apiFetch([
    ["/auth/token", () => response({ access_token: "tok", expires_in: 3600 }, { json: true })],
    ["/film/tmdb:27205", () => response({ id: "2bbs", rating: 4.24, link: "https://letterboxd.com/film/inception/" }, { json: true })],
    ["/film/2bbs/statistics", () => response({ counts: { ratings: 99 } }, { json: true })],
  ]);
  const score = await fetchLetterboxdScore({ tmdbId: 27205, webUrl: "https://letterboxd.com/film/inception/" }, { env: apiEnv, fetchImpl: impl });
  assert.deepEqual(score, { audienceScore: 4.24, audienceCount: 99, url: "https://letterboxd.com/film/inception/", source: "api" });
  const token = calls[0];
  assert.equal(token.url, "https://api.letterboxd.com/api/v0/auth/token");
  assert.equal(token.init.method, "POST");
  const body = new URLSearchParams(token.init.body);
  assert.equal(body.get("grant_type"), "client_credentials");
  assert.equal(body.get("client_id"), "id");
  assert.equal(body.get("client_secret"), "secret");
  assert.equal(calls[1].init.headers.Authorization, "Bearer tok");
  assert.ok(!calls.some((c) => c.url.includes("letterboxd.com/film/inception")), "no toca la web");

  // El token se reutiliza mientras no caduca.
  await fetchLetterboxdScore({ tmdbId: 27205 }, { env: apiEnv, fetchImpl: impl });
  assert.equal(calls.filter((c) => c.url.includes("/auth/token")).length, 1);
});

test("con credenciales: película inexistente (404) es null sin probar la web", async () => {
  resetLetterboxdTokenCache();
  const { calls, impl } = apiFetch([
    ["/auth/token", () => response({ access_token: "tok", expires_in: 3600 }, { json: true })],
    ["/film/tmdb:1", () => response({ type: "Error" }, { status: 404, json: true })],
  ]);
  assert.equal(await fetchLetterboxdScore({ tmdbId: 1, webUrl: "https://letterboxd.com/imdb/tt1/" }, { env: apiEnv, fetchImpl: impl }), null);
  assert.equal(calls.length, 2);
});

test("con credenciales: si la API falla (token rechazado, 5xx) se cae a la web", async () => {
  resetLetterboxdTokenCache();
  const { impl } = apiFetch([
    ["/auth/token", () => response({ error: "invalid_client" }, { status: 401, json: true })],
    ["letterboxd.com/film/inception", () => response(filmPage({ ratingValue: 4.2, ratingCount: 7 }), { url: "https://letterboxd.com/film/inception/" })],
  ]);
  assert.deepEqual(
    await fetchLetterboxdScore({ tmdbId: 27205, webUrl: "https://letterboxd.com/film/inception/" }, { env: apiEnv, fetchImpl: impl }),
    { audienceScore: 4.2, audienceCount: 7, url: "https://letterboxd.com/film/inception/", source: "web" },
  );
});

test("insignia: un decimal sobre 5, votos abreviados y enlace a la ficha", () => {
  assert.deepEqual(letterboxdScoreBadge({ audienceScore: 4.24, audienceCount: 4638530, url: "https://letterboxd.com/film/inception/" }), {
    value: "4.2", suffix: "/5", sub: "4,6M", href: "https://letterboxd.com/film/inception/",
  });
  assert.deepEqual(letterboxdScoreBadge({ audienceScore: 3, audienceCount: null, url: null }), {
    value: "3.0", suffix: "/5", sub: undefined, href: undefined,
  });
  assert.equal(letterboxdScoreBadge(null), null);
});
