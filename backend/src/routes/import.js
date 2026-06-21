// src/routes/import.js
// Importacion puntual desde Trakt.tv hacia la base de datos propia.

import { eq, and, desc, gt } from 'drizzle-orm';
import { db } from '../db/client.js';
import {
  favorites,
  userListItems,
  userLists,
  userRatings,
  watchHistory,
  watchlist,
  connectedAccounts,
} from '../db/schema.js';

const TRAKT_BASE = 'https://api.trakt.tv';
const CLIENT_ID = process.env.TRAKT_CLIENT_ID;
const USER_AGENT = process.env.TRAKT_USER_AGENT || 'TheShowVerse/1.0 (Fastify; Trakt Import)';
const DEFAULT_PAGE_LIMIT = 100;
const MAX_IMPORT_PAGES = 500;

// Cache en memoria del progreso de importacion por userId. Railway mantiene el
// proceso vivo durante la importacion; si se reinicia, el estado vuelve a idle.
const importProgress = new Map();

function progressKey(userId, provider = 'trakt') {
  return `${userId}:${provider}`;
}

function assertTraktConfigured() {
  if (!CLIENT_ID) {
    const err = new Error('TRAKT_CLIENT_ID is not configured');
    err.status = 503;
    throw err;
  }
}

async function traktFetchRaw(path, accessToken) {
  assertTraktConfigured();

  const res = await fetch(`${TRAKT_BASE}${path}`, {
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'trakt-api-key': CLIENT_ID,
      'trakt-api-version': '2',
      'User-Agent': USER_AGENT,
      Authorization: `Bearer ${accessToken}`,
    },
    signal: AbortSignal.timeout(45000),
  });

  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const err = new Error(json?.error_description || json?.error || json?.message || `Trakt ${res.status}`);
    err.status = res.status;
    throw err;
  }

  return { json, headers: res.headers };
}

function withoutExtendedFull(path) {
  const url = new URL(path, TRAKT_BASE);
  if (url.searchParams.get('extended') !== 'full') return null;
  url.searchParams.delete('extended');
  return `${url.pathname}${url.search}`;
}

function appendQuery(path, params = {}) {
  const url = new URL(path, TRAKT_BASE);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, String(value));
    }
  }
  return `${url.pathname}${url.search}`;
}

async function traktFetchAll(path, accessToken, { limit = DEFAULT_PAGE_LIMIT, maxPages = MAX_IMPORT_PAGES } = {}) {
  const all = [];
  let pageCount = null;

  for (let page = 1; page <= maxPages; page += 1) {
    const pagePath = appendQuery(path, { page, limit });
    let pageResult;
    try {
      pageResult = await traktFetchRaw(pagePath, accessToken);
    } catch (err) {
      const fallbackPath = err?.status === 403 ? withoutExtendedFull(pagePath) : null;
      if (!fallbackPath) throw err;
      pageResult = await traktFetchRaw(fallbackPath, accessToken);
    }
    const { json, headers } = pageResult;
    const items = Array.isArray(json) ? json : [];
    all.push(...items);

    const headerPageCount = Number(headers.get('x-pagination-page-count'));
    if (Number.isFinite(headerPageCount) && headerPageCount > 0) {
      pageCount = headerPageCount;
    }

    if ((pageCount && page >= pageCount) || items.length < limit || items.length === 0) {
      break;
    }
  }

  return all;
}

function dateKey(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString();
}

function historyKey(item) {
  return [
    Number(item.tmdbId),
    item.mediaType,
    item.season ?? '',
    item.episode ?? '',
    dateKey(item.watchedAt),
  ].join(':');
}

function ratingKey(item) {
  return [
    Number(item.tmdbId),
    item.mediaType,
    item.season ?? '',
    item.episode ?? '',
  ].join(':');
}

