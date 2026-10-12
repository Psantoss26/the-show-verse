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
