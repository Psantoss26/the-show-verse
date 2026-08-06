import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { resolvePosterViewerState } from "./posterViewerState.mjs";

const posterTilePath = new URL("./PosterTile.jsx", import.meta.url);

test("PosterTile no usa la sección como estado provisional del visor", async () => {
  const source = await readFile(posterTilePath, "utf8");

  assert.match(source, /resolvePosterViewerState\(\{/);
  assert.doesNotMatch(source, /isFixedFavorite && !viewerState \? true/);
  assert.doesNotMatch(source, /isFixedWatchlist && !viewerState \? true/);
});

test("no infiere el estado del visor desde la sección de otro perfil", () => {
  assert.deepEqual(
    resolvePosterViewerState({
      item: {},
      viewerState: undefined,
      fixedIndicator: "favorite",
    }),
    {
      favorite: false,
      watchlist: false,
      watched: false,
      userRating: undefined,
    },
  );

  assert.deepEqual(
    resolvePosterViewerState({
      item: {},
      viewerState: undefined,
      fixedIndicator: "watchlist",
    }),
    {
      favorite: false,
      watchlist: false,
      watched: false,
      userRating: undefined,
    },
  );
});

test("muestra exclusivamente el estado resuelto de la cuenta conectada", () => {
  assert.deepEqual(
    resolvePosterViewerState({
      item: { favorite: true, watchlist: true, watched: true, rating: 9 },
      viewerState: {
        favorite: false,
        watchlist: true,
        watched: false,
        rating: null,
      },
      fixedIndicator: "favorite",
    }),
    {
      favorite: false,
      watchlist: true,
      watched: false,
      userRating: null,
    },
  );
});

test("conserva los estados embebidos en tarjetas que no son indicadores fijos de Perfil", () => {
  assert.deepEqual(
    resolvePosterViewerState({
      item: { isFavorite: true, watched: true, userRating: 8 },
    }),
    {
      favorite: true,
      watchlist: false,
      watched: true,
      userRating: 8,
    },
  );
});
