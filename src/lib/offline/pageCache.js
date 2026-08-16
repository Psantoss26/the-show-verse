// Caché de página "stale-while-revalidate" en localStorage, para que cada página de
// usuario / dashboard pueda pintar su ÚLTIMO contenido al instante y —clave para el
// modo offline (NAS apagado)— seguir mostrándolo cuando /api falla. Unifica el
// patrón que ya usaban Favoritos/Watchlist/Historial a mano.
//
// Uso:
//   const cache = makePageCache("showverse:inprogress:items:v1");
//   const seed = cache.read();                 // { items, meta, fresh } | null
//   const [items, setItems] = useState(() => seed?.items || []);
//   ...tras un fetch OK:  cache.write(items, { extra });
//   ...si el fetch falla y hay seed, se conserva `items` (no vaciar).

import { setLocalStorageItem } from "@/lib/storage/localStorageBudget";

const DEFAULT_TTL_MS = 10 * 60 * 1000; // "fresco" (revalidar en segundo plano)
const DEFAULT_HARD_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // descartar si es más viejo

export function makePageCache(
  key,
  { ttlMs = DEFAULT_TTL_MS, hardMaxAgeMs = DEFAULT_HARD_MAX_AGE_MS } = {},
) {
  function read() {
    if (typeof window === "undefined") return null;
    try {
      const raw = window.localStorage.getItem(key);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed?.items)) return null;
      const age = Date.now() - Number(parsed.t || 0);
      if (age > hardMaxAgeMs) {
        window.localStorage.removeItem(key);
        return null;
      }
      return {
        items: parsed.items,
        meta: parsed.meta || null,
        fresh: age < ttlMs,
      };
    } catch {
      return null;
    }
  }

  function write(items, meta = null) {
    if (typeof window === "undefined") return;
    try {
      // Vía `setLocalStorageItem`: si el almacenamiento está lleno hace sitio
      // desalojando cachés por título antes de rendirse. Perder ESTA escritura
      // deja a la página sin pintado instantáneo la próxima vez, que es
      // justamente el fallo que estamos evitando.
      setLocalStorageItem(
        key,
        JSON.stringify({
          t: Date.now(),
          items: Array.isArray(items) ? items : [],
          meta: meta || undefined,
        }),
      );
    } catch {
      // Modo privado: ignorar (best-effort).
    }
  }

  function clear() {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.removeItem(key);
    } catch {
      // ignore
    }
  }

  return { read, write, clear, key };
}
