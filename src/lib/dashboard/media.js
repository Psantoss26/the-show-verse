// /src/lib/dashboard/media.js
// Helpers compartidos del dashboard de Inicio (MainDashboardClient + FeaturedHero).
// Funciones puras y cachés a nivel de módulo: al importarse en varios componentes
// comparten la misma instancia de caché.

import { TMDB_IMAGE_LANGS_PARAM } from "@/lib/tmdb/imageLanguages";

/* ---------- helpers de formato ---------- */
export const yearOf = (m) =>
  m?.release_date?.slice(0, 4) || m?.first_air_date?.slice(0, 4) || "";

export const ratingOf = (m) =>
  typeof m?.vote_average === "number" && m.vote_average > 0
    ? m.vote_average.toFixed(1)
    : "–";

// Etiqueta contextual de la casilla destacada (antes fija "MEJOR VALORADO"),
// compartida por el FeaturedHero y por las tarjetas spotlight de los 3 dashboards
// (Inicio, Películas y Series) para que TODAS muestren lo mismo. Elige el dato
// MÁS relevante de cada título usando solo campos disponibles al instante (nota
// TMDb + fecha), así varía por título y no depende de datos que cargan tarde
// (premios/IMDb) que provocarían parpadeo:
//   1. "Estreno"        → recién estrenado o inminente (±45 días).
//   2. "Mejor valorado" → nota TMDb ≥ 8,0 (excelente de verdad).
//   3. "Destacado"      → nota TMDb ≥ 7,0.
//   4. null             → sin etiqueta (no ocupa sitio).
export const getSpotlightBadge = (item, now = Date.now()) => {
  const dateStr = item?.release_date || item?.first_air_date || "";
  if (dateStr) {
    const released = new Date(dateStr);
    if (!Number.isNaN(released.getTime())) {
      // days > 0 → ya estrenado hace `days` días; days < 0 → se estrena dentro de
      // `-days` días. La fila "Estrenos y novedades" del backend son en su mayoría
      // PRÓXIMOS estrenos (hoy … +275 días para pelis; −30 … +275 para series),
      // así que la ventana cubre los próximos estrenos hasta ~9 meses vista y los
      // recién estrenados (últimos ~60 días). Antes era ±45 días y los próximos
      // estrenos a más de 45 días se quedaban sin la etiqueta "Estreno".
      const days = (now - released.getTime()) / 86400000;
      if (days >= -285 && days <= 60) return "Estreno";
    }
  }
  const rating = typeof item?.vote_average === "number" ? item.vote_average : NaN;
  if (Number.isFinite(rating)) {
    if (rating >= 8.0) return "Mejor valorado";
    if (rating >= 7.0) return "Destacado";
  }
  return null;
};

export const formatRuntime = (mins) => {
  if (!mins || typeof mins !== "number") return null;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h <= 0) return `${m} min`;
  return m ? `${h} h ${m} min` : `${h} h`;
};

export const buildImg = (path, size = "original") =>
  `https://image.tmdb.org/t/p/${size}${path}`;

export const PREVIEW_BACKDROP_SIZE = "w780";

export const getMediaTypeForItem = (item) =>
  item?.media_type === "tv" ||
  (item?.name && !item?.title) ||
  item?.first_air_date
    ? "tv"
    : "movie";

export const getBackdropCacheKey = (item, mediaType = getMediaTypeForItem(item)) =>
  `${mediaType}:${item?.id}`;

export const getPreviewBackdropFallback = (item) =>
  item?.backdrop_path || item?.poster_path || null;

export const GENRES = {
  28: "Acción",
  12: "Aventura",
  16: "Animación",
  35: "Comedia",
  80: "Crimen",
  99: "Documental",
  18: "Drama",
  10751: "Familia",
  14: "Fantasía",
  36: "Historia",
  27: "Terror",
  10402: "Música",
  9648: "Misterio",
  10749: "Romance",
  878: "Ciencia ficción",
  10770: "TV Movie",
  53: "Thriller",
  10752: "Bélica",
  37: "Western",
  10759: "Acción y aventura",
  10765: "Ciencia ficción y fantasía",
  10762: "Infantil",
  10763: "Noticias",
  10764: "Reality",
  10766: "Telenovela",
  10767: "Talk show",
  10768: "Guerra y política",
};

/* --------- precargar una imagen --------- */
export const imagePreloadCache = new Map();

