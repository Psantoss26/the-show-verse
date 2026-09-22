import assert from "node:assert/strict";
import test from "node:test";

import {
  CAST_ROW_SIX_CARDS_PX,
  DRAWER_MAX_VIEWPORT_SHARE,
  DRAWER_MIN_PX,
  DRAWER_MIN_TRAVEL_PX,
  MODAL_CONTENT_PADDING_PX,
  DRAWER_TABLET_MIN_PX,
  SCOREBOARD_FIVE_SCORES_PX,
  SCOREBOARD_MIN_CONTENT_PX,
  SCOREBOARD_STATS_ONE_ROW_PX,
  clampDrawerWidth,
} from "./detailModalSizing.js";

// Ancho que le queda al contenido dentro de un cajón de `w` px.
const contenido = (w) => w - MODAL_CONTENT_PADDING_PX;

// Ventanas en las que el mínimo cabe de verdad. Por debajo manda el techo de
// pantalla y no hay nada que garantizar (ver el test correspondiente).
const VENTANAS = [1280, 1366, 1440, 1600, 1792, 1920, 2200, 2541];

test("en escritorio el arrastre se para ANTES de perder puntuaciones", () => {
  // Por debajo de 40rem de barra, el container query retira Rotten Tomatoes y
  // Metacritic. En escritorio hay sitio de sobra, así que esa degradación ni se
  // llega a ofrecer: el tope inferior queda justo encima del umbral.
  assert.equal(contenido(DRAWER_MIN_PX), SCOREBOARD_FIVE_SCORES_PX);
  assert.equal(DRAWER_MIN_PX, 696);

  // Sigue MUY por debajo de los dos umbrales que fijaban el mínimo antiguo: ese
  // es el margen de estrechamiento ganado.
  assert.ok(contenido(DRAWER_MIN_PX) < SCOREBOARD_MIN_CONTENT_PX);
  assert.ok(contenido(DRAWER_MIN_PX) < CAST_ROW_SIX_CARDS_PX);
});

test("en tablet el cajón no pasa de medio viewport", () => {
  // El "rescate" que deja al cajón pasar de medio viewport existe para
  // portátiles estrechos, donde alcanzar un ancho usable importa más. En una
  // tablet se comía hasta el 70% y dejaba la página en una franja.
  for (const viewport of [768, 800, 820, 1024, 1180, 1366]) {
    const max = clampDrawerWidth(99999, viewport, { tablet: true });
    assert.ok(
      max <= Math.round(viewport * 0.5),
      `a ${viewport}px el cajón llega a ${max} (${((max / viewport) * 100).toFixed(1)}%)`,
    );
    // Y el tirador sigue teniendo recorrido: el mínimo cede si hace falta.
    const min = clampDrawerWidth(0, viewport, { tablet: true });
    assert.ok(max - min >= DRAWER_MIN_TRAVEL_PX, `a ${viewport}px solo hay ${max - min}px`);
  }
});

test("en tablet se para donde las estadísticas se partirían en dos filas", () => {
  // Ahí la pantalla no da para el tope de escritorio, así que se baja más y se
  // aceptan las dos puntuaciones menos por el camino. El suelo es el último
  // ancho en el que el marcador se lee de una pasada.
  assert.equal(contenido(DRAWER_TABLET_MIN_PX), SCOREBOARD_STATS_ONE_ROW_PX);
  assert.ok(DRAWER_TABLET_MIN_PX < DRAWER_MIN_PX);

  // Nunca por encima de ese tope; en tablets pequeñas queda por debajo, porque
  // ahí manda el tope duro de medio viewport.
  for (const viewport of [768, 820, 1024, 1180, 1366]) {
    const min = clampDrawerWidth(0, viewport, { tablet: true });
    assert.ok(min <= DRAWER_TABLET_MIN_PX, `a ${viewport}px el mínimo es ${min}`);
  }
});

test("los mínimos se derivan, no se escriben a mano", () => {
  assert.equal(
    DRAWER_MIN_PX,
    SCOREBOARD_FIVE_SCORES_PX + MODAL_CONTENT_PADDING_PX,
  );
  assert.equal(
    DRAWER_TABLET_MIN_PX,
    SCOREBOARD_STATS_ONE_ROW_PX + MODAL_CONTENT_PADDING_PX,
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
  // A 2541px el rango es 696 .. 1271.
  assert.equal(clampDrawerWidth(1000, 2541), 1000);
  assert.equal(clampDrawerWidth(1271, 2541), 1271);
  // 700px estaba FUERA de rango con el mínimo antiguo (896) y ahora es válido.
  assert.equal(clampDrawerWidth(700, 2541), 700);
  // Fuera de rango, se sigue acotando por ambos lados.
  assert.equal(clampDrawerWidth(300, 2541), DRAWER_MIN_PX);
  assert.equal(clampDrawerWidth(9999, 2541), 1271);
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
    // Un ancho pedido dentro del rango se respeta tal cual.
    assert.equal(clampMobileDetailsWidth(min + 10, viewport), min + 10);
  }
});


