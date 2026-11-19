// backend/src/lib/requestLog.js
// Piezas del registro de peticiones (tabla request_log): qué se guarda de cada
// petición y el búfer que lo escribe en lotes. El plugin plugins/requestLog.js
// las monta sobre Fastify.
//
// Datos personales mínimos: IP truncada (/24 en IPv4, /48 en IPv6), país de
// Cloudflare y navegador. La web (Next) reenvía país y navegador del visitante
// en CF-IPCountry y X-Client-User-Agent: sin ellos el backend solo vería el
// servidor de Next.

const MAX_ROUTE = 200;
const MAX_USER_AGENT = 300;
const SKIP_PATHS = new Set(['/health', '/ready']);

/** IP truncada para no guardar la dirección exacta, o null si no es una IP. */
export function truncateIp(raw) {
  let ip = String(raw || '').trim();
  if (!ip) return null;
  if (ip.startsWith('::ffff:') && ip.includes('.')) ip = ip.slice(7);
  const v4 = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.\d{1,3}$/);
  if (v4) return `${v4[1]}.${v4[2]}.${v4[3]}.0`;
  if (!ip.includes(':') || !/^[0-9a-f:]+$/i.test(ip)) return null;
  // Expandir «::» lo justo para leer los tres primeros grupos.
  const [head, tail = ''] = ip.split('::');
  const headGroups = head ? head.split(':') : [];
  const tailGroups = ip.includes('::') ? (tail ? tail.split(':') : []) : [];
  const missing = 8 - headGroups.length - tailGroups.length;
  const groups = ip.includes('::')
    ? [...headGroups, ...Array(Math.max(missing, 0)).fill('0'), ...tailGroups]
    : headGroups;
  if (groups.length !== 8) return null;
  return `${groups.slice(0, 3).map((g) => g.replace(/^0+(?=.)/, '').toLowerCase()).join(':')}::`;
}

/** Patrón de la ruta (/v1/lists/:id) para agrupar; la ruta real si no hay patrón (404). */
export function routeLabel(request) {
  const pattern = request?.routeOptions?.url;
  const raw = pattern || String(request?.url || '').split('?')[0] || '/';
  return raw.slice(0, MAX_ROUTE);
}

export function shouldLogRequest(request) {
  if (String(request?.method || '').toUpperCase() === 'OPTIONS') return false;
  const path = String(request?.url || '').split('?')[0];
  return !SKIP_PATHS.has(path);
}

function header(request, name) {
  const value = request?.headers?.[name];
  return Array.isArray(value) ? value[0] : value;
}

export function buildRequestLogEntry(request, reply) {
  const country = String(header(request, 'cf-ipcountry') || '').trim().toUpperCase();
  const userAgent = String(
    header(request, 'x-client-user-agent') || header(request, 'user-agent') || '',
  ).trim();
  return {
    method: String(request?.method || 'GET').toUpperCase(),
    route: routeLabel(request),
    status: Number(reply?.statusCode) || 0,
    durationMs: Math.max(0, Math.round(Number(reply?.elapsedTime) || 0)),
    userId: request?.user?.id || null,
    // XX = desconocido y T1 = Tor en Cloudflare: no son países.
    country: /^[A-Z]{2}$/.test(country) && country !== 'XX' ? country : null,
    ip: truncateIp(request?.ip),
    userAgent: userAgent ? userAgent.slice(0, MAX_USER_AGENT) : null,
  };
}

/**
 * Cola en memoria que escribe en lotes: al llegar a `maxBatch` filas o cada
 * `flushMs`. Si la escritura falla, las filas vuelven a la cola; pasado
 * `maxQueue` se descartan las más viejas (son métricas: mejor perder unas
 * filas que la memoria del NAS). Si el proceso muere, se pierde lo encolado.
 */
export function createRequestLogBuffer({
  insert,
  maxBatch = 200,
  maxQueue = 5000,
  flushMs = 5000,
  onError = () => {},
} = {}) {
  let queue = [];
  let pending = Promise.resolve();
  let timer = null;

  function drop() {
    if (queue.length > maxQueue) queue = queue.slice(queue.length - maxQueue);
  }

  async function writeOnce() {
    while (queue.length) {
      const batch = queue.slice(0, maxBatch);
      queue = queue.slice(batch.length);
      try {
        await insert(batch);
      } catch (err) {
        queue = [...batch, ...queue];
        drop();
        onError(err);
        return;
      }
    }
  }

  function flush() {
    pending = pending.then(writeOnce);
    return pending;
  }

  if (flushMs > 0) {
    timer = setInterval(() => { if (queue.length) flush(); }, flushMs);
    timer.unref?.();
  }

  return {
    push(entry) {
      queue.push(entry);
      drop();
      if (queue.length >= maxBatch) flush();
    },
    flush,
    idle: () => pending,
    size: () => queue.length,
    async close() {
      if (timer) clearInterval(timer);
      timer = null;
      await flush();
    },
  };
}
