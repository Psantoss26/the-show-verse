import assert from "node:assert/strict";
import test from "node:test";

import {
  FEATURED_HERO_RETRY_DELAYS_MS,
  featuredHeroAssetsOutcome,
  resolveFeaturedHeroPoster,
  shouldResolveFeaturedHeroAssets,
} from "./featuredHeroMedia.js";

test("does not expose a provisional poster while hero assets are unresolved", () => {
  const movie = {
    poster_path: "/provisional.jpg",
    backdrop_path: "/fallback.jpg",
  };

  assert.equal(resolveFeaturedHeroPoster(undefined, movie), null);
});

test("uses the resolved textless poster as the single final image", () => {
  const movie = {
    poster_path: "/provisional.jpg",
    backdrop_path: "/fallback.jpg",
  };

  assert.equal(
    resolveFeaturedHeroPoster({ poster: "/final.jpg" }, movie),
    "/final.jpg",
  );
});

test("uses the server poster only after asset resolution finishes without a poster", () => {
  const movie = {
    poster_path: "/server.jpg",
    backdrop_path: "/fallback.jpg",
  };

  assert.equal(resolveFeaturedHeroPoster({ poster: null }, movie), "/server.jpg");
});

test("never falls back to a backdrop as the mobile hero cover", () => {
  const movie = {
    poster_path: null,
    backdrop_path: "/fallback.jpg",
  };

  // Sin póster textless NI poster_path: debe devolver null (no pintar imagen),
  // NUNCA el backdrop apaisado. En móvil la portada es siempre de tipo póster.
  assert.equal(resolveFeaturedHeroPoster({ poster: null }, movie), null);
});

// Al volver de segundo plano (sobre todo en la app de Android) la red tarda un
// instante en volver: la petición de /images falla y antes el hero guardaba ese
// resultado vacío como definitivo, con el póster CON idioma y el título en
// texto en el hueco del logo hasta recargar.
test("a failed /images request is retried instead of stored as final", () => {
  assert.deepEqual(featuredHeroAssetsOutcome({ imagesLoaded: false, attempt: 0 }), {
    action: "retry",
    delay: FEATURED_HERO_RETRY_DELAYS_MS[0],
  });
  assert.deepEqual(featuredHeroAssetsOutcome({ imagesLoaded: false, attempt: 1 }), {
    action: "retry",
    delay: FEATURED_HERO_RETRY_DELAYS_MS[1],
  });
});

test("after the retries the fallback is stored as incomplete so it can heal later", () => {
  assert.deepEqual(
    featuredHeroAssetsOutcome({
      imagesLoaded: false,
      attempt: FEATURED_HERO_RETRY_DELAYS_MS.length,
    }),
    { action: "store", incomplete: true },
  );
});

test("loaded images are stored as final", () => {
  assert.deepEqual(featuredHeroAssetsOutcome({ imagesLoaded: true, attempt: 0 }), {
    action: "store",
    incomplete: false,
  });
  assert.deepEqual(featuredHeroAssetsOutcome({ imagesLoaded: true, attempt: 5 }), {
    action: "store",
    incomplete: false,
  });
});

test("only missing or incomplete assets are resolved again", () => {
  assert.equal(shouldResolveFeaturedHeroAssets(undefined), true);
  assert.equal(shouldResolveFeaturedHeroAssets({ poster: null, incomplete: true }), true);
  assert.equal(shouldResolveFeaturedHeroAssets({ poster: "/p.jpg", incomplete: false }), false);
  assert.equal(shouldResolveFeaturedHeroAssets({ poster: null }), false);
});
