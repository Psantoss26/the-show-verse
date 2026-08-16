import assert from "node:assert/strict";
import test from "node:test";

import {
  CAST_ROW_SIX_CARDS_PX,
  DRAWER_MAX_VIEWPORT_SHARE,
  DRAWER_MIN_PX,
  DRAWER_MIN_TRAVEL_PX,
  MODAL_CONTENT_PADDING_PX,
  SCOREBOARD_MIN_CONTENT_PX,
  clampDrawerWidth,
} from "./detailModalSizing.js";

// Ancho que le queda al contenido dentro de un cajón de `w` px.
const contenido = (w) => w - MODAL_CONTENT_PADDING_PX;

// Ventanas en las que el mínimo cabe de verdad. Por debajo manda el techo de
// pantalla y no hay nada que garantizar (ver el test correspondiente).
const VENTANAS = [1280, 1366, 1440, 1600, 1792, 1920, 2200, 2541];

test("el mínimo respeta LAS DOS restricciones", () => {
  // 1) El scoreboard: por debajo de 780px de contenido, las puntuaciones y los
  //    iconos de enlaces se solapan (medido sobre el modal real).
  assert.ok(contenido(DRAWER_MIN_PX) >= SCOREBOARD_MIN_CONTENT_PX);
  // 2) La fila de Reparto: su Swiper baja de 6 a 5 tarjetas por debajo de 840px
  //    de contenedor, y redimensionar no debe reorganizarla.
  assert.ok(contenido(DRAWER_MIN_PX) >= CAST_ROW_SIX_CARDS_PX);

  // Hoy manda el Reparto; el total son 896px.
  assert.equal(DRAWER_MIN_PX, 896);
});

test("el mínimo se deriva, no se escribe a mano", () => {
  // Escrito como el MAYOR de las dos exigencias: si mañana el scoreboard crece
  // y adelanta al Reparto, el mínimo sube solo en vez de quedarse corto.
  assert.equal(
    DRAWER_MIN_PX,
    Math.max(SCOREBOARD_MIN_CONTENT_PX + 44, CAST_ROW_SIX_CARDS_PX) +
      MODAL_CONTENT_PADDING_PX,
  );
});

test("por estrecho que se arrastre, Reparto mantiene sus 6 tarjetas", () => {
  for (const vw of VENTANAS) {
    const masEstrecho = clampDrawerWidth(0, vw);
    assert.equal(masEstrecho, DRAWER_MIN_PX, `ventana de ${vw}px`);
    assert.ok(
      contenido(masEstrecho) >= CAST_ROW_SIX_CARDS_PX,
      `a ${vw}px la fila de Reparto bajaría a 5 tarjetas`,
    );
    assert.ok(
      contenido(masEstrecho) >= SCOREBOARD_MIN_CONTENT_PX,
      `a ${vw}px el scoreboard se solaparía`,
    );
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
  // A 2541px el rango es 896 .. 1271.
  assert.equal(clampDrawerWidth(1000, 2541), 1000);
  assert.equal(clampDrawerWidth(1271, 2541), 1271);
  // Fuera de rango, se acota por ambos lados.
  assert.equal(clampDrawerWidth(700, 2541), DRAWER_MIN_PX);
  assert.equal(clampDrawerWidth(9999, 2541), 1271);
});
