const assert = require("node:assert/strict");
const test = require("node:test");
const D = require("./detection-core.js");

test("parseSeasonEpisode handles multiple languages/formats", () => {
  assert.deepEqual(D.parseSeasonEpisode("Temporada 4: Episodio 1"), { season: 4, episode: 1 });
  assert.deepEqual(D.parseSeasonEpisode("S2 E10"), { season: 2, episode: 10 });
  assert.deepEqual(D.parseSeasonEpisode("T1:E2"), { season: 1, episode: 2 });
  assert.deepEqual(D.parseSeasonEpisode("Capítulo 5"), { season: 1, episode: 5 });
  assert.deepEqual(D.parseSeasonEpisode("no numbers here"), {});
});

test("stripPlatformPrefix removes platform prefix and suffix", () => {
  assert.equal(D.stripPlatformPrefix("Netflix - Peaky Blinders", ["Netflix"]), "Peaky Blinders");
  assert.equal(D.stripPlatformPrefix("Prime Video: The Boys", []), "The Boys");
  assert.equal(D.stripPlatformPrefix("Watch Arcane", []), "Arcane");
  assert.equal(D.stripPlatformPrefix("Cargando", []), "");
});

test("buildPlaybackSignal prefers Media Session (series)", () => {
  const sig = D.buildPlaybackSignal({
    host: "www.crunchyroll.com",
    url: "https://www.crunchyroll.com/watch/abc",
    mediaSession: { title: "El Regreso", artist: "Peaky Blinders", artwork: [{ src: "u", sizes: "512x512" }] },
    tabTitle: "Peaky Blinders - Watch on Crunchyroll",
    seasonEpisodeText: "T2 E3",
  });
  assert.equal(sig.showName, "Peaky Blinders");
  assert.equal(sig.episodeName, "El Regreso");
  assert.equal(sig.movieTitle, undefined);
  assert.equal(sig.season, 2);
  assert.equal(sig.episode, 3);
  assert.equal(sig.artworkUrl, "u");
});

test("buildPlaybackSignal treats no-artist Media Session as a movie", () => {
  const sig = D.buildPlaybackSignal({
    host: "tv.apple.com",
    mediaSession: { title: "Napoleón" },
  });
  assert.equal(sig.movieTitle, "Napoleón");
  assert.equal(sig.showName, undefined);
  assert.equal(sig.episode, undefined);
});

test("largestArtwork picks the biggest by area", () => {
  assert.equal(
    D.largestArtwork([
      { src: "small", sizes: "96x96" },
      { src: "big", sizes: "512x512" },
    ]),
    "big",
  );
  assert.equal(D.largestArtwork([]), undefined);
});

test("findSeasonEpisodeBadge scans a doc-like object", () => {
  const fakeDoc = {
    querySelectorAll: () => [
      { children: [], textContent: "Reparto" },
      { children: [], textContent: "T1 E4 · El trato" },
    ],
  };
  assert.equal(D.findSeasonEpisodeBadge(fakeDoc), "T1 E4 · El trato");
});
