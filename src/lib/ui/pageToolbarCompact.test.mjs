import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

// La barra de filtros (buscador + Tipo/Ordenar/Agrupar + modos de vista) está
// COPIADA en las cinco páginas de colección: cada una tiene su propio
// `InlineDropdown`. La regla que la compacta es una sola, en globals.css, y se
// engancha por clases marcadoras. Si una página se queda sin marcar, sus
// controles siguen solapándose y no lo delata nada más que abrirla.
const PAGES = [
  "favorites/FavoritesClient",
  "watchlist/WatchlistClient",
  "history/HistoryClient",
  "in-progress/InProgressClient",
  "continue-watching/ContinueWatchingClient",
];

const read = (relative) =>
  readFile(new URL(relative, import.meta.url), "utf8");

test("las cinco páginas de colección marcan su barra de filtros", async () => {
  for (const page of PAGES) {
    const source = await read(`../../app/${page}.jsx`);

    // El contenedor que se consulta.
    assert.match(source, /className="sv-page-toolbar /, page);
    // Y las tres piezas que ceden dentro de él.
    assert.match(source, /sv-page-toolbar-label/, page);
    assert.match(source, /sv-page-toolbar-value/, page);
    assert.match(source, /sv-page-toolbar-trigger/, page);
  }
});

test("la barra cede en dos pasos, de lo menos a lo más informativo", async () => {
  const css = await read("../../app/globals.css");

  assert.match(css, /\.sv-page-toolbar \{\s*\n\s*container: sv-page-toolbar \/ inline-size;/);

  // El valor se RECORTA dentro de su botón. Es la causa real del solape: lleva
  // `truncate`, pero un `lg:overflow-visible` lo anula en escritorio y lo deja
  // derramarse sobre el botón siguiente. Sin esto, los umbrales solo deciden
  // cuándo deja de verse el problema, no lo evitan.
  assert.match(
    css,
    /\.sv-page-toolbar \.sv-page-toolbar-value \{\s*\n\s*overflow: hidden;/,
  );

  // 1º el rótulo, que el icono ya representa. El umbral es lo que pide la fila
  // CON rótulos (~1048px): la primera versión lo puso en 56rem, muy por debajo,
  // y para cuando cedía los controles llevaban rato tocándose.
  const label = css.slice(css.indexOf("@container sv-page-toolbar (width < 66rem)"));
  assert.match(label.slice(0, 120), /\.sv-page-toolbar-label \{\s*\n\s*display: none;/);

  // ...y 2º el valor, soltando además el ancho mínimo del botón: sin eso el
  // botón no se encoge aunque se vacíe. El umbral es lo que pide la fila SIN
  // rótulos (~862px).
  const value = css.slice(css.indexOf("@container sv-page-toolbar (width < 54rem)"));
  assert.match(value.slice(0, 420), /\.sv-page-toolbar-value \{\s*\n\s*display: none;/);
  assert.match(value.slice(0, 420), /min-width: 0 !important;/);

  // Container query y no media query: la ventana no cambia cuando el drawer se
  // acopla; lo que se estrecha es la FILA.
  assert.doesNotMatch(
    css.slice(css.indexOf(".sv-page-toolbar {"), css.indexOf(".sv-page-toolbar {") + 1200),
    /@media/,
  );
});

test("las tarjetas de Detalles y Producción llenan la fila o van en parejas", async () => {
  const [css, tabs] = await Promise.all([
    read("../../app/globals.css"),
    read("../../components/details/DetailsInfoTabs.jsx"),
  ]);

  // El contenedor es el CUERPO DE LA PESTAÑA, no la propia fila: un elemento no
  // puede consultarse a sí mismo, y pasar a dos columnas exige cambiar el
  // `flex-wrap` de la fila.
  assert.match(tabs, /<div key="details" className="sv-info-cards-scope">/);
  assert.match(tabs, /<div key="production" className="sv-info-cards-scope">/);
  assert.match(css, /\.sv-info-cards-scope \{\s*\n\s*container: sv-info-cards \/ inline-size;/);

  // Base de CONTENIDO, no ancho igual para todas: con columnas iguales, un
  // título largo se partía en dos líneas mientras "$94.0M" dejaba media tarjeta
  // vacía. Y `flex-grow` reparte el sobrante, así que no queda hueco libre.
  const base = css.slice(css.indexOf(".sv-info-cards > * {"));
  assert.match(base.slice(0, 90), /flex: 1 1 auto;/);

  // El texto NO se parte: una tarjeta a dos líneas mide más alto que sus
  // vecinas y estira la fila entera. Si no entra, se recorta.
  assert.match(
    css,
    /\.sv-info-cards \.sv-meta-label,\s*\n\.sv-info-cards \.sv-meta-value \{\s*\n\s*white-space: nowrap;\s*\n\s*overflow: hidden;\s*\n\s*text-overflow: ellipsis;/,
  );
  // Y lo recortado queda a mano al pasar por encima.
  const atoms = await read("../../components/details/DetailAtoms.jsx");
  assert.match(atoms, /title=\{typeof value === "string" \? value : undefined\}/);

  // Y cuando no caben, de dos en dos: `50% - medio hueco` es exactamente lo que
  // impide que entre una tercera y deje una suelta en la fila siguiente.
  const pairs = css.slice(css.indexOf("@container sv-info-cards"));
  assert.match(pairs.slice(0, 260), /flex-wrap: wrap;/);
  assert.match(pairs.slice(0, 260), /flex: 1 1 calc\(50% - 0\.375rem\);/);
});

test("el desplegable no encoge con su botón", async () => {
  // Medía justo lo que el disparador. Al compactarse la barra el botón se queda
  // en un icono, y el menú heredaba ese ancho: sus opciones se partían en dos
  // líneas o se cortaban. Es una capa flotante, no tiene por qué caber en el
  // hueco del botón.
  for (const page of PAGES) {
    const source = await read(`../../app/${page}.jsx`);
    assert.match(source, /const MENU_MIN_WIDTH = 224;/, page);
    assert.match(
      source,
      /Math\.max\(rect\.width, MENU_MIN_WIDTH\)/,
      page,
    );
    // El tope sigue siendo la ventana: en pantallas estrechas manda ella.
    assert.match(source, /window\.innerWidth - 24,/, page);
  }
});

test("un título original largo se queda solo en su fila", async () => {
  const [tabs, css] = await Promise.all([
    read("../../components/details/DetailsInfoTabs.jsx"),
    read("../../app/globals.css"),
  ]);

  // Con reparto en parejas, un título largo se recortaba mientras "$94.0M"
  // desperdiciaba media tarjeta. Las otras tres de Detalles —una fecha y dos
  // cifras— nunca se quedan estrechas, así que se reparten la fila siguiente.
  assert.match(tabs, /const LONG_ORIGINAL_TITLE_CHARS = 30;/);
  assert.match(tabs, /wide: isLongOriginalTitle\(originalTitle\)/);
  assert.match(tabs, /return wide \? "min-w-0 sv-info-card--wide" : "min-w-0";/);

  // Fila entera, y SOLO dentro del modo parejas: en una sola fila ya tiene su
  // ancho por contenido y no hay nada que forzar.
  const pairs = css.slice(css.indexOf("@container sv-info-cards"));
  const block = pairs.slice(0, pairs.indexOf("\n}\n") + 3);
  assert.match(block, /\.sv-info-cards > \.sv-info-card--wide \{\s*\n\s*flex-basis: 100%;/);

  // Se decide por LONGITUD del texto, no midiendo el elemento: medir exigiría
  // un observador que se dispararía en cada fotograma del arrastre del panel.
  assert.doesNotMatch(tabs, /ResizeObserver/);
});
