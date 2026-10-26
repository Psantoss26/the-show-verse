/* eslint @typescript-eslint/no-require-imports: "off" -- Buildless extension modules also run in CommonJS tests. */
// netflix-source.test.js — Netflix desde el reproductor y sus metadatos.
const assert = require("node:assert/strict");
const test = require("node:test");
const N = require("./netflix-source.js");
const D = require("./detection-core.js");
const E = require("./platform-enhancers.js");
const { h, doc } = require("./fake-dom.js");

// `window.netflix` tal y como lo expone el reproductor (solo lo que se lee).
function netflixGlobal(sessions, buildId = "vbd1c2e3f") {
  return {
    appContext: { state: { playerApp: { getState: () => ({ videoPlayer: { playbackStateBySessionId: sessions } }) } } },
    reactContext: { models: { serverDefs: { data: { BUILD_IDENTIFIER: buildId } } } },
  };
}

const SHOW = {
  video: {
    type: "show",
    id: 80057281,
    title: "Stranger Things",
    year: 2016,
    currentEpisode: 81091417,
    hiddenEpisodeNumbers: false,
    seasons: [
      { seq: 1, episodes: [{ id: 80077209, seq: 1, title: "Chapter One: The Vanishing of Will Byers" }] },
      { seq: 4, episodes: [
        { id: 81091416, seq: 4, title: "Chapter Four: Dear Billy" },
        { id: 81091417, seq: 5, title: "Chapter Five: The Nina Project" },
      ] },
    ],
  },
};
const MOVIE = { video: { type: "movie", id: 80175798, title: "The Irishman", year: 2019 } };

test("el estado del reproductor: la sesión que suena, con su id y el BUILD_IDENTIFIER", () => {
  const state = N.readPlayerState(netflixGlobal({
    old: { videoId: 81091416, duration: 3000000, paused: true, playing: false },
    loading: { videoId: 99, duration: 0, playing: true },
    now: { videoId: 81091417, duration: 3100000, paused: false, playing: true },
  }));
  assert.deepEqual(state, { videoId: "81091417", paused: false, buildId: "vbd1c2e3f" });
});

test("sin reproductor, o con datos raros, no hay estado", () => {
  assert.equal(N.readPlayerState(undefined), null);
  assert.equal(N.readPlayerState({}), null);
  assert.equal(N.readPlayerState(netflixGlobal({})), null);
  assert.equal(N.readPlayerState(netflixGlobal({ a: { videoId: "abc", duration: 10 } })), null);
  const throws = { appContext: { state: { playerApp: { getState: () => { throw new Error("x"); } } } } };
  assert.equal(N.readPlayerState(throws), null);
  // Un BUILD_IDENTIFIER con caracteres extraños no se usa en una URL.
  assert.equal(N.readPlayerState(netflixGlobal({ a: { videoId: 1, duration: 9 } }, "../x?y")).buildId, null);
});

test("el mensaje de la página se valida antes de usarlo", () => {
  assert.deepEqual(
    N.parsePlayerMessage({ source: N.PLAYER_MESSAGE, videoId: "81091417", paused: 0, buildId: "v1" }),
    { videoId: "81091417", paused: false, buildId: "v1" },
  );
  assert.equal(N.parsePlayerMessage({ source: "otra-cosa", videoId: "1" }), null);
  assert.equal(N.parsePlayerMessage({ source: N.PLAYER_MESSAGE, videoId: "1; drop" }), null);
  assert.equal(N.parsePlayerMessage(null), null);
});

test("URLs de metadatos: sin BUILD_IDENTIFIER solo las que no lo necesitan", () => {
  assert.equal(N.watchIdFromPath("/watch/81091417"), "81091417");
  assert.equal(N.watchIdFromPath("/title/80057281"), null);
  assert.deepEqual(N.metadataUrls("81091417", null), [
    "https://www.netflix.com/nq/website/memberapi/release/metadata?languages=en-US&movieid=81091417",
    "https://www.netflix.com/api/shakti/mre/metadata?languages=en-US&movieid=81091417",
  ]);
  assert.equal(N.metadataUrls("81091417", "v9").length, 4);
  assert.deepEqual(N.metadataUrls("abc", "v9"), []);
});