export function preloadImage(src, options = {}) {
  if (!src) return Promise.resolve(false);
  if (imagePreloadCache.has(src)) return imagePreloadCache.get(src);

  const promise = new Promise((resolve) => {
    const img = new Image();
    img.decoding = "async";
    if (options.fetchPriority) {
      img.fetchPriority = options.fetchPriority;
    }
    img.onload = async () => {
      try {
        if (typeof img.decode === "function") {
          await img.decode();
        }
      } catch {}
      resolve(true);
    };
    img.onerror = () => resolve(false);
    img.src = src;
  });
  imagePreloadCache.set(src, promise);
  return promise;
}

/* =================== CACHÉS COMPARTIDOS (cliente) =================== */
export const movieExtrasCache = new Map();
export const movieBackdropCache = new Map();
export const movieImagesCache = new Map();

/* ======== Preferencias de artwork guardadas en localStorage ======== */
export function getArtworkPreference(movieId, mediaType = "movie") {
  if (typeof window === "undefined") {
    return { poster: null, backdrop: null };
  }
  const type = mediaType === "tv" ? "tv" : "movie";
  const posterKey = `showverse:${type}:${movieId}:poster`;
  const backdropKey = `showverse:${type}:${movieId}:backdrop`;
  const poster = window.localStorage.getItem(posterKey);
  const backdrop = window.localStorage.getItem(backdropKey);
  return {
    poster: poster || null,
    backdrop: backdrop || null,
  };
}

export function pickBestBackdropByLangResVotes(list, opts = {}) {
  const {
    preferLangs = ["en", "en-US"],
    minWidth = 1200,
    offset = 0,
    includeNoLanguage = true,
  } = opts;

  if (!Array.isArray(list) || list.length === 0) return null;

  // Normaliza 'en-US' -> 'en'
  const norm = (v) => (v ? String(v).toLowerCase().split("-")[0] : null);
  const preferSet = new Set((preferLangs || []).map(norm).filter(Boolean));
  const isPreferredLang = (img) => preferSet.has(norm(img?.iso_639_1));
  const hasNoLanguage = (img) => !norm(img?.iso_639_1);

  const preferred = list.filter(isPreferredLang);
  const withLanguage = list.filter(
    (img) => norm(img?.iso_639_1) && !isPreferredLang(img),
  );
  const noLanguage = list.filter(hasNoLanguage);

  const pickFrom = (pool) => {
    if (!pool.length) return null;
    const sizeFiltered =
      minWidth > 0 ? pool.filter((b) => (b?.width || 0) >= minWidth) : pool;
    const candidates = (sizeFiltered.length ? sizeFiltered : pool).slice(0, 3);
    if (!candidates.length) return null;

    const preferredSizes = [
      [1920, 1080],
      [1712, 964],
      [3840, 2160],
    ];
    const ordered = [];
    for (const [width, height] of preferredSizes) {
      const match = candidates.find(
        (b) => (b?.width || 0) === width && (b?.height || 0) === height,
      );
      if (match && !ordered.includes(match)) ordered.push(match);
    }
    for (const candidate of candidates) {
      if (!ordered.includes(candidate)) ordered.push(candidate);
    }

    return ordered[Math.min(Math.max(0, offset), ordered.length - 1)] || null;
  };

  // Forzamos idioma en la vista previa: preferido (en) → cualquier otro idioma
  // (es…) → y SOLO como último recurso sin idioma (textless). Antes el textless
  // se elegía antes que un backdrop con idioma, mostrando portadas sin título.
  return (
    pickFrom(preferred) ||
    pickFrom(withLanguage) ||
    (includeNoLanguage ? pickFrom(noLanguage) : null)
  );
}

export function pickBestPosterByLangThenResolution(list, opts = {}) {
  const { preferLangs = ["en", "en-US"], minWidth = 500 } = opts;

  if (!Array.isArray(list) || list.length === 0) return null;

  const area = (img) => (img?.width || 0) * (img?.height || 0);
  const lang = (img) => img?.iso_639_1 || null;

  const sizeFiltered =
    minWidth > 0 ? list.filter((p) => (p?.width || 0) >= minWidth) : list;
  const pool0 = sizeFiltered.length ? sizeFiltered : list;

  const norm = (v) => (v ? String(v).toLowerCase().split("-")[0] : null);
  const preferSet = new Set((preferLangs || []).map(norm).filter(Boolean));
  const english = pool0.filter((p) => preferSet.has(norm(lang(p))));
  const noLanguage = pool0.filter((p) => !norm(lang(p)));
  const pool1 = english.length ? english : noLanguage.length ? noLanguage : pool0;

  let maxArea = 0;
  for (const p of pool1) maxArea = Math.max(maxArea, area(p));

  for (const p of pool1) {
    if (area(p) === maxArea) return p;
  }

  return null;
}

