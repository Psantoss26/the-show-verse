// Escalera de idioma del arte de las tarjetas:
//
//     inglés → español → idioma original del título → sin idioma (textless)
//
// Copia de src/lib/tmdb/imageLanguageLadder.js (el backend no puede importar
// del frontend); src/lib/tmdb/imageLanguageLadder.test.mjs comprueba que las
// dos coinciden.

const BASE_LANGUAGES = ['en', 'es'];

export function normalizeImageLanguage(value) {
  const language = String(value || '').toLowerCase().split('-')[0];
  return !language || language === 'xx' ? null : language;
}

function ladderLanguages(originalLanguage) {
  const original = normalizeImageLanguage(originalLanguage);
  return original && !BASE_LANGUAGES.includes(original)
    ? [...BASE_LANGUAGES, original]
    : BASE_LANGUAGES;
}

export function imageLanguageTiers(list, { originalLanguage } = {}) {
  const valid = (Array.isArray(list) ? list : []).filter((image) => image?.file_path);
  return [
    ...ladderLanguages(originalLanguage).map((language) =>
      valid.filter((image) => normalizeImageLanguage(image.iso_639_1) === language),
    ),
    valid.filter((image) => !normalizeImageLanguage(image.iso_639_1)),
  ];
}

export function pickByLanguageLadder(list, pickFromTier, options) {
  for (const tier of imageLanguageTiers(list, options)) {
    const picked = tier.length ? pickFromTier(tier) : null;
    if (picked) return picked;
  }
  return null;
}

export function tmdbImageLanguages(originalLanguage) {
  const original = normalizeImageLanguage(originalLanguage);
  const extra = original && !BASE_LANGUAGES.includes(original) ? `,${original}` : '';
  return `en,en-US,es,es-ES${extra},null`;
}
