import assert from "node:assert/strict";
import test from "node:test";

import {
  getSoundtrackFeedback,
  parseExcludedCollections,
  soundtrackCollectionKey,
  trackCollectionKeys,
  withSoundtrackFeedback,
} from "./soundtrackFeedback.js";

test("la clave de colección sale igual de la URL que de los ids de cada fuente", () => {
  assert.equal(
    soundtrackCollectionKey("https://open.spotify.com/album/2qvA7HmSg1iM6XMiFF76dp"),
    "spotify:album:2qvA7HmSg1iM6XMiFF76dp",
  );
  assert.equal(
    soundtrackCollectionKey("https://open.spotify.com/intl-es/playlist/1aQW5IWEP33iWiOYZiIFbH?si=x"),
    "spotify:playlist:1aQW5IWEP33iWiOYZiIFbH",
  );
  assert.equal(
    soundtrackCollectionKey("https://music.apple.com/us/album/inception-music-from-the-motion-picture/1440630520?uo=4"),
    "itunes:album:1440630520",
  );
  assert.equal(
    soundtrackCollectionKey("https://itunes.apple.com/us/album/inception/id1440630520"),
    "itunes:album:1440630520",
  );
  assert.equal(soundtrackCollectionKey("https://www.deezer.com/album/302127"), "deezer:album:302127");
  assert.equal(soundtrackCollectionKey(""), "");
});

test("las colecciones de un soundtrack no se repiten", () => {
  const keys = trackCollectionKeys([
    { collectionUrl: "https://open.spotify.com/album/A1" },
    { collectionUrl: "https://open.spotify.com/album/A1" },
    { collectionUrl: "https://www.deezer.com/album/9" },
    { collectionUrl: "" },
  ]);
  assert.deepEqual(keys, ["spotify:album:A1", "deezer:album:9"]);
});

test("exclude= solo admite claves válidas, sin repetir y con tope", () => {
  assert.deepEqual(
    parseExcludedCollections("spotify:album:A1, bogus,spotify:album:A1,deezer:album:9,itunes:album:x y"),
    ["spotify:album:A1", "deezer:album:9"],
  );
  const many = Array.from({ length: 60 }, (_, i) => `deezer:album:${i}`).join(",");
  assert.equal(parseExcludedCollections(many).length, 40);
});

test("la valoración se guarda por título y se borra cuando queda vacía", () => {
  let ui = { soundtrackAutoplay: true };
  ui = withSoundtrackFeedback(ui, "movie", 27205, { rejections: [["spotify:album:A1"]], status: null });
  assert.deepEqual(getSoundtrackFeedback(ui, "movie", 27205), {
    rejections: [["spotify:album:A1"]],
    excluded: ["spotify:album:A1"],
    status: null,
  });
  assert.equal(ui.soundtrackAutoplay, true);

  ui = withSoundtrackFeedback(ui, "tv", 1396, { rejections: [], status: "hidden" });
  assert.equal(getSoundtrackFeedback(ui, "tv", 1396).status, "hidden");
  // Otro tipo con el mismo id es otro título.
  assert.equal(getSoundtrackFeedback(ui, "movie", 1396).status, null);

  ui = withSoundtrackFeedback(ui, "movie", 27205, { rejections: [], status: null });
  assert.equal("movie:27205" in ui.soundtrackFeedback, false);
  assert.deepEqual(getSoundtrackFeedback(ui, "movie", 27205), {
    rejections: [],
    excluded: [],
    status: null,
  });
});

test("revertir quita el último rechazo y deja los anteriores", () => {
  let ui = withSoundtrackFeedback({}, "movie", 1, {
    rejections: [["spotify:album:A1"], ["spotify:playlist:P1", "deezer:album:9"]],
  });
  const before = getSoundtrackFeedback(ui, "movie", 1);
  assert.deepEqual(before.excluded, ["spotify:album:A1", "spotify:playlist:P1", "deezer:album:9"]);

  ui = withSoundtrackFeedback(ui, "movie", 1, { rejections: before.rejections.slice(0, -1) });
  assert.deepEqual(getSoundtrackFeedback(ui, "movie", 1).excluded, ["spotify:album:A1"]);
});

test("la lista plana de la primera versión cuenta como un rechazo", () => {
  const ui = { soundtrackFeedback: { "movie:1": { excluded: ["spotify:album:A1", "deezer:album:9"], status: null } } };
  assert.deepEqual(getSoundtrackFeedback(ui, "movie", 1).rejections, [["spotify:album:A1", "deezer:album:9"]]);
});

test("con demasiadas colecciones se olvidan los rechazos más antiguos", () => {
  const rejections = Array.from({ length: 30 }, (_, i) => [`deezer:album:${i * 2}`, `deezer:album:${i * 2 + 1}`]);
  const { rejections: kept, excluded } = getSoundtrackFeedback(
    withSoundtrackFeedback({}, "movie", 1, { rejections }),
    "movie",
    1,
  );
  assert.ok(excluded.length <= 40);
  assert.deepEqual(kept.at(-1), ["deezer:album:58", "deezer:album:59"]);
});
