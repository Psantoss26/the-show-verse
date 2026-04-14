// src/lib/trakt/fetchWithCache.js
// Sistema centralizado de cache y retry para peticiones a Trakt API

const TRAKT_BASE = "https://api.trakt.tv";

// Cache en memoria con TTL
const cache = new Map();
const pendingRequests = new Map(); // Deduplicación de peticiones en vuelo
let globalRateLimit = null; // Bloqueo GLOBAL cuando Trakt devuelve 429

// Configuración
const CACHE_TTL = 60 * 60 * 1000; // 1 hora (Trakt data cambia lentamente)
const MAX_RETRIES = 3;
const BASE_RETRY_DELAY = 1000; // 1 segundo

function isExpectedUpstreamStatus(status) {
  return [403, 404, 405, 429].includes(Number(status));
}

function traktHeaders() {
  const key = process.env.TRAKT_CLIENT_ID;
  if (!key) {
    console.error(
      "❌ TRAKT_CLIENT_ID no configurada. Variables TRAKT disponibles:",
      Object.keys(process.env).filter((k) => k.includes("TRAKT")),
    );
    throw new Error("Missing TRAKT_CLIENT_ID environment variable");
  }

  return {
    "Content-Type": "application/json",
    Accept: "application/json",
    "trakt-api-version": "2",
    "trakt-api-key": key,
    "User-Agent": "TheShowVerse/1.0 (Next.js; Trakt OAuth)",
  };
}

/**
 * Comprueba si hay un bloqueo GLOBAL por rate limit.
 * Devuelve los segundos restantes (>0) o 0 si no está bloqueada.
 */
function getGlobalRateLimitSeconds() {
  if (!globalRateLimit) return 0;
  const remaining = Math.ceil((globalRateLimit.until - Date.now()) / 1000);
  if (remaining <= 0) {
    globalRateLimit = null;
    return 0;
  }
  return remaining;
}

/**
 * Guarda el bloqueo GLOBAL de rate limit.
 */
function setGlobalRateLimit(retryAfterSeconds) {
  const until = Date.now() + retryAfterSeconds * 1000;
  globalRateLimit = { until, retryAfter: retryAfterSeconds };
  console.warn(
    `🚫 Trakt API bloqueada globalmente por ${retryAfterSeconds}s (hasta ${new Date(until).toLocaleTimeString()})`,
  );
}

/**
 * Obtiene datos del cache (incluso si están expirados, en caso de emergencia)
 */
function getFromCache(cacheKey, allowStale = false) {
  const cached = cache.get(cacheKey);
  if (!cached) return null;

  const now = Date.now();
  if (now > cached.expiresAt) {
    // Si permitimos datos stale (ej: durante rate limit), devolverlos
    if (allowStale) {
      console.log(`📦 Sirviendo datos STALE del cache para ${cacheKey}`);
      return cached.data;
    }
    cache.delete(cacheKey);
    return null;
  }

  // Log cuando servimos datos frescos del cache
  const remainingMin = Math.ceil((cached.expiresAt - now) / 60000);
  console.log(`✅ Cache HIT: ${cacheKey} (expira en ${remainingMin}m)`);

  return cached.data;
}

/**
 * Guarda datos en el cache con TTL
 */
function saveToCache(cacheKey, data, ttl = CACHE_TTL) {
  cache.set(cacheKey, {
    data,
    expiresAt: Date.now() + ttl,
  });
}

/**
 * Espera un tiempo determinado (para retry)
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Realiza una petición a Trakt con retry automático y exponential backoff
 */
