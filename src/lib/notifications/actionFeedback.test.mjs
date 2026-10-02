import assert from "node:assert/strict";
import test from "node:test";

import { activityTypeOf, describeAction } from "./actionFeedback.js";

const origin = "https://theshowverse.com";
const post = (url, body, method = "POST") =>
  describeAction({ method, url, body: body == null ? undefined : JSON.stringify(body), origin });

test("acciones: favoritas y pendientes, añadir y quitar", () => {
  const fav = post("/api/tmdb/account/favorite", { mediaType: "movie", mediaId: 603, favorite: true });
  assert.equal(fav.text, "Añadida a Favoritas");
  assert.equal(fav.icon, "favorite");
  assert.equal(fav.tmdbId, 603);
  assert.equal(fav.mediaType, "movie");
  assert.equal(activityTypeOf(fav), "favorite");

  assert.equal(post("/api/tmdb/account/favorite", { mediaType: "tv", mediaId: 1, favorite: false }).text, "Quitada de Favoritas");
  assert.equal(post("/api/tmdb/account/watchlist", { mediaType: "tv", mediaId: 1, watchlist: true }).text, "Añadida a Pendientes");
});

test("acciones: notas de película, serie, temporada y episodio", () => {
  assert.equal(post("/api/trakt/item/rating", { type: "movie", tmdbId: 603, rating: 8 }).text, "Has puntuado con un 8/10");
  assert.equal(post("/api/trakt/item/rating", { type: "show", tmdbId: 1, rating: null }).text, "Nota quitada");
  const episode = post("/api/trakt/ratings", { type: "episode", showTmdbId: 1399, season: 1, episode: 3, rating: 9 });
  assert.equal(episode.text, "Has puntuado S01E03 con un 9/10");
  assert.equal(episode.tmdbId, 1399);
  assert.equal(post("/api/tmdb/movies/603/rating", { value: 7.5 }).text, "Has puntuado con un 7.5/10");
});

test("acciones: vistos", () => {
  assert.equal(post("/api/trakt/episode/watched", { tmdbId: 1, season: 2, episode: 5, watched: true }).text, "S02E05 marcado como visto");
  assert.equal(post("/api/trakt/episode/watched", { tmdbId: 1, season: 2, episode: 5, watched: false }).text, "S02E05 marcado como no visto");
  assert.equal(post("/api/trakt/season/watched", { tmdbId: 1, season: 2, watched: true }).text, "Temporada 2 marcada como vista");
  assert.equal(post("/api/trakt/item/watched", { type: "movie", tmdbId: 603, watched: true, title: "Matrix" }).title, "Matrix");
  assert.equal(post("/api/trakt/item/watched", { type: "show", tmdbId: 1, watched: true }).text, "Serie marcada como vista");
});

test("acciones: listas, comunidad, ajustes y conexiones", () => {
  assert.equal(post("/api/lists", { name: "Terror" }).text, "Lista «Terror» creada");
  assert.equal(post("/api/lists/abc/items", { tmdbId: 5, mediaType: "movie" }).text, "Añadida a la lista");
  assert.equal(post("/api/lists/abc/items/5/tv", null, "DELETE").text, "Quitada de la lista");
  assert.equal(post("/api/community/tv/1399/comments", { comment: "x" }).text, "Reseña publicada");
  assert.equal(post("/api/users/ana/follow", null).text, "Ahora sigues a @ana");
  assert.equal(post("/api/netflix/disconnect", null).text, "Netflix desconectado");
});

test("acciones: lo que no es una acción no avisa", () => {
  assert.equal(post("/api/auth/login", { email: "a" }), null);
  assert.equal(post("/api/push/subscriptions", {}), null);
  assert.equal(describeAction({ method: "GET", url: "/api/tmdb/account/favorite", origin }), null);
  assert.equal(describeAction({ method: "POST", url: "https://evil.test/api/lists", origin }), null);
  assert.equal(post("/api/netflix/extension-progress", {}), null);
  assert.equal(post("/api/user/preferences", { x: 1 }, "PATCH"), null);
});

test("acciones: misma clave para la misma acción sobre el mismo título", () => {
  const a = post("/api/trakt/episode/watched", { tmdbId: 1, season: 1, episode: 1, watched: true });
  const b = post("/api/trakt/episode/watched", { tmdbId: 1, season: 1, episode: 2, watched: true });
  assert.equal(a.key, b.key);
});
