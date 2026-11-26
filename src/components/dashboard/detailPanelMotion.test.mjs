import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  DRAWER_TO_DETAILS_REVEAL_MIN_MS,
  DRAWER_TO_DETAILS_FADE_MS,
  captureCloneScroll,
  detailsContentReady,
  markDetailsEntered,
  settleCloneAnimations,
} from "./detailPanelMotion.js";

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

// Documento simulado: solo lo que mira `detailsContentReady`.
const node = (attrs, { visible = true } = {}) => ({
  getAttribute: (name) => (name in attrs ? String(attrs[name]) : null),
  getClientRects: () => (visible ? [{}] : []),
});
const doc = (pathname, nodes) => ({
  location: { pathname, origin: "https://x.test" },
  querySelectorAll: (selector) =>
    nodes.filter((n) =>
      selector.includes("[aria-busy") ? n.getAttribute("aria-busy") === "true" : true,
    ),
});

const HREF = "/details/movie/42";

test("no está lista mientras la URL no es la de la ficha", () => {
  assert.equal(detailsContentReady(doc("/favorites", []), HREF), false);
});

test("la pantalla de carga negra (loading.jsx) no cuenta como ficha", () => {
  const loading = node({ "data-details-root": "", "aria-busy": "true" });
  assert.equal(detailsContentReady(doc(HREF, [loading]), HREF), false);
});

test("espera a que la ficha tenga su imagen principal", () => {
  const root = node({ "data-details-root": "", "data-details-sequence-ready": "false" });
  assert.equal(detailsContentReady(doc(HREF, [root]), HREF), false);
  const ready = node({ "data-details-root": "", "data-details-sequence-ready": "true" });
  assert.equal(detailsContentReady(doc(HREF, [ready]), HREF), true);
});

test("las pantallas ocultas de la pila no bloquean", () => {
  const hiddenLoading = node({ "data-details-root": "", "aria-busy": "true" }, { visible: false });
  const ready = node({ "data-details-root": "", "data-details-sequence-ready": "true" });
  assert.equal(detailsContentReady(doc(HREF, [hiddenLoading, ready]), HREF), true);
});

test("sin ninguna ficha visible aún no está lista", () => {
  assert.equal(detailsContentReady(doc(HREF, []), HREF), false);
});

test("el relevo del drawer es más corto que el de antes (500 ms de suelo)", () => {
  assert.ok(DRAWER_TO_DETAILS_REVEAL_MIN_MS <= 260);
  assert.ok(DRAWER_TO_DETAILS_FADE_MS <= 280);
});

test("marca como ya entrada solo la ficha visible del destino", () => {
  const visible = node({ "data-details-root": "", "data-details-href": HREF });
  const hidden = node({ "data-details-root": "", "data-details-href": HREF }, { visible: false });
  const other = node({ "data-details-root": "", "data-details-href": "/details/tv/7" });
  const set = [];
  for (const n of [visible, hidden, other]) n.setAttribute = (k) => set.push([n, k]);
  markDetailsEntered({ querySelectorAll: () => [visible, hidden, other] }, HREF);
  assert.deepEqual(set, [[visible, "data-details-sequence-entered"]]);
});

test("el velo del drawer es el fondo que pintará la ficha, no el del panel", () => {
  const css = read("app/globals.css");
  const block = css.slice(css.indexOf(".sv-detail-route-transition--art"));
  assert.match(block, /sv-detail-route-transition__art/);
  assert.match(block, /is-art-pending/);
  const modal = read("components/dashboard/DetailModal.jsx");
  const go = modal.slice(modal.indexOf("const goToDetailsRoute"), modal.indexOf("const goToFullDetails"));
  // Fondo elegido por el precalentamiento (el mismo que usa DetailsClient al
  // llegar con la marca), y la ficha entra ya lista con `markDetailsArrival`.
  assert.match(go, /warmDetailsSequenceTarget\(href\)/);
  assert.match(go, /getWarmedSequenceBackdrop\(href\)/);
  assert.match(go, /markDetailsArrival\(\)/);
  assert.match(go, /waitForDetailsContent\(href\)/);
  assert.match(go, /markDetailsEntered\(document, href\)/);
  // El arte del panel solo es el último recurso (precalentamiento sin fondo).
  assert.ok(go.indexOf("getWarmedSequenceBackdrop(href)") < go.indexOf("heroBackdropSrc"));
  // Y se precalienta al abrir el panel, no al pulsar.
  assert.match(modal, /if \(isRightPlacement\) warmDetailsSequenceTarget\(dashboardDetailHref/);
});

// Relevo drawer → ficha a tirones: la ampliación del clon corría en el hilo
// principal (Chrome no compone un `filter: blur` animado) y se congelaba
// mientras React montaba la ficha. Solo transform y opacity.
test("la ampliación del clon del drawer solo anima propiedades del compositor", () => {
  const css = read("app/globals.css");
  const start = css.indexOf("@keyframes sv-detail-route-panel-zoom");
  const keyframes = css.slice(start, css.indexOf("@media", start));
  assert.ok(start > 0);
  assert.doesNotMatch(keyframes, /filter/);
  assert.match(keyframes, /transform/);
  assert.match(keyframes, /opacity/);
});

const el = (props = {}, children = []) => ({
  scrollTop: 0,
  scrollLeft: 0,
  ...props,
  querySelectorAll: () => children,
});

test("el clon conserva el desplazamiento del panel (no salta arriba)", () => {
  const scroller = el({ scrollTop: 600 });
  const row = el({ scrollLeft: 120 });
  const source = el({}, [el(), scroller, row]);
  const cloneScroller = el();
  const cloneRow = el();
  const clone = el({}, [el(), cloneScroller, cloneRow]);
  captureCloneScroll(source, clone)();
  assert.equal(cloneScroller.scrollTop, 600);
  assert.equal(cloneRow.scrollLeft, 120);
});

test("las animaciones internas del clon quedan en su estado final, no se repiten", () => {
  const timeline = {};
  const finished = [];
  const entry = { timeline, finish: () => finished.push("entry") };
  const scrollDriven = { timeline: {}, finish: () => finished.push("scroll") };
  const infinite = { timeline, finish: () => { throw new Error("infinite"); } };
  settleCloneAnimations({ getAnimations: () => [entry, scrollDriven, infinite] }, timeline);
  assert.deepEqual(finished, ["entry"]);
});

test("la marca global de llegada no se pone en el fotograma del clic", () => {
  const modal = read("components/dashboard/DetailModal.jsx");
  const go = modal.slice(modal.indexOf("const goToDetailsRoute"), modal.indexOf("const goToFullDetails"));
  // `markDetailsArrival` recalcula los estilos del documento entero: tras el
  // primer fotograma del relevo, no antes.
  assert.ok(go.indexOf("await nextAnimationFrame()") < go.indexOf("markDetailsArrival()"));
});
