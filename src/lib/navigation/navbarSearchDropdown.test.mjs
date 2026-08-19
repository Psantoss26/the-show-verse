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
