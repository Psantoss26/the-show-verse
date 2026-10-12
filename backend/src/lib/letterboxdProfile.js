// src/lib/letterboxdProfile.js
// Historial COMPLETO de un perfil público de Letterboxd a partir de sus páginas:
//
//   /<user>/films/diary/page/N/   el diario: cada visionado con su fecha y nota.
//   /<user>/films/page/N/         todas las películas vistas, con la nota actual.
//   /film/<slug>/                 la ficha: trae el id de TMDb (data-tmdb-id).
//
// El RSS (letterboxdRss) solo da las últimas ~50 entradas; esto se usa una vez
// al conectar la cuenta para traer todo lo anterior. Letterboxd no tiene API
// pública, así que se lee el HTML: los parsers aceptan las variantes de marcado
// conocidas (atributos data-film-* antiguos y data-item-* actuales) y, si no
// reconocen nada, se detienen en vez de inventar datos.

const BASE = 'https://letterboxd.com';
const PAGE_TIMEOUT_MS = 20000;
const MAX_PAGES = 400;
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (compatible; TheShowVerse/1.0; +https://letterboxd.com)',
  Accept: 'text/html,application/xhtml+xml',
  'Accept-Language': 'en',
};

export class LetterboxdProfileError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Entidades con nombre que aparecen en títulos (Latin-1 y tipografía).
const NAMED = Object.fromEntries(
  'nbsp:160 iexcl:161 cent:162 pound:163 curren:164 yen:165 brvbar:166 sect:167 uml:168 copy:169 ordf:170 laquo:171 not:172 shy:173 reg:174 macr:175 deg:176 plusmn:177 sup2:178 sup3:179 acute:180 micro:181 para:182 middot:183 cedil:184 sup1:185 ordm:186 raquo:187 frac14:188 frac12:189 frac34:190 iquest:191 Agrave:192 Aacute:193 Acirc:194 Atilde:195 Auml:196 Aring:197 AElig:198 Ccedil:199 Egrave:200 Eacute:201 Ecirc:202 Euml:203 Igrave:204 Iacute:205 Icirc:206 Iuml:207 ETH:208 Ntilde:209 Ograve:210 Oacute:211 Ocirc:212 Otilde:213 Ouml:214 times:215 Oslash:216 Ugrave:217 Uacute:218 Ucirc:219 Uuml:220 Yacute:221 THORN:222 szlig:223 agrave:224 aacute:225 acirc:226 atilde:227 auml:228 aring:229 aelig:230 ccedil:231 egrave:232 eacute:233 ecirc:234 euml:235 igrave:236 iacute:237 icirc:238 iuml:239 eth:240 ntilde:241 ograve:242 oacute:243 ocirc:244 otilde:245 ouml:246 divide:247 oslash:248 ugrave:249 uacute:250 ucirc:251 uuml:252 yacute:253 thorn:254 yuml:255 ndash:8211 mdash:8212 lsquo:8216 rsquo:8217 ldquo:8220 rdquo:8221 hellip:8230 oelig:339 OElig:338'
    .split(' ')
    .map((pair) => pair.split(':'))
    .map(([name, code]) => [name, String.fromCodePoint(Number(code))]),
);
const ENTITIES = { ...NAMED, amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
function decodeHtml(value) {
  return String(value || '')
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, code) => {
      if (code[0] === '#') {
        const point = code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : Number(code.slice(1));
        return Number.isFinite(point) ? String.fromCodePoint(point) : match;
      }
      return ENTITIES[code] ?? ENTITIES[code.toLowerCase()] ?? match;
    })
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function attr(block, names) {
  for (const name of names) {
    const match = block.match(new RegExp(`\\s${name}="([^"]*)"`, 'i'));
    if (match && match[1]) return decodeHtml(match[1]);
  }
  return '';
}

/** Slug de la película dentro de un bloque de HTML (fila del diario o póster). */
function filmSlug(block) {
  const direct = attr(block, ['data-film-slug', 'data-item-slug']);
  if (direct) return direct;
  const link =
    block.match(/data-(?:target|item)-link="\/film\/([^/"]+)\//i) ||
    block.match(/href="\/[^/"]+\/film\/([^/"]+)\//i) ||
    block.match(/href="\/film\/([^/"]+)\//i);
  return link ? decodeHtml(link[1]) : '';
}

/** Nota 1–10 (medias estrellas) o null. */
function filmRating(block) {
  const field = block.match(/rateit-field[^>]*value="(\d+)"/i) || block.match(/value="(\d+)"[^>]*rateit-field/i);
  const rated = block.match(/\brated-(\d+)\b/);
  const value = Number((field && field[1] !== '0' ? field[1] : null) ?? (rated ? rated[1] : NaN));
  return Number.isInteger(value) && value >= 1 && value <= 10 ? value : null;
}

