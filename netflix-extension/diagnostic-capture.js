/* eslint @typescript-eslint/no-require-imports: "off" -- Buildless extension modules also run in CommonJS tests. */
// diagnostic-capture.js — Captura de diagnóstico de lo que lee la detección.
//
// Para arreglar la detección de una plataforma hace falta ver lo que publica de
// verdad su reproductor. Desde la ventana de la extensión («Capturar diagnóstico»)
// se guarda un JSON con lo que lee content.js en la pestaña: la URL, el título de
// la pestaña, la Media Session, el JSON-LD, las metas públicas, el <video> y el
// DOM con texto. Ese DOM va en un formato que fake-dom.js rehace tal cual
// (diagnostic-replay.js), así que cada captura se convierte en una prueba que
// ejecuta la misma cadena de detección que el navegador.
//
// NO se guardan cookies, almacenamiento, tokens ni parámetros de URL que no estén
// en la lista blanca; de las metas, solo las públicas (og:, twitter:, apple:…);
// de los scripts, solo el JSON-LD. Aun así el DOM lleva texto de la página (p. ej.
// el nombre del perfil): la ventana lo avisa antes de compartir el fichero.
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.TSVDiagnostic = api;
})(typeof self !== "undefined" ? self : this, function () {
  const CAPTURE_VERSION = 1;
  const MAX_NODES = 5000;
  const MAX_DEPTH = 60;
  const MAX_TEXT = 300;
  const MAX_ATTR = 200;
  const MAX_JSON_LD = 20000;

  // Parámetros de URL que identifican el contenido (el resto puede llevar ids de
  // sesión o de seguimiento y se sustituye por «…»).
  const URL_PARAM_ALLOW = new Set(["gti", "key", "autoplay", "t", "episode", "season", "trackId", "jbv", "content_type", "content_id", "id", "tipo"]);

  // Atributos que sirven para leer el título: clases, ids, roles, etiquetas
  // accesibles y data-* (data-uia, data-testid…). Nada de src, style ni eventos.
  const ATTR_ALLOW = new Set(["class", "id", "role", "aria-label", "aria-hidden", "title", "alt", "lang", "datetime", "type", "property", "name", "content", "href"]);

  // <picture> NO: dentro va el <img> con el alt del logo-título (Apple TV+, Prime).
  const SKIP_TAGS = new Set(["style", "noscript", "svg", "path", "link", "template", "canvas", "iframe", "source", "track"]);

  // Metas públicas que leen la detección o que ayudan a diagnosticar.
  const META_RE = /^(og:|twitter:|apple:|video:|al:|title$|description$)/i;

  const cut = (value, max) => {
    const text = String(value == null ? "" : value);
    return text.length > max ? `${text.slice(0, max)}…` : text;
  };

  /** URL sin datos de sesión: origen y ruta, y solo los parámetros de la lista blanca. */
  function sanitizeUrl(href) {
    try {
      const url = new URL(String(href));
      const params = [];
      for (const [key, value] of url.searchParams) {
        params.push(`${encodeURIComponent(key)}=${URL_PARAM_ALLOW.has(key) ? encodeURIComponent(cut(value, 120)) : "…"}`);
      }
      return `${url.origin}${url.pathname}${params.length ? `?${params.join("&")}` : ""}`;
    } catch {
      return "";
    }
  }

  function sanitizeAttr(name, value) {
    if (name === "href") {
      try {
        const url = new URL(String(value), "https://x.invalid");
        return url.pathname;
      } catch {
        return "";
      }
    }
    return cut(value, MAX_ATTR);
  }

  function isVisible(el) {
    try {
      return typeof el.getClientRects !== "function" || el.getClientRects().length > 0;
    } catch {
      return true;
    }
  }

  /**
   * Árbol serializable del DOM: { t: etiqueta, a: atributos, c: hijos } para los
   * elementos y { x: texto } para los textos. Se descartan las ramas sin texto ni
   * etiquetas accesibles. `stats.truncated` avisa si se llegó a algún límite.
   */
  // Candidatos a título de una ficha (los mismos que mira browse-detection.js):
  // de ellos se guarda su medida para reproducir la elección del encabezado.
  const isTitleCandidate = (tag, attrs) =>
    tag === "h1" || tag === "h2" || /title/i.test(`${attrs.class || ""} ${attrs["data-testid"] || ""}`);

  function serializeDom(rootEl, { maxNodes = MAX_NODES, shadow = true, measure = null } = {}) {
    const stats = { nodes: 0, truncated: false };

    const walk = (node, depth) => {
      if (!node) return null;
      if (node.nodeType === 3) {
        const text = String(node.nodeValue || "").replace(/\s+/g, " ").trim();
        return text ? { x: cut(text, MAX_TEXT) } : null;
      }
      if (node.nodeType !== 1) return null;
      if (stats.nodes >= maxNodes || depth > MAX_DEPTH) {
        stats.truncated = true;
        return null;
      }
      const tag = String(node.tagName || "").toLowerCase();
      if (!tag || SKIP_TAGS.has(tag)) return null;

      const attrs = {};
      for (const attr of Array.from(node.attributes || [])) {
        const name = String(attr.name || "").toLowerCase();
        if (ATTR_ALLOW.has(name) || name.startsWith("data-")) attrs[name] = sanitizeAttr(name, attr.value);
      }

      if (tag === "script") {
        if (String(attrs.type || "").toLowerCase() !== "application/ld+json") return null;
        stats.nodes += 1;
        return { t: tag, a: { type: "application/ld+json" }, c: [{ x: cut(node.textContent, MAX_JSON_LD) }] };
      }
      if (tag === "meta") {
        const key = attrs.property || attrs.name || "";
        if (!META_RE.test(key)) return null;
        stats.nodes += 1;
        return { t: tag, a: { ...(attrs.property ? { property: attrs.property } : { name: attrs.name }), content: attrs.content || "" } };
      }
      if (tag === "video") {
        stats.nodes += 1;
        return { t: tag, a: attrs, c: [] };
      }

      stats.nodes += 1;
      // Marca propia (no el atributo `hidden` de la página): sin cajas visibles.
      if (!isVisible(node)) attrs["data-tsv-hidden"] = "1";
      else if (measure && isTitleCandidate(tag, attrs)) {
        try {
          const m = measure(node);
          attrs["data-tsv-top"] = String(Math.round(m.top));
          attrs["data-tsv-w"] = String(Math.round(m.width));
          attrs["data-tsv-h"] = String(Math.round(m.height));
          attrs["data-tsv-fs"] = String(Math.round(m.fontSize * 10) / 10);
        } catch {
          /* sin medida: la reproducción usa la de fake-dom */
        }
      }
      const children = [];
      for (const child of Array.from(node.childNodes || [])) {
        const out = walk(child, depth + 1);
        if (out) children.push(out);
      }
      // El contenido de un shadow root abierto (Disney+) va aparte: el DOM real no
      // lo devuelve en querySelectorAll, así que la reproducción no lo mezcla.
      if (shadow && node.shadowRoot) {
        const shadowChildren = [];
        for (const child of Array.from(node.shadowRoot.childNodes || [])) {
          const out = walk(child, depth + 1);
          if (out) shadowChildren.push(out);
        }
        if (shadowChildren.length) children.push({ t: "#shadow-root", a: {}, c: shadowChildren });
      }

      const useful = children.length > 0 || attrs["aria-label"] || attrs.alt || attrs.title
        || tag === "img" || tag === "h1" || tag === "h2" || tag === "h3" || tag === "h4";
      if (!useful) {
        stats.nodes -= 1;
        return null;
      }
      return { t: tag, a: attrs, c: children };
    };

    const tree = walk(rootEl, 0);
    return { tree, nodes: stats.nodes, truncated: stats.truncated };
  }

  /** Datos del <video> sin su origen (blob:/URL firmadas). */
  function describeVideo(video) {
    if (!video) return null;
    const num = (value) => (Number.isFinite(Number(value)) ? Math.round(Number(value) * 10) / 10 : null);
    return {
      currentTime: num(video.currentTime),
      duration: num(video.duration),
      paused: Boolean(video.paused),
      ended: Boolean(video.ended),
      width: num(video.clientWidth),
      height: num(video.clientHeight),
      readyState: num(video.readyState),
    };
  }

  return { CAPTURE_VERSION, sanitizeUrl, serializeDom, describeVideo };
});
