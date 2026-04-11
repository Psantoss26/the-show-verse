// src/lib/trakt/fetchWithCache.js
// Sistema centralizado de cache y retry para peticiones a Trakt API

const TRAKT_BASE = "https://api.trakt.tv";

// Cache en memoria con TTL
const cache = new Map();
const pendingRequests = new Map(); // Deduplicación de peticiones en vuelo
const rateLimitCache = new Map(); // Cache negativo: rutas bloqueadas por 429

// Configuración
const CACHE_TTL = 5 * 60 * 1000; // 5 minutos
const MAX_RETRIES = 3;
const BASE_RETRY_DELAY = 1000; // 1 segundo

function traktHeaders() {
  const key = process.env.TRAKT_CLIENT_ID;
  if (!key) throw new Error("Missing TRAKT_CLIENT_ID");
  return {
    "Content-Type": "application/json",
    "trakt-api-version": "2",
    "trakt-api-key": key,
    "User-Agent": "TheShowVerse/1.0 (Next.js; Trakt OAuth)",
  };
}

/**
 * Comprueba si una ruta está bloqueada por rate limit.
 * Devuelve los segundos restantes (>0) o 0 si no está bloqueada.
 */
function getRateLimitSeconds(cacheKey) {
  const entry = rateLimitCache.get(cacheKey);
  if (!entry) return 0;
  const remaining = Math.ceil((entry.until - Date.now()) / 1000);
  if (remaining <= 0) {
    rateLimitCache.delete(cacheKey);
    return 0;
  }
  return remaining;
}

/**
 * Guarda el bloqueo de rate limit para una ruta.
 */
function setRateLimitBlock(cacheKey, retryAfterSeconds) {
  rateLimitCache.set(cacheKey, {
    until: Date.now() + retryAfterSeconds * 1000,
    retryAfter: retryAfterSeconds,
  });
}

/**
 * Obtiene datos del cache si están disponibles y no han expirado
 */
function getFromCache(cacheKey) {
  const cached = cache.get(cacheKey);
  if (!cached) return null;

  const now = Date.now();
  if (now > cached.expiresAt) {
    cache.delete(cacheKey);
    return null;
  }

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
  const { timeoutMs = 8000, signal, headers: customHeaders } = options;

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

    const json = await res.json().catch(() => null);

    // Otros errores de servidor (5xx) - reintentar con exponential backoff
    if (res.status >= 500 && res.status < 600 && retryCount < MAX_RETRIES) {
      const waitTime = BASE_RETRY_DELAY * Math.pow(2, retryCount);
      console.warn(
        `⚠️ Trakt server error (${res.status}) on ${path}, retrying in ${waitTime}ms`,
      );
      await sleep(waitTime);
      return fetchTraktWithRetry(path, options, retryCount + 1);
    }

    if (!res.ok) {
      const msg = json?.error || json?.message || `Trakt error (${res.status})`;
      throw new Error(msg);
    }

    return json;
  } catch (err) {
    clearTimeout(timeoutId);

    if (err.name === "AbortError") {
      throw new Error("Trakt request timeout");
    }

    // Si el error es de red y tenemos reintentos, reintentar
    if (
      retryCount < MAX_RETRIES &&
      (err.message.includes("fetch failed") || err.message.includes("network"))
    ) {
      const waitTime = BASE_RETRY_DELAY * Math.pow(2, retryCount);
      console.warn(`⚠️ Network error on ${path}, retrying in ${waitTime}ms`);
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

  // 0. Comprobar bloqueo por rate limit (tiene prioridad sobre todo lo demás)
  const rlSeconds = getRateLimitSeconds(cacheKey);
  if (rlSeconds > 0) {
    const err = new Error(
      `Trakt rate limit exceeded (retry after ${rlSeconds}s)`,
    );
    err.status = 429;
    err.retryAfter = rlSeconds;
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
    return pendingRequests.get(cacheKey);
  }

  // 3. Crear nueva petición
  const requestPromise = fetchTraktWithRetry(path, { ...fetchOptions, headers })
    .then((data) => {
      // Guardar en cache si está habilitado
      if (useCache && data) {
        saveToCache(cacheKey, data, cacheTTL);
      }
      return data;
    })
    .catch((err) => {
      // Cachear el bloqueo de rate limit para evitar más peticiones
      if (err.status === 429) {
        setRateLimitBlock(cacheKey, err.retryAfter || 30);
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
  rateLimitCache.clear();
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
