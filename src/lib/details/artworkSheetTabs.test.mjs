import assert from "node:assert/strict";
import test from "node:test";

import { buildArtworkSheetTabs, buildDetailModalArtworkTabs } from "./artworkSheetTabs.js";

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

test("móvil: Portada (sin idioma por defecto, con las de idioma en el filtro), Tarjetas, Backdrop y Logo", () => {
  const tabs = buildArtworkSheetTabs({
    mobile: true,
    posters,
    backdrops,
    logos,
    active: { mobilePoster: "/neutral-2.jpg", logo: "/logo.png" },
  });
  assert.deepEqual(tabs.map((tab) => [tab.id, tab.label]), [
    ["posters", "Portada"],
    ["cardPosters", "Tarjetas"],
    ["cardBackdrops", "Backdrop"],
    ["logos", "Logo"],
  ]);
  // Sin idioma (la elegida primero) y después las con idioma; abre filtrada
  // en «Sin idioma».
  assert.deepEqual(tabs[0].images.map((img) => img.file_path), ["/neutral-2.jpg", "/neutral-1.jpg", "/es.jpg"]);
  assert.equal(tabs[0].defaultLanguage, "none");
  assert.equal(tabs[0].activePath, "/neutral-2.jpg");
  assert.equal(tabs[0].kind, "mobilePoster");
});

test("escritorio: Portada, Fondo y Logo (Vista previa se edita en DetailModal)", () => {
  const tabs = buildArtworkSheetTabs({ posters, backdrops, logos, active: { background: "/limpio.jpg" } });
  assert.deepEqual(tabs.map((tab) => tab.label), ["Portada", "Backdrop", "Fondo", "Logo"]);
  assert.equal(tabs[0].images.length, 3);
  // Fondo: sin idioma, la elegida primero.
  assert.deepEqual(tabs[2].images.map((img) => img.file_path), ["/limpio.jpg", "/main.jpg"]);
});

test("DetailModal: Vista previa (backdrop sin idioma de la galería) y Logo", () => {
  const tabs = buildDetailModalArtworkTabs({ backdrops, logos, active: { logo: "/logo.png" } });
  assert.deepEqual(tabs.map((tab) => [tab.id, tab.label, tab.kind]), [
    ["backdrops", "Vista previa", "backdrop"],
    ["logos", "Logo", "logo"],
  ]);
  // Arte de la galería (no el `main`) y sin texto.
  assert.deepEqual(tabs[0].images.map((img) => img.file_path), ["/limpio.jpg"]);
  assert.equal(tabs[1].activePath, "/logo.png");
});

test("móvil sin portadas neutras: «Portada» con las de idioma y sin filtro por defecto; pestañas vacías fuera", () => {
  const tabs = buildArtworkSheetTabs({ mobile: true, posters: [posters[0]], backdrops: [], logos: [] });
  // Sin backdrops no hay pestaña «Backdrop».
  assert.deepEqual(tabs.map((tab) => tab.id), ["posters", "cardPosters"]);
  assert.deepEqual(tabs[0].images.map((img) => img.file_path), ["/es.jpg"]);
  assert.equal(tabs[0].defaultLanguage, null);
});

test("móvil: una portada elegida con idioma va primera y marcada en «Portada»", () => {
  const tabs = buildArtworkSheetTabs({ mobile: true, posters, backdrops, logos, active: { mobilePoster: "/es.jpg" } });
  const [portada] = tabs;
  assert.deepEqual(portada.images.map((img) => img.file_path), ["/es.jpg", "/neutral-1.jpg", "/neutral-2.jpg"]);
  assert.equal(portada.kind, "mobilePoster");
  assert.equal(portada.activePath, "/es.jpg");
  assert.equal("injectActive" in portada, false);
  assert.equal(tabs.some((tab) => tab.id === "localizedPosters"), false);
});