async function fetchTraktWithRetry(path, options = {}, retryCount = 0) {
  // Timeout más generoso en producción (20s vs 10s) para evitar fallos
  const defaultTimeout = process.env.NODE_ENV === "production" ? 20000 : 10000;
  const {
    timeoutMs = defaultTimeout,
    signal,
    headers: customHeaders,
  } = options;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  // Combinar señales de abort
  if (signal) {
    signal.addEventListener("abort", () => controller.abort());
  }

  // Combinar headers personalizados con los por defecto
  const headers = customHeaders || traktHeaders();

  try {
    const res = await fetch(`${TRAKT_BASE}${path}`, {
      headers,
      cache: "no-store",
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    // Manejar rate limiting (429) — falla rápido sin esperar
    if (res.status === 429) {
      const json = await res.json().catch(() => ({}));
      const retryAfter =
        res.headers.get("retry-after") || json.retry_after || 30;

      console.warn(
        `⚠️ Trakt rate limit (429) on ${path}, retry-after: ${retryAfter}s`,
      );

      // Lanzar inmediatamente sin dormir para no bloquear conexiones del navegador
      const err = new Error(
        `Trakt rate limit exceeded (retry after ${retryAfter}s)`,
      );
      err.status = 429;
      err.retryAfter = Number(retryAfter) || 30;
      throw err;
    }

    // Intentar parsear JSON con mejor manejo de errores
    let json = null;
    let errorText = null;
    const contentType = res.headers.get("content-type");
    const expectedStatus = isExpectedUpstreamStatus(res.status);
    const logUnexpected = expectedStatus ? console.warn : console.error;

    if (contentType?.includes("application/json")) {
      try {
        json = await res.json();
      } catch (parseErr) {
        if (!res.ok) {
          logUnexpected(
            `❌ Error parsing Trakt JSON (${res.status}) for ${path}:`,
            parseErr.message,
          );
          // Intentar leer como texto para debugging
          errorText = await res.text().catch(() => null);
        }
      }
    } else if (!res.ok) {
      // Si la respuesta es un error y no es JSON, capturar el texto
      errorText = await res.text().catch(() => "");
      logUnexpected(
        `⚠️ Trakt returned non-JSON error (${res.status}) for ${path}`,
      );
      logUnexpected(`   Content-Type: ${contentType}`);
      logUnexpected(`   Response preview: ${errorText.substring(0, 200)}`);
    }

    // Otros errores de servidor (5xx) - reintentar con exponential backoff
    // PERO: para endpoints de stats (/stats), NO reintentar - son errores de Trakt
    const isStatsEndpoint = path.includes("/stats");

    if (res.status >= 500 && res.status < 600) {
      // Para /stats, fallar inmediatamente (no reintentar errores del servidor de Trakt)
      if (isStatsEndpoint) {
        console.warn(
          `⚠️ Trakt server error (${res.status}) on ${path} - NO reintentando (problema de Trakt)`,
        );
        const msg =
          json?.error || json?.message || `Trakt server error ${res.status}`;
        const err = new Error(msg);
        err.status = res.status;
        err.path = path;
        err.isServerError = true;
        throw err;
      }

      // Para otros endpoints, reintentar con backoff
      if (retryCount < MAX_RETRIES) {
        const waitTime = BASE_RETRY_DELAY * Math.pow(2, retryCount);
        console.warn(
          `⚠️ Trakt server error (${res.status}) on ${path}, retrying in ${waitTime}ms (attempt ${retryCount + 1}/${MAX_RETRIES})`,
        );
        await sleep(waitTime);
        return fetchTraktWithRetry(path, options, retryCount + 1);
      }
    }

    if (!res.ok) {
      // Construir mensaje de error con texto capturado si no hay JSON
      const msg = 
        json?.error || 
        json?.message || 
        (errorText && errorText.length < 100 ? errorText : null) ||
        `Trakt HTTP ${res.status}`;
      
      logUnexpected(`❌ Trakt error ${res.status} on ${path}: ${msg}`);
      
      // 403 puede ser auth expirado o rate limiting disfrazado
      if (res.status === 403) {
        console.warn(`⚠️ Trakt 403 Forbidden - posible token inválido o rate limit`);
      }
      
      const err = new Error(msg);
      err.status = res.status;
      err.path = path;
      err.isForbidden = res.status === 403;
      throw err;
    }

    return json;
  } catch (err) {
    clearTimeout(timeoutId);

    if (err.name === "AbortError") {
      console.warn(`⏱️ Trakt request timeout on ${path} after ${timeoutMs}ms`);
      const timeoutErr = new Error(`Trakt request timeout (${timeoutMs}ms)`);
      timeoutErr.isTimeout = true;
      timeoutErr.path = path;
      throw timeoutErr;
    }

    // Si el error es de red y tenemos reintentos, reintentar
    if (
      retryCount < MAX_RETRIES &&
      (err.message.includes("fetch failed") ||
        err.message.includes("network") ||
        err.message.includes("ECONNREFUSED") ||
        err.message.includes("ETIMEDOUT"))
    ) {
      const waitTime = BASE_RETRY_DELAY * Math.pow(2, retryCount);
      console.warn(
        `⚠️ Network error on ${path}, retrying in ${waitTime}ms (attempt ${retryCount + 1}/${MAX_RETRIES})`,
      );
      await sleep(waitTime);
      return fetchTraktWithRetry(path, options, retryCount + 1);
    }

    throw err;
  }
}

/**
 * Fetch principal con cache y deduplicación
 * @param {string} path - Ruta de la API de Trakt (sin el dominio base)
 * @param {object} options - Opciones de fetch
 * @param {boolean} options.useCache - Si usar cache (default: true)
 * @param {number} options.cacheTTL - TTL del cache en ms (default: 5min)
 * @param {number} options.timeoutMs - Timeout de la petición (default: 8000ms)
 * @param {object} options.headers - Headers personalizados (opcional)
 */
export async function fetchTrakt(path, options = {}) {
  const {
    useCache = true,
    cacheTTL = CACHE_TTL,
    headers,
    ...fetchOptions
  } = options;
  const cacheKey = `trakt:${path}`;

  // 0. Comprobar bloqueo GLOBAL por rate limit
  const rlSeconds = getGlobalRateLimitSeconds();
  if (rlSeconds > 0) {
    // Intentar servir datos stale del cache si los hay
    const staleData = getFromCache(cacheKey, true);
    if (staleData !== null) {
      console.log(`⚠️ Rate limit activo, sirviendo datos cache para ${path}`);
      return staleData;
    }

    // Si no hay cache disponible, lanzar error
    const err = new Error(
      `Trakt API temporalmente no disponible (rate limit: ${rlSeconds}s)`,
    );
    err.status = 429;
    err.retryAfter = rlSeconds;
    err.isRateLimit = true;
    throw err;
  }

  // 1. Verificar cache
  if (useCache) {
    const cached = getFromCache(cacheKey);
    if (cached !== null) {
      return cached;
    }
  }

  // 2. Deduplicación: si ya hay una petición en vuelo para esta ruta, esperarla
  if (pendingRequests.has(cacheKey)) {
    console.log(`⏳ Esperando petición en vuelo: ${path}`);
    return pendingRequests.get(cacheKey);
  }

  // 3. Crear nueva petición (Cache MISS - petición HTTP real)
  console.log(`🌐 Cache MISS → Petición HTTP a Trakt: ${path}`);
  const requestPromise = fetchTraktWithRetry(path, { ...fetchOptions, headers })
    .then((data) => {
      // Guardar en cache si está habilitado
      if (useCache && data) {
        saveToCache(cacheKey, data, cacheTTL);
      }
      return data;
    })
    .catch((err) => {
      // Guardar bloqueo GLOBAL cuando hay rate limit
      if (err.status === 429) {
        setGlobalRateLimit(err.retryAfter || 300); // Default 5 minutos

        // Intentar servir datos stale como último recurso
        const staleData = getFromCache(cacheKey, true);
        if (staleData !== null) {
          console.log(
            `⚠️ Rate limit alcanzado, sirviendo cache stale para ${path}`,
          );
          return staleData;
        }
      }
      throw err;
    })
    .finally(() => {
      // Limpiar de pendientes
      pendingRequests.delete(cacheKey);
    });

  pendingRequests.set(cacheKey, requestPromise);
  return requestPromise;
}

/**
 * Fetch que devuelve null en caso de error (para llamadas opcionales)
 */
export async function fetchTraktMaybe(path, options = {}) {
  try {
    return await fetchTrakt(path, options);
  } catch (err) {
    console.warn(`Trakt optional request failed: ${path}`, err.message);
    return null;
  }
}

/**
 * Limpia el cache (útil para testing o invalidación manual)
 */
export function clearCache() {
  cache.clear();
  pendingRequests.clear();
  globalRateLimit = null;
}

/**
 * Normaliza el tipo de contenido
 */
export function normalizeType(input) {
  const t = String(input || "")
    .toLowerCase()
    .trim();
  if (t === "tv" || t === "show") return "show";
  if (t === "movie") return "movie";
  if (t === "season") return "season";
  if (t === "episode") return "episode";
  return null;
}