export async function getMovieImages(itemId, mediaType = "movie") {
  const cacheKey = `${mediaType}:${itemId}`;
  if (movieImagesCache.has(cacheKey)) return movieImagesCache.get(cacheKey);

  const apiKey = process.env.NEXT_PUBLIC_TMDB_API_KEY;
  if (!apiKey) {
    const fallback = { posters: [], backdrops: [], logos: [] };
    movieImagesCache.set(cacheKey, fallback);
    return fallback;
  }

  try {
    const type = mediaType === "tv" ? "tv" : "movie";
    // No restringimos `include_image_language`: para las previews necesitamos
    // poder caer en cualquier backdrop con idioma si no existe versión inglesa.
    // El selector prioriza inglés y deja las imágenes sin idioma para el final.
    const url =
      `https://api.themoviedb.org/3/${type}/${itemId}/images` +
      `?api_key=${apiKey}`;

    const r = await fetch(url, { cache: "force-cache" });
    // Igual que en getTitleLogos: un 429/5xx daba un JSON sin `.backdrops`, se
    // convertía en [] y se cacheaba permanentemente. El llamador acababa cayendo
    // al `backdrop_path` por defecto de TMDb (sin idioma). No cacheamos fallos
    // transitorios: se reintenta en la siguiente llamada.
    if (!r.ok) return { posters: [], backdrops: [], logos: [] };
    const j = await r.json();
    const posters = Array.isArray(j?.posters) ? j.posters : [];
    const backdrops = Array.isArray(j?.backdrops) ? j.backdrops : [];
    const logos = Array.isArray(j?.logos) ? j.logos : [];

    const data = { posters, backdrops, logos };
    movieImagesCache.set(cacheKey, data);
    return data;
  } catch {
    return { posters: [], backdrops: [], logos: [] };
  }
}

export async function fetchBestBackdrop(itemId, mediaType = "movie", opts = {}) {
  const { backdrops } = await getMovieImages(itemId, mediaType);
  if (!Array.isArray(backdrops) || backdrops.length === 0) return null;

  const best = pickBestBackdropByLangResVotes(backdrops, {
    preferLangs: ["en", "en-US"],
    resolutionWindow: 0.98,
    minWidth: 1200,
    ...opts,
  });

  return best?.file_path || null;
}

// Selecciona el mejor backdrop SIN idioma (textless, iso_639_1 nulo), ideal para
// superponer un logotipo encima. El fallback con idioma puede desactivarse para
// superficies que necesitan garantizar arte completamente textless.
export function pickBestBackdropNoLang(
  list,
  {
    minWidth = 1280,
    offset = 0,
    limit = 0,
    excludePaths = [],
    allowLanguageFallback = true,
  } = {},
) {
  if (!Array.isArray(list) || list.length === 0) return null;

  const norm = (v) => (v ? String(v).toLowerCase().split("-")[0] : null);
  const noLang = list.filter((b) => !norm(b?.iso_639_1));
  if (!noLang.length && !allowLanguageFallback) return null;
  const pool = noLang.length ? noLang : list;
  const excluded = new Set(excludePaths.filter(Boolean));

  const sized = pool.filter((b) => (b?.width || 0) >= minWidth);
  const candidates = sized.length ? sized : pool;
  const limitedCandidates =
    Number.isFinite(limit) && limit > 0 ? candidates.slice(0, limit) : candidates;
  const sorted = limitedCandidates
    .map((backdrop, position) => ({ backdrop, position }))
    .filter(({ backdrop }) => !excluded.has(backdrop?.file_path))
    .sort((a, b) =>
      (b.backdrop?.width || 0) - (a.backdrop?.width || 0) ||
      (b.backdrop?.height || 0) - (a.backdrop?.height || 0) ||
      (b.backdrop?.vote_average || 0) - (a.backdrop?.vote_average || 0) ||
      a.position - b.position,
    )
    .map(({ backdrop }) => backdrop);

  const index = Math.max(0, Math.min(sorted.length - 1, Number(offset) || 0));
  return sorted[index] || null;
}