test("la elegida aparece aunque el filtro de su pestaña la deje fuera", () => {
  const [preview] = buildDetailModalArtworkTabs({ backdrops, logos, active: { preview: "/texto.jpg" } });
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

test("móvil: «Tarjetas» guarda la portada de escritorio y solo marca la elegida a propósito", () => {
  const card = (active) =>
    buildArtworkSheetTabs({ mobile: true, posters, backdrops, logos, active }).find(
      (tab) => tab.id === "cardPosters",
    );

  // Sin elección propia no hay marca, aunque la ficha de escritorio tenga una
  // portada automática.
  const auto = card({ poster: "/neutral-1.jpg", mobilePoster: "/neutral-2.jpg" });
  assert.equal(auto.kind, "poster");
  assert.equal(auto.activePath, null);
  // Solo portadas con idioma (español o inglés), como las de «Portada».
  assert.deepEqual(auto.images.map((img) => img.file_path), ["/es.jpg"]);

  // Una elegida antes sin idioma se sigue enseñando (primera y marcada).
  const chosen = card({ cardPoster: "/neutral-2.jpg", mobilePoster: "/es.jpg" });
  assert.equal(chosen.activePath, "/neutral-2.jpg");
  assert.deepEqual(chosen.images.map((img) => img.file_path), ["/neutral-2.jpg", "/es.jpg"]);
});

test("con idioma en «Portada» y «Tarjetas»: solo español e inglés; si no hay, los idiomas que haya", () => {
  const ids = (list) => (tab) => list.find((t) => t.id === tab)?.images.map((img) => img.file_path);

  const mixed = [
    { file_path: "/fr.jpg", iso_639_1: "fr" },
    { file_path: "/en.jpg", iso_639_1: "en" },
    { file_path: "/ja.jpg", iso_639_1: "ja" },
    { file_path: "/es.jpg", iso_639_1: "es" },
    { file_path: "/neutral.jpg", iso_639_1: null },
  ];
  const withEsEn = ids(buildArtworkSheetTabs({ mobile: true, posters: mixed }));
  assert.deepEqual(withEsEn("posters"), ["/neutral.jpg", "/en.jpg", "/es.jpg"]);
  assert.deepEqual(withEsEn("cardPosters"), ["/en.jpg", "/es.jpg"]);

  const others = [
    { file_path: "/fr.jpg", iso_639_1: "fr" },
    { file_path: "/ja.jpg", iso_639_1: "ja" },
    { file_path: "/neutral.jpg", iso_639_1: null },
  ];
  const withOthers = ids(buildArtworkSheetTabs({ mobile: true, posters: others }));
  assert.deepEqual(withOthers("posters"), ["/neutral.jpg", "/fr.jpg", "/ja.jpg"]);
  assert.deepEqual(withOthers("cardPosters"), ["/fr.jpg", "/ja.jpg"]);

  // Sin ninguna con idioma, «Tarjetas» no se queda vacía.
  const onlyNeutral = ids(buildArtworkSheetTabs({ mobile: true, posters: [{ file_path: "/neutral.jpg", iso_639_1: null }] }));
  assert.deepEqual(onlyNeutral("posters"), ["/neutral.jpg"]);
  assert.deepEqual(onlyNeutral("cardPosters"), ["/neutral.jpg"]);
});

test("«Backdrop»: backdrops con idioma en español e inglés para la portada backdrop y las tarjetas", () => {
  const mixed = [
    { file_path: "/fr.jpg", iso_639_1: "fr" },
    { file_path: "/en.jpg", iso_639_1: "en" },
    { file_path: "/neutral.jpg", iso_639_1: null },
    { file_path: "/es.jpg", iso_639_1: "es" },
  ];
  for (const mobile of [true, false]) {
    const tab = buildArtworkSheetTabs({ mobile, posters, backdrops: mixed, active: { cardBackdrop: "/es.jpg" } }).find(
      (t) => t.id === "cardBackdrops",
    );
    assert.equal(tab.kind, "cardBackdrop");
    assert.equal(tab.aspect, "backdrop");
    assert.deepEqual(tab.images.map((img) => img.file_path), ["/es.jpg", "/en.jpg"]);
  }
  // Sin ninguno en español o inglés, los de otros idiomas; sin ninguno con
  // idioma, todos.
  const others = buildArtworkSheetTabs({ backdrops: [{ file_path: "/fr.jpg", iso_639_1: "fr" }, { file_path: "/n.jpg", iso_639_1: null }] });
  assert.deepEqual(others.find((t) => t.id === "cardBackdrops").images.map((img) => img.file_path), ["/fr.jpg"]);
  const neutral = buildArtworkSheetTabs({ backdrops: [{ file_path: "/n.jpg", iso_639_1: null }] });
  assert.deepEqual(neutral.find((t) => t.id === "cardBackdrops").images.map((img) => img.file_path), ["/n.jpg"]);
});

test('cada pestaña lleva la imagen del criterio automático (defaultPath)', () => {
  const posters = [{ file_path: '/p1.jpg', iso_639_1: 'en' }, { file_path: '/p2.jpg', iso_639_1: null }]
  const backdrops = [{ file_path: '/b1.jpg', iso_639_1: 'en' }, { file_path: '/b2.jpg', iso_639_1: null }]
  const logos = [{ file_path: '/l1.png', iso_639_1: 'en' }]
  const desktop = buildArtworkSheetTabs({
    posters,
    backdrops,
    logos,
    defaults: { poster: '/p1.jpg', cardBackdrop: '/b1.jpg', background: '/b2.jpg', logo: '/l1.png' },
  })
  assert.deepEqual(
    desktop.map((tab) => [tab.id, tab.defaultPath]),
    [['posters', '/p1.jpg'], ['cardBackdrops', '/b1.jpg'], ['background', '/b2.jpg'], ['logos', '/l1.png']],
  )
  const mobile = buildArtworkSheetTabs({ mobile: true, posters, backdrops, logos, defaults: { mobilePoster: '/p2.jpg', cardPoster: '/p1.jpg' } })
  assert.deepEqual(
    mobile.map((tab) => [tab.id, tab.defaultPath]),
    [['posters', '/p2.jpg'], ['cardPosters', '/p1.jpg'], ['cardBackdrops', null], ['logos', null]],
  )
  const modal = buildDetailModalArtworkTabs({ backdrops, logos, defaults: { preview: '/b2.jpg', logo: '/l1.png' } })
  assert.deepEqual(modal.map((tab) => tab.defaultPath), ['/b2.jpg', '/l1.png'])
})
