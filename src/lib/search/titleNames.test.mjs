import test from "node:test";
import assert from "node:assert/strict";

import { getTitleNamesVersion, rememberTitleNames, titleNameKey } from "./titleNames.js";
import { titleMatchesQuery } from "./titleMatching.js";

test("titleNameKey entiende las formas de elemento de las páginas de usuario", () => {
  // TMDb (favoritos y pendientes de TMDb, listas)
  assert.equal(titleNameKey({ id: 129, media_type: "movie", title: "El viaje de Chihiro" }), "movie:129");
  assert.equal(titleNameKey({ id: 71446, name: "La casa de papel", first_air_date: "2017-05-02" }), "tv:71446");
  // Backend / perfil público
  assert.equal(titleNameKey({ tmdbId: 1396, mediaType: "tv" }), "tv:1396");
  // Trakt: la película o la serie anidada; un episodio cuenta como su serie
  assert.equal(titleNameKey({ type: "movie", movie: { ids: { tmdb: 603, trakt: 1 } } }), "movie:603");
  assert.equal(
    titleNameKey({ type: "episode", episode: { ids: { tmdb: 62085 } }, show: { ids: { tmdb: 1396, trakt: 9 } } }),
    "tv:1396",
  );
  // Con ids de Trakt pero sin el de TMDb no se adivina
  assert.equal(titleNameKey({ type: "movie", movie: { ids: { trakt: 1 } } }), null);
  assert.equal(titleNameKey({ ids: { trakt: 5 }, id: 5, type: "movie" }), null);
  assert.equal(titleNameKey({ title: "Sin tipo ni id" }), null);
});

test("titleMatchesQuery encuentra por inglés y español aunque la página traiga solo uno", () => {
  // Fila importada de IMDb: llega con el nombre en inglés.
  const imported = { tmdbId: 129, mediaType: "movie", title: "Spirited Away" };
  // Fila con la ficha es-ES.
  const spanish = { id: 71446, media_type: "tv", name: "La casa de papel" };
  assert.equal(titleMatchesQuery(imported, "chihiro"), false);
  assert.equal(titleMatchesQuery(spanish, "money heist"), false);

  const before = getTitleNamesVersion();
  rememberTitleNames({
    "movie:129": { en: "Spirited Away", es: "El viaje de Chihiro", original: "千と千尋の神隠し" },
    "tv:71446": { en: "Money Heist", es: "La casa de papel", original: "La casa de papel" },
    "basura": { en: "x" },
  });
  assert.equal(getTitleNamesVersion(), before + 1);

  assert.equal(titleMatchesQuery(imported, "chihiro"), true);
  assert.equal(titleMatchesQuery(imported, "el viaje"), true);
  assert.equal(titleMatchesQuery(spanish, "money heist"), true);
  assert.equal(titleMatchesQuery(spanish, "papel"), true);
  assert.equal(titleMatchesQuery(spanish, "totoro"), false);
});
