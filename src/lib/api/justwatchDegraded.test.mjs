import test, { afterEach } from "node:test";
import assert from "node:assert/strict";

import { getStreamingProviders } from "./justwatch.js";

const originalFetch = globalThis.fetch;
const originalError = console.error;
afterEach(() => {
  globalThis.fetch = originalFetch;
  console.error = originalError;
});

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

test("a JustWatch outage is reported as degraded, not as 'no platforms'", async () => {
  console.error = () => {};
  globalThis.fetch = async () => jsonResponse(502, {});
  const result = await getStreamingProviders("Clayface", "movie", 2026, { tmdbId: "1400940" });
  assert.equal(result.degraded, true);
});

test("GraphQL errors in the title details are degraded too", async () => {
  console.error = () => {};
  const node = { id: "tm1", content: { title: "Clayface", externalIds: { tmdbId: "1400940" } } };
  const replies = [
    jsonResponse(200, { data: { popularTitles: { edges: [{ node }] } } }),
    jsonResponse(200, { errors: [{ message: "rate limited" }], data: { node: null } }),
  ];
  globalThis.fetch = async () => replies.shift();
  const result = await getStreamingProviders("Clayface", "movie", 2026, { tmdbId: "1400940" });
  assert.equal(result.degraded, true);
});

test("a title JustWatch does not know is a real empty answer", async () => {
  globalThis.fetch = async () => jsonResponse(200, { data: { popularTitles: { edges: [] } } });
  const result = await getStreamingProviders("Nada", "movie", 2026, { tmdbId: "1" });
  assert.equal(result.degraded, undefined);
  assert.deepEqual(result.providers, []);
});

test("cinema offers come back for the matching title", async () => {
  const node = { id: "tm1", content: { title: "Clayface", externalIds: { tmdbId: "1400940" } } };
  const replies = [
    jsonResponse(200, { data: { popularTitles: { edges: [{ node }] } } }),
    jsonResponse(200, {
      data: {
        node: {
          ...node,
          content: { ...node.content, fullPath: "/es/pelicula/clayface" },
          offers: [{
            monetizationType: "CINEMA",
            standardWebURL: "https://www.cinesa.es/peliculas/clayface/",
            package: { packageId: 2124, clearName: "Cinesa", icon: "/icon/1/s100/cinesa.png" },
          }],
        },
      },
    }),
  ];
  globalThis.fetch = async () => replies.shift();
  const result = await getStreamingProviders("Clayface", "movie", 2026, { tmdbId: "1400940" });
  assert.equal(result.degraded, undefined);
  assert.deepEqual(result.cinemaChains.map((c) => c.name), ["Cinesa"]);
  assert.equal(result.justwatchUrl, "https://www.justwatch.com/es/pelicula/clayface");
});
