import assert from "node:assert/strict";
import test from "node:test";

// El módulo instala sus listeners al importarse y guarda el instante del último
// `popstate` en una variable de módulo. Para ejercitarlo de verdad hay que
// montar un `window` mínimo ANTES del import.
const listeners = new Map();
let ahora = 1000;

globalThis.window = {
  addEventListener: (tipo, fn) => listeners.set(tipo, fn),
  performance: { now: () => ahora },
  location: { pathname: "/favorites", search: "" },
  sessionStorage: {
    // Recarga hasta 30 s después de volver de una ficha: la marca de sesión
    // del documento anterior sigue ahí al cargar el módulo.
    _d: new Map([
      [
        "showverse:pending-history-navigation",
        JSON.stringify({ route: "/favorites", at: Date.now() }),
      ],
    ]),
    getItem(k) {
      return this._d.has(k) ? this._d.get(k) : null;
    },
    setItem(k, v) {
      this._d.set(k, v);
    },
    removeItem(k) {
      this._d.delete(k);
    },
  },
};
globalThis.performance = globalThis.window.performance;

const { isHistoryNavigation, notifyPushNavigation, syncHistoryPage } =
  await import("../navigation/historyNavigation.js");

// Un `popstate` real llega ya con la URL de DESTINO. Por defecto se simula
// volver a Favoritos desde otra página (la ficha de un título).
const popstate = ({ from = "/details/movie/1", to = "/favorites" } = {}) => {
  const [fromPath, fromSearch = ""] = from.split("?");
  globalThis.window.location = { pathname: fromPath, search: fromSearch ? `?${fromSearch}` : "" };
  syncHistoryPage();
  const [toPath, toSearch = ""] = to.split("?");
  globalThis.window.location = { pathname: toPath, search: toSearch ? `?${toSearch}` : "" };
  listeners.get("popstate")?.();
};
test("recargar tras volver de una ficha NO es navegación de historial", () => {
  assert.equal(isHistoryNavigation("/favorites"), false);
  assert.equal(
    globalThis.window.sessionStorage.getItem("showverse:pending-history-navigation"),
    null,
  );
});

const limpiar = () => {
  globalThis.window.sessionStorage._d.clear();
  notifyPushNavigation();
};

test("volver atrás marca la navegación como historial", () => {
  limpiar();
  popstate();
  assert.equal(isHistoryNavigation(), true);
});

test("la ventana caduca sola pasados los 10 s", () => {
  limpiar();
  popstate();
  ahora += 10_001;
  assert.equal(isHistoryNavigation(), false);
  ahora = 1000;
});

test("una navegación de empuje CANCELA la ventana de historial", () => {
  limpiar();
  popstate();
  assert.equal(isHistoryNavigation(), true, "precondición: venimos de atrás");

  // ESTE es el arreglo. Antes, durante 10 s cualquier página montada después de
  // un `popstate` se consideraba "vuelta atrás" y se pintaba estática: entrar a
  // Favoritos desde el desplegable del navbar se quedaba sin su animación.
  notifyPushNavigation();
  assert.equal(
    isHistoryNavigation(),
    false,
    "tras pulsar un enlace la página debe animar su entrada",
  );
});

test("el marcador de sesión sigue mandando aunque expire el reloj", () => {
  limpiar();
  // Lo escribe <ScrollRestoration> en el `popstate`, con la ruta de DESTINO:
  // cubre el caso de que la lista remonte mucho después.
  globalThis.window.sessionStorage.setItem(
    "showverse:pending-history-navigation",
    JSON.stringify({ route: "/favorites", at: Date.now() }),
  );
  assert.equal(isHistoryNavigation(), true);

  // Y si el marcador es de OTRA ruta, no aplica.
  globalThis.window.sessionStorage.setItem(
    "showverse:pending-history-navigation",
    JSON.stringify({ route: "/watchlist", at: Date.now() }),
  );
  assert.equal(isHistoryNavigation(), false);
});

test("cerrar la ficha rápida (`?preview=`) NO es volver a la página", () => {
  limpiar();
  // Cerrar la preview hace `history.go(-1)`: mismo pathname, solo cambia el
  // parámetro `preview`. Lo que monte después debe animar su entrada.
  popstate({ from: "/favorites?preview=movie-550", to: "/favorites" });
  assert.equal(isHistoryNavigation(), false);
  // Y retroceder de un nivel de preview a otro, tampoco.
  popstate({ from: "/favorites?preview=tv-2", to: "/favorites?preview=movie-550" });
  assert.equal(isHistoryNavigation(), false);
});

test("volver a la misma ruta con OTRA query sí es navegación de historial", () => {
  limpiar();
  popstate({ from: "/favorites?tab=series", to: "/favorites" });
  assert.equal(isHistoryNavigation(), true);
});

// Next renderiza la página NUEVA antes de su `pushState` (que es lo que
// cancela la ventana): en ese render la URL aún es la de la página a la que se
// volvió. Lo que se pregunta es si ESA ruta que se renderiza es la de la vuelta.
test("la página de un enlace pulsado justo después de volver NO es una vuelta atrás", () => {
  limpiar();
  popstate({ from: "/details/movie/1", to: "/favorites" });
  assert.equal(isHistoryNavigation("/favorites"), true, "la página a la que se volvió");
  assert.equal(isHistoryNavigation("/watchlist"), false, "Pendientes, pulsada antes del pushState");
});

test("el marcador de sesión tampoco tiñe otra ruta renderizada antes del pushState", () => {
  limpiar();
  globalThis.window.location = { pathname: "/favorites", search: "" };
  globalThis.window.sessionStorage.setItem(
    "showverse:pending-history-navigation",
    JSON.stringify({ route: "/favorites", at: Date.now() }),
  );
  assert.equal(isHistoryNavigation("/favorites"), true);
  assert.equal(isHistoryNavigation("/watchlist"), false);
});
