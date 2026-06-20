export const DEFAULT_LOCALE = "es-ES";
export const EN_LOCALE = "en-US";

export function normalizeLocale(locale) {
  return locale === EN_LOCALE || locale === "en" ? EN_LOCALE : DEFAULT_LOCALE;
}

export function getLocaleLanguage(locale) {
  return normalizeLocale(locale).startsWith("en") ? "en" : "es";
}

export function getLocaleFromCookieString(cookieString) {
  const match = String(cookieString || "").match(/(?:^|;\s*)showverse_locale=([^;]+)/);
  return normalizeLocale(match ? decodeURIComponent(match[1]) : DEFAULT_LOCALE);
}

export function getImageLanguageCodes(locale) {
  return getLocaleLanguage(locale) === "en"
    ? ["en-US", "en", "es-ES", "es", null]
    : ["es-ES", "es", "en-US", "en", null];
}

export function getTmdbIncludeImageLanguage(locale, { includeNull = true } = {}) {
  return getImageLanguageCodes(locale)
    .filter((lang) => includeNull || lang !== null)
    .map((lang) => (lang === null ? "null" : lang))
    .join(",");
}

const MOVIE_GENRES = {
  "es-ES": {
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
    10770: "Película de TV",
    53: "Thriller",
    10752: "Bélica",
    37: "Western",
  },
  "en-US": {
    28: "Action",
    12: "Adventure",
    16: "Animation",
    35: "Comedy",
    80: "Crime",
    99: "Documentary",
    18: "Drama",
    10751: "Family",
    14: "Fantasy",
    36: "History",
    27: "Horror",
    10402: "Music",
    9648: "Mystery",
    10749: "Romance",
    878: "Science Fiction",
    10770: "TV Movie",
    53: "Thriller",
    10752: "War",
    37: "Western",
  },
};

const TV_GENRES = {
  "es-ES": {
    10759: "Acción y aventura",
    16: "Animación",
    35: "Comedia",
    80: "Crimen",
    99: "Documental",
    18: "Drama",
    10751: "Familia",
    10762: "Kids",
    9648: "Misterio",
    10763: "Noticias",
    10764: "Reality",
    10765: "Ciencia ficción y fantasía",
    10766: "Telenovela",
    10767: "Talk show",
    10768: "Bélica y política",
    37: "Western",
  },
  "en-US": {
    10759: "Action & Adventure",
    16: "Animation",
    35: "Comedy",
    80: "Crime",
    99: "Documentary",
    18: "Drama",
    10751: "Family",
    10762: "Kids",
    9648: "Mystery",
    10763: "News",
    10764: "Reality",
    10765: "Sci-Fi & Fantasy",
    10766: "Soap",
    10767: "Talk",
    10768: "War & Politics",
    37: "Western",
  },
};

export function getGenreMap(mediaType, locale) {
  const normalized = normalizeLocale(locale);
  return mediaType === "tv" || mediaType === "show"
    ? TV_GENRES[normalized]
    : MOVIE_GENRES[normalized];
}

export function getGenreName(mediaType, genreId, locale) {
  const map = getGenreMap(mediaType, locale);
  const fallback = normalizeLocale(locale) === EN_LOCALE ? "Genre" : "Género";
  return map?.[genreId] || `${fallback} ${genreId}`;
}

export function getNoGenreLabel(locale) {
  return normalizeLocale(locale) === EN_LOCALE ? "No genre" : "Sin género";
}

export function pickBestImageByLocale(
  list,
  { locale = DEFAULT_LOCALE, minWidth = 0, kind = "poster" } = {},
) {
  if (!Array.isArray(list) || list.length === 0) return null;

  const preferred = getImageLanguageCodes(locale);
  const norm = (value) => (value ? String(value).toLowerCase() : null);
  const matchesLanguage = (img, lang) => {
    if (lang === null) return img?.iso_639_1 == null;
    const imageLang = norm(img?.iso_639_1);
    const preferredLang = norm(lang);
    return imageLang === preferredLang || imageLang === preferredLang?.split("-")[0];
  };
  const findPool = ({ enforceMinWidth, allowAnyLanguage = false, allowNull = true } = {}) => {
    const languages = allowAnyLanguage ? ["__any__"] : preferred;
    for (const lang of languages) {
      const pool = list.filter((img) => {
        const hasLanguage = img?.iso_639_1 != null;
        const sameLang = allowAnyLanguage ? hasLanguage : matchesLanguage(img, lang);
        return (
          sameLang &&
          (allowNull || hasLanguage) &&
          (!enforceMinWidth || !minWidth || (img?.width || 0) >= minWidth)
        );
      });
      if (pool.length) return pool;
    }
    return null;
  };
  const findNullPool = ({ enforceMinWidth } = {}) => {
    const pool = list.filter(
      (img) =>
        img?.iso_639_1 == null &&
        (!enforceMinWidth || !minWidth || (img?.width || 0) >= minWidth),
    );
    return pool.length ? pool : null;
  };

  if (kind === "poster" && getLocaleLanguage(locale) === "es") {
    const spanishPoster = list.find(
      (img) =>
        (matchesLanguage(img, "es-ES") || matchesLanguage(img, "es")) &&
        (!minWidth || (img?.width || 0) >= minWidth),
    );
    if (spanishPoster) return spanishPoster;
  }

  let pool =
    findPool({ enforceMinWidth: true, allowNull: false }) ||
    findPool({ enforceMinWidth: false, allowNull: false }) ||
    findPool({ enforceMinWidth: true, allowAnyLanguage: true, allowNull: false }) ||
    findPool({ enforceMinWidth: false, allowAnyLanguage: true, allowNull: false }) ||
    findNullPool({ enforceMinWidth: true }) ||
    findNullPool({ enforceMinWidth: false });
  if (!pool) pool = minWidth ? list.filter((img) => (img?.width || 0) >= minWidth) : list;
  if (!pool.length) pool = list;

  return (
    [...pool].sort((a, b) => {
      if (kind === "backdrop") {
        const targetA = Math.abs((a?.width || 0) - 1920) + Math.abs((a?.height || 0) - 1080);
        const targetB = Math.abs((b?.width || 0) - 1920) + Math.abs((b?.height || 0) - 1080);
        if (targetA !== targetB) return targetA - targetB;
      }
      const votes = (b?.vote_count || 0) - (a?.vote_count || 0);
      if (votes !== 0) return votes;
      const average = (b?.vote_average || 0) - (a?.vote_average || 0);
      if (average !== 0) return average;
      return (b?.width || 0) - (a?.width || 0);
    })[0] || null
  );
}
