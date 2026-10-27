/* eslint @typescript-eslint/no-require-imports: "off" -- Buildless extension modules also run in CommonJS tests. */
// fake-dom.js — DOM mínimo para las PRUEBAS. No se empaqueta en la extensión
// (manifest.json enumera los scripts uno a uno) ni lo carga ningún content script.
//
// POR QUÉ EXISTE. La detección real lee el DOM del reproductor de cada plataforma,
// y sin un árbol de verdad las pruebas solo podían comprobar funciones sueltas con
// objetos falsos hechos a medida de cada caso — que es justo lo que dejó pasar
// fallos como el del título de Netflix, cuyos hermanos se concatenan sin espacios.
// Con esto se puede reproducir el DOM de cada reproductor y comprobar la señal
// completa de punta a punta.
//
// Soporta el subconjunto de CSS que usan detection-core.js y platform-enhancers.js:
// nombre de etiqueta, `.clase`, `[attr]`, `[attr="v"]`, `[attr*="v"]`, varios
// selectores separados por comas y descendencia separada por espacios.
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.TSVFakeDom = api;
})(typeof self !== "undefined" ? self : this, function () {
  // Admite la marca « i» (sin distinguir mayúsculas), como el DOM real.
  const ATTR_RE = /\[([\w:-]+)(?:([*^$|~]?=)"([^"]*)"(\s+[iI])?)?\]/g;

  function parseSimple(part) {
    const attrs = [];
    let rest = part.replace(ATTR_RE, (_m, name, op, value, flag) => {
      attrs.push({ name, op: op || null, value: value ?? null, insensitive: Boolean(flag) });
      return "";
    });
    const classes = [];
    rest = rest.replace(/\.([\w-]+)/g, (_m, c) => {
      classes.push(c);
      return "";
    });
    const id = (rest.match(/#([\w-]+)/) || [])[1] || null;
    rest = rest.replace(/#[\w-]+/g, "");
    const tag = rest.trim().toLowerCase();
    return { tag: tag && tag !== "*" ? tag : null, classes, attrs, id };
  }

  function matchesSimple(node, simple) {
    if (simple.tag && node.tagName.toLowerCase() !== simple.tag) return false;
    if (simple.id && node.getAttribute("id") !== simple.id) return false;
    const classList = String(node.getAttribute("class") || "").split(/\s+/);
    for (const c of simple.classes) if (!classList.includes(c)) return false;
    for (const a of simple.attrs) {
      let actual = node.getAttribute(a.name);
      if (actual == null) return false;
      if (!a.op) continue;
      if (a.insensitive) {
        actual = actual.toLowerCase();
        a.value = String(a.value).toLowerCase();
      }
      if (a.op === "=" && actual !== a.value) return false;
      if (a.op === "*=" && !actual.includes(a.value)) return false;
      if (a.op === "^=" && !actual.startsWith(a.value)) return false;
      if (a.op === "$=" && !actual.endsWith(a.value)) return false;
    }
    return true;
  }

  // ¿`node` cumple la cadena de descendencia completa (el último selector es el
  // propio nodo y los anteriores, antepasados en orden)?
  function matchesChain(node, chain) {
    if (!matchesSimple(node, chain[chain.length - 1])) return false;
    let index = chain.length - 2;
    let current = node.parentNode;
    while (index >= 0 && current) {
      if (matchesSimple(current, chain[index])) index -= 1;
      current = current.parentNode;
    }
    return index < 0;
  }

  // Separa por espacios (descendencia) salvo dentro de [ ]: `[class*="title" i]`
  // es UN selector simple.
  function splitChain(group) {
    const parts = [];
    let current = "";
    let depth = 0;
    for (const ch of group.trim()) {
      if (ch === "[") depth += 1;
      if (ch === "]") depth -= 1;
      if (/\s/.test(ch) && depth === 0) {
        if (current) parts.push(current);
        current = "";
      } else {
        current += ch;
      }
    }
    if (current) parts.push(current);
    return parts;
  }

  function parseSelector(selector) {
    return String(selector)
      .split(",")
      .map((group) => splitChain(group).map(parseSimple))
      .filter((chain) => chain.length > 0);
  }

  // Los «#text» (textos sueltos de una captura de diagnóstico) no son elementos:
  // ningún selector los devuelve, igual que en el DOM real.
  function descendants(node, out) {
    for (const child of node.children) {
      if (child.tagName !== "#TEXT") out.push(child);
      descendants(child, out);
    }
    return out;
  }

  class FakeElement {
    constructor(tagName, attrs, childrenOrText) {
      this.tagName = String(tagName).toUpperCase();
      this._attrs = { ...(attrs || {}) };
      this.children = [];
      this.parentNode = null;
      this._text = "";
      if (typeof childrenOrText === "string") this._text = childrenOrText;
      else for (const child of childrenOrText || []) this.append(child);
    }

    append(child) {
      child.parentNode = this;
      this.children.push(child);
      return this;
    }

    getAttribute(name) {
      const value = this._attrs[name];
      return value == null ? null : String(value);
    }

    // Lo mínimo del DOM real que recorre diagnostic-capture.js.
    get nodeType() {
      return this.tagName === "#TEXT" ? 3 : 1;
    }

    get nodeValue() {
      return this.tagName === "#TEXT" ? this._text : null;
    }

    get childNodes() {
      if (this.children.length || !this._text) return this.children;
      return [{ nodeType: 3, nodeValue: this._text }];
    }

    get attributes() {
      return Object.entries(this._attrs)
        .filter(([, value]) => value != null && value !== false)
        .map(([name, value]) => ({ name, value: value === true ? "" : String(value) }));
    }

    // Concatena sin separador, igual que el DOM real: es precisamente lo que
    // obliga a los lectores a insertar espacios entre hermanos.
    get textContent() {
      if (!this.children.length) return this._text;
      return this.children.map((c) => c.textContent).join("");
    }

    get innerText() {
      return this.textContent;
    }

    get content() {
      return this.getAttribute("content");
    }

    getClientRects() {
      return this._attrs.hidden ? [] : [{ width: 400, height: 40 }];
    }

    getBoundingClientRect() {
      return { width: 400, height: 40, top: 80, left: 0 };
    }

    querySelectorAll(selector) {
      const chains = parseSelector(selector);
      return descendants(this, []).filter((node) =>
        chains.some((chain) => matchesChain(node, chain)),
      );
    }

    querySelector(selector) {
      return this.querySelectorAll(selector)[0] || null;
    }
  }

  /** `h("div", {"data-uia": "x"}, [...])` o `h("span", null, "texto")`. */
  function h(tag, attrs, childrenOrText) {
    return new FakeElement(tag, attrs, childrenOrText);
  }

  /** Documento con `title` y un `<body>` con los nodos dados. */
  function doc(title, nodes) {
    const root = new FakeElement("html", null, nodes || []);
    root.title = title || "";
    return root;
  }

  return { h, doc, FakeElement };
});
