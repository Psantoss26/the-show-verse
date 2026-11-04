import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

const sheet = read("components/ui/MobileOptionsSheet.jsx");
const css = read("app/globals.css");

// Páginas cuyo botón de filtros en móvil abre la hoja inferior con los
// filtros, el orden, la agrupación, las vistas y las acciones.
const PAGES = [
  "app/biblioteca/BibliotecaClient.jsx",
  "app/calendar/CalendarClient.jsx",
  "app/continue-watching/ContinueWatchingClient.jsx",
  "app/dashboard/[section]/DashboardSectionClient.jsx",
  "app/favorites/FavoritesClient.jsx",
  "app/history/HistoryClient.jsx",
  "app/in-progress/InProgressClient.jsx",
  "app/lists/ListsClient.jsx",
  "app/social/SocialClient.jsx",
  "app/u/[username]/ProfileSection.jsx",
  "app/watchlist/WatchlistClient.jsx",
  "components/ActorDetails.jsx",
  // DetailsClient ya no: «Portadas y fondos» no tiene botones en la fila del
  // título en el móvil (sus filtros están en la vista lateral, ver
  // SECTION_SHEETS).
  "components/lists/ListDetailsTools.jsx",
  "components/profile/neural/NeuralGraphView.jsx",
];

// Vistas laterales (SectionSheet) con filtros: la hoja sube encima del panel,
// dentro de su ancho desde 640px.
const SECTION_SHEETS = [
  "components/details/sectionSheet/ActorSectionSheets.jsx",
  "components/details/sectionSheet/DetailsSectionSheets.jsx",
  "components/details/sectionSheet/FilmographySheet.jsx",
];

// Páginas con desplegables propios: dentro de la hoja se pintan como grupos de
// píldoras, sin desplegables anidados.
const LOCAL_DROPDOWNS = [
  "app/biblioteca/BibliotecaClient.jsx",
  "app/calendar/CalendarClient.jsx",
  "app/continue-watching/ContinueWatchingClient.jsx",
  "app/favorites/FavoritesClient.jsx",
  "app/history/HistoryClient.jsx",
  "app/in-progress/InProgressClient.jsx",
  "app/lists/ListsClient.jsx",
  "app/social/SocialClient.jsx",
  "app/watchlist/WatchlistClient.jsx",
  "components/lists/ListDetailsTools.jsx",
  "components/details/CreditFilterControls.jsx",
];

// Páginas de usuario con filtros avanzados: su hoja va con un controlador
// (abrir o cerrar no repinta la página; ver useOptionsSheetController) y la
// cierra él mismo.
const CONTROLLED_PAGES = new Set([
  "app/favorites/FavoritesClient.jsx",
  "app/history/HistoryClient.jsx",
  "app/in-progress/InProgressClient.jsx",
  "app/watchlist/WatchlistClient.jsx",
]);

test("las páginas abren su menú móvil en la hoja común, que se puede cerrar", () => {
  for (const page of PAGES) {
    const source = read(page);
    if (CONTROLLED_PAGES.has(page)) {
      assert.match(source, /<ControlledOptionsSheet\s+controller=\{filtersSheet\}/, page);
      assert.match(source, /<OptionsSheetTrigger\s+controller=\{filtersSheet\}/, page);
      assert.doesNotMatch(source, /mobileFiltersOpen/, page);
      continue;
    }
    assert.match(source, /import MobileOptionsSheet\b.*from "@\/components\/ui\/MobileOptionsSheet";/, page);
    assert.match(source, /<MobileOptionsSheet\s[^>]*?onClose=/s, page);
    // Ya no hay desplegable en el sitio en el menú móvil de la página (Actor
    // lo conserva solo en escritorio).
    if (page !== "components/ActorDetails.jsx") {
      assert.doesNotMatch(source, /<MobileFiltersPanel\b/, page);
    }
  }
});

