import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const modalSource = await readFile(
  new URL("../../components/dashboard/DetailModal.jsx", import.meta.url),
  "utf8",
);

test("el botón de visionado de un episodio abre su historial, no lo alterna", () => {
  assert.match(modalSource, /const openEpisodePlays = async \(\) =>/);
  assert.match(modalSource, /await refreshEpisodePlays\(\);/);
  assert.match(modalSource, /setEpisodePlaysOpen\(true\);/);
  assert.doesNotMatch(
    modalSource,
    /traktSetEpisodeWatched/,
    "el botón del episodio no debe eliminar el único play al volver a pulsarlo",
  );
});

test("el modal de episodios usa operaciones de historial explícitas", () => {
  assert.match(modalSource, /traktAddEpisodePlay/);
  assert.match(modalSource, /const handleEpisodeUpdatePlay = async/);
  assert.match(modalSource, /const handleEpisodeRemovePlay = async/);
  assert.match(modalSource, /<TraktWatchedModal\s+open=\{episodePlaysOpen\}/);
});
