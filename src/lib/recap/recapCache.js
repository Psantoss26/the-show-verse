// Petición compartida del resumen anual (/api/recap). La vista previa del
// lateral del Perfil y la página /recap piden lo mismo: con esta caché en
// memoria, abrir el resumen desde la vista previa no vuelve a esperar al
// backend. Solo vive lo que dura la pestaña; el backend tiene su propia caché.

const TTL_MS = 10 * 60 * 1000;
const entries = new Map(); // clave → { at, data } | { promise }

function keyFor(year) {
  return year ? String(year) : "default";
}

export function getCachedRecap(year = null) {
  const entry = entries.get(keyFor(year));
  if (!entry?.data || Date.now() - entry.at > TTL_MS) return null;
  return entry.data;
}

function remember(year, data) {
  const stamp = { at: Date.now(), data };
  entries.set(keyFor(year), stamp);
  // Lo pedido sin año es también el resumen de su año concreto.
  if (!year && data?.year) entries.set(keyFor(data.year), stamp);
}

/**
 * Devuelve `{ status, data }` con status 200/401/… La misma petición en curso
 * se comparte entre quienes la pidan a la vez.
 */
export function fetchRecap(year = null, { signal } = {}) {
  const cached = getCachedRecap(year);
  if (cached) return Promise.resolve({ status: 200, data: cached });
  const key = keyFor(year);
  const pending = entries.get(key)?.promise;
  if (pending) return pending;

  const qs = year ? `?year=${encodeURIComponent(year)}` : "";
  const promise = fetch(`/api/recap${qs}`, { cache: "no-store", credentials: "include" })
    .then(async (res) => {
      const data = await res.json().catch(() => null);
      if (res.ok && data) remember(year, data);
      else entries.delete(key);
      return { status: res.status, data };
    })
    .catch((error) => {
      entries.delete(key);
      throw error;
    });
  entries.set(key, { promise });

  // La señal solo corta la espera de quien la pasa, no la petición compartida.
  if (!signal) return promise;
  return new Promise((resolve, reject) => {
    const onAbort = () => reject(new DOMException("Aborted", "AbortError"));
    if (signal.aborted) return onAbort();
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener("abort", onAbort));
  });
}
