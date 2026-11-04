import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_MOBILE_BOTTOM_NAV,
  sanitizeMobileBottomNav,
} from "./mobileBottomNav.js";

test("mobile bottom nav accepts a unique list of up to six known buttons", () => {
  assert.deepEqual(
    sanitizeMobileBottomNav(["calendar", "movies", "series", "social", "lists", "history"]),
    ["calendar", "movies", "series", "social", "lists", "history"],
  );
  assert.deepEqual(sanitizeMobileBottomNav(["calendar", "movies"]), ["calendar", "movies"]);
  assert.deepEqual(sanitizeMobileBottomNav([]), []);
});

test("mobile bottom nav falls back safely for malformed or unknown preferences", () => {
  assert.deepEqual(sanitizeMobileBottomNav(["social", "unknown"]), DEFAULT_MOBILE_BOTTOM_NAV);
  assert.deepEqual(sanitizeMobileBottomNav(null), DEFAULT_MOBILE_BOTTOM_NAV);
});

test("la clave antigua «today» se convierte en Social sin perder la barra", () => {
  assert.deepEqual(sanitizeMobileBottomNav(["today", "lists"]), ["social", "lists"]);
  assert.deepEqual(sanitizeMobileBottomNav(["today", "social", "lists"]), ["social", "lists"]);
});

test("Recomendaciones (sección retirada) se quita sin perder la barra", () => {
  assert.deepEqual(sanitizeMobileBottomNav(["recommendations", "lists"]), ["lists"]);
});

test("desktop side nav hides on dashboards and shows on full-screen pages", async () => {
  const { showsDesktopSideNav } = await import("./mobileBottomNav.js");
  for (const path of ["/", "/movies", "/series/", "/dashboard/trending", "/login", "/embed/details/movie/550"]) {
    assert.equal(showsDesktopSideNav(path), false, path);
  }
  for (const path of [
    "/favorites",
    "/history",
    "/details/movie/550",
    "/details/tv/1399/season/1",
    "/details/tv/1399/season/1/episode/2",
    "/movies-and-more",
  ]) {
    assert.equal(showsDesktopSideNav(path), true, path);
  }
});
