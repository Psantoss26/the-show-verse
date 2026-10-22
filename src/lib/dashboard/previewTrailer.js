// TRÁILER DE LAS VISTAS PREVIAS DEL DASHBOARD (autoplay al hacer hover).
//
// Una sola fuente para todas las previews (filas de pósters y de backdrops,
// Continuar viendo, Calendario): antes cada una pedía `getBestTrailerCached`
// cuando vencía su temporizador y, si ese vídeo no se podía insertar (edad,
// inserción desactivada, retirado), se rendía y volvía al backdrop… y la
// próxima vez repetía el mismo intento fallido.
//
// Aquí:
//  - Los candidatos (YouTube, tráileres y teasers con preferencia por inglés,
//    mismo criterio que `pickBestTrailer`) se piden UNA vez por título y en
//    cuanto empieza el hover (`prefetchPreviewTrailer`), no al vencer el
//    temporizador.
//  - El vídeo que se reproduce de verdad queda VERIFICADO entre visitas
//    (localStorage): la próxima vez es el único intento, sin red.
//  - El que da error queda marcado como ROTO entre visitas y se pasa al
//    siguiente candidato sin que se vea nada (el backdrop sigue cubriendo).
//  - `season` (Calendario): el tráiler de ESA temporada de la serie —la del
//    episodio que se estrena—, con los vídeos de la serie solo si la temporada
//    no tiene ninguno. Se recuerda aparte de la serie («tv:1396:s5»).

const STORE_KEY = "showverse:preview-trailer:v1";
const STORE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const STORE_MAX_ENTRIES = 600;

// Lo que espera la preview, ya montada, antes de arrancar el tráiler: filtra
// las pasadas rápidas del ratón por encima de la fila. El tráiler se pide en
// paralelo desde el montaje, así que al vencer suele estar ya resuelto.
export const PREVIEW_TRAILER_AUTOPLAY_DELAY_MS = 500;

const candidatesCache = new Map(); // "movie:603" -> Array | Promise<Array>

function seasonOf(mediaType, season) {
  const n = Number(season);
  return mediaType === "tv" && Number.isInteger(n) && n >= 0 ? n : null;
}

function titleKey(mediaType, id, season) {
  const base = `${mediaType === "tv" ? "tv" : "movie"}:${id}`;
  const n = seasonOf(mediaType, season);
  return n === null ? base : `${base}:s${n}`;
}

function videoKey(video) {
  return video?.key ? `yt:${video.key}` : "";
}

let storeMemo = null;
function readStore() {
  if (storeMemo) return storeMemo;
  storeMemo = { verified: {}, broken: {} };
  if (typeof window === "undefined") return storeMemo;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORE_KEY) || "null");
    const now = Date.now();
    for (const bucket of ["verified", "broken"]) {
      for (const [key, entry] of Object.entries(parsed?.[bucket] || {})) {
        if (entry && now - Number(entry.t || 0) < STORE_TTL_MS) {
          storeMemo[bucket][key] = entry;
        }
      }
    }
  } catch {
    // Almacenamiento ilegible: se empieza de cero.
  }
  return storeMemo;
}

function writeStore() {
  if (typeof window === "undefined" || !storeMemo) return;
  // Tope de entradas: fuera las más antiguas de cada grupo.
  for (const bucket of ["verified", "broken"]) {
    const entries = Object.entries(storeMemo[bucket]);
    if (entries.length > STORE_MAX_ENTRIES) {
      entries.sort((a, b) => Number(a[1].t) - Number(b[1].t));
      for (const [key] of entries.slice(0, entries.length - STORE_MAX_ENTRIES)) {
        delete storeMemo[bucket][key];
      }
    }
  }
  try {
    window.localStorage.setItem(STORE_KEY, JSON.stringify(storeMemo));
  } catch {
    // Sin espacio: queda en memoria para esta pestaña.
  }
}

function isBroken(video) {
  return Boolean(readStore().broken[videoKey(video)]);
}

// Candidatos por orden: el de `pickBestTrailer` (tráiler oficial en inglés,
// el de más resolución) y, detrás, el resto de tráileres y teasers. Solo si
// no hay ninguno, cualquier vídeo de YouTube del título.
export function rankPreviewTrailers(results) {
  const yt = (Array.isArray(results) ? results : []).filter(
    (v) => v?.site === "YouTube" && v?.key,
  );
  const preferred = (v) =>
    v?.iso_639_1 === "en" || v?.iso_3166_1 === "US" || v?.iso_3166_1 === "GB";
  const score = (v) =>
    (preferred(v) ? 1000 : 0) +
    (v?.type === "Trailer" ? 500 : v?.type === "Teaser" ? 200 : 0) +
    (v?.official ? 100 : 0) +
    (typeof v?.size === "number" ? v.size / 100 : 0);
  const trailers = yt.filter((v) => v?.type === "Trailer" || v?.type === "Teaser");
  const pool = trailers.length ? trailers : yt;
  const seen = new Set();
  return [...pool]
    .sort((a, b) => score(b) - score(a))
    .filter((v) => (seen.has(v.key) ? false : seen.add(v.key)))
    .map((v) => ({ key: v.key, site: v.site, type: v.type, name: v.name || null }));
}

