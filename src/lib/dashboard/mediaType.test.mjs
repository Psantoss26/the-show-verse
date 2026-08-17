// src/lib/dashboard/mediaType.test.mjs
import assert from "node:assert/strict";
import test from "node:test";

import { getMediaTypeForItem } from "./mediaType.mjs";

// ─────────────────────────────────────────────
// Items en camelCase (perfil, actividad, backend propio)
// ─────────────────────────────────────────────
test("una serie con mediaType en camelCase se detecta como serie", () => {
  // Regresión del bug del panel lateral: las series de la actividad se abrían
  // como película porque solo se miraba `media_type` en snake_case.
  assert.equal(getMediaTypeForItem({ tmdbId: 94997, mediaType: "tv" }), "tv");
});

test("el item real de la actividad del perfil se detecta como serie", () => {
  // Forma exacta que envía getUserActivity: lleva `title` incluso para series,
  // y no trae `name` ni `first_air_date`.
  const item = {
    id: "review:abc",
    type: "review",
    tmdbId: 94997,
    mediaType: "tv",
    title: "La casa del dragón",
    posterPath: "/x.jpg",
    createdAt: "2026-07-27T00:00:00.000Z",
  };
  assert.equal(getMediaTypeForItem(item), "tv");
});

test("una película en camelCase sigue siendo película", () => {
  assert.equal(getMediaTypeForItem({ tmdbId: 121, mediaType: "movie" }), "movie");
});

// ─────────────────────────────────────────────
// Items con la forma de TMDB (dashboards) — no deben cambiar
// ─────────────────────────────────────────────
test("una serie de TMDB con media_type se detecta como serie", () => {
  assert.equal(getMediaTypeForItem({ id: 1399, media_type: "tv" }), "tv");
});

test("un item con `name` y sin `title` se deduce como serie", () => {
  assert.equal(getMediaTypeForItem({ id: 1399, name: "Juego de tronos" }), "tv");
});

test("un item con `first_air_date` se deduce como serie", () => {
  assert.equal(getMediaTypeForItem({ id: 1399, first_air_date: "2011-04-17" }), "tv");
});

test("una película de TMDB se detecta como película", () => {
  assert.equal(
    getMediaTypeForItem({ id: 121, title: "Las dos torres", release_date: "2002-12-18" }),
    "movie",
  );
});

// ─────────────────────────────────────────────
// El tipo explícito manda sobre la heurística
// ─────────────────────────────────────────────
test("un tipo explícito de película gana a la heurística de `name`", () => {
  // Una película con `name` y sin `title` (p. ej. normalizada por otra capa) no
  // debe convertirse en serie: lo que el item DECLARA vale más que lo que se
  // adivina por sus campos.
  assert.equal(
    getMediaTypeForItem({ id: 550, mediaType: "movie", name: "El club de la lucha" }),
    "movie",
  );
  assert.equal(
    getMediaTypeForItem({ id: 550, media_type: "movie", first_air_date: "1999-10-15" }),
    "movie",
  );
});

test("un tipo explícito desconocido cae en la heurística", () => {
  // 'person' u otros tipos que TMDB devuelve en búsquedas mixtas.
  assert.equal(getMediaTypeForItem({ id: 1, media_type: "person", name: "Nolan" }), "tv");
  assert.equal(getMediaTypeForItem({ id: 1, media_type: "person", title: "Nolan" }), "movie");
});

test("'show' se acepta como sinónimo de serie", () => {
  // Es el nombre que usa Trakt y aparece en items que vienen de esa integración.
  assert.equal(getMediaTypeForItem({ id: 1399, mediaType: "show" }), "tv");
});

// ─────────────────────────────────────────────
// Entradas degeneradas
// ─────────────────────────────────────────────
test("sin item se asume película, como hasta ahora", () => {
  assert.equal(getMediaTypeForItem(undefined), "movie");
  assert.equal(getMediaTypeForItem(null), "movie");
  assert.equal(getMediaTypeForItem({}), "movie");
});
