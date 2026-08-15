import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

// LA REGLA. Dentro de un modal, ninguna casilla lleva contorno dibujado: el
// volumen lo dan el relleno y el degradado, no una línea. Es el mismo criterio
// que ya documentan `LIQUID_GLASS_BAR` y `LiquidGlassOpticalLayers` ("SIN
// BORDES MARCADOS": un aro claro recorriendo cada pieza se lee, en grupo, como
// un contorno dibujado).
//
// SE CONSERVAN, a propósito:
//   - separadores `border-t/b/l/r`, que no son cajas;
//   - bordes de COLOR, que son señal de estado (peligro, éxito, edición);
//   - `focus:`/`focus-visible:`, que son accesibilidad;
//   - `border-dashed` del estado vacío, que comunica "aquí no hay nada".
const MODALES = [
  "trakt/TraktWatchedModal",
  "trakt/TraktEpisodesWatchedModal",
  "details/VideoModal",
  "details/EpisodeRatingsModal",
  "details/AddToListModal",
  "details/SoundtrackModal",
  "details/TraktCommentModal",
  "StarRating",
];

const COLORES =
  "red|rose|emerald|yellow|orange|amber|sky|cyan|purple|fuchsia|pink|blue|green|violet|indigo|teal";

function leer(nombre) {
  return readFile(
    new URL(`../../components/${nombre}.jsx`, import.meta.url),
    "utf8",
  );
}

test("ninguna casilla lleva contorno neutro", async () => {
  for (const nombre of MODALES) {
    const source = await leer(nombre);
    // `border border-white/N` y el color suelto en ramas condicionales.
    const contornos = [
      ...source.matchAll(/(?<!border-[tblr] )(?<!border-dashed )border-white\/\d+/g),
    ];
    assert.equal(
      contornos.length,
      0,
      `${nombre} conserva ${contornos.length} contorno(s) neutro(s)`,
    );
  }
});

test("no queda `border` desnudo esperando color de una rama", async () => {
  for (const nombre of MODALES) {
    const source = await leer(nombre);
    // Un `border` suelto en la clase base pinta con `currentColor`: es peor que
    // el contorno que se quería quitar.
    const desnudos = [...source.matchAll(/(?<![-\w:])border(?![-\w])/g)].filter(
      (m) => !source.slice(m.index + 6).startsWith(" border-"),
    );
    assert.equal(desnudos.length, 0, `${nombre} tiene un \`border\` sin color`);
  }
});

test("ningún color de borde se queda sin ancho", async () => {
  // Una regla muerta: no pinta nada y engaña a quien la lea después.
  const rx = new RegExp(
    `(?:(?<variante>[a-z/-]+):)?border-(?:${COLORES}|white|transparent)(?:-\\d+(?:/\\d+)?)?\\b`,
    "g",
  );
  for (const nombre of MODALES) {
    const source = await leer(nombre);
    for (const m of source.matchAll(rx)) {
      const previo = source.slice(Math.max(0, m.index - 30), m.index);
      const variante = m.groups?.variante;
      const ancho = variante ? `${variante}:border ` : "border ";
      const ok =
        previo.endsWith(ancho) || /border(-[tblr])?(-dashed)? $/.test(previo);
      assert.ok(ok, `${nombre}: "${m[0]}" no tiene ancho que lo pinte`);
    }
  }
});

test("el foco tiene indicador y no mueve el layout", async () => {
  // Quitar el contorno en reposo no puede llevarse por delante el foco. Pero el
  // indicador tiene que ser un ANILLO, no un borde:
  //
  // `focus:border` lleva el ancho de 0 a 1px al enfocar y, con
  // `box-sizing: border-box`, eso encoge el área de contenido 2px. El campo da
  // un salto -- y como estos modales enfocan solos al abrirse, el salto se ve
  // como un parpadeo nada más aparecer. El anillo es `box-shadow`: no ocupa
  // caja, así que no puede mover nada.
  const conCampos = [
    "details/TraktCommentModal",
    "details/AddToListModal",
    "trakt/TraktEpisodesWatchedModal",
  ];
  for (const nombre of conCampos) {
    const source = await leer(nombre);
    assert.match(
      source,
      /focus:ring-\d/,
      `${nombre} perdió el indicador de foco de sus campos`,
    );
    assert.doesNotMatch(
      source,
      /focus(-visible)?:border(?![-\w])/,
      `${nombre} usa un borde de foco: desplaza el contenido al enfocar`,
    );
  }
});

test("los separadores y el estado vacío se conservan", async () => {
  const historial = await leer("trakt/TraktWatchedModal");

  assert.match(historial, /border-t border-white\/\d+/);
  assert.match(historial, /border-dashed/);
});

test("las tarjetas del modal rápido no dibujan un anillo al pasar por encima", async () => {
  // Un aro de 2.5px que aparece en hover es un contorno marcado como cualquier
  // otro, solo que intermitente. Se dibujaba con un `::after` + `box-shadow`
  // interior, así que no lo detecta una búsqueda de `border`.
  const modal = await leer("dashboard/DetailModal");

  assert.doesNotMatch(
    modal,
    /hover:after:shadow-\[inset/,
    "una tarjeta volvió a marcar su borde en hover",
  );
});

test("las tarjetas del modal rápido conservan respuesta al hover", async () => {
  // Quitar el aro no puede dejarlas sin señal de que son pulsables.
  const modal = await leer("dashboard/DetailModal");

  for (const señal of [
    /group-hover:scale-105/, // Títulos similares: la imagen crece
    /group-hover:grayscale-0/, // Reparto: la foto recupera color
    /hover:bg-white\/\[0\.05\]/, // Temporadas: la tarjeta se aclara
  ]) {
    assert.match(modal, señal, `falta la respuesta al hover ${señal}`);
  }
});
