import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  MOBILE_USER_PAGE_SWIPE_ROUTES,
  getMobileUserPageSwipeDestination,
  isMobileUserPageSwipeRoute,
} from "./mobileUserPageSwipe.js";

test("las páginas de usuario siguen el orden del navbar móvil y terminan en Perfil", () => {
  assert.deepEqual(MOBILE_USER_PAGE_SWIPE_ROUTES, [
    "/social",
    "/lists",
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
    "/lists",
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

test("las rutas personales del navbar se reconocen para capturar su orden de títulos", () => {
  assert.equal(isMobileUserPageSwipeRoute("/favorites"), true);
  assert.equal(isMobileUserPageSwipeRoute("/watchlist/"), true);
  assert.equal(isMobileUserPageSwipeRoute("/details/movie/550"), false);
});

test("la captura global replica el gesto de Perfil, también en fichas de usuario, y cede a gestos propios", async () => {
  const [navigation, layout, lists, detailsTabs] = await Promise.all([
    readFile(new URL("../../components/MobileUserPageSwipeNavigation.jsx", import.meta.url), "utf8"),
    readFile(new URL("../../app/layout.jsx", import.meta.url), "utf8"),
    readFile(new URL("../../app/lists/page.jsx", import.meta.url), "utf8"),
    readFile(new URL("../../components/details/DetailsInfoTabs.jsx", import.meta.url), "utf8"),
  ]);

  assert.match(navigation, /onTouchStartCapture/);
  assert.match(navigation, /onTouchEndCapture/);
  assert.match(navigation, /\(min-width: 640px\)/);
  assert.match(navigation, /MOBILE_USER_PAGE_SWIPE_IGNORE_SELECTOR/);
  assert.match(navigation, /getUserDetailsSequence\(pathname\)/);
  assert.match(navigation, /isDetailsInitialHeroVisible/);
  assert.match(navigation, /data-details-mobile-secondary-trigger/);
  assert.match(navigation, /secondaryTrigger\.getBoundingClientRect\(\)\.top >= window\.innerHeight - 88/);
  assert.match(navigation, /saveUserDetailsSequenceFromLink\(/);
  assert.match(navigation, /target\.closest\('a\[href\^="\/details\/"\]'\)/);
  assert.match(navigation, /event\.currentTarget/);
  assert.match(navigation, /detailsSequence\?\.next/);
  assert.match(navigation, /detailsSequence\?\.previous/);
  assert.match(navigation, /router\.push\(destination\)/);
  assert.match(layout, /<MobileUserPageSwipeNavigation>/);
  assert.match(lists, /<Swiper\s+data-mobile-page-swipe-ignore/);
  assert.match(detailsTabs, /"data-mobile-page-swipe-ignore": ""/);

  const detailsClient = await readFile(
    new URL("../../components/DetailsClient.jsx", import.meta.url),
    "utf8",
  );
  assert.match(detailsClient, /ref=\{mobileSecondaryTriggerRef\}\s+data-details-mobile-secondary-trigger/);

  const routes = await readFile(new URL("./mobileUserPageSwipe.js", import.meta.url), "utf8");
  assert.match(routes, /"\[data-mobile-page-swipe-ignore\]"/);
  assert.doesNotMatch(routes, /"a"|"button"|"input"/);
});
