import assert from "node:assert/strict";
import test from "node:test";

import {
  appGoogleNextStep,
  googleButtonOptions,
  googleRedirectHref,
  GOOGLE_SESSION_PARAM,
} from "./googleSignIn.js";

test("the official button uses Google's own text, dark theme and Spanish locale", () => {
  const options = googleButtonOptions({ width: 332, mode: "login" });
  assert.equal(options.type, "standard");
  assert.equal(options.theme, "filled_black");
  assert.equal(options.size, "large");
  assert.equal(options.text, "continue_with");
  assert.equal(options.locale, "es");
  assert.equal(options.width, 332);
});

test("registering asks Google for its sign-up wording", () => {
  assert.equal(googleButtonOptions({ width: 300, mode: "register" }).text, "signup_with");
});

test("the button width stays inside the range Google renders (200-400 px)", () => {
  assert.equal(googleButtonOptions({ width: 120 }).width, 200);
  assert.equal(googleButtonOptions({ width: 900 }).width, 400);
  assert.equal(googleButtonOptions({ width: Number.NaN }).width, 320);
});

test("the redirect fallback keeps a sanitized destination", () => {
  assert.equal(googleRedirectHref("/favorites"), "/api/auth/google/start?next=%2Ffavorites");
  assert.equal(googleRedirectHref("https://evil.example"), "/api/auth/google/start?next=%2F");
  assert.equal(googleRedirectHref("/login?next=/x"), "/api/auth/google/start?next=%2F");
  assert.equal(
    googleRedirectHref("/", { app: "abc" }),
    "/api/auth/google/start?next=%2F&app=abc",
  );
});

test("the redirect callback lands on /login with the session marker", () => {
  assert.equal(GOOGLE_SESSION_PARAM, "google_session");
});

test("in the Android app the native picker wins and only real failures open the browser", () => {
  assert.equal(appGoogleNextStep({ ok: true, idToken: "t" }), "exchange");
  assert.equal(appGoogleNextStep({ ok: false, cancelled: true }), "stay");
  assert.equal(appGoogleNextStep({ ok: false, error: "unavailable" }), "browser");
  assert.equal(appGoogleNextStep({ ok: false, error: "timeout" }), "browser");
  assert.equal(appGoogleNextStep({ ok: false, error: "no_credentials" }), "browser");
  assert.equal(appGoogleNextStep(null), "browser");
});
