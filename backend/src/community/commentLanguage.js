// backend/src/community/commentLanguage.js
//
// IDIOMA DE UN COMENTARIO DE TRAKT (Trakt no lo da). La sección de comentarios
// solo enseña los que están en inglés o en español.
//
// Un detector de trigramas solo (franc) falla con los comentarios cortos, que
// son mayoría: «great movie from great actors» salía rumano, «Ends as well as
// it begins.» sueco y «Awesome show!» hausa. Medido sobre comentarios reales,
// ocultaba decenas de comentarios en inglés. Se combinan tres señales:
//   1. Escritura: un texto sobre todo en otro alfabeto (árabe, cirílico,
//      asiáticos…) no es inglés ni español.
//   2. Palabras funcionales: las muy frecuentes de cada idioma (the/is/and…,
//      el/que/es…, não/você…, il/che…) deciden incluso con tres o cuatro
//      palabras, y separan el español del portugués o el italiano.
//   3. franc, limitado a idiomas de alfabeto latino, solo para desempatar.
//
// Devuelve 'en', 'es', otro código (ISO 639-1 o 639-3) o 'und' (sin texto
// suficiente: «11/10», «★★★★★»).

import { franc } from 'franc-min';

export const COMMENT_LANGUAGES = ['en', 'es'];

const MARKERS = {
  en: [
    'the', 'and', 'is', 'it', 'its', "it's", 'this', 'that', 'was', 'of', 'to', 'you', 'i', "i'm", "i've", 'my',
    'for', 'with', 'but', 'not', 'are', 'be', 'have', 'has', 'just', 'so', 'very', 'what', 'how', 'all', 'one',
    'best', 'great', 'good', 'awesome', 'amazing', 'masterpiece', 'show', 'movie', 'film', 'series', 'season',
    'episode', 'ever', 'love', 'loved', 'watch', 'watching', 'watched', 'really', 'can', "can't", "don't", 'like',
    'from', 'as', 'at', 'if', 'they', 'he', 'she', 'his', 'her', 'we', 'me', 'an', 'on', 'in', 'thank', 'simply',
  ],
  es: [
    'el', 'la', 'los', 'las', 'que', 'es', 'y', 'un', 'una', 'del', 'al', 'por', 'para', 'con', 'pero', 'muy',
    'lo', 'se', 'su', 'mi', 'como', 'más', 'mas', 'también', 'está', 'esta', 'este', 'esto', 'son', 'fue', 'hay',
    'serie', 'película', 'pelicula', 'temporada', 'capítulo', 'mejor', 'peor', 'gran', 'buena', 'bueno', 'nada',
    'todo', 'todos', 'muy', 'sólo', 'solo', 'cuando', 'porque', 'pues', 'ya', 'yo', 'me', 'te', 'le', 'sin',
    'obra', 'maestra', 'final', 'increíble', 'genial', 'eso', 'esa', 'ese', 'hace', 'tiene', 'ver', 'visto',
  ],
  pt: [
    'não', 'nao', 'você', 'voce', 'é', 'muito', 'uma', 'um', 'os', 'as', 'do', 'da', 'dos', 'das', 'no', 'na',
    'em', 'com', 'também', 'mais', 'já', 'série', 'filme', 'melhor', 'pior', 'ótimo', 'isso', 'essa', 'esse',
    'eu', 'ele', 'ela', 'foi', 'ser', 'tem', 'tempos', 'fim', 'obra', 'prima', 'nota', 'assistir', 'ver',
  ],
  it: [
    'il', 'di', 'che', 'è', 'non', 'per', 'della', 'delle', 'dei', 'gli', 'una', 'uno', 'sono', 'molto', 'anche',
    'questo', 'questa', 'film', 'serie', 'migliori', 'migliore', 'perfetta', 'perfetto', 'ho', 'visto', 'finale',
  ],
  fr: [
    'le', 'les', 'des', 'est', 'et', 'je', 'pas', 'très', "c'est", 'qui', 'une', 'du', 'sur', 'avec', 'mais',
    'pour', 'ce', 'cette', 'film', 'série', 'meilleur', 'vraiment', 'j\'ai', 'il', 'elle', 'nous', 'vous',
  ],
  de: [
    'der', 'die', 'das', 'und', 'ist', 'nicht', 'ein', 'eine', 'ich', 'sehr', 'mit', 'auch', 'den', 'dem', 'es',
    'zu', 'von', 'für', 'auf', 'aber', 'habe', 'serie', 'film', 'toller', 'tolle', 'gut', 'nach', 'mal',
  ],
};

const MARKER_SETS = Object.fromEntries(Object.entries(MARKERS).map(([lang, words]) => [lang, new Set(words)]));

// franc (ISO 639-3) → lo que se guarda.
const FRANC_TO_LANG = { eng: 'en', spa: 'es', por: 'pt', ita: 'it', fra: 'fr', deu: 'de' };
const FRANC_LATIN = Object.keys(FRANC_TO_LANG);

function cleanText(text) {
  return String(text || '')
    .replace(/https?:\/\/\S+/gi, ' ')
    .replace(/[@#][\p{L}\p{N}_]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function detectCommentLanguage(text) {
  const clean = cleanText(text);
  const letters = clean.match(/\p{L}/gu) || [];
  if (letters.length < 3) return 'und';

  // 1. Escritura: con mayoría de letras fuera del alfabeto latino, otro idioma.
  const latin = letters.filter((ch) => /\p{Script=Latin}/u.test(ch)).length;
  if (latin / letters.length < 0.5) return 'other';

  // 2. Palabras funcionales (distintas, no repeticiones).
  const words = new Set(clean.toLowerCase().match(/[\p{L}']+/gu) || []);
  const scores = Object.entries(MARKER_SETS)
    .map(([lang, set]) => [lang, [...words].filter((word) => set.has(word)).length])
    .sort((a, b) => b[1] - a[1]);
  const [[bestLang, best], [, second]] = scores;
  if (best > 0 && best > second) return bestLang;

  // 3. Empate o ninguna: franc entre idiomas de alfabeto latino.
  if (clean.length < 12) return best > 0 && ['en', 'es'].includes(bestLang) ? bestLang : 'und';
  const code = franc(clean, { minLength: 12, only: FRANC_LATIN });
  return FRANC_TO_LANG[code] || 'und';
}

export function isCommentLanguageShown(lang) {
  return COMMENT_LANGUAGES.includes(lang);
}