export async function fetchBestBackdropNoLang(itemId, mediaType = "movie", opts = {}) {
  const { backdrops } = await getMovieImages(itemId, mediaType);
  const best = pickBestBackdropNoLang(backdrops, opts);
  return best?.file_path || null;
}

export async function preparePreviewBackdrop(item, backdropOverride) {
  if (!item?.id) return null;

  const mediaType = getMediaTypeForItem(item);
  const backdropCacheKey = getBackdropCacheKey(item, mediaType);
  let backdropPath =
    backdropOverride || movieBackdropCache.get(backdropCacheKey);

  if (backdropPath === undefined) {
    try {
      backdropPath =
        (await fetchBestBackdrop(item.id, mediaType)) ||
        getPreviewBackdropFallback(item);
    } catch {
      backdropPath = getPreviewBackdropFallback(item);
    }

    movieBackdropCache.set(backdropCacheKey, backdropPath);
  }

  if (backdropPath) {
    await preloadImage(buildImg(backdropPath, PREVIEW_BACKDROP_SIZE));
  }

  return backdropPath || null;
}

export async function fetchBestPoster(itemId, mediaType = "movie") {
  const { posters } = await getMovieImages(itemId, mediaType);
  if (!Array.isArray(posters) || posters.length === 0) return null;

  const best = pickBestPosterByLangThenResolution(posters, {
    preferLangs: ["en", "en-US"],
    minWidth: 500,
  });

  return best?.file_path || null;
}

/* ========== Artwork para secciones de visionado (En progreso/Completadas) ========== */
const watchingPosterChoiceCache = new Map();
const watchingPosterInFlight = new Map();
const watchingBackdropChoiceCache = new Map();
const watchingBackdropInFlight = new Map();

function pickBestWatchingPoster(posters) {
  if (!Array.isArray(posters) || posters.length === 0) return null;

  const maxVotes = posters.reduce(
    (max, p) => ((p?.vote_count || 0) > max ? p.vote_count || 0 : max),
    0,
  );
  const withMaxVotes = posters.filter((p) => (p?.vote_count || 0) === maxVotes);
  if (!withMaxVotes.length) return null;

  const preferredLangs = new Set(["en", "en-US"]);
  const enGroup = withMaxVotes.filter(
    (p) => p?.iso_639_1 && preferredLangs.has(p.iso_639_1),
  );
  const nullLang = withMaxVotes.filter((p) => p?.iso_639_1 === null);
  const candidates = enGroup.length
    ? enGroup
    : nullLang.length
      ? nullLang
      : withMaxVotes;

  return (
    [...candidates].sort((a, b) => {
      const va = (b?.vote_average || 0) - (a?.vote_average || 0);
      if (va !== 0) return va;
      return (b?.width || 0) - (a?.width || 0);
    })[0] || null
  );
}

function pickBestWatchingBackdrop(list, opts = {}) {
  const { preferLangs = ["en", "en-US"], minWidth = 1200 } = opts;
  if (!Array.isArray(list) || list.length === 0) return null;

  const norm = (v) => (v ? String(v).toLowerCase().split("-")[0] : null);
  const preferSet = new Set((preferLangs || []).map(norm).filter(Boolean));
  const isPreferredLang = (img) => {
    if (img?.iso_639_1 === null || img?.iso_639_1 === undefined) return false;
    return preferSet.has(norm(img?.iso_639_1));
  };

  const pool0 =
    minWidth > 0 ? list.filter((b) => (b?.width || 0) >= minWidth) : list;
  const pool = pool0.length ? pool0 : list;

  const top3en = [];
  for (const b of pool) {
    if (isPreferredLang(b)) top3en.push(b);
    if (top3en.length === 3) break;
  }
  if (!top3en.length) return null;

  const isRes = (b, w, h) => (b?.width || 0) === w && (b?.height || 0) === h;
  const b1080 = top3en.find((b) => isRes(b, 1920, 1080));
  if (b1080) return b1080;
  const b1440 = top3en.find((b) => isRes(b, 2560, 1440));
  if (b1440) return b1440;
  const b4k = top3en.find((b) => isRes(b, 3840, 2160));
  if (b4k) return b4k;
  const b720 = top3en.find((b) => isRes(b, 1280, 720));
  if (b720) return b720;
  return top3en[0];
}

