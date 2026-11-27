import assert from "node:assert/strict";
import test from "node:test";

import {
  appGoogleNextStep,
  googleCodeClientOptions,
  googlePopupNextStep,
  googleRedirectHref,
  GOOGLE_SESSION_PARAM,
} from "./googleSignIn.js";

test("the button opens Google's own popup with the OAuth code flow", () => {
  const options = googleCodeClientOptions({ clientId: "abc.apps.googleusercontent.com" });
  assert.equal(options.client_id, "abc.apps.googleusercontent.com");
  assert.equal(options.ux_mode, "popup");
  assert.equal(options.scope, "openid email profile");
  assert.equal(options.prompt, undefined);
});

test("registering always asks which Google account to use", () => {
  assert.equal(googleCodeClientOptions({ clientId: "x", mode: "register" }).prompt, "select_account");
});

test("closing Google's popup does nothing; a blocked popup falls back to the redirect", () => {
  assert.equal(googlePopupNextStep({ type: "popup_closed" }), "stay");
  assert.equal(googlePopupNextStep({ error: "access_denied" }), "stay");
  assert.equal(googlePopupNextStep({ type: "popup_failed_to_open" }), "redirect");
  assert.equal(googlePopupNextStep({ error: "invalid_request" }), "error");
  assert.equal(googlePopupNextStep(null), "error");
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

test("after a 'cancelled' picker the next tap in the app goes to the browser", () => {
  assert.equal(appGoogleNextStep({ ok: false, error: "account_reauth_failed" }), "browser");
});
