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
    _d: new Map(),
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

const { isHistoryNavigation, notifyPushNavigation } = await import(
  "./useIsHistoryNavigation.js"
);

const popstate = () => listeners.get("popstate")?.();
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