test("metadatos de un episodio: serie, temporada y episodio numerados", () => {
  assert.deepEqual(N.parseMetadata(SHOW, "81091417"), {
    type: "show",
    videoId: "81091417",
    showTitle: "Stranger Things",
    year: 2016,
    season: 4,
    episode: 5,
    episodeTitle: "Chapter Five: The Nina Project",
    hiddenEpisodeNumbers: false,
  });
});

test("una colección no usa los números de Netflix, solo el nombre del episodio", () => {
  const meta = N.parseMetadata({ video: { ...SHOW.video, hiddenEpisodeNumbers: true } }, "81091417");
  assert.deepEqual([meta.season, meta.episode, meta.episodeTitle], [null, null, "Chapter Five: The Nina Project"]);
});

test("metadatos de una película, y respuestas que no sirven", () => {
  assert.deepEqual(N.parseMetadata(MOVIE, "80175798"),
    { type: "movie", videoId: "80175798", title: "The Irishman", year: 2019 });
  assert.equal(N.parseMetadata({}, "1"), null);
  assert.equal(N.parseMetadata({ video: { type: "show", title: "X", seasons: [] } }, "1"), null);
  assert.equal(N.parseMetadata({ video: { type: "supplemental", title: "Tráiler" } }, "1"), null);
});

// El overlay del título ya no está en el DOM (Netflix lo retira al reproducir):
// sin metadatos solo queda el título de la pestaña.
function bareNetflixSignal() {
  const document = doc("Netflix", [h("video", {})]);
  const signal = D.composePlaybackSignal({
    host: "www.netflix.com",
    url: "https://www.netflix.com/watch/81091417",
    tabTitle: "Netflix",
    durationSec: 3100,
    positionSec: 600,
    doc: document,
    enhance: E.enhance,
  });
  return D.fillMissingTitles(signal, { doc: document, tabTitle: "Netflix", platformName: "Netflix" });
}

test("con los metadatos, la señal del reproductor sin título queda completa", () => {
  const before = bareNetflixSignal();
  assert.ok(!before.showName && !before.movieTitle, "sin overlay no hay título del DOM");
  const signal = N.applyMetadata(before, N.parseMetadata(SHOW, "81091417"));
  assert.equal(signal.showName, "Stranger Things");
  assert.equal(signal.episodeName, "Chapter Five: The Nina Project");
  assert.deepEqual([signal.season, signal.episode, signal.seasonEpisodeText], [4, 5, "T4:E5"]);
  assert.equal(signal.contentId, "81091417");
  assert.equal(signal.identitySource, "netflix_metadata");
  assert.equal(signal.releaseYear, 2016);
  // Lo que no es identidad se conserva.
  assert.deepEqual([signal.positionSec, signal.durationSec], [600, 3100]);
});

test("los metadatos mandan sobre un DOM que dice otra cosa", () => {
  const dom = { showName: "Top 10 en España", episodeName: "Fila", season: 1, episode: 1, seasonEpisodeText: "T1:E1", positionSec: 5 };
  const movie = N.applyMetadata(dom, N.parseMetadata(MOVIE, "80175798"));
  assert.equal(movie.movieTitle, "The Irishman");
  assert.equal("showName" in movie || "episodeName" in movie || "seasonEpisodeText" in movie, false);
  assert.deepEqual([movie.season, movie.episode], [null, null]);

  const hidden = N.applyMetadata(dom, N.parseMetadata({ video: { ...SHOW.video, hiddenEpisodeNumbers: true } }, "81091417"));
  assert.deepEqual([hidden.season, hidden.episode, "seasonEpisodeText" in hidden], [null, null, false]);

  assert.equal(N.applyMetadata(dom, null), dom);
});
