import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const modalSource = await readFile(
  new URL(
    "../../components/trakt/TraktEpisodesWatchedModal.jsx",
    import.meta.url,
  ),
  "utf8",
);

test("el modal de episodios reserva su altura móvil antes de recibir episodios", () => {
  assert.match(
    modalSource,
    /\$\{isMovie \? "" : "h-\[85dvh\]"\} max-h-\[85dvh\]/,
    "la vista de series debe conservar altura estable durante la carga inicial",
  );
});

test("al cambiar de temporada no se tapa el contenido con un estado de carga", () => {
  assert.doesNotMatch(
    modalSource,
    /\bisSwitching\b/,
    "el cambio de temporada no debe renderizar una capa de carga sobre la lista",
  );
});
