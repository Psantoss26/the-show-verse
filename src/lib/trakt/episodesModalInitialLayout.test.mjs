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
const ratingsSource = await readFile(
  new URL(
    "../../components/details/EpisodeRatingsModal.jsx",
    import.meta.url,
  ),
  "utf8",
);

test("los modales de episodios conservan un margen proporcional", () => {
  assert.match(
    modalSource,
    /\$\{isMovie \? "max-h-\[85dvh\] sm:max-h-\[85vh\]" : "h-\[90dvh\] max-h-\[90dvh\]"\}/,
    "la vista de series debe conservar altura estable sin tocar los bordes del viewport",
  );
  assert.match(
    ratingsSource,
    /h-fit max-h-\[90dvh\]/,
    "el modal de valoraciones debe compartir el mismo límite proporcional",
  );
});

test("la cabecera de episodios comparte el espaciado de los demás modales", () => {
  assert.match(
    modalSource,
    /items-center justify-between bg-white\/\[0\.035\] px-6 py-5 backdrop-blur-xl sm:px-8 sm:pt-8 sm:pb-6/,
    "el título debe respirar respecto a los bordes lateral y superior del modal",
  );
});

test("al cambiar de temporada no se tapa el contenido con un estado de carga", () => {
  assert.doesNotMatch(
    modalSource,
    /\bisSwitching\b/,
    "el cambio de temporada no debe renderizar una capa de carga sobre la lista",
  );
});
