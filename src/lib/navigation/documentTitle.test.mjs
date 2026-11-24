import assert from "node:assert/strict";
import test from "node:test";

import { createTitleRegistry } from "./documentTitle.js";

// Documento mínimo: un <head> con hijos y `title` = texto del primer <title>,
// como en el navegador.
function fakeDocument() {
  const head = {
    children: [],
    insertBefore(node, ref) {
      this.removeChild(node);
      const at = ref ? this.children.indexOf(ref) : -1;
      if (at < 0) this.children.push(node);
      else this.children.splice(at, 0, node);
      node.parentNode = this;
    },
    removeChild(node) {
      const at = this.children.indexOf(node);
      if (at >= 0) this.children.splice(at, 1);
      node.parentNode = null;
    },
    querySelector(selector) {
      if (selector !== "title") throw new Error(`selector no simulado: ${selector}`);
      return this.children.find((node) => node.tagName === "TITLE") || null;
    },
  };
  const doc = {
    head,
    createElement(tag) {
      return { tagName: tag.toUpperCase(), textContent: "", parentNode: null, attrs: {}, setAttribute(k, v) { this.attrs[k] = v; } };
    },
    get title() {
      return head.querySelector("title")?.textContent ?? "";
    },
  };
  return doc;
}

function withNextTitle(text) {
  const doc = fakeDocument();
  const nextTitle = doc.createElement("title");
  nextTitle.textContent = text;
  doc.head.insertBefore(nextTitle, null);
  return { doc, nextTitle };
}

test("sin títulos registrados manda el <title> de Next", () => {
  const { doc } = withNextTitle("Inicio • TSV");
  const registry = createTitleRegistry(() => doc);
  registry.apply();
  assert.equal(doc.title, "Inicio • TSV");
});

test("un título registrado se impone sin tocar el <title> de Next y se retira al limpiar", () => {
  const { doc, nextTitle } = withNextTitle("Calendario • TSV");
  const registry = createTitleRegistry(() => doc);

  const release = registry.register("Juego de tronos • TSV");
  assert.equal(doc.title, "Juego de tronos • TSV");
  assert.equal(nextTitle.textContent, "Calendario • TSV");

  release();
  assert.equal(doc.title, "Calendario • TSV");
  assert.equal(doc.head.children.length, 1);
});

test("caso del bug: el título de una página no se queda al ir a otra cuyo <title> de Next no cambia", () => {
  const { doc, nextTitle } = withNextTitle("TSV");
  const registry = createTitleRegistry(() => doc);

  const releaseLists = registry.register("Listas • TSV");
  assert.equal(doc.title, "Listas • TSV");

  // Se navega a una página sin título propio: React no toca el nodo de Next
  // (su texto ya era «TSV») y la página anterior se desmonta.
  releaseLists();
  assert.equal(nextTitle.textContent, "TSV");
  assert.equal(doc.title, "TSV");
});

test("manda el último registrado y al irse vuelve el anterior (pantallas apiladas)", () => {
  const { doc } = withNextTitle("TSV");
  const registry = createTitleRegistry(() => doc);

  const releasePage = registry.register("Calendario • TSV");
  const releaseOverlay = registry.register("Matrix • TSV");
  assert.equal(doc.title, "Matrix • TSV");

  releaseOverlay();
  assert.equal(doc.title, "Calendario • TSV");

  // Al revelarse otra vez la ficha (<Activity> repite sus efectos) vuelve a mandar.
  const releaseAgain = registry.register("Matrix • TSV");
  assert.equal(doc.title, "Matrix • TSV");
  releaseAgain();
  releasePage();
  assert.equal(doc.title, "TSV");
});

test("si Next inserta un <title> nuevo delante, apply() recupera el primer puesto", () => {
  const { doc } = withNextTitle("TSV");
  const registry = createTitleRegistry(() => doc);
  registry.register("Listas • TSV");

  const streamed = doc.createElement("title");
  streamed.textContent = "Otra • TSV";
  doc.head.insertBefore(streamed, doc.head.querySelector("title"));
  assert.equal(doc.title, "Otra • TSV");

  registry.apply();
  assert.equal(doc.title, "Listas • TSV");
});

test("liberar dos veces no quita otro título", () => {
  const { doc } = withNextTitle("TSV");
  const registry = createTitleRegistry(() => doc);
  const releaseA = registry.register("A • TSV");
  registry.register("B • TSV");
  releaseA();
  releaseA();
  assert.equal(doc.title, "B • TSV");
});

test("títulos vacíos no se registran", () => {
  const { doc } = withNextTitle("TSV");
  const registry = createTitleRegistry(() => doc);
  const release = registry.register("   ");
  assert.equal(doc.title, "TSV");
  release();
});
