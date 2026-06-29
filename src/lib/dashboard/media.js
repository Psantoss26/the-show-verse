// /src/lib/dashboard/media.js
// Helpers compartidos del dashboard de Inicio (MainDashboardClient + FeaturedHero).
// Funciones puras y cachés a nivel de módulo: al importarse en varios componentes
// comparten la misma instancia de caché.

/* ---------- helpers de formato ---------- */
export const yearOf = (m) =>
  m?.release_date?.slice(0, 4) || m?.first_air_date?.slice(0, 4) || "";

export const ratingOf = (m) =>
  typeof m?.vote_average === "number" && m.vote_average > 0
    ? m.vote_average.toFixed(1)
    : "–";

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

export function preloadImage(src) {
  if (!src) return Promise.resolve(false);
  if (imagePreloadCache.has(src)) return imagePreloadCache.get(src);

  const promise = new Promise((resolve) => {
    const img = new Image();
    img.decoding = "async";
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
export function getArtworkPreference(movieId) {
  if (typeof window === "undefined") {
    return { poster: null, backdrop: null };
  }
  const posterKey = `showverse:movie:${movieId}:poster`;
  const backdropKey = `showverse:movie:${movieId}:backdrop`;
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
    const j = await r.json();
    const posters = Array.isArray(j?.posters) ? j.posters : [];
    const backdrops = Array.isArray(j?.backdrops) ? j.backdrops : [];
    const logos = Array.isArray(j?.logos) ? j.logos : [];

    const data = { posters, backdrops, logos };
    movieImagesCache.set(cacheKey, data);
    return data;
  } catch {
    const fallback = { posters: [], backdrops: [], logos: [] };
    movieImagesCache.set(cacheKey, fallback);
    return fallback;
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

// Selecciona el mejor cartel SIN idioma (textless). Si no hay textless, cae al
// de mayor resolución disponible.
export function pickBestPosterNoLang(list, { minWidth = 500 } = {}) {
  if (!Array.isArray(list) || list.length === 0) return null;

  const norm = (v) => (v ? String(v).toLowerCase().split("-")[0] : null);
  const noLang = list.filter((p) => !norm(p?.iso_639_1));
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

export async function fetchBestPosterNoLang(itemId, mediaType = "movie") {
  const { posters } = await getMovieImages(itemId, mediaType);
  const best = pickBestPosterNoLang(posters);
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
    const j = await r.json();
    const logos = Array.isArray(j?.logos) ? j.logos : [];
    movieLogosCache.set(cacheKey, logos);
    return logos;
  } catch {
    movieLogosCache.set(cacheKey, []);
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
