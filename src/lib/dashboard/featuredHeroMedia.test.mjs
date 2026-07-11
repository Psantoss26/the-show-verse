import assert from "node:assert/strict";
import test from "node:test";

import { resolveFeaturedHeroPoster } from "./featuredHeroMedia.js";

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
