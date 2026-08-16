"use client";

// PRESUPUESTO DE localStorage
//
// EL PROBLEMA QUE RESUELVE
// `localStorage` tiene un techo DURO de ~5 MB por origen (medido en este
// proyecto: 5.081 KB en Chrome) y la app lo llena ella sola. Cada ficha que se
// abre persiste su propia entrada —OMDb, comentarios y listas de Trakt, estado
// de visto, artwork, JustWatch, puntuaciones de temporada…— bajo una clave por
// título, y NADA las borra jamás. Las series son las que más escriben (estado
// por temporada/episodio además de todo lo de una película), así que entrar una
// y otra vez en fichas de series es lo que acaba tocando el techo.
//
// Al llegar ahí, `setItem` lanza `QuotaExceededError`. Como TODAS las escrituras
// de la app van dentro de un `try {} catch {}` mudo, el fallo no se ve por
// ninguna parte: simplemente las cachés dejan de poder actualizarse.
//
// Y ahí es donde se rompen las páginas de usuario. "En progreso" y "Completadas"
// BORRAN su entrada en cuanto pasa su TTL corto (5 y 10 min) y confían en poder
// reescribirla tras el siguiente fetch. Con el almacenamiento lleno esa
// reescritura falla en silencio, así que la caché desaparece PARA SIEMPRE y al
// volver de una ficha esas páginas ya no tienen nada que pintar. Favoritos y
// Pendientes, en cambio, conservan su entrada hasta un techo de 7 días sin
// borrarla nunca por estar obsoleta: por eso siguen mostrando contenido cuando
// el resto se ha quedado en blanco.
//
// LA REGLA
// El almacenamiento se trata como un PRESUPUESTO, no como un pozo sin fondo:
// cuando no cabe algo, se libera sitio tirando lo que se puede volver a pedir a
// la red (cachés por título) y nunca lo que no (sesión, tokens, cola offline y
// las propias listas de las páginas de usuario).

// Nunca se desalojan: o no se pueden regenerar (sesión, tokens, cola de
// mutaciones pendientes) o son justo lo que da el pintado instantáneo de las
// páginas de usuario, que es lo que estamos protegiendo.
const PROTECTED_PREFIXES = [
  "showverse:auth:",
  "showverse:favorites:items:",
  "showverse:watchlist:items:",
  "showverse:history:items:",
  "showverse:showverse:in-progress:",
  "showverse:showverse:completed:",
  "showverse:continue-watching:page:",
  "showverse:offline:",
  "showverse:trakt:auth",
  "showverse:pending-list",
  // Marcas de revisionado y vista de episodios: son estado LOCAL del usuario
  // (no siempre reconstruible desde el servidor) y ocupan muy poco.
  "showverse:trakt:rewatchRuns:",
  "showverse:trakt:rewatchStartAt:",
  "showverse:trakt:episodesView:",
];

// Cachés por TÍTULO y por sección: todo esto se vuelve a pedir a la red la
// próxima vez que haga falta, así que es lo primero que se tira.
const DISPOSABLE_PREFIXES = [
  "showverse:omdb:",
  "showverse:trakt:comments:",
  "showverse:trakt:lists:",
  "showverse:trakt:status:",
  "showverse:trakt:showWatched:",
  "showverse:jw:",
  "showverse:movie:",
  "showverse:tv:",
  "showverse:lists:preview:",
  "showverse:lists:index:",
  "showverse:list-details:",
  "showverse:dashboard:",
  "showverse:scores:",
  "showverse:watch-providers:",
  "showverse:plex-library-index:",
];

// Margen que se intenta dejar libre al hacer sitio: liberar justo lo que ocupa
// el valor deja el almacenamiento pegado al techo y la siguiente escritura
// vuelve a fallar. Con holgura, un desalojo sirve para varias escrituras.
const HEADROOM_BYTES = 512 * 1024;

// Umbral de la barrida de arranque. Por debajo no se toca nada.
const STARTUP_SWEEP_THRESHOLD_BYTES = 4 * 1024 * 1024;

function hasPrefix(key, prefixes) {
  return prefixes.some((prefix) => key.startsWith(prefix));
}

