import assert from "node:assert/strict";
import test from "node:test";

import {
  CAST_ROW_SIX_CARDS_PX,
  DRAWER_MAX_VIEWPORT_SHARE,
  DRAWER_MIN_PX,
  DRAWER_MIN_TRAVEL_PX,
  MODAL_CONTENT_PADDING_PX,
  SCOREBOARD_COMPACT_MIN_CONTENT_PX,
  SCOREBOARD_MIN_CONTENT_PX,
  clampDrawerWidth,
} from "./detailModalSizing.js";

// Ancho que le queda al contenido dentro de un cajón de `w` px.
const contenido = (w) => w - MODAL_CONTENT_PADDING_PX;

// Ventanas en las que el mínimo cabe de verdad. Por debajo manda el techo de
// pantalla y no hay nada que garantizar (ver el test correspondiente).
const VENTANAS = [1280, 1366, 1440, 1600, 1792, 1920, 2200, 2541];

test("el mínimo es el de la barra YA COMPACTADA", () => {
  // El panel sabe ceder por partes: al estrecharse, primero los botones de
  // plataformas, enlaces y compartir pierden su etiqueta, y después se retiran
  // Rotten Tomatoes y Metacritic. El suelo es lo que ocupa el resultado de eso,
  // no la barra completa.
  assert.equal(contenido(DRAWER_MIN_PX), SCOREBOARD_COMPACT_MIN_CONTENT_PX);
  assert.equal(DRAWER_MIN_PX, 534);

  // Y queda MUY por debajo de los dos umbrales que antes lo fijaban: ese es el
  // margen de estrechamiento que se ha ganado.
  assert.ok(contenido(DRAWER_MIN_PX) < SCOREBOARD_MIN_CONTENT_PX);
  assert.ok(contenido(DRAWER_MIN_PX) < CAST_ROW_SIX_CARDS_PX);
});

test("el mínimo se deriva, no se escribe a mano", () => {
  assert.equal(
    DRAWER_MIN_PX,
    SCOREBOARD_COMPACT_MIN_CONTENT_PX + MODAL_CONTENT_PADDING_PX,
  );
});

test("estrecharse reorganiza, no rompe", () => {
  // Los dos umbrales de antes siguen documentados porque siguen siendo ciertos
  // —por debajo de ellos la barra suelta lo prescindible y el Reparto pasa a
  // menos tarjetas—, pero ya no impiden arrastrar. Cruzarlos es el
  // comportamiento buscado, no un fallo.
  for (const vw of VENTANAS) {
    const masEstrecho = clampDrawerWidth(0, vw);
    assert.equal(masEstrecho, DRAWER_MIN_PX, `ventana de ${vw}px`);
  }
});

test("el tirador conserva recorrido: un rango de cero es un control muerto", () => {
  // Es el fallo por el que en su día se bajó el mínimo a 560: con el tope en
  // medio viewport, el mínimo lo alcanzaba y arrastrar no hacía nada.
  for (const vw of [1366, 1440, 1600, 1792, 1920, 2200, 2541]) {
    const rango = clampDrawerWidth(99999, vw) - clampDrawerWidth(0, vw);
    assert.ok(rango > 0, `a ${vw}px el tirador no se movería`);
  }
  // Y donde la pantalla da de sí, el recorrido es holgado.
  for (const vw of [1600, 1792, 1920]) {
    const rango = clampDrawerWidth(99999, vw) - clampDrawerWidth(0, vw);
    assert.ok(rango >= DRAWER_MIN_TRAVEL_PX, `a ${vw}px solo hay ${rango}px`);
  }
});

test("en pantallas anchas sigue mandando medio viewport", () => {
  assert.equal(clampDrawerWidth(99999, 2200), 1100);
  assert.equal(clampDrawerWidth(99999, 2560), 1280);
});

test("el rescate no se come la pantalla en ventanas pequeñas", () => {
  for (const vw of [900, 1024, 1152, 1280]) {
    const ancho = clampDrawerWidth(99999, vw);
    assert.ok(
      ancho <= Math.round(vw * DRAWER_MAX_VIEWPORT_SHARE),
      `a ${vw}px el cajón (${ancho}) supera el techo de pantalla`,
    );
  }
});

test("se respeta el ancho pedido cuando está dentro del rango", () => {
  // A 2541px el rango es 534 .. 1271.
  assert.equal(clampDrawerWidth(1000, 2541), 1000);
  assert.equal(clampDrawerWidth(1271, 2541), 1271);
  // 700px estaba FUERA de rango con el mínimo anterior y ahora es un ancho
  // válido: es exactamente lo que se ha abierto.
  assert.equal(clampDrawerWidth(700, 2541), 700);
  // Fuera de rango, se sigue acotando por ambos lados.
  assert.equal(clampDrawerWidth(300, 2541), DRAWER_MIN_PX);
  assert.equal(clampDrawerWidth(9999, 2541), 1271);
});

test("la tablet no se queda como la menos capaz de estrecharse", () => {
  // Tenía un mínimo propio de 560px, escrito cuando el de escritorio eran 896 y
  // en una tablet el cajón nacía bloqueado. Ahora que el general baja de esa
  // cifra, ese atajo la dejaría por encima de escritorio.
  for (const viewport of [768, 820, 1024, 1180, 1366]) {
    const min = clampDrawerWidth(0, viewport, { tablet: true });
    assert.ok(min <= DRAWER_MIN_PX, `a ${viewport}px el mínimo es ${min}`);
  }
});

test("la ficha móvil acoplada mantiene viewport móvil y espacio para la página", async () => {
  const { clampMobileDetailsWidth } = await import("./detailModalSizing.js");
  for (const viewport of [768, 820, 1024, 1180, 1366]) {
    const min = clampMobileDetailsWidth(0, viewport);
    const max = clampMobileDetailsWidth(10000, viewport);
    assert.ok(min >= 320);
    assert.ok(max < 640);
    assert.ok(viewport - max >= viewport * 0.4);
    assert.ok(max > min);
    assert.equal(clampMobileDetailsWidth(400, viewport), 400);
  }
});


test("la proporción móvil cabe en ambas orientaciones incluso con un ancho guardado excesivo", async () => {
  const { clampMobileDetailsWidth, MOBILE_DETAILS_ASPECT_RATIO: ratio } = await import("./detailModalSizing.js");
  for (const [viewportWidth, viewportHeight] of [[1024, 768], [768, 1024], [1180, 820], [820, 1180], [1366, 1024]]) {
    for (const requested of [0, 320, 400, 10000, undefined]) {
      const width = clampMobileDetailsWidth(requested, viewportWidth, viewportHeight);
      const height = width / ratio;
      assert.ok(height <= viewportHeight);
      assert.ok(width < 640);
      assert.ok(width <= viewportWidth * 0.6);
      assert.ok(width >= Math.min(320, Math.floor(viewportHeight * ratio)));
    }
  }
  assert.equal(clampMobileDetailsWidth(undefined, 1024, 768), 354);
});


test("DetailModal conserva al menos 120px de arrastre en tablets pequeñas y grandes", () => {
  for (const viewport of [768, 800, 820, 1024, 1180, 1366]) {
    const min = clampDrawerWidth(0, viewport, { tablet: true });
    const max = clampDrawerWidth(10000, viewport, { tablet: true });
    assert.ok(max - min >= DRAWER_MIN_TRAVEL_PX);
    assert.ok(min >= 320);
    assert.ok(max <= Math.round(viewport * DRAWER_MAX_VIEWPORT_SHARE));
    const requested = min + 60;
    assert.equal(clampDrawerWidth(requested, viewport, { tablet: true }), requested);
  }
});
