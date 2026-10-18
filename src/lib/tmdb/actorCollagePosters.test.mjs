import assert from "node:assert/strict";
import test from "node:test";

process.env.NEXT_PUBLIC_TMDB_API_KEY ||= "test-key";
const { getActorCollagePosters } = await import("./actorCollagePosters.js");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const titles = (count, mediaType = "movie") =>
  Array.from({ length: count }, (_, index) => ({ id: index + 1, media_type: mediaType }));
const idOf = (url) => Number(new URL(url).pathname.split("/")[3]);
const posterOf = (id) => ({ file_path: `/p${id}.jpg`, iso_639_1: null, width: 1000, height: 1500 });

// `plan(id)` → { delay, status, posters } de la respuesta simulada de /images.
// Las peticiones que siguen en vuelo al resolver ocupan el limitador del
// módulo: cada test espera a que terminen para no frenar al siguiente.
let pending = [];
test.afterEach(async () => {
  await Promise.allSettled(pending);
  pending = [];
});

function mockFetch(plan) {
  const calls = [];
  globalThis.fetch = (url) => {
    const response = respond(url);
    pending.push(response);
    return response;
  };
  const respond = async (url) => {
    const id = idOf(url);
    calls.push(url);
    const { delay = 0, status = 200, posters = [posterOf(id)], fail = false } = plan(id) || {};
    await sleep(delay);
    if (fail) throw new Error("network");
    return {
      ok: status === 200,
      status,
      headers: new Headers(),
      json: async () => ({ posters }),
    };
  };
  return calls;
}

test("pide solo las imágenes sin idioma y devuelve URLs w185 en orden", async () => {
  const calls = mockFetch(() => ({}));
  const posters = await getActorCollagePosters(titles(3, "tv"));
  assert.deepEqual(posters, [1, 2, 3].map((id) => `https://image.tmdb.org/t/p/w185/p${id}.jpg`));
  assert.ok(calls.every((url) => url.includes("/tv/") && url.includes("include_image_language=null,xx")));
});

test("sin repetir títulos y saltando los que no tienen póster sin texto", async () => {
  mockFetch((id) => (id === 2 ? { posters: [{ file_path: "/es.jpg", iso_639_1: "es" }] } : {}));
  const posters = await getActorCollagePosters([...titles(3), { id: 1, media_type: "movie" }]);
  assert.deepEqual(posters, [1, 3].map((id) => `https://image.tmdb.org/t/p/w185/p${id}.jpg`));
});

test("sale en cuanto los primeros títulos en orden llenan el mosaico más grande", async () => {
  mockFetch((id) => ({ delay: id > 40 ? 1500 : 5 }));
  const started = Date.now();
  const posters = await getActorCollagePosters(titles(60));
  assert.ok(Date.now() - started < 500, "no espera a los títulos lentos del final");
  assert.equal(posters.length, 40);
  assert.equal(posters[0], "https://image.tmdb.org/t/p/w185/p1.jpg");
});

test("un título lento al principio no frena el fondo: tras el plazo sale con lo llegado", async () => {
  mockFetch((id) => ({ delay: id === 1 ? 1500 : 5 }));
  const started = Date.now();
  const posters = await getActorCollagePosters(titles(30));
  const elapsed = Date.now() - started;
  assert.ok(elapsed >= 850 && elapsed < 1500, `sale al vencer el plazo (${elapsed} ms)`);
  assert.equal(posters.length, 29);
  assert.equal(posters[0], "https://image.tmdb.org/t/p/w185/p2.jpg");
});

test("tras el plazo espera si aún no hay pósters para un mosaico decente", async () => {
  mockFetch((id) => ({ delay: id <= 10 ? 5 : 1300 }));
  const started = Date.now();
  const posters = await getActorCollagePosters(titles(30));
  assert.ok(Date.now() - started >= 1250);
  assert.ok(posters.length >= 24);
});

test("null si TMDb no respondió a ninguno (el cliente los pide él)", async () => {
  mockFetch(() => ({ fail: true }));
  assert.equal(await getActorCollagePosters(titles(4)), null);
});

test("sin títulos válidos: lista vacía sin pedir nada", async () => {
  const calls = mockFetch(() => ({}));
  assert.deepEqual(await getActorCollagePosters([{ id: "x" }, null]), []);
  assert.equal(calls.length, 0);
});
