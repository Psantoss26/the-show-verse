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
  "app/lists/page.jsx",
  "app/social/SocialClient.jsx",
  "app/u/[username]/ProfileSection.jsx",
  "app/watchlist/WatchlistClient.jsx",
  "components/ActorDetails.jsx",
  "components/DetailsClient.jsx",
  "components/lists/ListDetailsTools.jsx",
  "components/profile/neural/NeuralGraphView.jsx",
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
  "app/lists/page.jsx",
  "app/social/SocialClient.jsx",
  "app/watchlist/WatchlistClient.jsx",
  "components/lists/ListDetailsTools.jsx",
  "components/details/CreditFilterControls.jsx",
];

test("las páginas abren su menú móvil en la hoja común, que se puede cerrar", () => {
  for (const page of PAGES) {
    const source = read(page);
    assert.match(source, /import MobileOptionsSheet\b.*from "@\/components\/ui\/MobileOptionsSheet";/, page);
    assert.match(source, /<MobileOptionsSheet\s[^>]*?onClose=/s, page);
    // Ya no hay desplegable en el sitio en el menú móvil de la página (Actor
    // lo conserva solo en escritorio).
    if (page !== "components/ActorDetails.jsx") {
      assert.doesNotMatch(source, /<MobileFiltersPanel\b/, page);
    }
  }
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

test("la hoja bloquea el scroll, cierra con Escape y se arrastra hacia abajo", () => {
  assert.match(sheet, /useModalGuard\(\{ open, onClose \}\)/);
  assert.match(sheet, /onPointerDown={onDragStart}/);
  assert.match(sheet, /DRAG_CLOSE_DISTANCE/);
  assert.match(sheet, /role="dialog"/);
  assert.match(sheet, /aria-modal="true"/);
});