function dedupeBy(items, makeKey) {
  const seen = new Set();
  const out = [];
  for (const item of items) {
    const key = makeKey(item);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function mapTraktHistoryItem(item, userId) {
  const isMovie = Boolean(item?.movie);
  const entity = isMovie ? item.movie : item?.show;
  const tmdbId = Number(entity?.ids?.tmdb);
  if (!Number.isInteger(tmdbId) || tmdbId <= 0) return null;

  return {
    userId,
    tmdbId,
    mediaType: isMovie ? 'movie' : 'tv',
    season: isMovie ? null : Number(item?.episode?.season || 0) || null,
    episode: isMovie ? null : Number(item?.episode?.number || 0) || null,
    watchedAt: item?.watched_at ? new Date(item.watched_at) : new Date(),
    title: entity?.title || null,
  };
}

function mapTraktRatingItem(item, userId) {
  const isMovie = Boolean(item?.movie);
  const isEpisode = Boolean(item?.episode);
  const entity = isMovie ? item.movie : item?.show;
  const tmdbId = Number(entity?.ids?.tmdb);
  const rating = Number(item?.rating);

  if (!Number.isInteger(tmdbId) || tmdbId <= 0) return null;
  if (!Number.isFinite(rating) || rating < 1 || rating > 10) return null;

  return {
    userId,
    tmdbId,
    mediaType: isMovie ? 'movie' : isEpisode ? 'episode' : 'tv',
    season: isEpisode ? Number(item?.episode?.season || 0) || null : null,
    episode: isEpisode ? Number(item?.episode?.number || 0) || null : null,
    rating,
    title: entity?.title || null,
    ratedAt: item?.rated_at ? new Date(item.rated_at) : new Date(),
    updatedAt: new Date(),
  };
}

function mapTraktSimpleItem(item, userId) {
  const isMovie = Boolean(item?.movie);
  const entity = isMovie ? item.movie : item?.show;
  const tmdbId = Number(entity?.ids?.tmdb);
  if (!Number.isInteger(tmdbId) || tmdbId <= 0) return null;

  const listedAt = item?.listed_at ? new Date(item.listed_at) : new Date();
  return {
    userId,
    tmdbId,
    mediaType: isMovie ? 'movie' : 'tv',
    title: entity?.title || null,
    addedAt: listedAt,
  };
}

function mapTmdbCollectionItem(item, userId) {
  const mediaType =
    item?.media_type === 'tv' ? 'tv' : item?.media_type === 'movie' ? 'movie' : null;
  const tmdbId = Number(item?.id || item?.media_id || item?.tmdbId);
  if (!mediaType || !Number.isInteger(tmdbId) || tmdbId <= 0) return null;

  return {
    userId,
    tmdbId,
    mediaType,
    title: item?.title || item?.name || item?.original_title || item?.original_name || null,
    posterPath: item?.poster_path || item?.posterPath || null,
    addedAt: new Date(),
  };
}

function mapTmdbRatingItem(item, userId) {
  const mediaType =
    item?.media_type === 'tv' ? 'tv' : item?.media_type === 'movie' ? 'movie' : null;
  const tmdbId = Number(item?.id || item?.media_id || item?.tmdbId);
  const rating = Number(item?.rating ?? item?.account_rating);

  if (!mediaType || !Number.isInteger(tmdbId) || tmdbId <= 0) return null;
  if (!Number.isFinite(rating) || rating < 1 || rating > 10) return null;

  return {
    userId,
    tmdbId,
    mediaType,
    season: null,
    episode: null,
    rating,
    title: item?.title || item?.name || item?.original_title || item?.original_name || null,
    posterPath: item?.poster_path || item?.posterPath || null,
    ratedAt: new Date(),
    updatedAt: new Date(),
  };
}

function makeStep(status, data = {}) {
  return {
    status,
    ...data,
    updatedAt: new Date(),
  };
}

function mapNetflixHistoryItem(item, userId) {
  const tmdbId = Number(item?.tmdbId);
  const mediaType = item?.mediaType === 'tv' ? 'tv' : item?.mediaType === 'movie' ? 'movie' : null;
  if (!tmdbId || !mediaType) return null;

  const watchedAt = item?.watchedAt ? new Date(item.watchedAt) : new Date();
  if (Number.isNaN(watchedAt.getTime())) return null;

  const season = item?.season ? Number(item.season) : null;
  const episode = item?.episode ? Number(item.episode) : null;
  if (mediaType === 'tv' && (!season || !episode)) return null;

  return {
    userId,
    tmdbId,
    mediaType,
    season: mediaType === 'tv' ? season : null,
    episode: mediaType === 'tv' ? episode : null,
    watchedAt,
    runtimeMins: item?.runtimeMins ? Number(item.runtimeMins) : null,
    title: item?.title || null,
    posterPath: item?.posterPath || null,
  };
}

function mergeStepData(current = {}, next = {}) {
  return {
    status: next.status || current.status || 'done',
    fetched: Number(current.fetched || 0) + Number(next.fetched || 0),
    imported: Number(current.imported || 0) + Number(next.imported || 0),
    updated: Number(current.updated || 0) + Number(next.updated || 0),
    skipped: Number(current.skipped || 0) + Number(next.skipped || 0),
    updatedAt: new Date(),
  };
}

async function insertInChunks(table, values, chunkSize = 500) {
  let inserted = 0;
  for (let i = 0; i < values.length; i += chunkSize) {
    const chunk = values.slice(i, i + chunkSize);
    const result = await db.insert(table).values(chunk).onConflictDoNothing().returning({ id: table.id });
    inserted += result.length;
  }
  return inserted;
}

async function importHistory(userId, accessToken) {
  const traktHistory = await traktFetchAll('/sync/history?extended=full', accessToken, {
    limit: DEFAULT_PAGE_LIMIT,
  });

  return importHistoryValues(userId, traktHistory);
}

async function importHistoryValues(userId, traktHistory = []) {
  const sourceValues = dedupeBy(
    traktHistory.map((item) => mapTraktHistoryItem(item, userId)).filter(Boolean),
    historyKey,
  );

  const existing = await db.select().from(watchHistory).where(eq(watchHistory.userId, userId));
  const existingKeys = new Set(existing.map(historyKey));
  const values = sourceValues.filter((item) => !existingKeys.has(historyKey(item)));
  const imported = await insertInChunks(watchHistory, values);

  return {
    status: 'done',
    fetched: traktHistory.length,
    imported,
    skipped: sourceValues.length - values.length,
  };
}

async function importNetflixHistoryValues(userId, netflixHistory = []) {
  const sourceValues = dedupeBy(
    netflixHistory.map((item) => mapNetflixHistoryItem(item, userId)).filter(Boolean),
    historyKey,
  );

  const existing = await db.select().from(watchHistory).where(eq(watchHistory.userId, userId));
  const existingKeys = new Set(existing.map(historyKey));
  const values = sourceValues.filter((item) => !existingKeys.has(historyKey(item)));
  const imported = values.length ? await insertInChunks(watchHistory, values) : 0;

  return {
    status: 'done',
    fetched: netflixHistory.length,
    imported,
    skipped: netflixHistory.length - imported,
  };
}

async function importRatings(userId, accessToken) {
  const [movieRatings, showRatings, episodeRatings] = await Promise.all([
    traktFetchAll('/sync/ratings/movies?extended=full', accessToken),
    traktFetchAll('/sync/ratings/shows?extended=full', accessToken),
    traktFetchAll('/sync/ratings/episodes?extended=full', accessToken),
  ]);

  return importRatingValues(userId, [...movieRatings, ...showRatings, ...episodeRatings]);
}

async function importRatingValues(userId, traktRatings = []) {
  const sourceValues = dedupeBy(
    traktRatings.map((item) => mapTraktRatingItem(item, userId)).filter(Boolean),
    ratingKey,
  );

  return importNormalizedRatingValues(userId, sourceValues, traktRatings.length);
}

async function importNormalizedRatingValues(userId, sourceValues = [], fetched = 0) {
  const existing = await db.select().from(userRatings).where(eq(userRatings.userId, userId));
  const existingByKey = new Map(existing.map((item) => [ratingKey(item), item]));

  let inserted = 0;
  let updated = 0;

  for (const item of sourceValues) {
    const existingItem = existingByKey.get(ratingKey(item));
    if (existingItem) {
      await db
        .update(userRatings)
        .set({
          rating: item.rating,
          title: item.title,
          posterPath: item.posterPath || null,
          ratedAt: item.ratedAt,
          updatedAt: new Date(),
        })
        .where(eq(userRatings.id, existingItem.id));
      updated += 1;
    } else {
      await db.insert(userRatings).values(item).onConflictDoNothing();
      inserted += 1;
    }
  }

  return {
    status: 'done',
    fetched,
    imported: inserted,
    updated,
  };
}

async function importFavorites(userId, accessToken) {
  const [favMovies, favShows] = await Promise.all([
    traktFetchAll('/sync/favorites/movies?extended=full', accessToken).catch(() => []),
    traktFetchAll('/sync/favorites/shows?extended=full', accessToken).catch(() => []),
  ]);

  const values = dedupeBy(
    [...favMovies, ...favShows]
      .map((item) => mapTraktSimpleItem(item, userId))
      .filter(Boolean),
    (item) => `${item.tmdbId}:${item.mediaType}`,
  );

  const imported = values.length ? await insertInChunks(favorites, values) : 0;
  return { status: 'done', fetched: favMovies.length + favShows.length, imported };
}

async function importWatchlist(userId, accessToken) {
  const traktWatchlist = await traktFetchAll('/sync/watchlist?extended=full', accessToken).catch(() => []);
  const values = dedupeBy(
    traktWatchlist.map((item) => mapTraktSimpleItem(item, userId)).filter(Boolean),
    (item) => `${item.tmdbId}:${item.mediaType}`,
  );

  const imported = values.length ? await insertInChunks(watchlist, values) : 0;
  return { status: 'done', fetched: traktWatchlist.length, imported };
}

async function importTmdbCollectionValues(userId, collection, items = []) {
  const table = collection === 'watchlist' ? watchlist : favorites;
  const sourceValues = dedupeBy(
    items.map((item) => mapTmdbCollectionItem(item, userId)).filter(Boolean),
    (item) => `${item.tmdbId}:${item.mediaType}`,
  );

  const imported = sourceValues.length ? await insertInChunks(table, sourceValues) : 0;

  return {
    status: 'done',
    fetched: Array.isArray(items) ? items.length : 0,
    imported,
    skipped: sourceValues.length - imported,
  };
}

async function importTmdbRatingValues(userId, items = []) {
  const sourceValues = dedupeBy(
    items.map((item) => mapTmdbRatingItem(item, userId)).filter(Boolean),
    ratingKey,
  );

  return importNormalizedRatingValues(userId, sourceValues, Array.isArray(items) ? items.length : 0);
}

async function importLists(userId, accessToken) {
  const lists = await traktFetchRaw('/users/me/lists', accessToken)
    .then((r) => (Array.isArray(r.json) ? r.json : []))
    .catch(() => []);

  let listsImported = 0;
  let itemsImported = 0;

  for (const list of lists) {
    const [newList] = await db
      .insert(userLists)
      .values({
        userId,
        name: list.name,
        description: list.description || null,
        isPublic: list.privacy === 'public',
      })
      .returning({ id: userLists.id });

    const slug = list?.ids?.slug;
    if (!slug) {
      listsImported += 1;
      continue;
    }

    const listItems = await traktFetchAll(`/users/me/lists/${encodeURIComponent(slug)}/items?extended=full`, accessToken).catch(() => []);
    const itemValues = dedupeBy(
      listItems
        .filter((item) => item.movie || item.show)
        .map((item) => {
          const isMovie = Boolean(item.movie);
          const entity = isMovie ? item.movie : item.show;
          const tmdbId = Number(entity?.ids?.tmdb);
          if (!Number.isInteger(tmdbId) || tmdbId <= 0) return null;
          return {
            listId: newList.id,
            tmdbId,
            mediaType: isMovie ? 'movie' : 'tv',
            title: entity?.title || null,
          };
        })
        .filter(Boolean),
      (item) => `${item.tmdbId}:${item.mediaType}`,
    );

    if (itemValues.length > 0) {
      itemsImported += await insertInChunks(userListItems, itemValues);
    }
    listsImported += 1;
  }

  return { status: 'done', fetched: lists.length, imported: listsImported, itemsImported };
}

function normalizeMode(mode) {
  if (mode === 'all') return 'all';
  return 'history_ratings';
}

const netflixSimulateList = [
  {
    tmdbId: 66732, // Stranger Things
    mediaType: 'tv',
    season: 4,
    episode: 2,
    title: 'Stranger Things: Capítulo dos: La maldición de Vecna',
    posterPath: '/49WJfeN0mhmmQ9R6w4DjaRrk7uP.jpg',
  },
  {
    tmdbId: 66732, // Stranger Things
    mediaType: 'tv',
    season: 4,
    episode: 3,
    title: 'Stranger Things: Capítulo tres: El monstruo y la superheroína',
    posterPath: '/49WJfeN0mhmmQ9R6w4DjaRrk7uP.jpg',
  },
  {
    tmdbId: 119051, // Wednesday
    mediaType: 'tv',
    season: 1,
    episode: 2,
    title: 'Miércoles: El sombrío encanto de la soledad',
    posterPath: '/9pf1T92r66mdmV9ehw584n5767P.jpg',
  },
  {
    tmdbId: 119051, // Wednesday
    mediaType: 'tv',
    season: 1,
    episode: 3,
    title: 'Miércoles: Amistad, penuria y problemas',
    posterPath: '/9pf1T92r66mdmV9ehw584n5767P.jpg',
  },
  {
    tmdbId: 93405, // Squid Game
    mediaType: 'tv',
    season: 1,
    episode: 2,
    title: 'El juego del calamar: Infierno',
    posterPath: '/zN4170sl4F4Ty5A8l7V946IOypZ.jpg',
  },
  {
    tmdbId: 76900, // Cobra Kai
    mediaType: 'tv',
    season: 5,
    episode: 1,
    title: 'Cobra Kai: Largo camino a casa',
    posterPath: '/z71oeG8U26N2x9eBv87DIB955Wg.jpg',
  },
  {
    tmdbId: 96677, // Lupin
    mediaType: 'tv',
    season: 1,
    episode: 1,
    title: 'Lupin: Capítulo 1',
    posterPath: '/sg7ahr0Yj99n7fSvtcu80HBsVMU.jpg',
  },
  {
    tmdbId: 60735, // Peaky Blinders
    mediaType: 'tv',
    season: 6,
    episode: 1,
    title: 'Peaky Blinders: Un día negro',
    posterPath: '/bOGk429ekjJg9251Q26TjO4HOEw.jpg',
  },
  {
    tmdbId: 108978, // Los Bridgerton
    mediaType: 'tv',
    season: 2,
    episode: 1,
    title: 'Los Bridgerton: Un libertino con todas las letras',
    posterPath: '/7uQz4aMv5241n7wE5W44BwL6A0G.jpg',
  },
  {
    tmdbId: 82856, // The Witcher
    mediaType: 'tv',
    season: 3,
    episode: 1,
    title: 'The Witcher: Festival de la reina de mayo',
    posterPath: '/9G55zN3H37O6N281W4F4N279B.jpg',
  }
];

export default async function importRoutes(fastify) {
  fastify.addHook('preHandler', fastify.requireAuth);

  // POST /import/trakt - inicia una importacion desde Trakt en background.
  fastify.post('/trakt', async (req, reply) => {
    const { accessToken, mode } = req.body || {};
    if (!accessToken) {
      return reply.status(400).send({ error: 'accessToken required' });
    }

    const userId = req.user.id;
    const key = progressKey(userId, 'trakt');
    if (importProgress.get(key)?.status === 'running') {
      return reply.status(409).send({ error: 'Import already in progress' });
    }

    const normalizedMode = normalizeMode(mode);
    importProgress.set(key, {
      status: 'running',
      mode: normalizedMode,
      startedAt: new Date(),
      completedAt: null,
      steps: {},
      error: null,
    });

    runImport(userId, accessToken, normalizedMode, key).catch((err) => {
      const progress = importProgress.get(key);
      if (progress) {
        progress.status = 'error';
        progress.error = err.message;
        progress.completedAt = new Date();
      }
      req.log.error({ err, userId }, 'Trakt import failed');
    });

    return reply.status(202).send({ message: 'Import started', status: 'running', mode: normalizedMode });
  });

  // POST /import/trakt/data - importa datos de Trakt ya descargados por el BFF.
  fastify.post('/trakt/data', async (req, reply) => {
    const { history = [], ratings = [], mode } = req.body || {};
    if (!Array.isArray(history) || !Array.isArray(ratings)) {
      return reply.status(400).send({ error: 'history and ratings must be arrays' });
    }
    if (history.length > 50000 || ratings.length > 50000) {
      return reply.status(413).send({ error: 'Import payload is too large' });
    }

    const userId = req.user.id;
    const key = progressKey(userId, 'trakt');
    if (importProgress.get(key)?.status === 'running') {
      return reply.status(409).send({ error: 'Import already in progress' });
    }

    const normalizedMode = normalizeMode(mode);
    importProgress.set(key, {
      status: 'running',
      mode: normalizedMode,
      startedAt: new Date(),
      completedAt: null,
      steps: {},
      error: null,
      source: 'bff',
    });

    runImportData(userId, { history, ratings }, key).catch((err) => {
      const progress = importProgress.get(key);
      if (progress) {
        progress.status = 'error';
        progress.error = err.message;
        progress.completedAt = new Date();
      }
      req.log.error({ err, userId }, 'Trakt data import failed');
    });

    return reply.status(202).send({ message: 'Import started', status: 'running', mode: normalizedMode });
  });

  // POST /import/trakt/data/chunk - importa un lote pequeno ya descargado por Next.
  fastify.post('/trakt/data/chunk', async (req, reply) => {
    const {
      history = [],
      ratings = [],
      done = false,
      reset = false,
      mode,
    } = req.body || {};

    if (!Array.isArray(history) || !Array.isArray(ratings)) {
      return reply.status(400).send({ error: 'history and ratings must be arrays' });
    }
    if (history.length > 1000 || ratings.length > 1000) {
      return reply.status(413).send({ error: 'Import chunk is too large' });
    }

    const userId = req.user.id;
    const key = progressKey(userId, 'trakt');
    const current = importProgress.get(key);
    if (!reset && current?.status === 'running' && current?.source !== 'bff-chunk') {
      return reply.status(409).send({ error: 'Import already in progress' });
    }

    if (reset || !current || current.status !== 'running') {
      importProgress.set(key, {
        status: 'running',
        mode: normalizeMode(mode),
        startedAt: new Date(),
        completedAt: null,
        steps: {},
        error: null,
        source: 'bff-chunk',
      });
    }

    const progress = importProgress.get(key);
    try {
      if (history.length > 0) {
        const result = await importHistoryValues(userId, history);
        progress.steps.history = mergeStepData(progress.steps.history, result);
      } else if (!progress.steps.history) {
        progress.steps.history = makeStep('done', { fetched: 0, imported: 0, skipped: 0 });
      }

      if (ratings.length > 0) {
        const result = await importRatingValues(userId, ratings);
        progress.steps.ratings = mergeStepData(progress.steps.ratings, result);
      } else if (!progress.steps.ratings) {
        progress.steps.ratings = makeStep('done', { fetched: 0, imported: 0, updated: 0 });
      }

      if (done) {
        progress.status = 'done';
        progress.completedAt = new Date();
      }

      return reply.send(progress);
    } catch (err) {
      progress.status = 'error';
      progress.error = err.message;
      progress.completedAt = new Date();
      req.log.error({ err, userId }, 'Trakt chunk import failed');
      return reply.status(500).send(progress);
    }
  });

  // GET /import/trakt/status - estado de la importacion.
  fastify.get('/trakt/status', async (req, reply) => {
    const progress = importProgress.get(progressKey(req.user.id, 'trakt'));
    return reply.send(progress || { status: 'idle', steps: {} });
  });

  // POST /import/tmdb/data/chunk - importa favoritos, pendientes y puntuaciones de TMDb por lotes.
  fastify.post('/tmdb/data/chunk', async (req, reply) => {
    const {
      favorites: favoriteItems = [],
      watchlist: watchlistItems = [],
      ratings: ratingItems = [],
      done = false,
      reset = false,
    } = req.body || {};

    if (!Array.isArray(favoriteItems) || !Array.isArray(watchlistItems) || !Array.isArray(ratingItems)) {
      return reply.status(400).send({ error: 'favorites, watchlist and ratings must be arrays' });
    }
    if (favoriteItems.length > 1000 || watchlistItems.length > 1000 || ratingItems.length > 1000) {
      return reply.status(413).send({ error: 'Import chunk is too large' });
    }

    const userId = req.user.id;
    const key = progressKey(userId, 'tmdb');
    const current = importProgress.get(key);
    if (!reset && current?.status === 'running' && current?.source !== 'tmdb-bff-chunk') {
      return reply.status(409).send({ error: 'Import already in progress' });
    }

    if (reset || !current || current.status !== 'running') {
      importProgress.set(key, {
        status: 'running',
        mode: 'favorites_watchlist_ratings',
        startedAt: new Date(),
        completedAt: null,
        steps: {},
        error: null,
        source: 'tmdb-bff-chunk',
      });
    }

    const progress = importProgress.get(key);
    try {
      if (favoriteItems.length > 0) {
        const result = await importTmdbCollectionValues(userId, 'favorites', favoriteItems);
        progress.steps.favorites = mergeStepData(progress.steps.favorites, result);
      } else if (!progress.steps.favorites) {
        progress.steps.favorites = makeStep('done', { fetched: 0, imported: 0, skipped: 0 });
      }

      if (watchlistItems.length > 0) {
        const result = await importTmdbCollectionValues(userId, 'watchlist', watchlistItems);
        progress.steps.watchlist = mergeStepData(progress.steps.watchlist, result);
      } else if (!progress.steps.watchlist) {
        progress.steps.watchlist = makeStep('done', { fetched: 0, imported: 0, skipped: 0 });
      }

      if (ratingItems.length > 0) {
        const result = await importTmdbRatingValues(userId, ratingItems);
        progress.steps.ratings = mergeStepData(progress.steps.ratings, result);
      } else if (!progress.steps.ratings) {
        progress.steps.ratings = makeStep('done', { fetched: 0, imported: 0, updated: 0 });
      }

      if (done) {
        progress.status = 'done';
        progress.completedAt = new Date();
      }

      return reply.send(progress);
    } catch (err) {
      progress.status = 'error';
      progress.error = err.message;
      progress.completedAt = new Date();
      req.log.error({ err, userId }, 'TMDb chunk import failed');
      return reply.status(500).send(progress);
    }
  });

  fastify.get('/tmdb/status', async (req, reply) => {
    const progress = importProgress.get(progressKey(req.user.id, 'tmdb'));
    return reply.send(progress || { status: 'idle', steps: {} });
  });

  // POST /import/netflix/data/chunk - importa historial de Netflix ya resuelto a IDs de TMDb.
  fastify.post('/netflix/data/chunk', async (req, reply) => {
    const { history = [] } = req.body || {};
    if (!Array.isArray(history)) {
      return reply.status(400).send({ error: 'history must be an array' });
    }
    if (history.length > 1000) {
      return reply.status(413).send({ error: 'Import chunk is too large' });
    }

    const userId = req.user.id;
    const key = progressKey(userId, 'netflix');
    importProgress.set(key, {
      status: 'running',
      mode: 'history',
      startedAt: new Date(),
      completedAt: null,
      steps: {
        history: makeStep('loading', { fetched: history.length }),
      },
      error: null,
      source: 'netflix-csv',
    });

    const progress = importProgress.get(key);
    try {
      const result = await importNetflixHistoryValues(userId, history);
      progress.steps.history = makeStep('done', result);
      progress.status = 'done';
      progress.completedAt = new Date();
      return reply.send(progress);
    } catch (err) {
      progress.status = 'error';
      progress.error = err.message;
      progress.completedAt = new Date();
      req.log.error({ err, userId }, 'Netflix import failed');
      return reply.status(500).send(progress);
    }
  });

  fastify.get('/netflix/status', async (req, reply) => {
    const progress = importProgress.get(progressKey(req.user.id, 'netflix'));
    return reply.send(progress || { status: 'idle', steps: {} });
  });

  // POST /import/netflix/simulate - Simular visionado de Netflix
  fastify.post('/netflix/simulate', async (req, reply) => {
    const randomIndex = Math.floor(Math.random() * netflixSimulateList.length);
    const item = netflixSimulateList[randomIndex];
    const watchedAt = new Date();

    const [inserted] = await db
      .insert(watchHistory)
      .values({
        userId: req.user.id,
        tmdbId: item.tmdbId,
        mediaType: item.mediaType,
        season: item.season || null,
        episode: item.episode || null,
        watchedAt,
        title: item.title,
        posterPath: item.posterPath,
      })
      .returning();

    return reply.send({
      success: true,
      item: inserted,
    });
  });

  // GET /import/netflix/poll - Polling para nuevos visionados de Netflix
  fastify.get('/netflix/poll', async (req, reply) => {
    const { since } = req.query;
    const sinceDate = since ? new Date(since) : new Date(Date.now() - 30 * 1000);

    // Verificar si Netflix está conectado para este usuario
    const [netflixConn] = await db
      .select()
      .from(connectedAccounts)
      .where(
        and(
          eq(connectedAccounts.userId, req.user.id),
          eq(connectedAccounts.provider, 'netflix')
        )
      )
      .limit(1);

    if (!netflixConn) {
      return reply.send({ results: [], polledAt: new Date().toISOString() });
    }

    const recentItems = await db
      .select()
      .from(watchHistory)
      .where(
        and(
          eq(watchHistory.userId, req.user.id),
          gt(watchHistory.watchedAt, sinceDate)
        )
      )
      .orderBy(desc(watchHistory.watchedAt));

    return reply.send({
      results: recentItems,
      polledAt: new Date().toISOString(),
    });
  });
}

async function runImportData(userId, { history = [], ratings = [] }, key = progressKey(userId, 'trakt')) {
  const progress = importProgress.get(key);
  const updateStep = (step, data) => {
    progress.steps[step] = makeStep(data.status || 'running', data);
  };

  try {
    updateStep('history', { status: 'loading' });
    updateStep('history', await importHistoryValues(userId, history));

    updateStep('ratings', { status: 'loading' });
    updateStep('ratings', await importRatingValues(userId, ratings));

    progress.status = 'done';
    progress.completedAt = new Date();
  } catch (err) {
    progress.status = 'error';
    progress.error = err.message;
    progress.completedAt = new Date();
    throw err;
  }
}

async function runImport(userId, accessToken, mode, key = progressKey(userId, 'trakt')) {
  const progress = importProgress.get(key);
  const updateStep = (step, data) => {
    progress.steps[step] = makeStep(data.status || 'running', data);
  };

  try {
    updateStep('history', { status: 'loading' });
    updateStep('history', await importHistory(userId, accessToken));

    updateStep('ratings', { status: 'loading' });
    updateStep('ratings', await importRatings(userId, accessToken));

    if (mode === 'all') {
      updateStep('favorites', { status: 'loading' });
      updateStep('favorites', await importFavorites(userId, accessToken));

      updateStep('watchlist', { status: 'loading' });
      updateStep('watchlist', await importWatchlist(userId, accessToken));

      updateStep('lists', { status: 'loading' });
      updateStep('lists', await importLists(userId, accessToken));
    }

    progress.status = 'done';
    progress.completedAt = new Date();
  } catch (err) {
    progress.status = 'error';
    progress.error = err.message;
    progress.completedAt = new Date();
    throw err;
  }
}
