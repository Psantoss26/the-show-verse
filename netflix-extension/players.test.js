/* eslint @typescript-eslint/no-require-imports: "off" -- Buildless extension modules also run in CommonJS tests. */
// players.test.js — La detección, reproductor a reproductor.
//
// Cada caso reconstruye lo que publica UNA plataforma REAL mientras se reproduce:
// su Media Session, su título de pestaña y el trozo de DOM del que sale el título
// (con la misma estructura de nodos, que es la que rompía la lectura). Se ejercita
// la cadena completa —badge del DOM, Media Session, refinador de la plataforma,
// JSON-LD y título de pestaña— tal y como la usa content.js, y se comprueba la
// señal resultante: si es serie o película, la serie, el episodio y sus números.
//
// Lo que se prueba aquí es la mitad CLIENTE. La mitad servidor (resolución a TMDb)
// se prueba en src/lib/netflix/playbackSignals.test.mjs con estas mismas señales.
const assert = require("node:assert/strict");
const test = require("node:test");
const D = require("./detection-core.js");
const E = require("./platform-enhancers.js");
const { h, doc } = require("./fake-dom.js");

// Compone la señal igual que content.js: misma cadena, mismas fuentes.
function detect({ host, url, mediaSession, tabTitle, nodes, platformName, durationSec }) {
  const document = doc(tabTitle, nodes || []);
  const signal = D.composePlaybackSignal({
    host,
    url,
    mediaSession: mediaSession || null,
    tabTitle,
    durationSec,
    positionSec: 600,
    doc: document,
    enhance: E.enhance,
  });
  return D.fillMissingTitles(signal, { doc: document, tabTitle, platformName });
}

// ── Netflix ────────────────────────────────────────────────────────────────────
// El título del reproductor son elementos HERMANOS dentro de [data-uia="video-title"]:
// el h4 con la serie y sendos spans con "T4:E5" y el nombre del episodio.
function netflixEpisodeNodes() {
  return [
    h("div", { "data-uia": "video-title" }, [
      h("h4", null, "Stranger Things"),
      h("span", null, "T4:E5"),
      h("span", null, "Capítulo cinco: La Nina"),
    ]),
  ];
}

test("Netflix, episodio: serie, temporada, episodio y su nombre", () => {
  const signal = detect({
    host: "www.netflix.com",
    url: "https://www.netflix.com/watch/81002747",
    tabTitle: "Netflix",
    nodes: netflixEpisodeNodes(),
    platformName: "Netflix",
    durationSec: 4200,
  });
  assert.equal(signal.showName, "Stranger Things");
  assert.equal(signal.season, 4, "la temporada se pierde si los hermanos se leen pegados");
  assert.equal(signal.episode, 5);
  assert.equal(signal.episodeName, "Capítulo cinco: La Nina");
  assert.equal(signal.movieTitle, undefined);
  assert.equal(signal.contentId, "81002747");
});

test("Netflix, película: NO se inventa un episodio con el título de la pestaña", () => {
  const signal = detect({
    host: "www.netflix.com",
    url: "https://www.netflix.com/watch/80100172",
    tabTitle: "Ver El Irlandés | Netflix",
    nodes: [h("div", { "data-uia": "video-title" }, [h("h4", null, "El Irlandés")])],
    platformName: "Netflix",
    durationSec: 12780,
  });
  assert.equal(signal.movieTitle, "El Irlandés");
  assert.equal(signal.showName, undefined);
  assert.equal(signal.episode, undefined);
  assert.equal(signal.season, undefined);
});

test('Netflix, película con "Capítulo" en su nombre: sigue siendo película', () => {
  // Es el caso que rompía la detección: el patrón de episodio casa dentro del
  // propio nombre de la película y la convertía en un episodio de otra cosa.
  const signal = detect({
    host: "www.netflix.com",
    url: "https://www.netflix.com/watch/324552",
    tabTitle: "John Wick: Capítulo 2 - Netflix",
    mediaSession: { title: "John Wick: Capítulo 2" },
    nodes: [
      h("div", { "data-uia": "video-title" }, [h("h4", null, "John Wick: Capítulo 2")]),
    ],
    platformName: "Netflix",
    durationSec: 7500,
  });
  assert.equal(signal.movieTitle, "John Wick: Capítulo 2");
  assert.equal(signal.showName, undefined);
  assert.equal(signal.episode, undefined);
});

