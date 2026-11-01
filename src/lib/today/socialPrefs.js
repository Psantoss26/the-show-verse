// Preferencias del menú de /social: la sección (Actividad · Siguiendo · Yo),
// Quién, Día y Agrupar de Actividad, y Filtro y Orden de Siguiendo / Yo. Van en
// una cookie, como la pestaña de /lists (listsSourcePrefs.js), para que el
// SERVIDOR pinte ya lo elegido y pida los datos de esa ventana: leídas solo en
// el cliente, la página llegaba con los valores por defecto y saltaba al
// hidratar. Lo que diga la URL (un enlace compartido) gana a lo guardado.
//
// La vista y el agrupado de Siguiendo / Yo y la vista de Actividad siguen en
// localStorage (SocialClient).

import { SOCIAL_VIEWS, TODAY_GROUPS, TODAY_SCOPES } from "./params.js";

export const SOCIAL_PREFS_COOKIE = "showverse_social_prefs";

// Un día concreto (AAAA-MM-DD) no se guarda: al volver otro día ya no sería
// lo que se eligió. «Ayer» y «Semana» sí, porque se mueven con la fecha.
const SAVED_DAYS = ["today", "yesterday", "week"];
const ORDERS = ["recent", "oldest"];
const FILTER_RE = /^[a-z_]{1,24}$/;

const KEYS = {
  view: (v) => SOCIAL_VIEWS.includes(v),
  scope: (v) => TODAY_SCOPES.includes(v),
  day: (v) => SAVED_DAYS.includes(v),
  group: (v) => TODAY_GROUPS.includes(v),
  // Los filtros válidos los conoce SocialClient (FILTROS); aquí solo la forma.
  filter: (v) => FILTER_RE.test(v),
  order: (v) => ORDERS.includes(v),
};

/** Valor de la cookie → preferencias válidas (las que no valen se omiten). */
export function readSocialPrefs(raw) {
  const out = {};
  if (!raw || typeof raw !== "string") return out;
  let params;
  try {
    params = new URLSearchParams(decodeURIComponent(raw));
  } catch {
    return out;
  }
  for (const [key, valid] of Object.entries(KEYS)) {
    const value = params.get(key);
    if (value && valid(value)) out[key] = value;
  }
  return out;
}

/** Preferencias → valor de la cookie, sin las que no valen. */
export function serializeSocialPrefs(prefs) {
  const params = new URLSearchParams();
  for (const [key, valid] of Object.entries(KEYS)) {
    const value = prefs?.[key];
    if (value && valid(value)) params.set(key, value);
  }
  return encodeURIComponent(params.toString());
}

/**
 * Parámetros con los que se abre la página: los de la URL y, para lo que no
 * traiga, lo guardado. `saved` dice si se ha usado algo guardado: entonces no
 * se salta solo de un «Hoy» vacío a la Semana o a Siguiendo, se respeta lo
 * elegido.
 */
export function mergeSocialParams(params, prefs) {
  const merged = { ...(params || {}) };
  let saved = false;
  // Un enlace con algo de Actividad (?scope=, ?day=, ?group=, ?story=) es a
  // Actividad: no se cambia a la sección guardada.
  const toActivity = ["scope", "day", "group", "story"].some((key) => merged[key]);
  for (const key of ["view", "scope", "day", "group"]) {
    if (key === "view" && toActivity) continue;
    if (!merged[key] && prefs?.[key]) {
      merged[key] = prefs[key];
      saved = true;
    }
  }
  return { params: merged, saved };
}

/** Escribe la cookie (solo cliente). Un año, para toda la web. */
export function writeSocialPrefsCookie(prefs) {
  if (typeof document === "undefined") return;
  try {
    document.cookie = `${SOCIAL_PREFS_COOKIE}=${serializeSocialPrefs(prefs)}; Path=/; Max-Age=31536000; SameSite=Lax`;
  } catch {
    // Sin cookies: se queda para esta visita.
  }
}
