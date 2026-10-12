import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const source = readFileSync(new URL("./letterboxd-export.js", import.meta.url), "utf8");
const ZIP = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3]);

function load(routes) {
  const calls = [];
  const context = vm.createContext({
    URL, URLSearchParams, AbortSignal, btoa, Uint8Array, String, Set,
    fetch: async (url, init = {}) => {
      calls.push(`${init.method || "GET"} ${url}`);
      const route = routes[`${init.method || "GET"} ${url}`];
      if (!route) return new Response("not found", { status: 404 });
      const res = new Response(route.body, { status: route.status || 200 });
      Object.defineProperty(res, "url", { value: route.url || url });
      return res;
    },
  });
  vm.runInContext(`${source}\nthis.fetchLetterboxdExport = fetchLetterboxdExport;`, context);
  return { run: () => context.fetchLetterboxdExport(), calls };
}

test("descarga directa del ZIP", async () => {
  const { run } = load({ "GET https://letterboxd.com/data/export/": { body: ZIP } });
  const result = await run();
  assert.equal(result.success, true);
  assert.equal(Buffer.from(result.base64, "base64").length, ZIP.length);
});

test("sin sesión: lo dice", async () => {
  const { run } = load({
    "GET https://letterboxd.com/data/export/": { body: "<html>login</html>" },
    "GET https://letterboxd.com/settings/data/": { body: "<form id=\"signin-form\"></form>", url: "https://letterboxd.com/sign-in/" },
  });
  assert.equal((await run()).code, "not_logged_in");
});

test("formulario de exportación con CSRF", async () => {
  const { run, calls } = load({
    "GET https://letterboxd.com/settings/data/": {
      body: '<form action="/user/export-data/" method="post"><input type="hidden" name="__csrf" value="abc"></form>',
    },
    "POST https://letterboxd.com/user/export-data/": { body: ZIP },
  });
  const result = await run();
  assert.equal(result.success, true);
  assert.ok(calls.includes("POST https://letterboxd.com/user/export-data/"));
});

test("enlace de exportación en la página de ajustes", async () => {
  const { run } = load({
    "GET https://letterboxd.com/settings/data/": { body: '<a href="/data/export/v2/">Export</a>' },
    "GET https://letterboxd.com/data/export/v2/": { body: ZIP },
  });
  assert.equal((await run()).success, true);
});
