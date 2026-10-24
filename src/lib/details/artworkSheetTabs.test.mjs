import assert from "node:assert/strict";
import test from "node:test";

import { buildArtworkSheetTabs } from "./artworkSheetTabs.js";

const posters = [
  { file_path: "/es.jpg", iso_639_1: "es" },
  { file_path: "/neutral-1.jpg", iso_639_1: null },
  { file_path: "/neutral-2.jpg", iso_639_1: null },
];
const backdrops = [
  { file_path: "/main.jpg", iso_639_1: null, from: "main" },
  { file_path: "/texto.jpg", iso_639_1: "en" },
  { file_path: "/limpio.jpg", iso_639_1: null },
];
const logos = [{ file_path: "/logo.png", iso_639_1: "es" }];

test("móvil: las mismas pestañas que la ficha (Portada sin idioma, Con idioma y Logo)", () => {
  const tabs = buildArtworkSheetTabs({
    mobile: true,
    posters,
    backdrops,
    logos,
    active: { mobilePoster: "/neutral-2.jpg", logo: "/logo.png" },
  });
  assert.deepEqual(tabs.map((tab) => [tab.id, tab.label]), [
    ["posters", "Portada"],
    ["localizedPosters", "Con idioma"],
    ["logos", "Logo"],
  ]);
  // Solo portadas sin idioma, con la elegida primero.
  assert.deepEqual(tabs[0].images.map((img) => img.file_path), ["/neutral-2.jpg", "/neutral-1.jpg"]);
  assert.equal(tabs[0].activePath, "/neutral-2.jpg");
  assert.equal(tabs[0].kind, "mobilePoster");
});

test("escritorio: Portada, Vista previa, Fondo y Logo", () => {
  const tabs = buildArtworkSheetTabs({ posters, backdrops, logos, active: { background: "/limpio.jpg" } });
  assert.deepEqual(tabs.map((tab) => tab.label), ["Portada", "Vista previa", "Fondo", "Logo"]);
  assert.equal(tabs[0].images.length, 3);
  // Vista previa: arte de la galería (no el `main`) y sin texto.
  assert.deepEqual(tabs[1].images.map((img) => img.file_path), ["/limpio.jpg"]);
  // Fondo: sin idioma, la elegida primero.
  assert.deepEqual(tabs[2].images.map((img) => img.file_path), ["/limpio.jpg", "/main.jpg"]);
});

test("móvil sin portadas neutras: solo «Con idioma»; pestañas vacías fuera", () => {
  const tabs = buildArtworkSheetTabs({ mobile: true, posters: [posters[0]], backdrops: [], logos: [] });
  assert.deepEqual(tabs.map((tab) => tab.id), ["localizedPosters"]);
  assert.deepEqual(tabs[0].images.map((img) => img.file_path), ["/es.jpg"]);
});

test("móvil: la portada elegida se marca solo en su pestaña", () => {
  const tabs = buildArtworkSheetTabs({ mobile: true, posters, backdrops, logos, active: { mobilePoster: "/es.jpg" } });
  const [neutral, localized] = tabs;
  assert.deepEqual(neutral.images.map((img) => img.file_path), ["/neutral-1.jpg", "/neutral-2.jpg"]);
  assert.deepEqual(localized.images.map((img) => img.file_path), ["/es.jpg"]);
  assert.equal(localized.kind, "mobilePoster");
  assert.equal(localized.activePath, "/es.jpg");
  assert.equal("injectActive" in localized, false);
});

test("la elegida aparece aunque el filtro de su pestaña la deje fuera", () => {
  const tabs = buildArtworkSheetTabs({ posters, backdrops, logos, active: { preview: "/texto.jpg" } });
  const preview = tabs.find((tab) => tab.id === "backdrops");
  assert.deepEqual(preview.images.map((img) => img.file_path), ["/texto.jpg", "/limpio.jpg"]);
  assert.equal(preview.count, 2);
});

test("logos: solo en español e inglés (con el elegido primero); si no hay ninguno, todos", () => {
  const mixed = [
    { file_path: "/ja.png", iso_639_1: "ja" },
    { file_path: "/en.png", iso_639_1: "en" },
    { file_path: "/fr.png", iso_639_1: "fr" },
    { file_path: "/es.png", iso_639_1: "es" },
    { file_path: "/neutral.png", iso_639_1: null },
  ];
  for (const mobile of [true, false]) {
    const tabs = buildArtworkSheetTabs({ mobile, posters, backdrops, logos: mixed, active: { logo: "/es.png" } });
    const logoTab = tabs.find((tab) => tab.id === "logos");
    assert.deepEqual(logoTab.images.map((img) => img.file_path), ["/es.png", "/en.png"]);
  }
  const onlyOthers = [{ file_path: "/ja.png", iso_639_1: "ja" }, { file_path: "/fr.png", iso_639_1: "fr" }];
  const tabs = buildArtworkSheetTabs({ posters, backdrops, logos: onlyOthers });
  assert.equal(tabs.find((tab) => tab.id === "logos").count, 2);
});
