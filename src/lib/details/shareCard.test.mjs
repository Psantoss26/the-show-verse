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
const byKey = (buttons, key) => buttons.find((b) => b.key === key);

test("movie card shows only the actions with a user state in DetailActionsRow order", () => {
  const card = sanitizeShareCard(buildShareCardPayload(baseInput));
  const buttons = shareCardActionButtons(card);

  // Sin tráiler, banda sonora ni los botones apagados: solo lo que el usuario
  // ha hecho con el título, en el orden de DetailActionsRow (visto · nota · favorito).
  assert.deepEqual(keysAndVariants(buttons), [
    "watched:active",
    "rating:active",
    "favorite:active",
  ]);
  const watched = byKey(buttons, "watched");
  assert.equal(watched.wide, undefined);
  assert.equal(watched.icon, undefined);
  assert.equal(watched.label, "2");
  assert.equal(watched.labelSuffix, undefined);
  assert.equal(watched.color, "green");
  assert.equal(byKey(buttons, "rating").label, "9");
  assert.equal(byKey(buttons, "rating").color, "yellow");
  assert.equal(byKey(buttons, "favorite").color, "red");
  assert.equal(byKey(buttons, "favorite").filledIcon, true);
});

test("finished series with every state: watched, rating, favorite, list and review (Game of Thrones case)", () => {
  const buttons = shareCardActionButtons(
    sanitizeShareCard(
      buildShareCardPayload({
        ...baseInput,
        type: "tv",
        trakt: { watched: true, badge: "100%", loading: false },
        rating: 10,
        favorite: true,
        watchlist: false,
        listActive: true,
        commentsActive: true,
      }),
    ),
  );
  assert.deepEqual(keysAndVariants(buttons), [
    "watched:active",
    "rating:active",
    "favorite:active",
    "list:active",
    "comments:active",
  ]);
  // Terminada al 100%: el ojo esmeralda con el relleno completo, como en la ficha.
  const watched = byKey(buttons, "watched");
  assert.equal(watched.wide, undefined);
  assert.deepEqual([watched.icon, watched.iconColor], ["eye", "emerald"]);
  assert.equal(watched.fill, 100);
  assert.equal(watched.label, undefined);
  assert.equal(byKey(buttons, "rating").label, "10");
});