async function fetchVideosList(path) {
  const apiKey = process.env.NEXT_PUBLIC_TMDB_API_KEY;
  if (!apiKey) return [];
  try {
    const res = await fetch(
      `https://api.themoviedb.org/3/${path}/videos?api_key=${apiKey}` +
        `&language=en-US&include_video_language=en,es,null`,
      { cache: "force-cache" },
    );
    if (!res.ok) return null;
    const json = await res.json();
    return rankPreviewTrailers(json?.results);
  } catch {
    return null; // fallo de red: no se memoriza
  }
}

async function fetchCandidates(mediaType, id, season) {
  if (!id) return [];
  const type = mediaType === "tv" ? "tv" : "movie";
  const n = seasonOf(mediaType, season);
  if (n === null) return fetchVideosList(`${type}/${id}`);
  // La temporada primero; sus vídeos casi siempre son del estreno de esa
  // temporada. Sin ninguno, los de la serie (mejor que sin tráiler).
  const seasonList = await fetchVideosList(`tv/${id}/season/${n}`);
  if (seasonList === null) return null;
  if (seasonList.length > 0) return seasonList;
  return loadCandidates(mediaType, id);
}

function loadCandidates(mediaType, id, season) {
  const key = titleKey(mediaType, id, season);
  const cached = candidatesCache.get(key);
  if (cached) return Promise.resolve(cached);
  const request = fetchCandidates(mediaType, id, season).then((list) => {
    if (list) candidatesCache.set(key, list);
    else candidatesCache.delete(key);
    return list || [];
  });
  candidatesCache.set(key, request);
  return request;
}

function pick(mediaType, id, season, candidates) {
  const verified = readStore().verified[titleKey(mediaType, id, season)];
  if (verified?.k && !isBroken({ key: verified.k })) {
    return (
      candidates?.find((v) => v.key === verified.k) || {
        key: verified.k,
        site: "YouTube",
        type: verified.type || "Trailer",
      }
    );
  }
  return (candidates || []).find((v) => !isBroken(v)) || null;
}

/** El tráiler de un título si ya se conoce SIN esperar (verificado o resuelto). */
export function peekPreviewTrailer(mediaType, id, season) {
  if (!id) return undefined;
  const key = titleKey(mediaType, id, season);
  const cached = candidatesCache.get(key);
  const verified = readStore().verified[key];
  if (Array.isArray(cached) || verified?.k) {
    return pick(mediaType, id, season, Array.isArray(cached) ? cached : null);
  }
  return undefined;
}

/** El tráiler a reproducir (null si el título no tiene ninguno utilizable). */
export async function resolvePreviewTrailer(mediaType, id, season) {
  if (!id) return null;
  const known = peekPreviewTrailer(mediaType, id, season);
  if (known !== undefined && readStore().verified[titleKey(mediaType, id, season)]) {
    return known;
  }
  return pick(mediaType, id, season, await loadCandidates(mediaType, id, season));
}

/** Empieza a resolverlo ya (hover) y deja lista la API de YouTube. */
export function prefetchPreviewTrailer(mediaType, id, season) {
  if (!id || typeof window === "undefined") return;
  if (!readStore().verified[titleKey(mediaType, id, season)]) {
    loadCandidates(mediaType, id, season).catch(() => {});
  }
  loadYouTubeIframeApi().catch(() => {});
}

/** Se ha reproducido de verdad: el tráiler de este título entre visitas. */
export function markPreviewTrailerPlayable(mediaType, id, video, season) {
  if (!id || !video?.key) return;
  const store = readStore();
  const key = titleKey(mediaType, id, season);
  if (store.verified[key]?.k === video.key) return;
  store.verified[key] = { k: video.key, type: video.type || null, t: Date.now() };
  writeStore();
}

/**
 * YouTube no lo deja reproducir: se marca ROTO entre visitas y se devuelve el
 * siguiente candidato (o null si no queda ninguno).
 */
export async function markPreviewTrailerBroken(mediaType, id, video, season) {
  if (!video?.key) return null;
  const store = readStore();
  store.broken[videoKey(video)] = { t: Date.now() };
  const key = titleKey(mediaType, id, season);
  if (store.verified[key]?.k === video.key) delete store.verified[key];
  writeStore();
  return pick(mediaType, id, season, await loadCandidates(mediaType, id, season));
}

/* ---------------- API IFrame de YouTube (una sola vez) ---------------- */
let youtubeIframeApiPromise = null;

export function loadYouTubeIframeApi() {
  if (typeof window === "undefined") return Promise.resolve(null);
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (youtubeIframeApiPromise) return youtubeIframeApiPromise;

  youtubeIframeApiPromise = new Promise((resolve) => {
    const previousReady = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previousReady?.();
      resolve(window.YT);
    };
    if (document.querySelector('script[src="https://www.youtube.com/iframe_api"]')) {
      // Otro módulo ya la está cargando: se espera a que esté.
      const wait = window.setInterval(() => {
        if (window.YT?.Player) {
          window.clearInterval(wait);
          resolve(window.YT);
        }
      }, 100);
      return;
    }
    const script = document.createElement("script");
    script.src = "https://www.youtube.com/iframe_api";
    script.async = true;
    document.head.appendChild(script);
  });

  return youtubeIframeApiPromise;
}
