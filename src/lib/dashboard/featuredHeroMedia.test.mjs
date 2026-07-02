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