test("a title without any user state has no action row", () => {
  const buttons = shareCardActionButtons(
    sanitizeShareCard(
      buildShareCardPayload({
        ...baseInput,
        trakt: { watched: false },
        rating: null,
        favorite: false,
      }),
    ),
  );
  assert.deepEqual(buttons, []);
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

test("tv card keeps the series progress and drops the media buttons", () => {
  const card = sanitizeShareCard(
    buildShareCardPayload({
      ...baseInput,
      type: "tv",
      trailerAvailable: false,
      soundtrackAvailable: true,
      trakt: { watched: true, plays: 0, badge: "45%", loading: false },
      rating: 7.5,
      favorite: false,
    }),
  );
  const buttons = shareCardActionButtons(card);

  assert.ok(!buttons.some((b) => b.key === "media" || b.key === "episodes"));
  // Dos botones: el de visionado no puede ir en el centro, va a la izquierda.
  assert.deepEqual(buttons.map((b) => b.key), ["watched", "rating"]);
  assert.equal(buttons[0].label, "45");
  assert.equal(buttons[0].labelSuffix, "%");
  assert.equal(buttons[0].fill, 45);
  assert.equal(buttons[0].icon, undefined);
  assert.equal(buttons[1].label, "7.5");
});

test("finished series shows the emerald eye, unwatched is left out", () => {
  const done = shareCardActionButtons(
    sanitizeShareCard(
      buildShareCardPayload({
        ...baseInput,
        type: "tv",
        trakt: { watched: true, badge: "100%" },
      }),
    ),
  ).find((b) => b.key === "watched");
  assert.equal(done.key, "watched");
  assert.equal(done.icon, "eye");
  assert.equal(done.iconColor, "emerald");

  const idle = shareCardActionButtons(
    sanitizeShareCard(buildShareCardPayload({ ...baseInput, trakt: { watched: false } })),
  );
  assert.ok(!idle.some((b) => b.key === "watched"));
});

test("loading Trakt state is never shown as watched", () => {
  const card = sanitizeShareCard(
    buildShareCardPayload({ ...baseInput, trakt: { watched: true, plays: 3, loading: true } }),
  );
  assert.equal(card.actions.watched, false);
  assert.equal(card.actions.plays, 0);
});

test("trailer and soundtrack never appear, available or not", () => {
  for (const available of [true, false]) {
    const buttons = shareCardActionButtons(
      sanitizeShareCard(
        buildShareCardPayload({ ...baseInput, trailerAvailable: available, soundtrackAvailable: available }),
      ),
    );
    assert.ok(!buttons.some((b) => b.key === "trailer" || b.key === "soundtrack"));
  }
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

test("season card keeps only the user states: watched and rating (no series button, arrows or edit)", () => {
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
    "watched:active",
    "rating:active",
  ]);
  assert.ok(!buttons.some((b) => /arrow|pencil|edit/i.test(`${b.key} ${b.icon ?? ""}`)));
  assert.equal(buttons[0].label, "43");
  assert.equal(buttons[0].wide, undefined);
  assert.equal(buttons[1].label, "8");
});

test("only tv cards can be season cards, and the flags are booleans", () => {
  assert.equal(sanitizeShareCard({ type: "movie", season: { previous: true } }).season, null);
  assert.deepEqual(sanitizeShareCard({ type: "tv", season: { previous: "yes", next: 1 } }).season, {
    previous: false,
    next: false,
  });
  assert.equal(sanitizeShareCard({ type: "tv" }).season, null);
});

test("the watched button maintains the exact DetailActionsRow order", () => {
  const keysFor = (extra) =>
    shareCardActionButtons(
      sanitizeShareCard(
        buildShareCardPayload({
          ...baseInput,
          trakt: { watched: true, plays: 1, loading: false },
          rating: null,
          favorite: false,
          ...extra,
        }),
      ),
    ).map((b) => b.key);

  assert.deepEqual(keysFor({}), ["watched"]);
  assert.deepEqual(keysFor({ favorite: true }), ["watched", "favorite"]);
  assert.deepEqual(keysFor({ favorite: true, watchlist: true }), ["watched", "favorite", "watchlist"]);
  assert.deepEqual(keysFor({ rating: 8, favorite: true, watchlist: true }), ["watched", "rating", "favorite", "watchlist"]);
  assert.deepEqual(
    keysFor({ rating: 8, favorite: true, watchlist: true, listActive: true, commentsActive: true }),
    ["watched", "rating", "favorite", "watchlist", "list", "comments"],
  );
});

test("a watched movie without a play count shows the eye icon", () => {
  const watched = shareCardActionButtons(
    sanitizeShareCard(buildShareCardPayload({ ...baseInput, trakt: { watched: true, plays: 0, loading: false } })),
  ).find((b) => b.key === "watched");
  assert.deepEqual([watched.icon, watched.label, watched.labelSuffix ?? null], ["eye", undefined, null]);
  const watched1 = shareCardActionButtons(
    sanitizeShareCard(buildShareCardPayload({ ...baseInput, trakt: { watched: true, plays: 1, loading: false } })),
  ).find((b) => b.key === "watched");
  assert.equal(watched1.label, "1");
  assert.equal(watched1.labelSuffix, undefined);
});

test("episode card: stacked stills cover, kicker and only watched · rating", () => {
  const card = sanitizeShareCard(
    buildShareCardPayload({
      ...baseInput,
      type: "tv",
      title: "Piloto",
      posterPath: "/still1.jpg",
      logoPath: null,
      episode: true,
      kicker: "Episodio 1 · Temporada 1",
      stillPaths: ["/still1.jpg", "/still2.jpg", "/still3.jpg"],
      trakt: { watched: true, plays: 0, badge: null, loading: false },
      rating: 9,
    }),
  );
  assert.equal(card.episode, true);
  assert.equal(card.kicker, "Episodio 1 · Temporada 1");
  assert.deepEqual(card.stillPaths, ["/still1.jpg", "/still2.jpg", "/still3.jpg"]);
  assert.equal(card.season, null);

  const buttons = shareCardActionButtons(card);
  assert.deepEqual(keysAndVariants(buttons), ["watched:active", "rating:active"]);
  // Sin play count muestra el icono del ojo, sin texto.
  assert.equal(byKey(buttons, "watched").icon, "eye");
  assert.equal(byKey(buttons, "watched").label, undefined);

  const twice = shareCardActionButtons(
    sanitizeShareCard({ ...card, actions: { ...card.actions, plays: 2 } }),
  );
  assert.equal(byKey(twice, "watched").label, "2");
  assert.equal(byKey(twice, "watched").labelSuffix, undefined);
});

test("episode stills: only TMDb paths, deduplicated, at most three, tv only", () => {
  const card = sanitizeShareCard({
    type: "tv",
    episode: true,
    stillPaths: ["/a.jpg", "/a.jpg", "https://evil/x.jpg", "/b.jpg", "/c.jpg", "/d.jpg"],
  });
  assert.deepEqual(card.stillPaths, ["/a.jpg", "/b.jpg", "/c.jpg"]);
  const movie = sanitizeShareCard({ type: "movie", episode: true, stillPaths: ["/a.jpg"] });
  assert.equal(movie.episode, false);
  assert.deepEqual(movie.stillPaths, []);
  assert.equal(sanitizeShareCard({ type: "tv", episode: "yes" }).episode, false);
});
