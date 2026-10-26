/* eslint @typescript-eslint/no-require-imports: "off" -- Buildless extension modules also run in CommonJS tests. */
// diagnostic.test.js — Captura de diagnóstico y su reproducción.
//
// 1) La captura no guarda lo que no debe (parámetros de URL, scripts, metas
//    privadas, origen de imágenes y vídeos).
// 2) Una captura reproducida da la MISMA señal que el DOM original: si no, una
//    prueba hecha con capturas reales no probaría lo que pasa en el navegador.
// 3) Cada captura real de diagnostics/ con su campo `expected` es una prueba.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const D = require("./detection-core.js");
const E = require("./platform-enhancers.js");
const X = require("./diagnostic-capture.js");
const R = require("./diagnostic-replay.js");
const { h, doc } = require("./fake-dom.js");

test("la URL guarda la ruta y solo los parámetros que identifican el contenido", () => {
  assert.equal(
    X.sanitizeUrl("https://www.primevideo.com/detail/0QN9/?autoplay=1&gti=amzn1.dv.gti.abc&ref_=atv_sess_tok&token=secreto#x"),
    "https://www.primevideo.com/detail/0QN9/?autoplay=1&gti=amzn1.dv.gti.abc&ref_=…&token=…",
  );
  assert.equal(X.sanitizeUrl("https://www.netflix.com/watch/81091417?trackId=1&tctx=0%2C0"), "https://www.netflix.com/watch/81091417?trackId=1&tctx=…");
  assert.equal(X.sanitizeUrl("no es una url"), "");
});

test("la captura guarda el texto y los atributos útiles, y nada privado", () => {
  const page = h("html", null, [
    h("head", null, [
      h("meta", { property: "og:title", content: "The Boys" }),
      h("meta", { name: "csrf-token", content: "secreto" }),
      h("script", { type: "application/ld+json" }, '{"@type":"TVEpisode","name":"El Chico Diabólico"}'),
      h("script", null, "window.__STATE__ = {token: 'secreto'}"),
    ]),
    h("body", null, [
      h("div", { "data-uia": "video-title", style: "color:red", onclick: "x()" }, [
        h("h4", null, "The Boys"),
        h("img", { alt: "Logo de la serie", src: "https://cdn.example/firmado?sig=1" }),
        h("a", { href: "https://www.primevideo.com/detail/0QN9?ref=secreto" }, "Ficha"),
      ]),
      h("div", { class: "vacio" }, []),
      h("span", { class: "oculto", hidden: true }, "Fila del catálogo"),
    ]),
  ]);
  const { tree, truncated } = X.serializeDom(page);
  const json = JSON.stringify(tree);
  assert.equal(truncated, false);
  assert.ok(json.includes('"og:title"') && json.includes("TVEpisode"), "metas públicas y JSON-LD");
  for (const secret of ["csrf-token", "__STATE__", "sig=1", "?ref=", "color:red", "onclick", '"vacio"']) {
    assert.equal(json.includes(secret), false, `no debe guardar ${secret}`);
  }
  assert.ok(json.includes('"href":"/detail/0QN9"'), "el enlace guarda solo la ruta");
  assert.ok(json.includes('"data-tsv-hidden":"1"'), "marca lo que no se ve");
});

test("los límites de la captura se respetan y se avisa", () => {
  const many = h("body", null, Array.from({ length: 50 }, (_, i) => h("p", null, `fila ${i}`)));
  const { nodes, truncated } = X.serializeDom(many, { maxNodes: 10 });
  assert.equal(truncated, true);
  assert.ok(nodes <= 10);
});

// Captura sintética de una pestaña: la misma forma que produce content.js.
function captureOf({ host, url, tabTitle, nodes, mediaSession = null, duration = 3600, name }) {
  const page = doc(tabTitle, nodes);
  return {
    platform: { id: host.split(".").slice(-2, -1)[0], name },
    page: {
      host,
      url,
      tabTitle,
      mediaSession,
      video: { currentTime: 600, duration },
      dom: X.serializeDom(h("html", null, page.children)),
    },
  };
}

function direct({ host, url, tabTitle, nodes, mediaSession = null, duration = 3600, name }) {
  const document = doc(tabTitle, nodes);
  const signal = D.composePlaybackSignal({
    host, url, mediaSession, tabTitle, durationSec: duration, positionSec: 600, doc: document, enhance: E.enhance,
  });
  return D.fillMissingTitles(signal, { doc: document, tabTitle, platformName: name });
}

const CASES = [
  {
    name: "Netflix",
    host: "www.netflix.com",
    url: "https://www.netflix.com/watch/81002747",
    tabTitle: "Netflix",
    nodes: [h("div", { "data-uia": "video-title" }, [
      h("h4", null, "Stranger Things"), h("span", null, "T4:E5"), h("span", null, "Capítulo cinco: La Nina"),
    ])],
  },
  {
    name: "Prime Video",
    host: "www.primevideo.com",
    url: "https://www.primevideo.com/detail/0QN9ZXJ4G/",
    tabTitle: "Prime Video: The Boys",
    mediaSession: { title: "El Chico Diabólico" },
    nodes: [
      h("h1", { class: "atvwebplayersdk-title-text" }, "The Boys"),
      h("div", { class: "atvwebplayersdk-subtitle-text" }, "T2 E3 El Chico Diabólico"),
    ],
  },
  {
    name: "Apple TV+ (JSON-LD)",
    host: "tv.apple.com",
    url: "https://tv.apple.com/es/episode/x/umc.cmc.1",
    tabTitle: "Severance - Apple TV+",
    nodes: [h("script", { type: "application/ld+json" }, JSON.stringify({
      "@type": "TVEpisode", name: "Hola, Ms. Cobel", episodeNumber: 2,
      partOfSeason: { seasonNumber: 2 }, partOfSeries: { name: "Severance" },
    }))],
  },
];

for (const c of CASES) {
  test(`una captura reproducida da la misma señal que el DOM original: ${c.name}`, () => {
    assert.deepEqual(R.identity(R.replaySignal(captureOf(c))), R.identity(direct(c)));
  });
}

test("los textos sueltos entre elementos se conservan al reproducir", () => {
  const capture = {
    platform: { name: "Test" },
    page: { host: "x.test", url: "https://x.test/", tabTitle: "", dom: { tree: {
      t: "html", a: {}, c: [{ t: "div", a: { class: "t" }, c: [{ t: "b", a: {}, c: [{ x: "Serie" }] }, { x: " T1:E2" }] }],
    } } },
  };
  const document = R.captureToDoc(capture);
  assert.equal(document.querySelector(".t").textContent, "Serie T1:E2");
  // Un texto suelto no es un elemento: ningún selector lo devuelve.
  assert.equal(document.querySelectorAll("*").some((n) => n.tagName === "#TEXT"), false);
});

// ── Capturas reales ──────────────────────────────────────────────────────────
// Cada fichero de diagnostics/ es una captura hecha con «Capturar diagnóstico».
// Con `expected` (lo que DEBERÍA detectarse: showName/movieTitle, season, episode…)
// se comprueba que el código actual lo detecta.
const dir = path.join(__dirname, "diagnostics");
const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith(".json")) : [];
for (const file of files) {
  const capture = JSON.parse(fs.readFileSync(path.join(dir, file), "utf8"));
  if (!capture.expected) continue;
  test(`captura real ${file}: ${capture.platform?.name || "?"}`, () => {
    const got = R.identity(R.replaySignal(capture));
    for (const [key, value] of Object.entries(capture.expected)) {
      assert.deepEqual(got[key], value, `${key}: ${JSON.stringify(got)}`);
    }
  });
}