function yearFrom(value) {
  const match = String(value || '').match(/\((\d{4})\)\s*$/) || String(value || '').match(/^(\d{4})$/);
  return match ? Number(match[1]) : null;
}

function nameWithoutYear(value) {
  return String(value || '').replace(/\s*\(\d{4}\)\s*$/, '').trim();
}

function hasNextPage(html, path, page) {
  return html.includes(`${path}page/${page + 1}/`);
}

/** Filas del diario: [{ slug, title, year, watchedAt, rating }]. */
export function parseDiaryPage(html) {
  const source = String(html || '');
  const rows = source.split(/<tr\b/i).slice(1).filter((row) => /diary-entry|viewing-id/i.test(row.slice(0, 600)) || /\/films\/diary\/for\//.test(row));
  const entries = [];
  for (const raw of rows) {
    const row = raw.split(/<\/tr>/i)[0];
    const date = row.match(/\/films\/diary\/for\/(\d{4})\/(\d{2})\/(\d{2})\//);
    const slug = filmSlug(row);
    if (!date || !slug) continue;
    const named = attr(row, ['data-film-name', 'data-item-name', 'data-item-full-display-name']);
    const headline = row.match(/<h3[^>]*>([\s\S]*?)<\/h3>/i);
    const released = row.match(/td-released[^>]*>([\s\S]*?)<\/td>/i);
    const title = nameWithoutYear(named) || (headline ? decodeHtml(headline[1]) : '') || null;
    const year =
      yearFrom(attr(row, ['data-film-release-year', 'data-item-release-year'])) ||
      yearFrom(named) ||
      yearFrom(released ? decodeHtml(released[1]) : '');
    const watchedAt = new Date(Date.UTC(Number(date[1]), Number(date[2]) - 1, Number(date[3]), 12)).toISOString();
    entries.push({ slug, title, year, watchedAt, rating: filmRating(row) });
  }
  return entries;
}

/** Pósters de la rejilla de películas vistas: [{ slug, title, year, rating }]. */
export function parseFilmsPage(html) {
  const source = String(html || '');
  const blocks = source.split(/<li\b/i).slice(1);
  const films = [];
  const seen = new Set();
  for (const raw of blocks) {
    const block = raw.split(/<\/li>/i)[0];
    if (!/poster|griditem|film-slug|item-slug/i.test(block)) continue;
    const slug = filmSlug(block);
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);
    const named = attr(block, ['data-film-name', 'data-item-name', 'data-item-full-display-name']);
    const alt = attr(block, ['alt']);
    films.push({
      slug,
      title: nameWithoutYear(named) || nameWithoutYear(alt.replace(/^Poster for\s+/i, '')) || null,
      year: yearFrom(attr(block, ['data-film-release-year', 'data-item-release-year'])) || yearFrom(named) || yearFrom(alt),
      rating: filmRating(block),
    });
  }
  return films;
}

/** Ficha de una película: { tmdbId, mediaType, year } o null. */
export function parseFilmPage(html) {
  const source = String(html || '');
  const id = attr(source, ['data-tmdb-id']) || (source.match(/themoviedb\.org\/(?:movie|tv)\/(\d+)/) || [])[1];
  const type =
    attr(source, ['data-tmdb-type']) || ((source.match(/themoviedb\.org\/(movie|tv)\/\d+/) || [])[1]) || 'movie';
  const tmdbId = Number(id);
  if (!Number.isInteger(tmdbId) || tmdbId <= 0) return null;
  const ogTitle = source.match(/<meta[^>]+property="og:title"[^>]+content="([^"]*)"/i);
  const yearLink = source.match(/\/films\/year\/(\d{4})\//);
  return {
    tmdbId,
    mediaType: type === 'tv' ? 'tv' : 'movie',
    year: yearFrom(ogTitle ? decodeHtml(ogTitle[1]) : '') || (yearLink ? Number(yearLink[1]) : null),
  };
}

/** GET con reintentos ante 429/5xx. Devuelve el HTML, o null en 404. */
export async function fetchLetterboxdHtml(url, { fetchImpl = fetch, retries = 3 } = {}) {
  for (let attempt = 0; ; attempt += 1) {
    let res;
    try {
      res = await fetchImpl(url, { headers: HEADERS, signal: AbortSignal.timeout(PAGE_TIMEOUT_MS) });
    } catch {
      if (attempt < retries) {
        await wait(2000 * (attempt + 1));
        continue;
      }
      throw new LetterboxdProfileError('unavailable', 'No se pudo conectar con Letterboxd.');
    }
    if (res.status === 404) return null;
    if ((res.status === 429 || res.status >= 500) && attempt < retries) {
      const retryAfter = Number(res.headers?.get?.('retry-after'));
      await wait(Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter, 60) * 1000 : 5000 * (attempt + 1));
      continue;
    }
    if (!res.ok) {
      throw new LetterboxdProfileError(
        res.status === 403 ? 'blocked' : 'unavailable',
        res.status === 403
          ? 'Letterboxd ha bloqueado la lectura del perfil. Importa el ZIP para traer el historial completo.'
          : `Letterboxd respondió ${res.status}.`,
      );
    }
    return res.text();
  }
}