function isDisposable(key) {
  if (hasPrefix(key, PROTECTED_PREFIXES)) return false;
  return hasPrefix(key, DISPOSABLE_PREFIXES);
}

// `QuotaExceededError` se identifica por nombre o por código heredado (22 en
// Chrome/Firefox, 1014 en Firefox antiguo). Un fallo de OTRO tipo (modo privado,
// almacenamiento bloqueado) no se arregla haciendo sitio.
function isQuotaError(error) {
  if (!error) return false;
  return (
    error.name === "QuotaExceededError" ||
    error.name === "NS_ERROR_DOM_QUOTA_REACHED" ||
    error.code === 22 ||
    error.code === 1014
  );
}

// Marca de tiempo de la entrada SIN parsear el JSON entero: las cachés de la app
// llevan su fecha en `t`, `ts` o `savedAt`, siempre al principio del objeto. Las
// entradas del dashboard pesan ~170 KB cada una y parsearlas todas para ordenar
// costaría más que el propio desalojo.
function entryTimestamp(raw) {
  const match = /"(?:t|ts|savedAt)"\s*:\s*(\d{10,})/.exec(raw.slice(0, 160));
  return match ? Number(match[1]) : 0;
}

function entryBytes(key, raw) {
  return key.length + raw.length;
}

export function localStorageUsageBytes() {
  if (typeof window === "undefined") return 0;
  try {
    let total = 0;
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const key = window.localStorage.key(i);
      if (!key) continue;
      total += entryBytes(key, window.localStorage.getItem(key) || "");
    }
    return total;
  } catch {
    return 0;
  }
}

// Tira entradas desechables hasta liberar `bytesNeeded`. Se desalojan primero
// las MÁS ANTIGUAS (las que no llevan fecha cuentan como antiquísimas), que es
// lo que el usuario tiene menos probabilidades de volver a mirar.
// Devuelve los bytes liberados.
function evictDisposable(bytesNeeded, exceptKey = null) {
  if (typeof window === "undefined") return 0;

  let candidates = [];
  try {
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const key = window.localStorage.key(i);
      if (!key || key === exceptKey || !isDisposable(key)) continue;
      const raw = window.localStorage.getItem(key);
      if (raw == null) continue;
      candidates.push({
        key,
        bytes: entryBytes(key, raw),
        at: entryTimestamp(raw),
      });
    }
  } catch {
    return 0;
  }

  candidates.sort((a, b) => a.at - b.at || b.bytes - a.bytes);

  let freed = 0;
  for (const candidate of candidates) {
    if (freed >= bytesNeeded) break;
    try {
      window.localStorage.removeItem(candidate.key);
      freed += candidate.bytes;
    } catch {
      // Si una entrada concreta no se puede borrar, se sigue con las demás.
    }
  }
  return freed;
}

/**
 * `localStorage.setItem` que NO se rinde al llenarse el almacenamiento: si no
 * cabe, hace sitio desalojando cachés regenerables y reintenta.
 *
 * Devuelve `true` si el valor quedó guardado. Úsalo en toda escritura cuya
 * pérdida degrade la app (las listas de las páginas de usuario, la sesión); para
 * las cachés desechables da igual, pero tampoco estorba.
 */
export function setLocalStorageItem(key, value) {
  if (typeof window === "undefined") return false;

  try {
    window.localStorage.setItem(key, value);
    return true;
  } catch (error) {
    if (!isQuotaError(error)) return false;

    const needed = entryBytes(key, String(value)) + HEADROOM_BYTES;
    if (evictDisposable(needed, key) <= 0) return false;

    try {
      window.localStorage.setItem(key, value);
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Barrida de arranque. Un dispositivo que YA venía con el almacenamiento lleno
 * se recupera solo, sin esperar a que falle una escritura (y sin que el usuario
 * tenga que borrar datos del navegador a mano).
 */
export function sweepLocalStorageOnStartup() {
  if (typeof window === "undefined") return 0;
  const usage = localStorageUsageBytes();
  if (usage < STARTUP_SWEEP_THRESHOLD_BYTES) return 0;
  return evictDisposable(usage - STARTUP_SWEEP_THRESHOLD_BYTES + HEADROOM_BYTES);
}
