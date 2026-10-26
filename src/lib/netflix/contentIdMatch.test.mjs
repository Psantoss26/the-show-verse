import assert from "node:assert/strict";
import test from "node:test";

import { pickContentMatch } from "./contentIdMatch.js";

const episode = { scope: "user", source: "auto", tmdbId: 66732, mediaType: "tv", season: 4, episode: 5 };
const movie = { scope: "global", source: null, tmdbId: 324552, mediaType: "movie", season: null, episode: null };

test("sin contradicciones, el título del id se usa tal cual", () => {
  assert.equal(pickContentMatch(episode, { season: 4, episode: 5, seriesEvidence: true }), episode);
  assert.equal(pickContentMatch(episode, {}), episode);
  assert.equal(pickContentMatch(movie, { clientSaysMovie: true }), movie);
  assert.equal(pickContentMatch(null, {}), null);
});

test("el reproductor manda sobre lo automático y el consenso", () => {
  // Otro episodio u otra temporada en pantalla: el id ya no es lo que se aprendió.
  assert.equal(pickContentMatch(episode, { season: 4, episode: 6 }), null);
  assert.equal(pickContentMatch(episode, { season: 3, episode: 5 }), null);
  // Película según el cliente frente a serie en el mapa, y al revés.
  assert.equal(pickContentMatch(episode, { clientSaysMovie: true }), null);
  assert.equal(pickContentMatch(movie, { seriesEvidence: true }), null);
  assert.equal(pickContentMatch(movie, { episode: 2 }), null);
});

test("los vetos y las reglas del usuario ganan a lo aprendido", () => {
  assert.equal(pickContentMatch(episode, { rejected: new Set(["tv:66732"]) }), null);
  assert.equal(pickContentMatch(episode, { override: { tmdbId: 1, mediaType: "tv" } }), null);
  assert.equal(pickContentMatch(episode, { override: { tmdbId: 66732, mediaType: "tv" } }), episode);
});

test("la corrección del propio usuario para ese id manda siempre", () => {
  const corrected = { ...episode, source: "correction" };
  assert.equal(
    pickContentMatch(corrected, {
      season: 1, episode: 1, clientSaysMovie: true,
      rejected: new Set(["tv:66732"]), override: { tmdbId: 1, mediaType: "tv" },
    }),
    corrected,
  );
  // La corrección de OTRO usuario no: solo cuenta dentro del consenso.
  assert.equal(pickContentMatch({ ...corrected, scope: "global" }, { episode: 1 }), null);
});

test("una serie sin episodio concreto no se acepta nunca", () => {
  assert.equal(pickContentMatch({ ...episode, episode: null, source: "correction" }, {}), null);
});