async function collectPages(username, path, parse, { fetchImpl, delayMs, onPage }) {
  const items = [];
  const base = `/${encodeURIComponent(username)}${path}`;
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const url = `${BASE}${base}${page > 1 ? `page/${page}/` : ''}`;
    const html = await fetchLetterboxdHtml(url, { fetchImpl });
    if (html == null) {
      if (page === 1) throw new LetterboxdProfileError('not_found', 'No existe ese usuario de Letterboxd o su perfil es privado.');
      break;
    }
    const pageItems = parse(html);
    items.push(...pageItems);
    onPage?.(page, items.length);
    if (!pageItems.length || !hasNextPage(html, base, page)) break;
    if (delayMs) await wait(delayMs);
  }
  return items;
}

/**
 * Diario y películas vistas de un perfil.
 * @returns {{ diary: Array, films: Array }}
 */
export async function collectLetterboxdProfile(username, { fetchImpl = fetch, delayMs = 700, onProgress } = {}) {
  const diary = await collectPages(username, '/films/diary/', parseDiaryPage, {
    fetchImpl,
    delayMs,
    onPage: (page, count) => onProgress?.({ phase: 'diary', pages: page, diary: count }),
  });
  const films = await collectPages(username, '/films/', parseFilmsPage, {
    fetchImpl,
    delayMs,
    onPage: (page, count) => onProgress?.({ phase: 'films', pages: page, films: count }),
  });
  if (!diary.length && !films.length) {
    // Perfil existente pero sin nada reconocible: o está vacío o el marcado ha
    // cambiado. Mejor avisar que dar el historial por sincronizado.
    throw new LetterboxdProfileError(
      'empty',
      'No se encontró ninguna película en el perfil de Letterboxd. Si tienes películas registradas, importa el ZIP.',
    );
  }
  return { diary, films };
}

const tmdbBySlug = new Map();

/** slug → { tmdbId, mediaType, year } | null, leyendo la ficha (con caché). */
export async function resolveLetterboxdSlug(slug, { fetchImpl = fetch } = {}) {
  if (tmdbBySlug.has(slug)) return tmdbBySlug.get(slug);
  const html = await fetchLetterboxdHtml(`${BASE}/film/${encodeURIComponent(slug)}/`, { fetchImpl });
  const film = html ? parseFilmPage(html) : null;
  tmdbBySlug.set(slug, film);
  return film;
}

/**
 * De lo leído del perfil a visionados y puntuaciones (con tmdbId ya resuelto
 * en `resolved`: slug → ficha).
 *
 *   - Cada fila del diario es un visionado con su fecha.
 *   - Las películas vistas que no están en el diario no tienen fecha: entran
 *     como "sin fecha" (solo si no estaban ya vistas) el 1 de enero de su año de
 *     estreno, para no llenar de golpe la actividad reciente.
 *   - La nota es la actual de la rejilla; si no, la del registro más reciente
 *     del diario.
 */
export function buildLetterboxdProfileImport({ diary = [], films = [] }, resolved) {
  const history = [];
  const ratings = new Map();
  const diarySlugs = new Set();
  const movieFor = (slug) => {
    const film = resolved.get(slug);
    return film && film.mediaType === 'movie' ? film : null;
  };

  for (const entry of diary) {
    const film = movieFor(entry.slug);
    if (!film) continue;
    diarySlugs.add(entry.slug);
    history.push({ tmdbId: film.tmdbId, title: entry.title, watchedAt: entry.watchedAt, undated: false });
    if (entry.rating) {
      const current = ratings.get(film.tmdbId);
      if (!current || (current.fromDiary && current.ratedAt < entry.watchedAt)) {
        ratings.set(film.tmdbId, { tmdbId: film.tmdbId, title: entry.title, rating: entry.rating, ratedAt: entry.watchedAt, fromDiary: true });
      }
    }
  }

  for (const item of films) {
    const film = movieFor(item.slug);
    if (!film) continue;
    if (!diarySlugs.has(item.slug)) {
      const year = film.year || item.year;
      if (year) {
        history.push({
          tmdbId: film.tmdbId,
          title: item.title,
          watchedAt: new Date(Date.UTC(year, 0, 1, 12)).toISOString(),
          undated: true,
        });
      }
    }
    if (item.rating) {
      const previous = ratings.get(film.tmdbId);
      ratings.set(film.tmdbId, {
        tmdbId: film.tmdbId,
        title: item.title,
        rating: item.rating,
        ratedAt: previous?.ratedAt || null,
        fromDiary: false,
      });
    }
  }

  return {
    history,
    ratings: [...ratings.values()].map(({ fromDiary, ...rest }) => rest),
  };
}
