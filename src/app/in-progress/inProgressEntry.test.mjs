import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const clientPath = new URL("./InProgressClient.jsx", import.meta.url);
const cssPath = new URL("../globals.css", import.meta.url);

function block(css, selector) {
  const i = css.indexOf(`${selector} {`);
  assert.ok(i > -1, `no se localiza ${selector}`);
  return css.slice(i, css.indexOf("}", i));
}

// framer anima `y`, `scale`, `width` y `strokeDashoffset` en JS y limita el
// avance a 40 ms por fotograma: con el hilo principal cargado (primera visita
// de la sesión, sobre todo en la app de Android) la entrada iba a cámara lenta.
test("la entrada de En progreso no anima transform ni ancho con framer", async () => {
  // El menú desplegable de los filtros se queda en framer: no es la entrada.
  const src = (await readFile(clientPath, "utf8")).replace(
    "initial={{ opacity: 0, y: 8, scale: 0.98 }}",
    "",
  );
  assert.doesNotMatch(src, /initial=\{[^}]*\{[^}]*\b(y|scale):/);
  assert.doesNotMatch(src, /initial=\{\{\s*(width|strokeDashoffset):/);
  assert.doesNotMatch(src, /<motion\.circle/);
  assert.doesNotMatch(src, /<motion\.header/);
});

test("tarjetas, cabecera y barras usan las entradas CSS", async () => {
  const src = await readFile(clientPath, "utf8");
  for (const cls of [
    "sv-progress-rise",
    "sv-progress-card-in",
    "sv-progress-bar-fill",
    "sv-progress-ring-fill",
    "sv-progress-divider-in",
    "sv-progress-pop",
    "sv-section-header-in",
    "sv-section-stats-in",
    "sv-section-stat-in",
  ]) {
    assert.ok(src.includes(cls), `falta ${cls}`);
  }
  // Se decide al montar: un refresco en segundo plano no repite la entrada.
  assert.match(src, /const \[entryAnimated\] = useState\(\(\) => !isBackNav && index < ENTRY_ANIMATED_CARDS\)/);
});

test("las reglas CSS usan relleno backwards y respetan reducir movimiento", async () => {
  const css = await readFile(cssPath, "utf8");
  for (const sel of [
    ".sv-progress-rise",
    ".sv-progress-divider-in",
    ".sv-progress-card-in",
    ".sv-progress-pop",
    ".sv-progress-bar-fill",
    ".sv-progress-ring-fill",
  ]) {
    const rule = block(css, sel);
    assert.match(rule, /backwards/);
    assert.doesNotMatch(rule, /\bboth\b|\bforwards\b/);
  }
  assert.match(
    css,
    /@media \(prefers-reduced-motion: reduce\) \{\s*\.sv-progress-rise,\s*\.sv-progress-divider-in,\s*\.sv-progress-card-in,\s*\.sv-progress-pop,\s*\.sv-progress-bar-fill,\s*\.sv-progress-ring-fill \{\s*animation: none;/,
  );
});
