import test from "node:test";
import assert from "node:assert/strict";

import { fetchStreamingAvailability } from "./streamingClient.js";

const params = new URLSearchParams({ title: "Clayface", type: "movie", tmdbId: "1400940" });

function reply(status, body, headers = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(headers),
    json: async () => body,
  };
}

function sequence(...responses) {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    const next = responses.shift();
    if (next instanceof Error) throw next;
    return next;
  };
  return { fetchImpl, calls };
}

const fresh = { providers: [], justwatchUrl: "https://jw", cinema: { chains: [{ id: 2124 }], releaseDate: "2026-10-23" } };

test("a fresh server answer is cacheable", async () => {
  const { fetchImpl, calls } = sequence(reply(200, fresh));
  const result = await fetchStreamingAvailability(params, { fetchImpl, retryDelayMs: 0 });
  assert.deepEqual(result, { data: fresh, fresh: true });
  assert.equal(calls.length, 1);
  assert.match(calls[0], /^\/api\/streaming\?title=Clayface/);
});

test("JustWatch down (503 degraded) is retried, not taken as 'no platforms'", async () => {
  const { fetchImpl, calls } = sequence(
    reply(503, { providers: [], cinema: null, degraded: true }),
    reply(200, fresh),
  );
  const result = await fetchStreamingAvailability(params, { fetchImpl, retryDelayMs: 0 });
  assert.equal(result.fresh, true);
  assert.equal(calls.length, 2);
});

test("a service-worker copy is shown but never cached", async () => {
  const stale = { providers: [], justwatchUrl: null };
  const { fetchImpl } = sequence(
    reply(200, stale, { "X-Showverse-Offline": "1" }),
    reply(200, stale, { "X-Showverse-Offline": "1" }),
  );
  const result = await fetchStreamingAvailability(params, { fetchImpl, retryDelayMs: 0 });
  assert.deepEqual(result, { data: stale, fresh: false });
});

test("a service-worker copy followed by the real answer returns the real one", async () => {
  const { fetchImpl } = sequence(
    reply(200, { providers: [] }, { "X-Showverse-Offline": "1" }),
    reply(200, fresh),
  );
  const result = await fetchStreamingAvailability(params, { fetchImpl, retryDelayMs: 0 });
  assert.deepEqual(result, { data: fresh, fresh: true });
});

test("network errors and the SW 'missing' answer leave nothing to cache", async () => {
  const { fetchImpl } = sequence(
    new TypeError("Failed to fetch"),
    reply(503, { offline: true, error: "No hay una copia guardada" }),
  );
  const result = await fetchStreamingAvailability(params, { fetchImpl, retryDelayMs: 0 });
  assert.deepEqual(result, { data: null, fresh: false });
});
