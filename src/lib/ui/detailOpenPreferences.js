// Cómo se abre un título al pulsarlo (escritorio), por ámbito:
//   - `dashboard`: Inicio, Películas, Series… (por defecto, modal CENTRADO);
//   - `userPages`: Favoritos, Pendientes, Historial, listas… (por defecto,
//     panel LATERAL).
// Se guarda en `preferences.uiSettings.detailOpen` (servidor, todos los
// dispositivos). Lo lee DetailModalProvider como punto de partida y lo cambian
// tanto Ajustes como los controles del propio panel.
//
//   target       "panel" (ficha rápida, DetailModal) | "page" (DetailsClient)
//   placement    "center" | "right"
//   drawerView   "overlay" (superpuesto) | "docked" (acoplado)   — lateral
//   contentView  "modal" (ficha) | "mobile" (vista teléfono)     — lateral
//
// Un campo ausente es «sin preferencia»: se usa lo de antes (la elección
// guardada en el navegador o el valor por defecto del ámbito).

export const DETAIL_OPEN_SCOPES = ["dashboard", "userPages"];

const FIELDS = {
  target: ["panel", "page"],
  placement: ["center", "right"],
  drawerView: ["overlay", "docked"],
  contentView: ["modal", "mobile"],
};

export const DETAIL_OPEN_DEFAULTS = {
  dashboard: { target: "panel", placement: "center", drawerView: "overlay", contentView: "modal" },
  userPages: { target: "panel", placement: "right", drawerView: "overlay", contentView: "modal" },
};

function cleanScope(raw) {
  const out = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [field, allowed] of Object.entries(FIELDS)) {
    if (allowed.includes(raw[field])) out[field] = raw[field];
  }
  return out;
}

/** Preferencia guardada de un ámbito: solo los campos válidos que existan. */
export function readDetailOpen(uiSettings, scope) {
  if (!DETAIL_OPEN_SCOPES.includes(scope)) return {};
  return cleanScope(uiSettings?.detailOpen?.[scope]);
}

/** La de un ámbito con sus valores por defecto donde no hay preferencia (Ajustes). */
export function resolveDetailOpen(uiSettings, scope) {
  return { ...DETAIL_OPEN_DEFAULTS[scope], ...readDetailOpen(uiSettings, scope) };
}

/** `uiSettings` nuevo con el parche aplicado a un ámbito (campos inválidos fuera). */
export function withDetailOpen(uiSettings, scope, patch) {
  const current = uiSettings && typeof uiSettings === "object" ? uiSettings : {};
  if (!DETAIL_OPEN_SCOPES.includes(scope)) return current;
  const detailOpen = current.detailOpen && typeof current.detailOpen === "object" ? current.detailOpen : {};
  return {
    ...current,
    detailOpen: {
      ...detailOpen,
      [scope]: cleanScope({ ...cleanScope(detailOpen[scope]), ...patch }),
    },
  };
}
