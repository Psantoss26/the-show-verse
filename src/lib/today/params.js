// src/lib/today/params.js
// Parámetros de la URL de /today (?scope=&day=&group=), compartidos por el RSC
// y el cliente para que los dos lean lo mismo de un enlace pegado a mano.

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

/** URL de /today sin los valores por defecto, para que el enlace quede limpio. */
export function todayHref({ scope, day, group }) {
  const search = new URLSearchParams();
  if (scope && scope !== "following") search.set("scope", scope);
  if (day && day !== "today") search.set("day", day);
  if (group && group !== "title") search.set("group", group);
  const query = search.toString();
  return query ? `/today?${query}` : "/today";
}
