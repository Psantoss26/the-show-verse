import assert from "node:assert/strict";
import test from "node:test";
import {
  imageLanguageTiers,
  pickByLanguageLadder,
  pickPreferredResolutionBackdrop,
  pickFirstImage,
  tmdbImageLanguages,
} from "./imageLanguageLadder.js";
import * as backendLadder from "../../../backend/src/lib/imageLanguageLadder.js";

const img = (file_path, iso_639_1, extra = {}) => ({ file_path, iso_639_1, vote_count: 1, vote_average: 5, width: 1000, height: 1500, ...extra });
const firstPath = (tier) => tier[0] || null;

test("inglés, español, idioma original y sin idioma, en ese orden", () => {
  const list = [img("/ko", "ko"), img("/none", null), img("/es", "es"), img("/en", "en")];
  assert.equal(pickByLanguageLadder(list, firstPath, { originalLanguage: "ko" }).file_path, "/en");
  assert.equal(pickByLanguageLadder(list.filter((i) => i.iso_639_1 !== "en"), firstPath, { originalLanguage: "ko" }).file_path, "/es");
  assert.equal(pickByLanguageLadder([img("/ko", "ko"), img("/none", null)], firstPath, { originalLanguage: "ko" }).file_path, "/ko");
  assert.equal(pickByLanguageLadder([img("/fr", "fr"), img("/none", null)], firstPath, { originalLanguage: "ko" }).file_path, "/none");
});

test("solo en español (Señor, dame paciencia) elige el primer español de TMDb", () => {
  const list = [img("/es-1", "es"), img("/es-2", "es", { vote_count: 9 })];
  assert.equal(pickByLanguageLadder(list, pickFirstImage).file_path, "/es-1");
});

test("sin ningún escalón disponible devuelve null para que se use el póster por defecto", () => {
  assert.equal(pickByLanguageLadder([img("/fr", "fr")], firstPath, { originalLanguage: "ja" }), null);
  assert.equal(pickByLanguageLadder([], firstPath), null);
  assert.equal(pickByLanguageLadder(null, firstPath), null);
});

test("normaliza variantes regionales y trata 'xx' como sin idioma", () => {
  const tiers = imageLanguageTiers([img("/en-us", "en-US"), img("/es-es", "es-ES"), img("/xx", "xx"), img("/pt", "pt-BR")], { originalLanguage: "pt-BR" });
  assert.deepEqual(tiers.map((tier) => tier.map((i) => i.file_path)), [["/en-us"], ["/es-es"], ["/pt"], ["/xx"]]);
});

test("si el idioma original es inglés o español no repite escalón", () => {
  assert.equal(imageLanguageTiers([], { originalLanguage: "es" }).length, 3);
});

test("pide a TMDb los idiomas de la escalera, con el original si se conoce", () => {
  assert.equal(tmdbImageLanguages(), "en,en-US,es,es-ES,null");
  assert.equal(tmdbImageLanguages("ko"), "en,en-US,es,es-ES,ko,null");
  assert.equal(tmdbImageLanguages("es"), "en,en-US,es,es-ES,null");
});

test("póster: el primero en el orden de TMDb, aunque otro tenga más votos", () => {
  const list = [img("/a", "en", { vote_count: 1 }), img("/b", "en", { vote_count: 9 })];
  assert.equal(pickFirstImage(list).file_path, "/a");
  assert.equal(pickFirstImage([]), null);
});

test("backdrop: entre los tres primeros con ancho mínimo, prefiere 1080p", () => {
  const list = [img("/small", "en", { width: 800 }), img("/4k", "en", { width: 3840, height: 2160 }), img("/1080", "en", { width: 1920, height: 1080 })];
  assert.equal(pickPreferredResolutionBackdrop(list, { minWidth: 1200 }).file_path, "/1080");
  assert.equal(pickPreferredResolutionBackdrop([img("/small", "en", { width: 800 })], { minWidth: 1200 }).file_path, "/small");
});

test("la copia del backend aplica exactamente la misma escalera", () => {
  const list = [img("/ko", "ko"), img("/none", null), img("/es", "es")];
  for (const originalLanguage of [undefined, "ko", "es"]) {
    assert.deepEqual(
      backendLadder.imageLanguageTiers(list, { originalLanguage }),
      imageLanguageTiers(list, { originalLanguage }),
    );
  }
  assert.equal(backendLadder.tmdbImageLanguages("ko"), tmdbImageLanguages("ko"));
});
