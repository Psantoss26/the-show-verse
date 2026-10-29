import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

const panel = read("components/ui/MobileFiltersPanel.jsx");

// El desplegable EN EL SITIO que queda (los filtros de Actor en escritorio)
// usa la animación común. Las páginas, las vistas laterales y el modal de
// episodios de Trakt usan la hoja (MobileOptionsSheet, ver
// mobileOptionsSheet.test.mjs); la vista teléfono del drawer ya no tiene
// controles en «Portadas y fondos» (están en su vista lateral).
const PAGES = [
  "components/ActorDetails.jsx",
];

test("los desplegables en el sitio usan el panel común", () => {
  for (const page of PAGES) {
    const source = read(page);
    assert.match(source, /import MobileFiltersPanel from "@\/components\/ui\/MobileFiltersPanel";/, page);
    assert.match(source, /<MobileFiltersPanel\b/, page);
    // Ningún panel móvil vuelve a la animación por JS ni al truco a mano.
    assert.doesNotMatch(source, /gridTemplateRows: mobileFiltersOpen/, page);
  }
});

test("el panel anima la altura en CSS y el contenido solo por transform", () => {
  assert.match(panel, /gridTemplateRows: expanded \? "1fr" : "0fr"/);
  assert.match(panel, /transition: `grid-template-rows \$\{transition\}`/);
  assert.match(panel, /translateY\(-8px\)/);
  // La opacidad en un ancestro aplana el cristal de los controles.
  assert.doesNotMatch(panel, /opacity\s*:|\bopacity-\d/);
});

test("el panel solo recorta mientras anima y respeta reducir movimiento", () => {
  assert.match(panel, /settled \? "overflow-visible" : "overflow-hidden"/);
  assert.match(panel, /motion-reduce:!transition-none/);
  assert.match(panel, /prefers-reduced-motion: reduce/);
});

test("el panel absorbe la separación del contenedor para no dar un bache al montarse/desmontarse", () => {
  // Con `space-y-*`/`gap` en la barra, la fila anterior conserva su margen
  // mientras el panel está montado: se anula fuera y se reproduce dentro.
  assert.match(panel, /function inheritedLeadingGap\(el\)/);
  assert.match(panel, /marginTop: leadingGap \? -leadingGap/);
  assert.match(panel, /style={{ height: leadingGap }}/);
  // Como overlay (barra fijada) no hay nada que compensar.
  assert.match(panel, /own\.position === "absolute" \|\| own\.position === "fixed"\) return 0/);
});

test("el panel se ajusta al ancho de la pantalla, no al de su contenido", () => {
  assert.match(panel, /gridTemplateColumns: "minmax\(0, 1fr\)"/);
  assert.match(panel, /className={`min-h-0 min-w-0 /);
});
