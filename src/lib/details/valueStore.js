// Almacén mínimo de UN valor fuera del estado de React.
//
// Para valores que cambian con el SCROLL y solo los pinta una pieza pequeña
// (p. ej. la sección activa del menú sticky de la ficha): guardarlos en el
// estado de un componente grande lo re-renderiza entero en cada cambio, justo
// mientras el usuario arrastra. Aquí quien escribe no re-renderiza nada y solo
// se actualiza quien se suscribe (`useSyncExternalStore`).

export function createValueStore(initial) {
  let value = initial;
  const listeners = new Set();
  return {
    get: () => value,
    set(next) {
      const resolved = typeof next === "function" ? next(value) : next;
      if (Object.is(resolved, value)) return;
      value = resolved;
      listeners.forEach((listener) => listener());
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