test("la ficha de teléfono nunca baja del ancho mínimo y conserva la proporción cuando cabe", async () => {
  const {
    clampMobileDetailsWidth,
    MOBILE_DETAILS_ASPECT_RATIO: ratio,
    MOBILE_DETAILS_MIN_PX,
    PHONE_RATINGS_ONE_ROW_PX,
    PHONE_STATS_NO_SCROLL_PX,
    PHONE_MIN_SAFETY_MARGIN_PX,
  } = await import("./detailModalSizing.js");
  for (const [viewportWidth, viewportHeight] of [[1024, 768], [768, 1024], [1180, 820], [820, 1180], [1366, 1024], [1280, 600], [1024, 600], [1366, 700]]) {
    for (const requested of [0, 320, 400, 10000, undefined]) {
      const width = clampMobileDetailsWidth(requested, viewportWidth, viewportHeight);
      // Nunca más estrecha que un teléfono real: la fila de acciones se recortaría.
      assert.ok(width >= MOBILE_DETAILS_MIN_PX);
      assert.ok(width < 640);
      assert.ok(width <= viewportWidth * 0.6);
      // Por encima del mínimo, la proporción de teléfono cabe en alto.
      if (width > MOBILE_DETAILS_MIN_PX) assert.ok(width / ratio <= viewportHeight);
    }
  }
  // Tablet 1024x768: la proporción daría 354px, por debajo del mínimo.
  assert.equal(clampMobileDetailsWidth(undefined, 1024, 768), MOBILE_DETAILS_MIN_PX);
  // Pantalla baja: la proporción daría 276px; se ensancha al mínimo.
  assert.equal(clampMobileDetailsWidth(undefined, 1280, 600), MOBILE_DETAILS_MIN_PX);
  // El mínimo sale de lo MEDIDO en el panel real, no de un número a ojo: el
  // mayor de los dos umbrales del marcador más su margen.
  assert.equal(
    MOBILE_DETAILS_MIN_PX,
    Math.max(PHONE_RATINGS_ONE_ROW_PX, PHONE_STATS_NO_SCROLL_PX) +
      PHONE_MIN_SAFETY_MARGIN_PX,
  );
  // Y el ancho siempre deja las puntuaciones en una fila y las estadísticas
  // sin scroll.
  assert.ok(MOBILE_DETAILS_MIN_PX >= PHONE_RATINGS_ONE_ROW_PX);
  assert.ok(MOBILE_DETAILS_MIN_PX >= PHONE_STATS_NO_SCROLL_PX);
  // Con alto de sobra manda la proporción.
  assert.equal(clampMobileDetailsWidth(undefined, 1366, 1024), Math.floor(1024 * ratio));
});


test("DetailModal conserva al menos 120px de arrastre en tablets pequeñas y grandes", () => {
  for (const viewport of [768, 800, 820, 1024, 1180, 1366]) {
    const min = clampDrawerWidth(0, viewport, { tablet: true });
    const max = clampDrawerWidth(10000, viewport, { tablet: true });
    assert.ok(max - min >= DRAWER_MIN_TRAVEL_PX);
    // Aquí había un suelo de 320px. Con el tope duro de medio viewport ya no
    // cabe: en una tablet de 768px el máximo son 384px, y conservar el
    // recorrido del tirador obliga a bajar el mínimo a 264. Entre un tirador
    // que no se mueve y un cajón que puede quedarse estrecho, se elige lo
    // segundo: el ancho lo decide quien arrastra, y en esas pantallas la vista
    // por defecto es la de teléfono, que tiene su propio cálculo.
    assert.ok(min > 0);
    assert.ok(min <= DRAWER_TABLET_MIN_PX);
    assert.ok(max <= Math.round(viewport * DRAWER_MAX_VIEWPORT_SHARE));
    const requested = min + 60;
    assert.equal(clampDrawerWidth(requested, viewport, { tablet: true }), requested);
  }
});

test("la ficha de teléfono escala su contenido con el ancho del panel", async () => {
  const { phoneContentScale, PHONE_CONTENT_MAX_SCALE } = await import("./detailModalSizing.js");
  // FullHD (~440px de panel) es la referencia: nada cambia.
  assert.equal(phoneContentScale(438), 1);
  // Nunca por debajo de 1: en paneles estrechos se queda como está.
  assert.equal(phoneContentScale(320), 1);
  // 2K (~604px): crece, pero menos que el panel (×1,37 era demasiado).
  assert.equal(phoneContentScale(604), 1.224);
  // Con techo, para pantallas enormes.
  assert.equal(phoneContentScale(2000), PHONE_CONTENT_MAX_SCALE);
});
