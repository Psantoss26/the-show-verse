// src/lib/tmdb/imageLanguageLadder.js
//
// ESCALERA DE IDIOMA DEL ARTE DE LAS TARJETAS (pósters y backdrops).
//
//     inglés → español → idioma original del título → sin idioma (textless)
//
// Si no queda ninguno, `null`: quien llama usa el póster/backdrop por defecto
// de TMDb. Antes cada página tenía su propia escalera y casi todas se quedaban
// en «solo inglés» o «inglés → sin idioma»: un título con arte SOLO en español
// («Señor, dame paciencia») salía sin póster en el Perfil y las notificaciones.
//
// Dentro de un idioma, los pósters toman el PRIMERO de TMDb (pickFirstImage);
// los backdrops conservan su criterio de resolución. Este módulo decide el
// ORDEN de los idiomas.
//
// El backend tiene una copia en backend/src/lib/imageLanguageLadder.js (no puede
// importar de aquí); un test comprueba que las dos coinciden.

const BASE_LANGUAGES = ["en", "es"];

// "en-US" → "en"; sin idioma (null, "" o "xx") → null.
export function normalizeImageLanguage(value) {
  const language = String(value || "").toLowerCase().split("-")[0];
  return !language || language === "xx" ? null : language;
}

function ladderLanguages(originalLanguage) {
  const original = normalizeImageLanguage(originalLanguage);
  return original && !BASE_LANGUAGES.includes(original)
    ? [...BASE_LANGUAGES, original]
    : BASE_LANGUAGES;
}

// Las imágenes agrupadas por escalón, en orden. El último es el sin idioma.
export function imageLanguageTiers(list, { originalLanguage } = {}) {
  const valid = (Array.isArray(list) ? list : []).filter((image) => image?.file_path);
  return [
    ...ladderLanguages(originalLanguage).map((language) =>
      valid.filter((image) => normalizeImageLanguage(image.iso_639_1) === language),
    ),
    valid.filter((image) => !normalizeImageLanguage(image.iso_639_1)),
  ];
}

// Primer escalón con candidatos en el que `pickFromTier` elige una imagen.
export function pickByLanguageLadder(list, pickFromTier, options) {
  for (const tier of imageLanguageTiers(list, options)) {
    const picked = tier.length ? pickFromTier(tier) : null;
    if (picked) return picked;
  }
  return null;
}

// Valor de `include_image_language`: sin el idioma original en la petición,
// TMDb no devuelve ese arte y su escalón se queda siempre vacío.
export function tmdbImageLanguages(originalLanguage) {
  const original = normalizeImageLanguage(originalLanguage);
  const extra = original && !BASE_LANGUAGES.includes(original) ? `,${original}` : "";
  return `en,en-US,es,es-ES${extra},null`;
}

// Póster: el PRIMERO de TMDb en ese idioma. Su orden es el de la web de TMDb y
// el primero es su póster principal (medido: coincidía con el `poster_path`
// en inglés en 15 de 15 títulos; el más votado, solo en 4).
export function pickFirstImage(list) {
  return (Array.isArray(list) && list[0]) || null;
}

// Backdrop de tarjeta: de los tres primeros de TMDb con el ancho mínimo, el
// primero con una resolución preferida y si no, el primero.
const PREFERRED_BACKDROP_SIZES = [[1920, 1080], [2560, 1440], [3840, 2160], [1280, 720]];

export function pickPreferredResolutionBackdrop(
  list,
  { minWidth = 1200, sizes = PREFERRED_BACKDROP_SIZES, offset = 0 } = {},
) {
  if (!Array.isArray(list) || !list.length) return null;
  const sized = minWidth > 0 ? list.filter((image) => (image?.width || 0) >= minWidth) : list;
  const candidates = (sized.length ? sized : list).slice(0, 3);
  const ordered = [];
  for (const [width, height] of sizes) {
    const match = candidates.find((image) => image?.width === width && image?.height === height);
    if (match && !ordered.includes(match)) ordered.push(match);
  }
  for (const candidate of candidates) if (!ordered.includes(candidate)) ordered.push(candidate);
  return ordered[Math.min(Math.max(0, offset), ordered.length - 1)] || null;
}
