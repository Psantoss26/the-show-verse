// src/lib/today/params.js
// Parámetros de la vista «Hoy» de /social (?scope=&day=&group=), compartidos por
// el RSC y el cliente para que los dos lean lo mismo de un enlace pegado a mano.
// «Siguiendo» y «Yo» son ?view=activity y ?view=mine; «Hoy» es la de por defecto.

export const TODAY_SCOPES = ["following", "community"];
export const TODAY_GROUPS = ["title", "person", "time"];
const DAY_RE = /^(today|yesterday|week|\d{4}-\d{2}-\d{2})$/;

function first(value) {
  return Array.isArray(value) ? value[0] : value;
}

export function normalizeTodayParams(params) {
  const scope = first(params?.scope);
  const day = first(params?.day);
  const group = first(params?.group);
  return {
    scope: TODAY_SCOPES.includes(scope) ? scope : "following",
    day: DAY_RE.test(day || "") ? day : "today",
    group: TODAY_GROUPS.includes(group) ? group : "title",
  };
}

export const SOCIAL_VIEWS = ["today", "activity", "mine"];

export function normalizeSocialView(params) {
  const view = first(params?.view);
  return SOCIAL_VIEWS.includes(view) ? view : "today";
}

/** URL de la vista «Hoy» sin los valores por defecto, para que el enlace quede limpio. */
export function todayHref({ scope, day, group }) {
  const search = new URLSearchParams();
  if (scope && scope !== "following") search.set("scope", scope);
  if (day && day !== "today") search.set("day", day);
  if (group && group !== "title") search.set("group", group);
  const query = search.toString();
  return query ? `/social?${query}` : "/social";
}

/**
 * ¿Se ha entrado en Social sin elegir día (ni historia)? Solo entonces se puede
 * saltar de un «Hoy» vacío a la Semana. Pasar a Siguiendo exige además que no
 * venga nada de Actividad en la URL: un enlace con ?scope= o ?group= es a ella.
 */
export function implicitSocialEntry(params) {
  const has = (key) => Boolean(first(params?.[key]));
  if (has("view") || has("day") || has("story")) return { day: false, view: false };
  return { day: true, view: !has("scope") && !has("group") };
}

/**
 * Adónde lleva la entrada por defecto según los recuentos de días: «today» si
 * hay algo en las últimas 24 h, «week» si solo hay en la semana y «activity»
 * (Siguiendo) si la semana tampoco tiene nada. Sin recuentos no se mueve.
 */
export function defaultSocialLanding(days) {
  if (!Array.isArray(days)) return "today";
  const count = (key) => days.find((d) => d?.key === key)?.count;
  const today = count("today");
  const week = count("week");
  if (typeof today !== "number" || today > 0) return "today";
  if (typeof week !== "number" || week > 0) return "week";
  return "activity";
}
