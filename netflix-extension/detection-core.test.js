const assert = require("node:assert/strict");
const test = require("node:test");
const D = require("./detection-core.js");

test("parseSeasonEpisode handles multiple languages/formats", () => {
  assert.deepEqual(D.parseSeasonEpisode("Temporada 4: Episodio 1"), { season: 4, episode: 1 });
  assert.deepEqual(D.parseSeasonEpisode("S2 E10"), { season: 2, episode: 10 });
  assert.deepEqual(D.parseSeasonEpisode("T1:E2"), { season: 1, episode: 2 });
  // Episodio sin temporada: NO se asume 1 (queda null; el servidor decide).
  assert.deepEqual(D.parseSeasonEpisode("Capítulo 5"), { season: null, episode: 5 });
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

test("badge S×E reclassifies as series even without artist/album (Prime/Max)", () => {
  // Prime/Max no exponen artist/album: el título de la Media Session es el
  // EPISODIO. El badge S×E del DOM es evidencia fuerte de serie.
  const sig = D.buildPlaybackSignal({
    host: "www.primevideo.com",
    mediaSession: { title: "La bendición" },
    seasonEpisodeText: "T2 E5",
  });
  assert.equal(sig.movieTitle, undefined);
  assert.equal(sig.episodeName, "La bendición");
  assert.equal(sig.season, 2);
  assert.equal(sig.episode, 5);
});

test("S×E only in Media Session title is parsed when it's a series", () => {
  const sig = D.buildPlaybackSignal({
    host: "example.com",
    mediaSession: { title: "T3:E7 - El final", artist: "La Serie" },
  });
  assert.equal(sig.showName, "La Serie");
  assert.equal(sig.season, 3);
  assert.equal(sig.episode, 7);
});

test("a movie with 'Chapter N' in tab/title never gets episode numbers", () => {
  const sig = D.buildPlaybackSignal({
    host: "play.max.com",
    mediaSession: { title: "John Wick: Chapter 2" },
    tabTitle: "John Wick: Chapter 2 | Max",
  });
  assert.equal(sig.movieTitle, "John Wick: Chapter 2");
  assert.equal(sig.showName, undefined);
  assert.equal(sig.episode, undefined);
  assert.equal(sig.season, undefined);
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

test("buildDetailsUrl arma la URL de detalles según el tipo", () => {
  const o = "https://theshowverse.com";
  assert.equal(
    D.buildDetailsUrl(o, { tmdbId: 157336, mediaType: "movie" }),
    "https://theshowverse.com/details/movie/157336",
  );
  assert.equal(
    D.buildDetailsUrl(o, { tmdbId: 66732, mediaType: "tv", season: 4, episode: 5 }),
    "https://theshowverse.com/details/tv/66732/season/4/episode/5",
  );
  assert.equal(
    D.buildDetailsUrl(o, { tmdbId: 66732, mediaType: "tv" }),
    "https://theshowverse.com/details/tv/66732",
  );
  // Sin id resuelto → sin URL.
  assert.equal(D.buildDetailsUrl(o, { mediaType: "tv" }), "");
  assert.equal(D.buildDetailsUrl("", { tmdbId: 1, mediaType: "movie" }), "");
  // Quita barra final del origin.
  assert.equal(
    D.buildDetailsUrl("https://theshowverse.com/", { tmdbId: 1, mediaType: "movie" }),
    "https://theshowverse.com/details/movie/1",
  );
});

test("detectFromJsonLd extrae serie + temporada/episodio de un TVEpisode", () => {
  const doc = {
    querySelectorAll: (sel) =>
      String(sel).includes("ld+json")
        ? [
            {
              textContent: JSON.stringify({
                "@type": "TVEpisode",
                name: "El proyecto Nina",
                episodeNumber: 5,
                partOfSeason: {
                  seasonNumber: 4,
                  partOfSeries: { name: "Stranger Things" },
                },
              }),
            },
          ]
        : [],
  };
  const r = D.detectFromJsonLd(doc);
  assert.equal(r.mediaType, "tv");
  assert.equal(r.showName, "Stranger Things");
  assert.equal(r.episodeName, "El proyecto Nina");
  assert.equal(r.season, 4);
  assert.equal(r.episode, 5);
});

test("detectFromJsonLd soporta @graph, TVSeries y Movie", () => {
  const series = {
    querySelectorAll: () => [
      { textContent: JSON.stringify({ "@graph": [{ "@type": "TVSeries", name: "The Boys" }] }) },
    ],
  };
  assert.deepEqual(D.detectFromJsonLd(series), { mediaType: "tv", showName: "The Boys" });
  const movie = {
    querySelectorAll: () => [
      { textContent: JSON.stringify([{ "@type": "Movie", name: "Napoleón" }]) },
    ],
  };
  assert.deepEqual(D.detectFromJsonLd(movie), { mediaType: "movie", movieTitle: "Napoleón" });
});

test("detectFromJsonLd es tolerante (null sin datos / JSON inválido)", () => {
  assert.equal(D.detectFromJsonLd({ querySelectorAll: () => [{ textContent: "no json {" }] }), null);
  assert.equal(D.detectFromJsonLd({ querySelectorAll: () => [] }), null);
});

test("detectFromMeta lee og:title / twitter:title", () => {
  const doc = {
    querySelector: (sel) => (String(sel).includes("og:title") ? { getAttribute: () => "  The Bear  " } : null),
  };
  assert.equal(D.detectFromMeta(doc), "The Bear");
  assert.equal(D.detectFromMeta({ querySelector: () => null }), "");
});

test("findSeasonEpisodeBadge combina temporada y episodio en nodos separados", () => {
  // Netflix a veces muestra la temporada y el episodio en elementos distintos.
  const fakeDoc = {
    querySelectorAll: () => [
      { children: [], textContent: "Stranger Things" },
      { children: [], textContent: "T4" },
      { children: [], textContent: "Capítulo cinco: El proyecto Nina" },
      { children: [], textContent: "E5" },
    ],
  };
  const badge = D.findSeasonEpisodeBadge(fakeDoc);
  assert.match(badge, /T4/);
  assert.match(badge, /E5/);
});

test("pickProgressPoint nunca deja retroceder la posición", () => {
  // El <video> ya reproduce el episodio SIGUIENTE (currentTime bajo) pero aún
  // estamos volcando el anterior: manda lo último que sabíamos de él.
  assert.deepEqual(
    D.pickProgressPoint({ positionSec: 3, durationSec: 2700 }, { positionSec: 2500, durationSec: 2700 }),
    { positionSec: 2500, durationSec: 2700 },
  );
  // Avanzando con normalidad: manda la lectura viva.
  assert.deepEqual(
    D.pickProgressPoint({ positionSec: 2600, durationSec: 2700 }, { positionSec: 2500, durationSec: 2700 }),
    { positionSec: 2600, durationSec: 2700 },
  );
});

test("pickProgressPoint funciona sin reproductor y descarta lo inservible", () => {
  // El reproductor ya no está en el DOM: queda lo cacheado.
  assert.deepEqual(
    D.pickProgressPoint(null, { positionSec: 1200, durationSec: 3600 }),
    { positionSec: 1200, durationSec: 3600 },
  );
  // La duración la aporta la lectura viva y la posición el caché.
  assert.deepEqual(
    D.pickProgressPoint({ positionSec: 0, durationSec: 3600 }, { positionSec: 1200, durationSec: 0 }),
    { positionSec: 1200, durationSec: 3600 },
  );
  // Sin posición o sin duración no hay nada que enviar.
  assert.equal(D.pickProgressPoint(null, null), null);
  assert.equal(D.pickProgressPoint({ positionSec: 0, durationSec: 3600 }, null), null);
  assert.equal(D.pickProgressPoint({ positionSec: 100, durationSec: 0 }, null), null);
  assert.equal(D.pickProgressPoint({ positionSec: NaN, durationSec: NaN }, null), null);
});
