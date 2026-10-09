import assert from "node:assert/strict";
import test from "node:test";

import {
  buildShareCardPayload,
  sanitizeShareCard,
  shareCardActionButtons,
  shareCardFileName,
} from "./shareCard.js";

const baseInput = {
  type: "movie",
  title: "Harry Potter y la piedra filosofal",
  posterPath: "/vq3E1U5WmAIPpqBoUHi77zYVIij.jpg",
  logoPath: "/n7Pj4doQ1yfElCiGTGFTvzoQkpf.png",
  trailerAvailable: true,
  soundtrackAvailable: true,
  trakt: { watched: true, plays: 2, badge: null, loading: false },
  rating: 9,
  favorite: true,
  watchlist: false,
  listActive: false,
  commentsActive: false,
  scores: {
    tmdb: { value: "7.9", sub: "30K", href: "https://tmdb" },
    trakt: { value: "8.2", sub: "52K", pending: false },
    imdb: { value: "7.7", sub: "944K" },
  },
};

const keysAndVariants = (buttons) => buttons.map((b) => `${b.key}:${b.variant}`);

test("movie card mirrors the mobile action row states (screenshot case)", () => {
  const card = sanitizeShareCard(buildShareCardPayload(baseInput));
  const buttons = shareCardActionButtons(card);

  assert.deepEqual(keysAndVariants(buttons), [
    "trailer:solid",
    "soundtrack:solid",
    "watched:active",
    "rating:active",
    "favorite:active",
    "watchlist:glass",
    "list:glass",
    "comments:glass",
  ]);
  assert.equal(buttons[2].label, "2");
  assert.equal(buttons[2].color, "green");
  assert.equal(buttons[3].label, "9");
  assert.equal(buttons[3].color, "yellow");
  assert.equal(buttons[4].color, "red");
  assert.equal(buttons[4].filledIcon, true);
});

test("scores keep only TMDb, Trakt and IMDb values with their vote counts", () => {
  const card = sanitizeShareCard(buildShareCardPayload(baseInput));
  assert.deepEqual(card.scores, {
    tmdb: { value: "7.9", votes: "30K" },
    trakt: { value: "8.2", votes: "52K" },
    imdb: { value: "7.7", votes: "944K" },
  });
});

test("pending or missing scores are dropped instead of drawn empty", () => {
  const card = sanitizeShareCard(
    buildShareCardPayload({
      ...baseInput,
      scores: { tmdb: { value: null }, trakt: { value: undefined, pending: true }, imdb: null },
    }),
  );
  assert.deepEqual(card.scores, { tmdb: null, trakt: null, imdb: null });
});

test("tv card uses the collapsed combined row with series progress", () => {
  const card = sanitizeShareCard(
    buildShareCardPayload({
      ...baseInput,
      type: "tv",
      trailerAvailable: false,
      soundtrackAvailable: true,
      trakt: { watched: true, plays: 0, badge: "45%", loading: false },
      rating: 7.5,
    }),
  );
  const buttons = shareCardActionButtons(card);

  assert.deepEqual(buttons.slice(0, 2).map((b) => `${b.key}:${b.variant}:${b.icon}`), [
    "media:solid:play",
    "episodes:solid:chart",
  ]);
  assert.equal(buttons[2].label, "45");
  assert.equal(buttons[2].labelSuffix, "%");
  assert.equal(buttons[2].fill, 45);
  assert.equal(buttons[3].label, "7.5");
});

test("finished series shows the emerald eye, unwatched shows eye-off", () => {
  const done = shareCardActionButtons(
    sanitizeShareCard(
      buildShareCardPayload({
        ...baseInput,
        type: "tv",
        trakt: { watched: true, badge: "100%" },
      }),
    ),
  )[2];
  assert.equal(done.icon, "eye");
  assert.equal(done.iconColor, "emerald");

  const idle = shareCardActionButtons(
    sanitizeShareCard(buildShareCardPayload({ ...baseInput, trakt: { watched: false } })),
  )[2];
  assert.deepEqual([idle.icon, idle.variant], ["eyeOff", "glass"]);
});

test("loading Trakt state is never shown as watched", () => {
  const card = sanitizeShareCard(
    buildShareCardPayload({ ...baseInput, trakt: { watched: true, plays: 3, loading: true } }),
  );
  assert.equal(card.actions.watched, false);
  assert.equal(card.actions.plays, 0);
});

test("unavailable trailer and soundtrack render as disabled", () => {
  const buttons = shareCardActionButtons(
    sanitizeShareCard(
      buildShareCardPayload({ ...baseInput, trailerAvailable: false, soundtrackAvailable: false }),
    ),
  );
  assert.deepEqual(keysAndVariants(buttons.slice(0, 2)), ["trailer:disabled", "soundtrack:disabled"]);
});

test("sanitizer rejects foreign image urls and clamps untrusted input", () => {
  const card = sanitizeShareCard({
    type: "<script>",
    title: "x".repeat(500),
    posterPath: "https://evil.example/poster.jpg",
    logoPath: "/../../etc/passwd",
    showTitle: false,
    actions: { rating: 99, plays: -4, progress: "250%", favorite: "true" },
    scores: { tmdb: { value: "8.123456789", votes: "1".repeat(40) }, rt: { value: "90" } },
  });

  assert.equal(card.type, "movie");
  assert.equal(card.title.length, 80);
  assert.equal(card.posterPath, null);
  assert.equal(card.logoPath, null);
  assert.equal(card.showTitle, false);
  assert.equal(card.actions.rating, 10);
  assert.equal(card.actions.plays, 0);
  assert.equal(card.actions.progress, null);
  assert.equal(card.actions.favorite, false);
  assert.deepEqual(card.scores.tmdb, { value: "8.1234", votes: "11111111" });
  assert.equal("rt" in card.scores, false);
});

test("file name is a readable ascii slug", () => {
  assert.equal(
    shareCardFileName("Harry Potter y la piedra filosofal", "jpg"),
    "harry-potter-y-la-piedra-filosofal-the-show-verse.jpg",
  );
  assert.equal(shareCardFileName("¿Qué pasó ayer?"), "que-paso-ayer-the-show-verse.png");
  assert.equal(shareCardFileName(""), "titulo-the-show-verse.png");
});

test("season card mirrors the season row: previous, series, watched, rating, next", () => {
  const card = sanitizeShareCard(
    buildShareCardPayload({
      ...baseInput,
      type: "tv",
      title: "Breaking Bad · Temporada 1",
      logoPath: null,
      showTitle: false,
      trakt: { watched: true, badge: "43%", loading: false },
      rating: 8,
      season: { previous: false, next: true },
    }),
  );
  assert.deepEqual(card.season, { previous: false, next: true });

  const buttons = shareCardActionButtons(card);
  assert.deepEqual(buttons.map((b) => `${b.key}:${b.variant}`), [
    "previous:disabled",
    "series:glass",
    "watched:active",
    "rating:active",
    "next:glass",
  ]);
  assert.deepEqual(buttons.map((b) => b.icon ?? null), ["arrowLeft", "monitorPlay", null, null, "arrowRight"]);
  assert.equal(buttons[2].label, "43");
  assert.equal(buttons[3].label, "8");
});

test("only tv cards can be season cards, and the flags are booleans", () => {
  assert.equal(sanitizeShareCard({ type: "movie", season: { previous: true } }).season, null);
  assert.deepEqual(sanitizeShareCard({ type: "tv", season: { previous: "yes", next: 1 } }).season, {
    previous: false,
    next: false,
  });
  assert.equal(sanitizeShareCard({ type: "tv" }).season, null);
});
