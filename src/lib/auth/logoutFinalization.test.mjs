import assert from "node:assert/strict";
import test from "node:test";

import { finalizeLogout } from "./logoutFinalization.js";

test("clears auth state before redirecting after logout", () => {
  const events = [];

  const redirected = finalizeLogout({
    applyUser: (user) => events.push(["user", user]),
    setHydrated: (hydrated) => events.push(["hydrated", hydrated]),
    redirectTo: "/login",
    replaceLocation: (destination) => events.push(["redirect", destination]),
  });

  assert.equal(redirected, true);
  assert.deepEqual(events, [
    ["user", null],
    ["hydrated", true],
    ["redirect", "/login"],
  ]);
});

test("clears auth state without navigating when no redirect is requested", () => {
  const events = [];

  const redirected = finalizeLogout({
    applyUser: (user) => events.push(["user", user]),
    setHydrated: (hydrated) => events.push(["hydrated", hydrated]),
  });

  assert.equal(redirected, false);
  assert.deepEqual(events, [
    ["user", null],
    ["hydrated", true],
  ]);
});
