import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { resolveListItemIndicator } from "./listItemHoverIndicator.js";

const listsPage = readFileSync(
  new URL("../../app/lists/page.jsx", import.meta.url),
  "utf8",
);

test("favorito tiene prioridad y muestra datos personales", () => {
  assert.deepEqual(
    resolveListItemIndicator({
      mediaType: "movie",
      favorite: true,
      watchlist: true,
      watched: true,
      plays: 3,
      userRating: 8.5,
      tmdbRating: 7.4,
      imdbRating: 7.8,
    }),
    {
      leading: "favorite",
      watched: { kind: "count", value: 3 },
      rating: { kind: "user", value: 8.5 },
    },
  );
});

test("pendiente muestra su estado y puntuaciones públicas", () => {
  assert.deepEqual(
    resolveListItemIndicator({
      mediaType: "tv",
      watchlist: true,
      tmdbRating: 7.4,
      imdbRating: 7.8,
    }),
    {
      leading: "watchlist",
      tmdbRating: 7.4,
      imdbRating: 7.8,
    },
  );
});

test("sin estado muestra el tipo y las puntuaciones públicas", () => {
  assert.deepEqual(
    resolveListItemIndicator({
      mediaType: "tv",
      tmdbRating: 8,
      imdbRating: 8.2,
    }),
    {
      leading: "tv",
      tmdbRating: 8,
      imdbRating: 8.2,
    },
  );
});

test("las tarjetas de las filas dejan el hover exclusivamente al indicador", () => {
  const card = listsPage.slice(
    listsPage.indexOf("const ListItemCard"),
    listsPage.indexOf("function sortLists"),
  );

  assert.match(card, /<ListItemHoverIndicator/);
  assert.doesNotMatch(card, /group-hover:text-purple-400/);
  assert.doesNotMatch(card, /bg-gradient-to-t from-black\/90/);
});
