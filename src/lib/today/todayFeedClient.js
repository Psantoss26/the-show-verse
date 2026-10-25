// src/lib/today/todayFeedClient.js
//
// Petición compartida de /api/users/today en el navegador. La usan la vista
// «Hoy» de Social y la píldora «Hoy» del navbar (montada dos veces: barra de
// escritorio y de móvil), así que comparten la petición en curso y una copia
// reciente en memoria en vez de pedir lo mismo cada una.

// Lo que vale una copia para la píldora antes de volver a pedirla al navegar.
export const TODAY_FEED_FRESH_MS = 60_000;

const inFlight = new Map();
const recent = new Map();

const keyOf = (scope, day) => `${scope}|${day}`;

/** Copia reciente (o null) sin pedir nada. */
export function peekTodayFeed(scope, day, maxAgeMs = TODAY_FEED_FRESH_MS) {
  const hit = recent.get(keyOf(scope, day));
  return hit && Date.now() - hit.at < maxAgeMs ? hit.data : null;
}

/** La página ya tiene datos (del RSC o de su propia carga): la píldora los reutiliza. */
export function rememberTodayFeed(scope, day, data) {
  if (data && Array.isArray(data.actions)) recent.set(keyOf(scope, day), { at: Date.now(), data });
}

export function fetchTodayFeed(scope = "following", day = "today") {
  const key = keyOf(scope, day);
  if (inFlight.has(key)) return inFlight.get(key);
  const request = fetch(`/api/users/today?scope=${scope}&day=${encodeURIComponent(day)}`, {
    credentials: "include",
    cache: "no-store",
  })
    .then(async (res) => {
      const json = await res.json().catch(() => null);
      if (!res.ok || !Array.isArray(json?.actions)) throw new Error(json?.error || `HTTP ${res.status}`);
      rememberTodayFeed(scope, day, json);
      return json;
    })
    .finally(() => inFlight.delete(key));
  inFlight.set(key, request);
  return request;
}