test("las vistas laterales abren sus filtros en la hoja, dentro del ancho del panel", () => {
  for (const page of SECTION_SHEETS) {
    const source = read(page);
    assert.match(source, /<MobileOptionsSheet\s+open={filtersOpen}\s+onClose={\(\) => setFiltersOpen\(false\)}[\s\S]*?placement="sectionSheet"/, page);
    assert.doesNotMatch(source, /<MobileFiltersPanel\b/, page);
  }
  // Filmografía: el rol y el tipo de título, solo en la hoja (sin pestañas
  // ni selector en la cabecera del panel).
  const filmography = read("components/details/sectionSheet/FilmographySheet.jsx");
  assert.match(filmography, /<SheetOptionGroup label="Rol"/);
  assert.match(filmography, /<SheetOptionGroup label="Tipo de título"/);
  assert.doesNotMatch(filmography, /tabs=\{|role="radiogroup"/);
  assert.match(sheet, /placement === "sectionSheet" \? "sm:ml-auto sm:w-\[30rem\]/);
  // La vista lateral de debajo marca `data-sv-sheet-open`: la hoja no se lo quita.
  assert.match(sheet, /if \(root\.hasAttribute\(SHEET_OPEN_ATTR\)\) return;/);
  assert.match(sheet, /if \(pageBelowHolders \|\| !ownsPageBelowAttr\) return;/);
});

test("la hoja anima entera al abrir y al cerrar aunque la página esté ocupada", () => {
  // Se desmonta al acabar la animación de salida, no con un temporizador fijo
  // que la cortaba si arrancaba tarde.
  assert.match(sheet, /onAnimationEnd=\{\(event\) => \{\s*if \(closing && event\.target === event\.currentTarget && EXIT_ANIMATIONS\.has\(event\.animationName\)\)/);
  assert.match(sheet, /MOBILE_OPTIONS_SHEET_EXIT_MS \+ EXIT_FALLBACK_EXTRA_MS/);
  // La pausa de la página (recalcula ~11.000 elementos) no va en el primer
  // fotograma de la animación.
  assert.match(sheet, /pageBelowHolders > 0 \? \(hold\(\), \(\) => \{\}\) : afterTwoFrames\(hold\)/);
  assert.match(sheet, /if \(held\) afterTwoFrames\(releasePageBelow\)/);
  assert.match(sheet, /export function useOptionsSheetController\(\)/);
});

test("los desplegables de las páginas se pintan como opciones a la vista dentro de la hoja", () => {
  for (const page of LOCAL_DROPDOWNS) {
    const source = read(page);
    assert.match(source, /if \(useInOptionsSheet\(\)\) \{\s*return \(?\s*<SheetOptionGroup/, page);
    assert.match(source, /if \(useInOptionsSheet\(\)\) \{\s*return <SheetOption active=/, page);
  }
});

test("la hoja usa el cristal de los modales y entra solo con transform", () => {
  assert.match(sheet, /LIQUID_GLASS_PANEL/);
  assert.match(sheet, /sv-options-sheet-in/);
  assert.match(css, /@keyframes sv-options-sheet-in \{\s*from \{\s*transform: translate3d\(0, 100%, 0\);/);
  // Una opacidad en el panel (o un ancestro) aplanaría su cristal.
  const panelKeyframes = css.slice(
    css.indexOf("@keyframes sv-options-sheet-in"),
    css.indexOf(".sv-options-sheet-in {"),
  );
  assert.doesNotMatch(panelKeyframes, /opacity/);
});

test("las filas deslizables (años) se mueven con la rueda y arrastrando con el ratón", () => {
  // Sin barra y con la rueda solo en vertical, en el ordenador no se movían.
  assert.match(sheet, /row\.addEventListener\("wheel", onWheel, \{ passive: false \}\)/);
  assert.match(sheet, /row\.scrollLeft \+= delta/);
  assert.match(sheet, /event\.pointerType !== "mouse"/);
  // El clic que cierra un arrastre no elige la píldora.
  assert.match(sheet, /onClickCapture={onClickCapture}/);
});

test("la hoja bloquea el scroll, cierra con Escape y se arrastra hacia abajo", () => {
  assert.match(sheet, /useModalGuard\(\{ open, onClose \}\)/);
  assert.match(sheet, /onPointerDown={onDragStart}/);
  assert.match(sheet, /DRAG_CLOSE_DISTANCE/);
  assert.match(sheet, /role="dialog"/);
  assert.match(sheet, /aria-modal="true"/);
});

test("el modal de episodios vistos abre sus opciones móviles en la hoja, encima del modal", () => {
  const modal = read("components/trakt/TraktEpisodesWatchedModal.jsx");
  assert.match(modal, /<MobileOptionsSheet\s+open={mobileFiltersOpen}\s+onClose={\(\) => setMobileFiltersOpen\(false\)}/);
  assert.doesNotMatch(modal, /<MobileFiltersPanel\b/);
  // El modal vive en z-[99999] dentro de la página: la hoja sube por encima
  // y no apaga su cristal con `data-sv-sheet-open`.
  assert.match(modal, /layerClassName="z-\[100001\]"/);
  assert.match(modal, /pausePageBelow={false}/);
  assert.match(sheet, /if \(!open \|\| !pausePageBelow\) return undefined;/);
});
