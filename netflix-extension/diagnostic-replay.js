/* eslint @typescript-eslint/no-require-imports: "off" -- Buildless extension modules also run in CommonJS tests. */
// diagnostic-replay.js — Rehace la detección a partir de una captura de
// diagnóstico (diagnostic-capture.js). Solo para pruebas y para el análisis: no
// está en el manifest.
//
// Uso desde la terminal, para comparar lo que detectó el navegador con lo que
// detecta el código actual:
//   node netflix-extension/diagnostic-replay.js ruta/a/tsv-diagnostico-….json
const D = require("./detection-core.js");
const E = require("./platform-enhancers.js");
const N = require("./netflix-source.js");
const { h, doc } = require("./fake-dom.js");

// Árbol de la captura → nodos de fake-dom. Los textos sueltos de un elemento con
// más hijos van en nodos «#text» (fake-dom no tiene nodos de texto), que no casan
// con ningún selector; el contenido de un shadow root se descarta porque el DOM
// real tampoco lo devuelve al consultar el documento.
function toFake(node) {
  if (!node || node.t === "#shadow-root") return null;
  if (typeof node.x === "string") return h("#text", null, node.x);
  const attrs = { ...(node.a || {}) };
  if (attrs["data-tsv-hidden"]) attrs.hidden = true;
  const children = (node.c || []).map(toFake).filter(Boolean);
  if (children.length === 1 && children[0].tagName === "#TEXT") {
    return h(node.t, attrs, children[0].textContent);
  }
  return h(node.t, attrs, children);
}

/** Documento de fake-dom con el DOM capturado del marco principal. */
function captureToDoc(capture) {
  const page = capture?.page || {};
  const root = page.dom?.tree ? toFake(page.dom.tree) : null;
  return doc(page.tabTitle || "", root ? [root] : []);
}

/**
 * La señal de reproducción que produce el código ACTUAL con lo que vio el
 * navegador: la misma cadena que content.js (Media Session, refinador, JSON-LD,
 * título de la pestaña y, en Netflix, sus metadatos).
 */
function replaySignal(capture) {
  const page = capture?.page || {};
  const document = captureToDoc(capture);
  const video = page.video || {};
  let signal = D.composePlaybackSignal({
    host: page.host,
    url: page.url,
    mediaSession: page.mediaSession || null,
    tabTitle: page.tabTitle || "",
    durationSec: Number.isFinite(video.duration) ? Math.round(video.duration) : undefined,
    positionSec: Number.isFinite(video.currentTime) ? Math.round(video.currentTime) : undefined,
    doc: document,
    enhance: E.enhance,
  });
  const netflixMeta = capture?.netflix?.metadata;
  if (netflixMeta) {
    signal = N.applyMetadata({ ...signal, contentId: netflixMeta.videoId || signal.contentId }, netflixMeta);
  }
  return D.fillMissingTitles(signal, {
    doc: document,
    tabTitle: page.tabTitle || "",
    platformName: capture?.platform?.name || "",
  });
}

// Campos de la señal que deciden la identidad (lo que se compara en las pruebas).
const IDENTITY_FIELDS = ["showName", "movieTitle", "episodeName", "season", "episode", "contentId", "absoluteEpisode", "seasonEpisodeIndex"];

function identity(signal) {
  const out = {};
  for (const key of IDENTITY_FIELDS) {
    if (signal?.[key] != null && signal[key] !== "") out[key] = signal[key];
  }
  return out;
}

module.exports = { toFake, captureToDoc, replaySignal, identity, IDENTITY_FIELDS };

if (require.main === module) {
  const fs = require("node:fs");
  const file = process.argv[2];
  if (!file) {
    console.error("Uso: node netflix-extension/diagnostic-replay.js <captura.json>");
    process.exit(1);
  }
  const capture = JSON.parse(fs.readFileSync(file, "utf8"));
  const replayed = identity(replaySignal(capture));
  // Sin reproducción, lo que se envió fue la señal de la FICHA (content.js →
  // detectBrowsingSignal), que no se reproduce aquí.
  const playing = Boolean(capture?.detection?.signal);
  const captured = identity(playing ? capture.detection.signal : capture?.detection?.browse);
  console.log(`${capture?.platform?.name || "?"} · ${capture?.page?.url || ""}`);
  console.log(playing ? "Detectado en el navegador (reproducción):" : "Detectado en el navegador (ficha):", captured);
  console.log("Detectado con el código actual:", replayed);
  if (capture?.detection?.lastResolve) console.log("Respuesta del servidor:", capture.detection.lastResolve);
  if (capture?.expected) console.log("Esperado:", capture.expected);
}
