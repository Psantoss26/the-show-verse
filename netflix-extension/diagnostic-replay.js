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
const B = require("./browse-detection.js");
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
  const filled = D.fillMissingTitles(signal, {
    doc: document,
    tabTitle: page.tabTitle || "",
    platformName: capture?.platform?.name || "",
  });
  return B.enrichPlaybackSignal(filled, replayBrowse(capture));
}

/**
 * La señal de FICHA que produce el código ACTUAL con lo que vio el navegador
 * (browse-detection.js), con la medida de cada candidato a título guardada en la
 * captura.
 */
function replayBrowse(capture) {
  const page = capture?.page || {};
  const num = (node, name, fallback) => {
    const value = Number(node.getAttribute(name));
    return Number.isFinite(value) && node.getAttribute(name) != null ? value : fallback;
  };
  return B.detectBrowsingSignal({
    doc: captureToDoc(capture),
    href: page.url || "",
    platformId: capture?.platform?.id || "",
    platformName: capture?.platform?.name || "",
    viewportHeight: page.viewport?.height || 1080,
    measure: (node) => ({
      top: num(node, "data-tsv-top", 80),
      width: num(node, "data-tsv-w", 400),
      height: num(node, "data-tsv-h", 40),
      fontSize: num(node, "data-tsv-fs", 0),
    }),
  });
}

// Campos de la señal que deciden la identidad (lo que se compara en las pruebas).
const IDENTITY_FIELDS = ["mainTitle", "showName", "movieTitle", "episodeName", "season", "episode", "contentId", "absoluteEpisode", "seasonEpisodeIndex", "mediaTypeHint", "releaseYear"];

function identity(signal) {
  const out = {};
  for (const key of IDENTITY_FIELDS) {
    if (signal?.[key] != null && signal[key] !== "") out[key] = signal[key];
  }
  return out;
}

// Lo que lee la detección de una página: si una captura conserva estos nodos (y
// sus antepasados, con sus atributos), la reproducción da la misma señal.
function relevantSelectors(platformId) {
  const refiner = (E.REFINERS || []).flatMap((r) => [...(r.titleSel || []), ...(r.subSel || []), ...(r.seSel || [])]);
  return [
    'script[type="application/ld+json"]',
    "meta",
    "video",
    "h1, h2, [data-testid*=\"title\" i], [class*=\"title\" i]",
    '[id^="av-ep-episode-"]',
    ...(B.TITLE_SELECTORS[platformId] || []),
    ...refiner,
  ];
}

/**
 * Versión reducida de una captura para guardarla como prueba: solo los campos
 * que usa la reproducción y, del DOM, lo que lee la detección (resto de textos
 * fuera). Así no se guarda texto ajeno de la página que no hace falta.
 */
function slimCapture(capture, expected) {
  const page = capture?.page || {};
  const document = captureToDoc(capture);
  const keep = new Set();
  for (const selector of relevantSelectors(capture?.platform?.id)) {
    let nodes = [];
    try {
      nodes = document.querySelectorAll(selector);
    } catch {
      continue;
    }
    for (const node of nodes) {
      keep.add(node);
      const stack = [...node.children];
      while (stack.length) {
        const child = stack.pop();
        keep.add(child);
        stack.push(...child.children);
      }
      for (let up = node.parentNode; up; up = up.parentNode) keep.add(up);
    }
  }
  // fake-dom → árbol de la captura, solo con los nodos que se conservan. Un
  // antepasado conserva sus atributos pero no sus textos sueltos.
  const toTree = (node) => {
    if (node.tagName === "#TEXT") return keep.has(node.parentNode) && keepsText(node.parentNode) ? { x: node.textContent } : null;
    if (!keep.has(node)) return null;
    const attrs = { ...node._attrs };
    if (attrs.hidden === true) {
      delete attrs.hidden;
      attrs["data-tsv-hidden"] = "1";
    }
    const own = node.children.length ? node.children.map(toTree).filter(Boolean) : (keepsText(node) && node._text ? [{ x: node._text }] : []);
    return { t: node.tagName.toLowerCase(), a: attrs, c: own };
  };
  // Un nodo guarda su texto solo si es él mismo (o un descendiente) de lo leído.
  const leaves = new Set();
  for (const selector of relevantSelectors(capture?.platform?.id)) {
    try {
      for (const node of document.querySelectorAll(selector)) {
        const stack = [node];
        while (stack.length) {
          const n = stack.pop();
          leaves.add(n);
          stack.push(...n.children);
        }
      }
    } catch {
      /* selector no soportado */
    }
  }
  function keepsText(node) {
    return leaves.has(node);
  }
  const root = document.children[0];
  const out = {
    captureVersion: capture?.captureVersion,
    platform: capture?.platform,
    page: {
      host: page.host,
      url: page.url,
      tabTitle: page.tabTitle,
      mediaSession: page.mediaSession || null,
      video: page.video || null,
      viewport: page.viewport || null,
      dom: { tree: root ? toTree(root) : null },
    },
    detection: { browse: capture?.detection?.browse || null, signal: capture?.detection?.signal || null },
  };
  if (capture?.netflix?.metadata) out.netflix = { metadata: capture.netflix.metadata };
  if (expected) out.expected = expected;
  return out;
}

module.exports = { toFake, captureToDoc, replaySignal, replayBrowse, slimCapture, identity, IDENTITY_FIELDS };

if (require.main === module) {
  const fs = require("node:fs");
  const file = process.argv[2];
  if (!file) {
    console.error("Uso: node netflix-extension/diagnostic-replay.js <captura.json>");
    process.exit(1);
  }
  const capture = JSON.parse(fs.readFileSync(file, "utf8"));
  // Sin reproducción, lo que se envió fue la señal de la FICHA.
  const playing = Boolean(capture?.detection?.signal);
  const replayed = identity(playing ? replaySignal(capture) : replayBrowse(capture));
  const captured = identity(playing ? capture.detection.signal : capture?.detection?.browse);
  console.log(`${capture?.platform?.name || "?"} · ${capture?.page?.url || ""}`);
  console.log(playing ? "Detectado en el navegador (reproducción):" : "Detectado en el navegador (ficha):", captured);
  console.log("Detectado con el código actual:", replayed);
  if (capture?.detection?.lastResolve) console.log("Respuesta del servidor:", capture.detection.lastResolve);
  if (capture?.expected) console.log("Esperado:", capture.expected);
}
