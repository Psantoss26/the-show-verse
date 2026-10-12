// src/lib/letterboxdRss.js
// Feed RSS público de un perfil de Letterboxd (https://letterboxd.com/<user>/rss/).
// Trae las últimas ~50 entradas del diario, cada una con su fecha de visionado,
// si fue rewatch, la puntuación y el id de TMDb de la película: con eso se
// sincroniza sin API (la oficial es privada) y sin buscar títulos.

const FEED_TIMEOUT_MS = 15000;
const USER_AGENT = 'TheShowVerse/1.0 (Letterboxd RSS sync)';

/**
 * Usuario de Letterboxd a partir de lo que escriba la persona: "usuario",
 * "@usuario" o la URL del perfil. null si no es un nombre válido.
 */
export function normalizeLetterboxdUsername(input) {
  let value = String(input || '').trim();
  const fromUrl = value.match(/letterboxd\.com\/([^/?#\s]+)/i);
  if (fromUrl) value = fromUrl[1];
  value = value.replace(/^@/, '').toLowerCase();
  return /^[a-z0-9_]{2,30}$/.test(value) ? value : null;
}

export function letterboxdFeedUrl(username) {
  return `https://letterboxd.com/${encodeURIComponent(username)}/rss/`;
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

function decodeXml(value) {
  return String(value || '')
    .replace(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/, '$1')
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, code) => {
      if (code[0] === '#') {
        const point = code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : Number(code.slice(1));
        return Number.isFinite(point) ? String.fromCodePoint(point) : match;
      }
      return ENTITIES[code.toLowerCase()] ?? match;
    })
    .trim();
}

function tag(block, name) {
  const escaped = name.replace(':', '\\:');
  const match = block.match(new RegExp(`<${escaped}(?:\\s[^>]*)?>([\\s\\S]*?)</${escaped}>`, 'i'));
  return match ? decodeXml(match[1]) : '';
}

/** "2024-01-01" → mediodía UTC de ese día (igual que la importación por ZIP). */
function dayIso(value) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/**
 * Entradas del diario del feed: [{ guid, tmdbId, title, year, watchedAt,
 * rewatch, rating, publishedAt }]. Las listas y lo que no trae id de TMDb o
 * fecha de visionado se ignoran.
 */
export function parseLetterboxdRss(xml) {
  const items = [];
  const blocks = String(xml || '').match(/<item\b[\s\S]*?<\/item>/gi) || [];
  for (const block of blocks) {
    const tmdbId = Number(tag(block, 'tmdb:movieId'));
    const watchedAt = dayIso(tag(block, 'letterboxd:watchedDate'));
    if (!Number.isInteger(tmdbId) || tmdbId <= 0 || !watchedAt) continue;
    const stars = Number(tag(block, 'letterboxd:memberRating'));
    const rating = Number.isFinite(stars) && stars > 0 ? Math.round(stars * 2) : null;
    const published = new Date(tag(block, 'pubDate'));
    const year = Number(tag(block, 'letterboxd:filmYear'));
    items.push({
      guid: tag(block, 'guid') || `${tmdbId}:${watchedAt}`,
      tmdbId,
      title: tag(block, 'letterboxd:filmTitle') || null,
      year: Number.isInteger(year) && year > 0 ? year : null,
      watchedAt,
      rewatch: /^yes$/i.test(tag(block, 'letterboxd:rewatch')),
      rating: rating >= 1 && rating <= 10 ? rating : null,
      publishedAt: Number.isNaN(published.getTime()) ? watchedAt : published.toISOString(),
    });
  }
  return items;
}

export class LetterboxdFeedError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

/** Descarga y parsea el feed. Lanza LetterboxdFeedError('not_found' | 'unavailable'). */
export async function fetchLetterboxdFeed(username, { fetchImpl = fetch } = {}) {
  let res;
  try {
    res = await fetchImpl(letterboxdFeedUrl(username), {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/rss+xml, application/xml, text/xml' },
      signal: AbortSignal.timeout(FEED_TIMEOUT_MS),
    });
  } catch {
    throw new LetterboxdFeedError('unavailable', 'No se pudo conectar con Letterboxd.');
  }
  if (res.status === 404) {
    throw new LetterboxdFeedError('not_found', 'No existe ese usuario de Letterboxd o su perfil es privado.');
  }
  if (!res.ok) {
    throw new LetterboxdFeedError('unavailable', `Letterboxd respondió ${res.status}.`);
  }
  const xml = await res.text();
  if (!/<rss\b/i.test(xml)) {
    throw new LetterboxdFeedError('unavailable', 'Letterboxd no devolvió un feed válido.');
  }
  return parseLetterboxdRss(xml);
}

/**
 * Qué toca en esta pasada:
 *   fresh    entradas que no se habían visto (por guid): visionados nuevos.
 *   edited   entradas ya vistas que siguen en el feed con otra nota (la
 *            persona editó el registro en Letterboxd).
 *   ratings  la nota más reciente de cada película entre las nuevas y las
 *            editadas. Las entradas ya vistas sin cambios no vuelven a
 *            aplicar su nota: si luego la cambias en The Show Verse, la
 *            siguiente pasada no la pisa.
 *
 * @param seenRatings  { guid: nota } de las entradas del feed anterior. Sin él
 *                     (cuentas de antes de existir) no se detectan ediciones.
 */
export function pendingLetterboxdEntries(items, seenGuids = [], seenRatings = null) {
  const seen = new Set(seenGuids);
  const fresh = items.filter((item) => !seen.has(item.guid));
  const edited = seenRatings
    ? items.filter(
        (item) =>
          seen.has(item.guid) &&
          Object.prototype.hasOwnProperty.call(seenRatings, item.guid) &&
          (seenRatings[item.guid] ?? null) !== (item.rating ?? null),
      )
    : [];
  const ratings = new Map();
  for (const item of [...fresh, ...edited]) {
    if (!item.rating) continue;
    const current = ratings.get(item.tmdbId);
    if (!current || current.publishedAt < item.publishedAt) ratings.set(item.tmdbId, item);
  }
  return { fresh, edited, ratings: [...ratings.values()] };
}

/** Nota de cada entrada del feed actual, para detectar ediciones en la siguiente pasada. */
export function nextSeenRatings(items) {
  return Object.fromEntries(items.map((item) => [item.guid, item.rating ?? null]));
}

/** Guids recordados: los del feed actual más los anteriores, con tope. */
export function nextSeenGuids(items, seenGuids = [], limit = 300) {
  return [...new Set([...items.map((item) => item.guid), ...seenGuids])].slice(0, limit);
}
