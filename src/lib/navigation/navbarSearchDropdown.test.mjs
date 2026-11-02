import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const NAVBAR = new URL("../../components/Navbar.jsx", import.meta.url);

test("pulsar un resultado no repliega la barra de búsqueda", async () => {
  const navbar = await readFile(NAVBAR, "utf8");

  // EL FALLO: la barra de escritorio se repliega al pulsar fuera, y escucha
  // `pointerdown` —que va ANTES que el click—. Sus desplegables (resultados y
  // filtros) se pintan con `createPortal` al final del body, así que no cuelgan
  // de `desktopSearchRef`: pulsar un resultado contaba como "fuera", la barra se
  // replegaba, el portal se desmontaba y el click no llegaba nunca a su enlace.
  // No se podía abrir ningún resultado.
  //
  // NO SIRVE COMPROBAR LOS REFS del desplegable: viven en `SearchBar`, que es
  // otro componente del mismo fichero, y desde `Navbar` ni existen (referenciarlos
  // lanza y el handler deja de cerrar nada). Por eso las raíces de los portales
  // se marcan en el DOM y el handler las consulta con `closest`.
  const marcas = navbar.match(/data-search-portal/g) || [];
  assert.ok(
    marcas.length >= 3,
    "faltan las marcas de los portales o la consulta del handler",
  );

  const handler = navbar.slice(
    navbar.indexOf("const desktopSearchRef = useRef(null);"),
    navbar.indexOf("// Desplegable del perfil"),
  );
  assert.match(handler, /closest\("\[data-search-portal\]"\)/);
  assert.match(handler, /desktopSearchRef\.current\?\.contains\(e\.target\)/);
  // Y sigue cerrándose con lo que de verdad está fuera.
  assert.match(handler, /setDesktopSearchOpen\(false\)/);
  assert.match(handler, /addEventListener\("pointerdown", fuera\)/);
});

test("los dos desplegables de la barra llevan la marca", async () => {
  const navbar = await readFile(NAVBAR, "utf8");

  // El de FILTROS y el de RESULTADOS. Si a uno le falta, ese vuelve a cerrar la
  // barra al pulsarlo.
  const filtros = navbar.slice(
    navbar.indexOf("ref={filterMenuRef}"),
    navbar.indexOf("ref={filterMenuRef}") + 400,
  );
  const resultados = navbar.slice(
    navbar.indexOf("ref={dropdownRef}"),
    navbar.indexOf("ref={dropdownRef}") + 400,
  );
  assert.match(filtros, /data-search-portal/);
  assert.match(resultados, /data-search-portal/);
});

test("la etiqueta de resultados de búsqueda para actores es 'Actor' y no 'Actor/actriz'", async () => {
  const navbar = await readFile(NAVBAR, "utf8");
  const i18n = await readFile(new URL("../../lib/i18n.js", import.meta.url), "utf8");

  assert.doesNotMatch(navbar, /search_badge_actor.*Actor\/actriz/);
  assert.match(navbar, /t\("search_badge_actor",\s*"Actor"\)/);
  assert.doesNotMatch(i18n, /search_badge_actor:\s*"Actor\/actriz"/);
  assert.match(i18n, /search_badge_actor:\s*"Actor"/);
});


test("la vista previa móvil se abre por encima del desplegable de resultados", async () => {
  // EL FALLO: el desplegable va a z-[99999] y la vista previa de pulsación
  // larga solo subía por encima (PEEK_OVER_PAGE_Z) desde modales o menús; desde
  // un resultado se abría a z-9999 y quedaba detrás, sin verse.
  const { isInsidePageOverlay } = await import("../ui/pageModal.js");
  const nodo = (selectorQueCoincide) => ({
    closest: (selector) =>
      selector.split(",").some((s) => s.trim() === selectorQueCoincide)
        ? {}
        : null,
  });
  assert.equal(isInsidePageOverlay(nodo("[data-search-portal]")), true);
  assert.equal(isInsidePageOverlay(nodo("[role=\"menu\"]")), true);
  assert.equal(isInsidePageOverlay(nodo(".otra-cosa")), false);
});

test("tocar el fondo de la vista previa no cierra los resultados de búsqueda", async () => {
  const navbar = await readFile(NAVBAR, "utf8");
  // EL FALLO: en el móvil, el toque para cerrar la vista previa emite un
  // `mousedown` de compatibilidad; el cierre "al pulsar fuera" de SearchBar lo
  // tomaba por un toque fuera y se llevaba el desplegable.
  const handler = navbar.slice(
    navbar.indexOf('document.addEventListener("mousedown", handler)') - 900,
    navbar.indexOf('document.addEventListener("mousedown", handler)'),
  );
  assert.match(handler, /\[data-detail-modal-layer\]/);
});

test("con el teclado abierto la vista previa espera a que baje para medirse", async () => {
  const peek = await readFile(
    new URL("../../components/preview/MobileTitlePeek.jsx", import.meta.url),
    "utf8",
  );
  // EL FALLO: la tarjeta se mide una vez al abrir con `visualViewport`, que con
  // el teclado es la mitad: salía compactada.
  const fire = peek.slice(peek.indexOf("const fire = () => {"), peek.indexOf("const onTouchStart"));
  assert.match(fire, /focused\.blur\(\)/);
  assert.match(fire, /isKeyboardOpen\(\)/);
  assert.match(fire, /waitForKeyboardClose\(/);
});
