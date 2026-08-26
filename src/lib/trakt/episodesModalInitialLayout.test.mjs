import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const modalSource = await readFile(
  new URL(
    "../../components/trakt/TraktEpisodesWatchedModal.jsx",
    import.meta.url,
  ),
  "utf8",
);
const ratingsSource = await readFile(
  new URL(
    "../../components/details/EpisodeRatingsModal.jsx",
    import.meta.url,
  ),
  "utf8",
);

test("los modales de episodios conservan un margen proporcional", () => {
  assert.match(
    modalSource,
    /\$\{isMovie \? "max-h-\[85dvh\] sm:max-h-\[85vh\]" : "h-\[90dvh\] max-h-\[90dvh\]"\}/,
    "la vista de series debe conservar altura estable sin tocar los bordes del viewport",
  );
  assert.match(
    ratingsSource,
    /h-fit max-h-\[90dvh\]/,
    "el modal de valoraciones debe compartir el mismo límite proporcional",
  );
});

test("la cabecera de episodios comparte el espaciado de los demás modales", () => {
  assert.match(
    modalSource,
    /items-center justify-between bg-white\/\[0\.035\] px-6 py-5 backdrop-blur-xl sm:px-8 sm:pt-8 sm:pb-6/,
    "el título debe respirar respecto a los bordes lateral y superior del modal",
  );
});

test("el cierre y las tarjetas de episodios no muestran contornos visuales", () => {
  assert.match(
    modalSource,
    /rounded-full border-0 bg-white\/5 text-white\/70 shadow-none[\s\S]*?aria-label="Cerrar \(Esc\)"/,
    "el botón de cierre no debe añadir borde ni relieve",
  );
  assert.match(
    modalSource,
    /group flex cursor-pointer[\s\S]*?rounded-2xl border-0[\s\S]*?shadow-none backdrop-blur-xl/,
    "cada fila de episodio debe prescindir de borde y sombra",
  );
  assert.match(
    modalSource,
    /aspect-video w-24[\s\S]*?rounded-xl border-0 bg-black\/30 shadow-none sm:w-32/,
    "la miniatura no debe recuperar un contorno interior",
  );
});

test("un rewatch conserva su icono y etiqueta completos", () => {
  assert.match(modalSource, /isRewatchView \? "w-max"/);
  assert.match(modalSource, /isRewatchView \? "w-10 xl:w-11"/);
  assert.match(modalSource, /isRewatchView \? \(\s*<History className="w-3\.5 h-3\.5"/);
  assert.match(modalSource, /!isRewatchView && \(/);
});

test("el selector de escritorio usa el recuadro de icono amplio de Historial", () => {
  assert.match(
    modalSource,
    /inline-flex h-6 w-6 items-center justify-center rounded-md shrink-0/,
  );
});

test("el selector móvil de rewatch muestra solo la fecha sin hora", () => {
  assert.match(
    modalSource,
    /isRewatchView\s*\? formatDate\(currentRewatchStartedAt\)\s*: activeViewLabel/g,
  );
});

test("el selector de escritorio antepone Rewatch a la fecha", () => {
  assert.match(
    modalSource,
    /isRewatchView\s*\? `Rewatch · \$\{formatDate\(currentRewatchStartedAt\)\}`\s*: activeViewLabel/,
  );
});

test("el desplegable conserva el formato y color morado de los rewatch", () => {
  assert.match(modalSource, /label: `Rewatch · \$\{formatDate\(startedAt\)\}`/);
  assert.match(modalSource, /label: `Rewatch · \$\{formatDate\(iso\)\}`/);
  assert.match(modalSource, /mobileLabel: formatDate\(item\.startedAt\)/);
  assert.match(modalSource, /\{item\.mobileLabel \|\| item\.label\}/);
  assert.match(modalSource, /bg-purple-500\/12 text-purple-200/);
  assert.match(modalSource, /History className="w-4 h-4 text-purple-400 shrink-0"/);
});

test("el cuadro de fecha de rewatch no muestra borde", () => {
  assert.match(
    modalSource,
    /rounded-2xl bg-purple-500\/5 px-3\.5 py-3 flex flex-col gap-3 lg:flex-row/,
  );
  assert.doesNotMatch(
    modalSource,
    /rounded-2xl border border-purple-500\/20 bg-purple-500\/5/,
  );
  assert.doesNotMatch(
    modalSource,
    /bg-purple-500\/15 border border-purple-500\/30 text-purple-100/,
  );
  assert.doesNotMatch(
    modalSource,
    /bg-purple-500\/15 text-purple-100 border border-purple-300\/25/,
  );
});

test("el selector de lista o tabla comparte la altura de la barra", () => {
  assert.match(
    modalSource,
    /flex h-10 shrink-0 gap-1 rounded-xl bg-black\/30 p-1 backdrop-blur-md xl:h-11/,
  );
  assert.match(modalSource, /h-full w-9 rounded-lg text-xs font-bold/);
});

test("al cambiar de temporada no se tapa el contenido con un estado de carga", () => {
  assert.doesNotMatch(
    modalSource,
    /\bisSwitching\b/,
    "el cambio de temporada no debe renderizar una capa de carga sobre la lista",
  );
});
