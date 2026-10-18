// PILA DE PANTALLAS VIVAS DE OverlayRouteHost.
//
// Cada URL visitada es una pantalla: la página del slot `children`
// (`kind: "page"`) o la ficha del slot `@overlay` (`kind: "overlay"`). La
// activa se ve; las demás siguen montadas en <Activity hidden> para que volver
// atrás las muestre tal cual, sin montarlas de nuevo.
//
// Sin dependencias de React ni de Next (se testea con Node).

export const MAX_SCREENS = 5;

function createScreen(state, key, kind) {
  return {
    screen: { id: state.serial, key, kind },
    serial: state.serial + 1,
  };
}

export function createScreenStack(key, kind) {
  const { screen, serial } = createScreen({ serial: 0 }, key, kind);
  return { screens: [screen], active: 0, serial, revealed: false };
}

// Pila tras navegar a `key` (ruta) con una ficha en el slot o una página.
// `history`: es una vuelta atrás/adelante del navegador. `revealed` indica que
// se ha recuperado una pantalla que seguía montada.
export function navigateScreens(state, key, kind, history) {
  const existing = state.screens.findIndex((screen) => screen.key === key);
  // Atrás/adelante a una pantalla guardada: se muestra tal cual estaba.
  if (history && existing !== -1 && state.screens[existing].kind === kind) {
    return { ...state, active: existing, revealed: true };
  }
  // Navegación nueva: como el historial, se descartan las pantallas "hacia
  // adelante" y la copia vieja de esta misma ruta (Favoritos → ficha → enlace a
  // Favoritos se monta de nuevo, con su entrada y su estado al día). Una vuelta
  // a una pantalla que ya no está (descartada por el tope) se monta sin más.
  const kept = (history ? state.screens : state.screens.slice(0, state.active + 1))
    .filter((screen) => screen.key !== key);
  const { screen, serial } = createScreen(state, key, kind);
  const screens = [...kept, screen];
  // Tope de pantallas vivas: fuera la más antigua, salvo la página de partida
  // (el dashboard o la lista desde la que se abrió todo), que es a la que más
  // se vuelve.
  while (screens.length > MAX_SCREENS) {
    const victim = screens.findIndex(
      (candidate, index) => candidate !== screen && !(index === 0 && candidate.kind === "page"),
    );
    if (victim === -1) break;
    screens.splice(victim, 1);
  }
  return { screens, active: screens.indexOf(screen), serial, revealed: false };
}