// ── Prime Video ────────────────────────────────────────────────────────────────
// No expone artist/album: el `title` de la Media Session es el EPISODIO y la serie
// solo está en el DOM del reproductor y en los datos estructurados de la página.
test("Prime Video, episodio: la serie sale del reproductor, no del título", () => {
  const signal = detect({
    host: "www.primevideo.com",
    url: "https://www.primevideo.com/detail/0QN9ZXJ4G/",
    mediaSession: { title: "El Chico Diabólico" },
    tabTitle: "Prime Video: The Boys",
    nodes: [
      h("h1", { class: "atvwebplayersdk-title-text" }, "The Boys"),
      h("div", { class: "atvwebplayersdk-subtitle-text" }, "T2 E3 El Chico Diabólico"),
    ],
    platformName: "Prime Video",
    durationSec: 3600,
  });
  assert.equal(signal.showName, "The Boys");
  assert.equal(signal.season, 2);
  assert.equal(signal.episode, 3);
  assert.equal(signal.movieTitle, undefined);
});

test("Prime Video, episodio por JSON-LD cuando no hay selectores propios", () => {
  const signal = detect({
    host: "www.primevideo.com",
    url: "https://www.primevideo.com/detail/0ABC/",
    mediaSession: { title: "Un asunto de familia" },
    tabTitle: "Prime Video",
    nodes: [
      h(
        "script",
        { type: "application/ld+json" },
        JSON.stringify({
          "@type": "TVEpisode",
          name: "Un asunto de familia",
          episodeNumber: 4,
          partOfSeason: { seasonNumber: 3 },
          partOfSeries: { name: "Reacher" },
        }),
      ),
    ],
    platformName: "Prime Video",
    durationSec: 3300,
  });
  assert.equal(signal.showName, "Reacher");
  assert.equal(signal.episodeName, "Un asunto de familia");
  assert.equal(signal.season, 3);
  assert.equal(signal.episode, 4);
  assert.equal(signal.movieTitle, undefined);
});

test("Prime Video, película: el título de la Media Session manda", () => {
  const signal = detect({
    host: "www.primevideo.com",
    url: "https://www.primevideo.com/detail/0XYZ/",
    mediaSession: { title: "El Aviador" },
    tabTitle: "Prime Video: El Aviador",
    nodes: [h("h1", { class: "atvwebplayersdk-title-text" }, "El Aviador")],
    platformName: "Prime Video",
    durationSec: 10380,
  });
  assert.equal(signal.movieTitle, "El Aviador");
  assert.equal(signal.showName, undefined);
  assert.equal(signal.episode, undefined);
});

// ── Max / HBO Max ──────────────────────────────────────────────────────────────
test("Max, episodio: serie y episodio desde el reproductor", () => {
  const signal = detect({
    host: "play.max.com",
    url: "https://play.max.com/video/watch/abc-123",
    mediaSession: { title: "El príncipe rebelde" },
    tabTitle: "Max",
    nodes: [
      h("div", { "data-testid": "player-ux-asset-title" }, "La Casa del Dragón"),
      h(
        "div",
        { "data-testid": "player-ux-asset-subtitle" },
        "Temporada 2, Episodio 1 El príncipe rebelde",
      ),
    ],
    platformName: "Max",
    durationSec: 3900,
  });
  assert.equal(signal.showName, "La Casa del Dragón");
  assert.equal(signal.season, 2);
  assert.equal(signal.episode, 1);
});

test("Max, película: sin subtítulo no hay episodio", () => {
  const signal = detect({
    host: "play.max.com",
    url: "https://play.max.com/movie/watch/xyz",
    mediaSession: { title: "Dune: Parte Dos" },
    tabTitle: "Dune: Parte Dos | Max",
    nodes: [h("div", { "data-testid": "player-ux-asset-title" }, "Dune: Parte Dos")],
    platformName: "Max",
    durationSec: 9960,
  });
  assert.equal(signal.movieTitle, "Dune: Parte Dos");
  assert.equal(signal.showName, undefined);
  assert.equal(signal.episode, undefined);
});

