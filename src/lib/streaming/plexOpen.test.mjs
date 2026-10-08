import assert from "node:assert/strict";
import test, { afterEach } from "node:test";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { buildPlexWatchUrl, getPlexLink } from "./plexLinks.js";

const web = "https://app.plex.tv/desktop/#!/server/abc123/details?key=%2Flibrary%2Fmetadata%2F42";
const watch = "https://watch.plex.tv/movie/fight-club";
const links = {
  web, universal: watch, slug: "plex://movie/fight-club",
  androidSlugIntent: "intent://movie/fight-club#Intent;scheme=plex;package=com.plexapp.android;end",
  mobile: "plex://preplay/?metadataKey=%2Flibrary%2Fmetadata%2F42&server=abc123",
  androidIntentPlay: "intent://play?metadataKey=%2Flibrary%2Fmetadata%2F42&server=abc123#Intent;scheme=plex;package=com.plexapp.android;end",
};

const originalGlobals = Object.fromEntries(["window", "navigator"].map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
afterEach(() => {
  for (const [key, descriptor] of Object.entries(originalGlobals)) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else delete globalThis[key];
  }
});

function device(_t, { ua = "Android", desktop = false, bridge = undefined } = {}) {
  const navigations = [];
  Object.defineProperty(globalThis, "window", { configurable: true, value: {
    matchMedia: () => ({ matches: desktop }),
    TSVAndroidBridge: bridge,
    location: { set href(url) { navigations.push(url); } },
    open: (...args) => navigations.push(args),
  } });
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: { userAgent: ua } });
  return navigations;
}

function loadFunction(path, name, endMarker, dependencies = {}) {
  const source = readFileSync(new URL(path, import.meta.url), "utf8");
  const start = source.indexOf(`function ${name}(`);
  const end = source.indexOf(endMarker, start);
  assert.ok(start >= 0 && end > start);
  const context = vm.createContext({ window: globalThis.window, ...dependencies });
  vm.runInContext(source.slice(start, end), context);
  return context[name];
}

function providerHref() {
  const source = readFileSync(new URL("./providers.js", import.meta.url), "utf8")
    .replace(/^import .*;$/gm, "")
    .replaceAll("export function", "function");
  const context = vm.createContext({
    window: globalThis.window, navigator: globalThis.navigator, getPlexLink,
    isAndroidApp: () => Boolean(globalThis.window?.TSVAndroidBridge),
  });
  vm.runInContext(source, context);
  return context.createPlatformItem({ isPlex: true, url: links }, {}).href;
}

function openLibrary(itemLinks = links) {
  const fn = loadFunction("../../app/biblioteca/BibliotecaClient.jsx", "openPlexLink", "function LibraryHoverIndicator", { getPlexLink });
  fn({ links: itemLinks });
}

test("PWA Android: DetailsClient y Biblioteca abren la misma ficha HTTPS en Plex", (t) => {
  const navigations = device(t);
  const href = providerHref();
  openLibrary();
  assert.equal(navigations[0], href);
  assert.equal(href, `intent://watch.plex.tv/movie/fight-club#Intent;scheme=https;package=com.plexapp.android;S.browser_fallback_url=${encodeURIComponent(watch)};end`);
  assert.doesNotMatch(href, /scheme=plex;|\/\/play|\/\/preplay/);
});

test("iPhone e iPad usan el Universal Link conservando el título", (t) => {
  for (const ua of ["iPhone", "iPad", "Macintosh"]) {
    device(t, { ua });
    assert.equal(providerHref(), watch);
  }
});

test("en escritorio ambas entradas mantienen los detalles del servidor personal", (t) => {
  const navigations = device(t, { desktop: true, ua: "Linux" });
  assert.equal(providerHref(), web);
  openLibrary();
  assert.deepEqual(navigations, [[web, "_blank", "noopener,noreferrer"]]);
});

test("el WebView recibe HTTPS, nunca un intent serializado como ACTION_VIEW", (t) => {
  device(t, { bridge: { isApp: () => true } });
  assert.equal(getPlexLink(links), watch);
});

test("snapshots antiguos con slug se convierten al enlace HTTPS de la ficha", (t) => {
  device(t, { ua: "iPhone" });
  assert.equal(getPlexLink({ web, slug: "plex://show/the-sopranos" }), "https://watch.plex.tv/show/the-sopranos");
});

test("sin slug se conserva la ficha web y no se intenta reproducir o abrir el inicio", (t) => {
  const navigations = device(t);
  const unmatched = { ...links, universal: web, slug: null };
  assert.equal(getPlexLink(unmatched), web);
  openLibrary(unmatched);
  assert.deepEqual(navigations, [web]);
  assert.equal(getPlexLink(null), "#");
  assert.equal(getPlexLink({}), "#");
  assert.equal(getPlexLink(web), web);
});

test("los enlaces de Biblioteca incluyen el slug real de Plex para películas y series", () => {
  const fn = loadFunction("../../app/api/plex/library/route.js", "buildPlexItemLinks", "function toPlainCountObject", {
    getMetadataKey: (item) => item.key,
    buildPlexWatchUrl,
  });
  for (const [itemType, slug, typePath] of [["movie", "fight-club", "movie"], ["show", "the-sopranos", "show"]]) {
    const result = fn({ item: { key: "/library/metadata/42", slug }, machineIdentifier: "abc123", baseUrl: "https://server.example", itemType });
    assert.equal(result.universal, `https://watch.plex.tv/${typePath}/${slug}`);
    assert.equal(result.web, web);
  }
  assert.equal(buildPlexWatchUrl(undefined, "movie"), null);
  assert.equal(buildPlexWatchUrl("", "tv"), null);
});

test("solo enlaces HTTPS del dominio y rutas de títulos de Plex forman intents", (t) => {
  device(t);
  for (const universal of ["https://evil.example/movie/test", "https://watch.plex.tv.evil.example/movie/test", "https://watch.plex.tv/", "http://watch.plex.tv/movie/test"]) {
    assert.equal(getPlexLink({ web, universal }), web);
  }
  assert.equal(buildPlexWatchUrl("a/b#c", "movie"), "https://watch.plex.tv/movie/a%2Fb%23c");
});
