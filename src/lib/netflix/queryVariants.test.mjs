import assert from "node:assert/strict";
import test from "node:test";

import {
  cleanSearchTitle,
  stripEditionSuffix,
  beforeColon,
  buildQueryVariants,
  showNameFromTab,
} from "./queryVariants.js";

test("showNameFromTab extrae el nombre de la serie del título de la pestaña", () => {
  assert.equal(showNameFromTab("Stranger Things - Netflix"), "Stranger Things");
  assert.equal(showNameFromTab("Watch The Bear | Max"), "The Bear");
  assert.equal(showNameFromTab("The Mandalorian | Disney+"), "The Mandalorian");
  assert.equal(showNameFromTab("Ver La Casa de Papel · Netflix"), "La Casa de Papel");
  assert.equal(showNameFromTab("The Boys - Prime Video"), "The Boys");
  assert.equal(showNameFromTab(""), "");
});

test("buildQueryVariants usa el tabTitle como nombre de serie cuando mainTitle es el episodio", () => {
  // Caso real (S2): plataforma sin artist/album -> mainTitle es el EPISODIO,
  // la serie solo aparece en el título de la pestaña.
  const v = buildQueryVariants({
    showName: "",
    mainTitle: "The Vanishing of Will Byers",
    tabTitle: "Stranger Things - Netflix",
    isSeries: true,
  });
  assert.equal(v[0], "Stranger Things"); // la serie se prueba PRIMERO
  assert.ok(v.includes("The Vanishing of Will Byers")); // el episodio sigue como respaldo
});

test("buildQueryVariants NO regresiona películas (mainTitle primero)", () => {
  const v = buildQueryVariants({
    mainTitle: "Interstellar",
    tabTitle: "Interstellar - Netflix",
    isSeries: false,
  });
  assert.equal(v[0], "Interstellar");
});

test("buildQueryVariants prioriza showName sobre tab y mainTitle en series", () => {
  const v = buildQueryVariants({
    showName: "The Boys",
    mainTitle: "The Boys",
    tabTitle: "The Boys - Prime Video",
    episodeName: "Episode 1",
    isSeries: true,
  });
  assert.equal(v[0], "The Boys");
});

test("cleanSearchTitle quita prefijos de plataforma (incl. los nuevos)", () => {
  assert.equal(cleanSearchTitle("Netflix - Stranger Things"), "Stranger Things");
  assert.equal(cleanSearchTitle("Crunchyroll: One Piece"), "One Piece");
  assert.equal(cleanSearchTitle("Movistar+ | La Unidad"), "La Unidad");
  assert.equal(cleanSearchTitle("SkyShowtime · Yellowstone"), "Yellowstone");
  assert.equal(cleanSearchTitle("Apple TV+ - Ted Lasso"), "Ted Lasso");
});

test("cleanSearchTitle quita descriptores de temporada/episodio y año final", () => {
  assert.equal(cleanSearchTitle("The Bear - Temporada 2"), "The Bear");
  assert.equal(cleanSearchTitle("Dark: S1 E3"), "Dark");
  assert.equal(cleanSearchTitle("Dune (2021)"), "Dune");
  // No confundir un número que forma parte del título con un año.
  assert.equal(cleanSearchTitle("Blade Runner 2049"), "Blade Runner 2049");
});

test("stripEditionSuffix elimina ediciones/formatos/paréntesis finales", () => {
  assert.equal(stripEditionSuffix("Avatar (2009)"), "Avatar");
  assert.equal(stripEditionSuffix("Blade Runner [4K]"), "Blade Runner");
  assert.equal(stripEditionSuffix("El Señor de los Anillos - Edición extendida"), "El Señor de los Anillos");
  assert.equal(stripEditionSuffix("Interstellar: IMAX"), "Interstellar");
});

test("beforeColon devuelve la parte previa a los dos puntos", () => {
  assert.equal(beforeColon("Peaky Blinders: El hombre inmortal"), "Peaky Blinders");
  assert.equal(beforeColon("Sin dos puntos"), "");
});

test("buildQueryVariants ordena, deduplica y añade la parte antes de ':'", () => {
  // Serie con episodio pegado en el título principal (sin marcador de temporada).
  const v = buildQueryVariants({
    showName: "",
    mainTitle: "Peaky Blinders: El hombre inmortal",
  });
  assert.deepEqual(v, ["Peaky Blinders: El hombre inmortal", "Peaky Blinders"]);
});

test("buildQueryVariants prueba showName y mainTitle si difieren", () => {
  const v = buildQueryVariants({ showName: "The Office", mainTitle: "Diversity Day" });
  assert.ok(v.includes("The Office"));
  assert.ok(v.includes("Diversity Day"));
  assert.equal(v[0], "The Office");
});

test("buildQueryVariants ignora vacíos y limita a 4", () => {
  const v = buildQueryVariants({ showName: "Dune (2021)", mainTitle: "" });
  assert.ok(v.length >= 1 && v.length <= 4);
  assert.equal(v[0], "Dune");
});
