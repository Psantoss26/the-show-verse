// backend/src/community/trakt.js
// Cliente Trakt mínimo: SOLO client-id (endpoints públicos). Usado únicamente por el
// sembrado (una vez por título). Caché en memoria + backoff para no gatillar 429.
const TRAKT_BASE = 'https://api.trakt.tv';
const CLIENT_ID = process.env.TRAKT_CLIENT_ID || '';
const CACHE_TTL_MS = 60 * 60 * 1000; // 1h
const cache = new Map();             // key -> { ts, value }
let rateLockedUntil = 0;

// Cloudflare (delante de api.trakt.tv) rechaza con 403 las peticiones SIN cabecera
// User-Agent (el fetch de Node no envía ninguna por defecto). Cualquier UA descriptiva
// pasa el bot-check; se deja configurable por si Trakt pidiera una concreta.
const USER_AGENT = process.env.TRAKT_USER_AGENT || 'TheShowVerse/1.0 (+https://theshowverse.app)';

function headers() {
  return {
    'Content-Type': 'application/json',
    'User-Agent': USER_AGENT,
    'trakt-api-version': '2',
    'trakt-api-key': CLIENT_ID,
  };
}

async function traktGet(path, { retries = 2 } = {}) {
  if (!CLIENT_ID) return { ok: false, json: null, pagination: null };
  const key = path;
  const cached = cache.get(key);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) return cached.value;
  if (Date.now() < rateLockedUntil) return { ok: false, json: null, pagination: null };

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    let res;
    try {
      res = await fetch(`${TRAKT_BASE}${path}`, { headers: headers(), cache: 'no-store' });
    } catch {
      if (attempt === retries) return { ok: false, json: null, pagination: null };
      await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
      continue;
    }
    if (res.status === 429) {
      rateLockedUntil = Date.now() + 60_000;
      return { ok: false, json: null, pagination: null };
    }
    if (!res.ok) return { ok: false, json: null, pagination: null };
    const json = await res.json().catch(() => null);
    const pagination = {
      itemCount: Number(res.headers.get('x-pagination-item-count')) || 0,
      pageCount: Number(res.headers.get('x-pagination-page-count')) || 0,
      page: Number(res.headers.get('x-pagination-page')) || 1,
      limit: Number(res.headers.get('x-pagination-limit')) || 0,
    };
    const value = { ok: true, json, pagination };
    cache.set(key, { ts: Date.now(), value });
    return value;
  }
  return { ok: false, json: null, pagination: null };
}

const traktType = (type) => (type === 'tv' ? 'show' : 'movie');
const traktBase = (type) => (type === 'tv' ? 'shows' : 'movies');

export async function resolveTraktId({ type, tmdbId }) {
  const { ok, json } = await traktGet(`/search/tmdb/${tmdbId}?type=${traktType(type)}`);
  if (!ok) return { ok: false, traktId: null, slug: null };            // hard failure (network/HTTP/429)
  if (!Array.isArray(json) || !json.length) return { ok: true, traktId: null, slug: null }; // confirmed no match
  const item = json[0]?.[traktType(type)] || null;
  const traktId = item?.ids?.trakt || null;
  return { ok: true, traktId, slug: item?.ids?.slug || null };
}

export async function getComments({ type, traktId, sort = 'likes', page = 1, limit = 10 }) {
  const { ok, json, pagination } = await traktGet(
    `/${traktBase(type)}/${traktId}/comments/${sort}?page=${page}&limit=${limit}`,
  );
  return { ok, items: ok && Array.isArray(json) ? json : [], pagination };
}

export async function getListsContaining({ type, traktId, tab = 'popular', page = 1, limit = 3 }) {
  const { ok, json, pagination } = await traktGet(
    `/${traktBase(type)}/${traktId}/lists/${tab}?page=${page}&limit=${limit}`,
  );
  return { items: ok && Array.isArray(json) ? json : [], pagination };
}

export async function getUserListItems({ username, listSlug, page = 1, limit = 50 }) {
  const { ok, json } = await traktGet(
    `/users/${encodeURIComponent(username)}/lists/${encodeURIComponent(listSlug)}/items?extended=full&page=${page}&limit=${limit}`,
  );
  return ok && Array.isArray(json) ? json : [];
}

// Sentimiento OFICIAL de Trakt (temas positivos/negativos que Trakt precomputa a
// partir de los comentarios). Se copia una vez en el sembrado (como comentarios y
// listas) y se sirve desde Postgres. Devuelve { good:[{sentiment,comment_ids}], bad },
// o null si Trakt no tiene sentimiento para el título.
export async function getSentiments({ type, traktId }) {
  const { ok, json } = await traktGet(`/${traktBase(type)}/${traktId}/sentiments`);
  if (!ok || !json || typeof json !== 'object' || Array.isArray(json)) return null;
  return {
    good: Array.isArray(json.good) ? json.good : [],
    bad: Array.isArray(json.bad) ? json.bad : [],
    analyzedAt: json.analyzed_at || null,
    commentCount: Number(json.comment_count) || 0,
  };
}