async function fetchWatchingImages(itemId, mediaType = "movie") {
  const apiKey = process.env.NEXT_PUBLIC_TMDB_API_KEY;
  if (!apiKey || !itemId) return { posters: [], backdrops: [] };

  try {
    const type = mediaType === "tv" ? "tv" : "movie";
    const url =
      `https://api.themoviedb.org/3/${type}/${itemId}/images` +
      `?api_key=${apiKey}&${TMDB_IMAGE_LANGS_PARAM}`;
    const r = await fetch(url, { cache: "force-cache" });
    if (!r.ok) return { posters: [], backdrops: [] };
    const j = await r.json();
    return {
      posters: Array.isArray(j?.posters) ? j.posters : [],
      backdrops: Array.isArray(j?.backdrops) ? j.backdrops : [],
    };
  } catch {
    return { posters: [], backdrops: [] };
  }
}

export async function fetchBestWatchingPoster(itemId, mediaType = "movie") {
  const type = mediaType === "tv" ? "tv" : "movie";
  const key = `${type}:${itemId}`;
  if (watchingPosterChoiceCache.has(key)) {
    return watchingPosterChoiceCache.get(key);
  }
  if (watchingPosterInFlight.has(key)) return watchingPosterInFlight.get(key);

  const promise = (async () => {
    const { posters } = await fetchWatchingImages(itemId, type);
    const chosen = pickBestWatchingPoster(posters)?.file_path || null;
    watchingPosterChoiceCache.set(key, chosen);
    watchingPosterInFlight.delete(key);
    return chosen;
  })();

  watchingPosterInFlight.set(key, promise);
  return promise;
}

export async function fetchBestWatchingBackdrop(itemId, mediaType = "movie") {
  const type = mediaType === "tv" ? "tv" : "movie";
  const key = `${type}:${itemId}`;
  if (watchingBackdropChoiceCache.has(key)) {
    return watchingBackdropChoiceCache.get(key);
  }
  if (watchingBackdropInFlight.has(key)) return watchingBackdropInFlight.get(key);

  const promise = (async () => {
    const { backdrops } = await fetchWatchingImages(itemId, type);
    const chosen =
      pickBestWatchingBackdrop(backdrops, {
        preferLangs: ["en", "en-US"],
        minWidth: 1200,
      })?.file_path || null;
    watchingBackdropChoiceCache.set(key, chosen);
    watchingBackdropInFlight.delete(key);
    return chosen;
  })();

  watchingBackdropInFlight.set(key, promise);
  return promise;
}

// Selecciona el mejor cartel SIN idioma (textless). Si no hay textless, cae al
// de mayor resolución disponible.
export function pickBestPosterNoLang(
  list,
  { minWidth = 500, fallbackToAny = true } = {},
) {
  if (!Array.isArray(list) || list.length === 0) return null;

  const norm = (v) => (v ? String(v).toLowerCase().split("-")[0] : null);
  const noLang = list.filter((p) => !norm(p?.iso_639_1));
  if (!noLang.length && !fallbackToAny) return null;
  const pool = noLang.length ? noLang : list;

  const sized = pool.filter((p) => (p?.width || 0) >= minWidth);
  const candidates = sized.length ? sized : pool;

  return (
    [...candidates].sort(
      (a, b) =>
        (b?.width || 0) - (a?.width || 0) ||
        (b?.vote_average || 0) - (a?.vote_average || 0),
    )[0] || null
  );
}

export async function fetchBestPosterNoLang(
  itemId,
  mediaType = "movie",
  opts = {},
) {
  const { posters } = await getMovieImages(itemId, mediaType);
  const best = pickBestPosterNoLang(posters, opts);
  return best?.file_path || null;
}

/* =================== LOGOS (arte del título) =================== */
function pickBestLogoByLang(logos, order = ["es", "en", null]) {
  if (!Array.isArray(logos) || logos.length === 0) return null;
  const score = (l) => {
    const langIdx = order.indexOf(l?.iso_639_1 ?? null);
    const langScore = langIdx === -1 ? 0 : (order.length - langIdx) * 1000;
    return langScore + (l?.vote_count || 0);
  };
  // Prefiere PNG/SVG con fondo transparente; TMDb sirve .svg y .png.
  return [...logos].sort((a, b) => score(b) - score(a))[0] || null;
}

// Caché dedicada de logos. Igual que con backdrops/pósters, pedimos los logos
// SIN `include_image_language` para que TMDb devuelva los de TODOS los idiomas.
// Así nunca nos quedamos sin logo cuando un título solo lo tiene en otro idioma
// (p. ej. solo el original); el selector ya prioriza es/en/null y, si no, el más
// votado de cualquier idioma.
export const movieLogosCache = new Map(); // `${mediaType}:${id}` -> logos[]

