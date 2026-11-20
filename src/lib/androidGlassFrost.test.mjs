import test from "node:test";
import assert from "node:assert/strict";

import { blurRadiusPx, frostAlphaForBlur, frostRulesFrom, prefixSelectorList } from "./androidGlassFrost.js";

const style = (decl, imp = []) => ({
  getPropertyValue: (k) => decl[k] || "",
  getPropertyPriority: (k) => (imp.includes(k) ? "important" : ""),
});
const rule = (selectorText, decl, imp) => ({ type: 1, selectorText, style: style(decl, imp) });

test("radio del desenfoque: literal, variables de Tailwind y rem", () => {
  assert.equal(blurRadiusPx("blur(2.5px) saturate(130%)"), 2.5);
  assert.equal(blurRadiusPx("blur(var(--blur-lg))", (n) => (n === "--blur-lg" ? "16px" : "")), 16);
  assert.equal(blurRadiusPx("blur(1rem)"), 16);
  assert.ok(Number.isNaN(blurRadiusPx("saturate(2)")));
});

test("densidad graduada por radio", () => {
  assert.equal(frostAlphaForBlur(2), 0.3);
  assert.equal(frostAlphaForBlur(16), 0.5);
  assert.equal(frostAlphaForBlur(40), 0.62);
  assert.equal(frostAlphaForBlur(0), 0);
  assert.equal(frostAlphaForBlur(NaN), 0.5);
});

test("prefijo por selector, respetando :is() y pseudoelementos", () => {
  assert.equal(
    prefixSelectorList(".a, .b:is(.c, .d)::before"),
    "html[data-android-app] .a, html[data-android-app] .b:is(.c, .d)::before",
  );
  assert.equal(prefixSelectorList("html .x, &:hover"), "");
  assert.equal(prefixSelectorList(".w-\\(1\\,2\\), .b"), "html[data-android-app] .w-\\(1\\,2\\), html[data-android-app] .b");
  assert.equal(
    prefixSelectorList(".max-sm\\:\\[\\&\\>button\\] > button"),
    "html[data-android-app] .max-sm\\:\\[\\&\\>button\\] > button",
  );
});

test("reglas: utilidad de Tailwind, clase propia con sombra, @media, none y la propia regla de la app", () => {
  const resolve = (n) => (n === "--blur-xl" ? "24px" : "");
  const out = frostRulesFrom([
    rule(".backdrop-blur-xl", { "backdrop-filter": "var(--tw-backdrop-blur,) var(--tw-backdrop-saturate,)", "--tw-backdrop-blur": "blur(var(--blur-xl))" }),
    rule(".sv-topbar-glass-soft", { "backdrop-filter": "blur(2.5px)", "box-shadow": "0 1px 0 red" }),
    { type: 4, media: { mediaText: "(width >= 1456px)" }, cssRules: [rule(".side", { "backdrop-filter": "blur(12px)" })] },
    rule(".off", { "backdrop-filter": "none" }),
    rule("html[data-android-app] *", { "backdrop-filter": "none" }),
    rule(".plain", { color: "red" }),
  ], resolve);
  assert.equal(out.length, 3);
  assert.match(out[0], /^html\[data-android-app\] \.backdrop-blur-xl \{ --sv-frost: rgb\(17 17 20 \/ 0\.62\).*var\(--tw-shadow/);
  assert.match(out[1], /\/ 0\.3\).*inset 0 0 0 100vmax var\(--sv-frost\), 0 1px 0 red;/);
  assert.match(out[2], /^@media \(width >= 1456px\) \{ html\[data-android-app\] \.side \{/);
});

test("cristal forzado con !important: la escarcha también lo es", () => {
  const forced = rule(".wrap > button", { "backdrop-filter": "var(--tw-backdrop-blur,)", "--tw-backdrop-blur": "blur(6px)" }, ["backdrop-filter"]);
  const [out] = frostRulesFrom([forced]);
  assert.match(out, /\/ 0\.3\) !important; box-shadow: .* !important; \}$/);
  // Dentro de una capa, la escarcha forzada vuelve a esa capa.
  const [layered] = frostRulesFrom([
    { type: 18, name: "utilities", cssRules: [{ type: 4, media: { mediaText: "(width < 40rem)" }, cssRules: [forced] }] },
  ]);
  assert.match(layered, /^@media \(width < 40rem\) \{ @layer utilities \{ html\[data-android-app\] \.wrap > button \{/);
});
