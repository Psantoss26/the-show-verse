// src/lib/tmdb/imageRequests.js
//
// Cliente único para /images de TMDb: limita la concurrencia y reintenta los 429.
//
// POR QUÉ EXISTE
// Cada tarjeta pedía su /images por su cuenta, así que una lista larga (Pendientes,
// Favoritos, dashboards) disparaba 100+ peticiones SIMULTÁNEAS. Medido contra la
// API real: de 150 en paralelo, 20 devuelven 429. Los llamadores hacen
// `if (!r.ok) return null` y la tarjeta cae al `backdrop_path` crudo de TMDb —que
// es el primario, normalmente SIN idioma—, de ahí las tarjetas backdrop sin
// idioma, y sobre todo "al final" de la lista: las últimas de la ráfaga son las
// limitadas.
//
// QUÉ HACE
//   1. Cola con tope de concurrencia: nunca hay más de MAX_CONCURRENT en vuelo,
//      así que no se provoca el 429 en primer lugar.
//   2. Reintento con backoff SOLO ante 429: si aun así llega, se reintenta en vez
//      de rendirse y degradar la imagen.
//   3. Deduplicación: dos tarjetas del mismo título comparten una sola petición.
//
// NO cachea respuestas fallidas: un 429 es transitorio y cachearlo dejaría el
// título degradado toda la sesión. La caché de resultados vive en los llamadores.

import { TMDB_IMAGE_LANGS_PARAM } from "@/lib/tmdb/imageLanguages";

// Medido contra la API real, con rangos de IDs distintos por nivel para que
// nada saliera de la caché HTTP:
//
//   concurrencia:  6   12   20   32   48   150
//   429:           0    0    0    0    0    19
//
// Hasta 48 simultáneas TMDb no limita; el problema aparece al dispararlas todas
// (una lista larga son 100+). 24 deja la mitad de margen sobre el último valor
// medido limpio, que hace falta porque estas peticiones comparten cupo con el
// resto de la app (pósters, logos, detalles).
//
// El primer valor que puse aquí fue 6, elegido a ojo: no provocaba 429 pero
// serializaba la parrilla en 25 tandas (~7s para 150 títulos) sin ninguna razón
// medida. El reintento con backoff de abajo sigue cubriendo el 429 residual.
const MAX_CONCURRENT = 24;
const MAX_RETRIES = 3;
const BASE_BACKOFF_MS = 250;

let active = 0;
const pending = [];

function pump() {
  while (active < MAX_CONCURRENT && pending.length > 0) {
    const job = pending.shift();
    active += 1;
    job
      .run()
      .then(job.resolve, job.reject)
      .finally(() => {
        active -= 1;
        pump();
      });
  }
}

function schedule(run) {
  return new Promise((resolve, reject) => {
    pending.push({ run, resolve, reject });
    pump();
  });
}

const sleep = (ms) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

// Devuelve el JSON de /images, o null si no se pudo obtener.
async function requestImages(url) {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    let response;
    try {
      // NO se usa `force-cache`. Ese modo devuelve SIEMPRE lo que haya en caché
      // sin tocar la red, así que:
      //   - si un logo devolvió un error transitorio y quedó en caché, se servía
      //     ese error indefinidamente (fallo per-navegador, invisible desde el
      //     servidor: por eso "en muchos casos no aparece el logo");
      //   - y el bucle de reintentos de abajo era INÚTIL, porque cada reintento
      //     volvía a leer la misma entrada de caché en vez de la red.
      // `default` respeta el `Cache-Control: max-age` de TMDb (los éxitos se
      // cachean ~92 min y se reutilizan, sin perder velocidad) pero no sirve
      // errores como si fueran válidos. En el reintento del 429 se fuerza
      // `reload` para saltarse la caché y llegar de verdad a la red.
      response = await fetch(url, {
        cache: attempt === 0 ? "default" : "reload",
      });
    } catch {
      return null; // red caída: no insistimos
    }

    if (response.ok) {
      try {
        return await response.json();
      } catch {
        return null;
      }
    }

    // Solo el 429 merece reintento: un 404 no va a cambiar por insistir.
    if (response.status !== 429 || attempt === MAX_RETRIES) return null;

    // `Retry-After` si TMDb lo manda; si no, backoff exponencial.
    const retryAfter = Number(response.headers.get("retry-after"));
    const waitMs = Number.isFinite(retryAfter)
      ? retryAfter * 1000
      : BASE_BACKOFF_MS * 2 ** attempt;
    await sleep(waitMs);
  }
  return null;
}

const inFlight = new Map();

/**
 * Pide /images de un título pasando por la cola. Dos llamadas concurrentes al
 * mismo título comparten la misma petición.
 *
 * @param {object}  [opts]
 * @param {boolean} [opts.allLanguages] Si true, NO se restringe
 *   `include_image_language` y TMDb devuelve el arte de TODOS los idiomas. Lo
 *   necesitan los selectores de logo: prefieren es/en pero, antes que quedarse
 *   sin logo, aceptan el más votado de cualquier idioma. Restringir aquí les
 *   quitaría esa red.
 * @returns {Promise<{posters: [], backdrops: [], logos: []}|null>} null si falló.
 */
export function fetchTmdbImages(type, id, { apiKey, allLanguages = false } = {}) {
  const key = process.env.NEXT_PUBLIC_TMDB_API_KEY || apiKey;
  if (!key || !type || id == null) return Promise.resolve(null);

  const mediaType = type === "tv" ? "tv" : "movie";
  // Las dos variantes devuelven conjuntos distintos, así que no pueden compartir
  // ni deduplicación ni entrada en vuelo.
  const cacheKey = `${mediaType}:${id}:${allLanguages ? "all" : "std"}`;
  const existing = inFlight.get(cacheKey);
  if (existing) return existing;

  const url =
    `https://api.themoviedb.org/3/${mediaType}/${id}/images?api_key=${key}` +
    (allLanguages ? "" : `&${TMDB_IMAGE_LANGS_PARAM}`);

  const promise = schedule(() => requestImages(url)).finally(() => {
    inFlight.delete(cacheKey);
  });

  inFlight.set(cacheKey, promise);
  return promise;
}