export async function getTitleLogos(itemId, mediaType = "movie") {
  const cacheKey = `${mediaType}:${itemId}`;
  if (movieLogosCache.has(cacheKey)) return movieLogosCache.get(cacheKey);

  const apiKey = process.env.NEXT_PUBLIC_TMDB_API_KEY;
  if (!apiKey || !itemId) {
    movieLogosCache.set(cacheKey, []);
    return [];
  }

  try {
    const type = mediaType === "tv" ? "tv" : "movie";
    const url = `https://api.themoviedb.org/3/${type}/${itemId}/images?api_key=${apiKey}`;
    const r = await fetch(url, { cache: "force-cache" });
    // Sin este `r.ok`, un 429 (los dashboards disparan decenas de peticiones a
    // la vez y TMDb limita) o un 5xx devolvía un JSON de error sin `.logos`,
    // que se convertía en [] y se cacheaba abajo PARA SIEMPRE: ese título se
    // quedaba sin logo el resto de la sesión. Los fallos transitorios no se
    // cachean, así que el siguiente render reintenta.
    if (!r.ok) return [];
    const j = await r.json();
    const logos = Array.isArray(j?.logos) ? j.logos : [];
    movieLogosCache.set(cacheKey, logos);
    return logos;
  } catch {
    return [];
  }
}

export async function fetchBestLogo(
  itemId,
  mediaType = "movie",
  preferLangs = ["es", "en", null],
) {
  const logos = await getTitleLogos(itemId, mediaType);
  const best = pickBestLogoByLang(logos, preferLangs);
  return best?.file_path || null;
}

/* =================== TRAILERS (TMDb videos) =================== */
export const movieTrailerCache = new Map();
export const movieTrailerInFlight = new Map();

export function pickBestTrailer(videos) {
  if (!Array.isArray(videos) || videos.length === 0) return null;

  const yt = videos.filter((v) => v?.site === "YouTube" && v?.key);
  if (!yt.length) return null;

  const preferredLang = yt.filter(
    (v) =>
      v?.iso_639_1 === "en" || v?.iso_3166_1 === "US" || v?.iso_3166_1 === "GB",
  );

  const pool = preferredLang.length ? preferredLang : yt;
  const trailers = pool.filter((v) => v?.type === "Trailer");
  const teasers = pool.filter((v) => v?.type === "Teaser");
  const candidates = trailers.length
    ? trailers
    : teasers.length
      ? teasers
      : pool;

  const score = (v) => {
    const official = v?.official ? 100 : 0;
    const typeScore =
      v?.type === "Trailer" ? 50 : v?.type === "Teaser" ? 20 : 0;
    const size = typeof v?.size === "number" ? v.size : 0;
    return official + typeScore + size;
  };

  return [...candidates].sort((a, b) => score(b) - score(a))[0] || null;
}

export async function fetchBestTrailer(itemId, mediaType = "movie") {
  try {
    const apiKey = process.env.NEXT_PUBLIC_TMDB_API_KEY;
    if (!apiKey || !itemId) return null;

    const type = mediaType === "tv" ? "tv" : "movie";
    const url =
      `https://api.themoviedb.org/3/${type}/${itemId}/videos` +
      `?api_key=${apiKey}&language=en-US`;

    const r = await fetch(url, { cache: "force-cache" });
    if (!r.ok) return null;

    const j = await r.json();
    const results = Array.isArray(j?.results) ? j.results : [];
    const best = pickBestTrailer(results);

    if (!best?.key) return null;
    return { key: best.key, site: best.site, type: best.type };
  } catch {
    return null;
  }
}

export async function getBestTrailerCached(itemId, mediaType = "movie") {
  const cacheKey = `${mediaType}:${itemId}`;
  if (movieTrailerCache.has(cacheKey)) return movieTrailerCache.get(cacheKey);
  if (movieTrailerInFlight.has(cacheKey))
    return movieTrailerInFlight.get(cacheKey);

  const p = (async () => {
    const t = await fetchBestTrailer(itemId, mediaType);
    movieTrailerCache.set(cacheKey, t || null);
    movieTrailerInFlight.delete(cacheKey);
    return t || null;
  })();

  movieTrailerInFlight.set(cacheKey, p);
  return p;
}