// ── Disney+ ────────────────────────────────────────────────────────────────────
test("Disney+, episodio: Media Session con artista = serie", () => {
  const signal = detect({
    host: "www.disneyplus.com",
    url: "https://www.disneyplus.com/video/abc-def",
    mediaSession: {
      title: "Capítulo 5: El pistolero",
      artist: "The Mandalorian",
      artwork: [{ src: "https://img/small.jpg", sizes: "96x96" }, { src: "https://img/big.jpg", sizes: "512x512" }],
    },
    tabTitle: "The Mandalorian | Disney+",
    nodes: [
      h("div", { "data-testid": "subtitle-field" }, "T1:E5 Capítulo 5: El pistolero"),
    ],
    platformName: "Disney+",
    durationSec: 2400,
  });
  assert.equal(signal.showName, "The Mandalorian");
  assert.equal(signal.season, 1);
  assert.equal(signal.episode, 5);
  assert.equal(signal.artworkUrl, "https://img/big.jpg");
});

// ── Crunchyroll ────────────────────────────────────────────────────────────────
// La Media Session da el EPISODIO como título y no expone la serie: el nombre de
// la serie está en el enlace a /series/ del reproductor.
test("Crunchyroll, episodio: la serie sale del enlace a /series/", () => {
  const signal = detect({
    host: "www.crunchyroll.com",
    url: "https://www.crunchyroll.com/watch/GZ7UV13VE",
    mediaSession: { title: "E12 - La promesa" },
    tabTitle: "Frieren - Ver en Crunchyroll en castellano",
    nodes: [
      h("a", { href: "/series/GY5P48XEY/frieren", class: "show-title-link" }, "Frieren"),
      h("h4", { class: "current-media-info-title" }, "E12 - La promesa"),
    ],
    platformName: "Crunchyroll",
    durationSec: 1440,
  });
  assert.equal(signal.showName, "Frieren");
  assert.equal(signal.episode, 12);
  assert.equal(signal.movieTitle, undefined);
});

// ── Plex ───────────────────────────────────────────────────────────────────────
test("Plex, episodio: título y subtítulo del panel de controles", () => {
  const signal = detect({
    host: "app.plex.tv",
    url: "https://app.plex.tv/desktop/#!/server/x/playback?key=%2Flibrary%2Fmetadata%2F4123",
    tabTitle: "Plex",
    nodes: [
      h("div", { "data-testid": "metadataTitle" }, "Breaking Bad"),
      h("div", { "data-testid": "metadataSubtitle" }, "S3 E7 One Minute"),
    ],
    platformName: "Plex",
    durationSec: 2820,
  });
  assert.equal(signal.showName, "Breaking Bad");
  assert.equal(signal.season, 3);
  assert.equal(signal.episode, 7);
  assert.equal(signal.contentId, "%2Flibrary%2Fmetadata%2F4123");
});

// ── Plataforma sin refinador propio ────────────────────────────────────────────
test("Plataforma sin selectores propios: badge del DOM + título de pestaña", () => {
  const signal = detect({
    host: "www.skyshowtime.com",
    url: "https://www.skyshowtime.com/watch/abc",
    tabTitle: "Yellowstone - SkyShowtime",
    nodes: [h("span", null, "T3 E4"), h("p", null, "Sin precedentes")],
    platformName: "SkyShowtime",
    durationSec: 3300,
  });
  assert.equal(signal.showName, "Yellowstone");
  assert.equal(signal.season, 3);
  assert.equal(signal.episode, 4);
});

test("Sin título legible: no se inventa nada con el nombre de la plataforma", () => {
  const signal = detect({
    host: "www.netflix.com",
    url: "https://www.netflix.com/watch/1",
    tabTitle: "Netflix",
    nodes: [],
    platformName: "Netflix",
    durationSec: 3600,
  });
  assert.equal(signal.showName, undefined);
  assert.equal(signal.movieTitle, undefined);
});

// ── Refinador frente al rastreo genérico del DOM ───────────────────────────────
test("El badge de otra fila del catálogo no pisa lo que dice el reproductor", () => {
  const signal = detect({
    host: "www.netflix.com",
    url: "https://www.netflix.com/watch/70143836",
    tabTitle: "Netflix",
    nodes: [
      // Una fila de recomendaciones con su propio badge, ANTES del reproductor.
      h("div", { class: "recommendation" }, [h("span", null, "T1 E1")]),
      h("div", { "data-uia": "video-title" }, [
        h("h4", null, "Breaking Bad"),
        h("span", null, "T5:E14"),
        h("span", null, "Ozymandias"),
      ]),
    ],
    platformName: "Netflix",
    durationSec: 2880,
  });
  assert.equal(signal.showName, "Breaking Bad");
  assert.equal(signal.season, 5);
  assert.equal(signal.episode, 14);
  assert.equal(signal.episodeName, "Ozymandias");
});
