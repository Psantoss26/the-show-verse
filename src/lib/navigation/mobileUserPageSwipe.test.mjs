import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  MOBILE_USER_PAGE_SWIPE_ROUTES,
  getMobileUserPageSwipeDestination,
} from "./mobileUserPageSwipe.js";

test("las páginas de usuario siguen el orden del navbar móvil y terminan en Perfil", () => {
  assert.deepEqual(MOBILE_USER_PAGE_SWIPE_ROUTES, [
    "/social",
    "/recommendations",
    "/in-progress",
    "/history",
    "/favorites",
    "/watchlist",
    "/profile",
  ]);
});

test("un deslizamiento solo navega dentro de los extremos de la secuencia", () => {
  assert.equal(getMobileUserPageSwipeDestination("/social", "right"), null);
  assert.equal(
    getMobileUserPageSwipeDestination("/social", "left"),
    "/recommendations",
  );
  assert.equal(
    getMobileUserPageSwipeDestination("/watchlist/", "left"),
    "/profile",
  );
  assert.equal(
    getMobileUserPageSwipeDestination("/profile", "left"),
    null,
  );
  assert.equal(getMobileUserPageSwipeDestination("/calendar", "left"), null);
});

test("la captura global replica el gesto de Perfil y solo cede a gestos horizontales propios", async () => {
  const [navigation, layout, recommendations] = await Promise.all([
    readFile(new URL("../../components/MobileUserPageSwipeNavigation.jsx", import.meta.url), "utf8"),
    readFile(new URL("../../app/layout.jsx", import.meta.url), "utf8"),
    readFile(new URL("../../app/recommendations/RecommendationsClient.jsx", import.meta.url), "utf8"),
  ]);

  assert.match(navigation, /onTouchStartCapture/);
  assert.match(navigation, /onTouchEndCapture/);
  assert.match(navigation, /\(min-width: 640px\)/);
  assert.match(navigation, /MOBILE_USER_PAGE_SWIPE_IGNORE_SELECTOR/);
  assert.match(navigation, /router\.push\(destination\)/);
  assert.match(layout, /<MobileUserPageSwipeNavigation>/);
  assert.match(recommendations, /<motion\.div\s+data-mobile-page-swipe-ignore/);

  const routes = await readFile(new URL("./mobileUserPageSwipe.js", import.meta.url), "utf8");
  assert.match(routes, /"\[data-mobile-page-swipe-ignore\]"/);
  assert.doesNotMatch(routes, /"a"|"button"|"input"/);
});
