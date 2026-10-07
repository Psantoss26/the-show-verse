// Valoración del soundtrack de un título por el usuario (reproductor de
// DetailsClient): 👍 lo da por bueno, 👎 lo descarta y pide otro, y "ocultar"
// quita el soundtrack de esa ficha.
//
// Se guarda POR USUARIO y POR TÍTULO en las preferencias de la cuenta
// (`uiSettings.soundtrackFeedback`), igual que las portadas personalizadas:
//
//   soundtrackFeedback: {
//     "movie:27205": { rejections: [["spotify:album:4Zx…"], ["spotify:playlist:1a…"]], status: "confirmed" },
//     "tv:1396":     { rejections: [], status: "hidden" },
//   }
//
// Cada 👎 apila un RECHAZO: las COLECCIONES (álbum o playlist de la fuente, no
// pistas) de las que salía el soundtrack descartado. /api/soundtrack recibe
// todas juntas (`excluded`), las salta en todas sus etapas y la misma
// clasificación cae en la siguiente candidata. Ir apiladas permite REVERTIR:
// quitar el último rechazo devuelve exactamente el soundtrack anterior (la
// misma búsqueda, que además ya está en caché).
//
// Sirve en cliente y servidor (sin dependencias).

export const SOUNDTRACK_EXCLUDE_PARAM = "exclude";

// Tope de colecciones descartadas por título: acota la URL y la caché. A esa
// altura ya no quedan alternativas razonables.
export const MAX_EXCLUDED_COLLECTIONS = 40;

const STATUSES = new Set(["confirmed", "hidden"]);

/**
 * Clave estable de una colección a partir de su URL pública
 * (`collectionUrl` de cada pista). Las mismas claves se construyen en el
 * servidor a partir de los ids de cada fuente (ver `spotifyCollectionKey`…).
 */
export function soundtrackCollectionKey(url) {
  const value = String(url || "").trim();
  if (!value) return "";

  const spotify = value.match(/open\.spotify\.com\/(?:intl-[a-z-]+\/)?(album|playlist)\/([A-Za-z0-9]+)/i);
  if (spotify) return spotifyCollectionKey(spotify[1].toLowerCase(), spotify[2]);

  if (/(?:itunes|music)\.apple\.com\//i.test(value)) {
    const apple = value.match(/\/album\/(?:[^/?#]+\/)?(?:id)?(\d+)/i);
    if (apple) return itunesCollectionKey(apple[1]);
  }

  const deezer = value.match(/deezer\.com\/(?:[a-z]{2}\/)?album\/(\d+)/i);
  if (deezer) return deezerCollectionKey(deezer[1]);

  return `url:${value.split(/[?#]/)[0]}`;
}

export function spotifyCollectionKey(kind, id) {
  return id ? `spotify:${kind}:${id}` : "";
}

export function itunesCollectionKey(collectionId) {
  return collectionId ? `itunes:album:${collectionId}` : "";
}

export function deezerCollectionKey(albumId) {
  return albumId ? `deezer:album:${albumId}` : "";
}

/** Colecciones de las que sale un soundtrack (sin repetir, en orden). */
export function trackCollectionKeys(tracks) {
  const keys = [];
  for (const track of Array.isArray(tracks) ? tracks : []) {
    const key = soundtrackCollectionKey(track?.collectionUrl);
    if (key && !keys.includes(key)) keys.push(key);
  }
  return keys;
}

/** Lee `exclude=` de la petición: claves válidas, únicas y acotadas. */
export function parseExcludedCollections(raw) {
  const keys = [];
  for (const part of String(raw || "").split(",")) {
    const key = part.trim();
    if (!/^(spotify:(album|playlist)|itunes:album|deezer:album):[A-Za-z0-9]+$|^url:https?:\/\/\S+$/.test(key)) continue;
    if (!keys.includes(key)) keys.push(key);
    if (keys.length === MAX_EXCLUDED_COLLECTIONS) break;
  }
  return keys;
}

export function soundtrackFeedbackKey(type, id) {
  return `${type === "tv" ? "tv" : "movie"}:${id}`;
}

function cleanRejections(rejections) {
  const seen = new Set();
  const clean = [];
  for (const batch of Array.isArray(rejections) ? rejections : []) {
    const keys = parseExcludedCollections((Array.isArray(batch) ? batch : []).join(","))
      .filter((key) => !seen.has(key));
    if (!keys.length) continue;
    keys.forEach((key) => seen.add(key));
    clean.push(keys);
  }
  // Tope de colecciones en total: se olvidan los rechazos más antiguos.
  while (clean.length > 1 && clean.flat().length > MAX_EXCLUDED_COLLECTIONS) clean.shift();
  return clean;
}

/**
 * Valoración guardada de un título (siempre con la misma forma):
 * `rejections` (pila de 👎), `excluded` (todas sus colecciones, para la
 * petición) y `status`.
 */
export function getSoundtrackFeedback(uiSettings, type, id) {
  const entry = uiSettings?.soundtrackFeedback?.[soundtrackFeedbackKey(type, id)];
  // Primera versión (sin pila): una lista plana cuenta como un solo rechazo.
  const rejections = cleanRejections(
    Array.isArray(entry?.rejections)
      ? entry.rejections
      : Array.isArray(entry?.excluded)
        ? [entry.excluded]
        : [],
  );
  return {
    rejections,
    excluded: rejections.flat(),
    status: STATUSES.has(entry?.status) ? entry.status : null,
  };
}

/**
 * uiSettings con la valoración de un título cambiada. Sin rechazos ni estado,
 * la entrada se borra para no dejar restos en las preferencias.
 */
export function withSoundtrackFeedback(uiSettings, type, id, feedback) {
  const key = soundtrackFeedbackKey(type, id);
  const all = { ...(uiSettings?.soundtrackFeedback || {}) };
  const rejections = cleanRejections(feedback?.rejections);
  const status = STATUSES.has(feedback?.status) ? feedback.status : null;

  if (rejections.length || status) all[key] = { rejections, status };
  else delete all[key];

  return { ...(uiSettings || {}), soundtrackFeedback: all };
}
