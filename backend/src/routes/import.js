// src/routes/import.js
// Importación de datos desde Trakt.tv (migración)

import { db } from '../db/client.js';
import { watchHistory, favorites, watchlist, userRatings, userLists, userListItems } from '../db/schema.js';

const TRAKT_BASE = 'https://api.trakt.tv';
const CLIENT_ID = process.env.TRAKT_CLIENT_ID;

async function traktFetch(path, accessToken) {
  const res = await fetch(`${TRAKT_BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      'trakt-api-key': CLIENT_ID,
      'trakt-api-version': '2',
      Authorization: `Bearer ${accessToken}`,
    },
    signal: AbortSignal.timeout(30000),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw Object.assign(new Error(err.error || `Trakt ${res.status}`), { status: res.status });
  }

  return res.json();
}

// Caché en memoria del progreso de importación (por userId)
const importProgress = new Map();

export default async function importRoutes(fastify) {
  fastify.addHook('preHandler', fastify.requireAuth);

  // POST /import/trakt — Inicia importación en background
  fastify.post('/trakt', async (req, reply) => {
    const { accessToken } = req.body || {};
    if (!accessToken) {
      return reply.status(400).send({ error: 'accessToken required' });
    }

    const userId = req.user.id;

    // Evitar importaciones simultáneas
    if (importProgress.get(userId)?.status === 'running') {
      return reply.status(409).send({ error: 'Import already in progress' });
    }

    // Iniciar importación asíncrona
    importProgress.set(userId, {
      status: 'running',
      startedAt: new Date(),
      steps: {},
      error: null,
    });

    // Ejecutar en background sin bloquear la respuesta
    runImport(userId, accessToken).catch((err) => {
      const progress = importProgress.get(userId);
      if (progress) {
        progress.status = 'error';
        progress.error = err.message;
      }
    });

    return reply.status(202).send({ message: 'Import started', status: 'running' });
  });

  // GET /import/trakt/status — Estado de la importación
  fastify.get('/trakt/status', async (req, reply) => {
    const progress = importProgress.get(req.user.id);
    if (!progress) {
      return reply.send({ status: 'idle' });
    }
    return reply.send(progress);
  });
}

async function runImport(userId, accessToken) {
  const progress = importProgress.get(userId);

  const updateStep = (step, data) => {
    progress.steps[step] = data;
  };

  try {
    // ── 1. Historial ──────────────────────────────
    updateStep('history', { status: 'loading' });
    const history = await traktFetch('/sync/history?limit=10000&page=1', accessToken);
    const historyValues = history
      .filter((item) => item.movie || item.episode)
      .map((item) => {
        const isMovie = !!item.movie;
        const entity = item.movie || item.show;
        return {
          userId,
          tmdbId: entity?.ids?.tmdb,
          mediaType: isMovie ? 'movie' : 'tv',
          season: item.episode?.season || null,
          episode: item.episode?.number || null,
          watchedAt: item.watched_at ? new Date(item.watched_at) : new Date(),
          title: isMovie ? item.movie?.title : item.show?.title,
        };
      })
      .filter((item) => item.tmdbId);

    if (historyValues.length > 0) {
      // Insertar en batches de 500
      for (let i = 0; i < historyValues.length; i += 500) {
        await db.insert(watchHistory).values(historyValues.slice(i, i + 500)).onConflictDoNothing();
      }
    }
    updateStep('history', { status: 'done', imported: historyValues.length });

    // ── 2. Favoritos ───────────────────────────────
    updateStep('favorites', { status: 'loading' });
    const [favMovies, favShows] = await Promise.all([
      traktFetch('/sync/favorites/movies', accessToken).catch(() => []),
      traktFetch('/sync/favorites/shows', accessToken).catch(() => []),
    ]);

    const favValues = [
      ...favMovies.map((item) => ({
        userId,
        tmdbId: item.movie?.ids?.tmdb,
        mediaType: 'movie',
        title: item.movie?.title,
        addedAt: item.listed_at ? new Date(item.listed_at) : new Date(),
      })),
      ...favShows.map((item) => ({
        userId,
        tmdbId: item.show?.ids?.tmdb,
        mediaType: 'tv',
        title: item.show?.title,
        addedAt: item.listed_at ? new Date(item.listed_at) : new Date(),
      })),
    ].filter((item) => item.tmdbId);

    if (favValues.length > 0) {
      await db.insert(favorites).values(favValues).onConflictDoNothing();
    }
    updateStep('favorites', { status: 'done', imported: favValues.length });

    // ── 3. Watchlist ───────────────────────────────
    updateStep('watchlist', { status: 'loading' });
    const wl = await traktFetch('/sync/watchlist', accessToken).catch(() => []);
    const wlValues = wl
      .map((item) => {
        const isMovie = !!item.movie;
        const entity = item.movie || item.show;
        return {
          userId,
          tmdbId: entity?.ids?.tmdb,
          mediaType: isMovie ? 'movie' : 'tv',
          title: entity?.title,
          addedAt: item.listed_at ? new Date(item.listed_at) : new Date(),
        };
      })
      .filter((item) => item.tmdbId);

    if (wlValues.length > 0) {
      await db.insert(watchlist).values(wlValues).onConflictDoNothing();
    }
    updateStep('watchlist', { status: 'done', imported: wlValues.length });

    // ── 4. Ratings ─────────────────────────────────
    updateStep('ratings', { status: 'loading' });
    const ratings = await traktFetch('/sync/ratings', accessToken).catch(() => []);
    const ratingValues = ratings
      .filter((item) => item.rating && (item.movie || item.show || item.episode))
      .map((item) => {
        const isMovie = !!item.movie;
        const isEpisode = !!item.episode;
        const entity = item.movie || item.show;
        return {
          userId,
          tmdbId: entity?.ids?.tmdb,
          mediaType: isMovie ? 'movie' : isEpisode ? 'episode' : 'tv',
          rating: item.rating,
          season: item.episode?.season || null,
          episode: item.episode?.number || null,
          title: entity?.title,
          ratedAt: item.rated_at ? new Date(item.rated_at) : new Date(),
        };
      })
      .filter((item) => item.tmdbId);

    if (ratingValues.length > 0) {
      await db.insert(userRatings).values(ratingValues).onConflictDoNothing();
    }
    updateStep('ratings', { status: 'done', imported: ratingValues.length });

    // ── 5. Listas ──────────────────────────────────
    updateStep('lists', { status: 'loading' });
    const lists = await traktFetch('/users/me/lists', accessToken).catch(() => []);
    let listsImported = 0;

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

      const listItems = await traktFetch(`/users/me/lists/${list.ids?.slug}/items`, accessToken).catch(() => []);
      const itemValues = listItems
        .filter((item) => item.movie || item.show)
        .map((item) => {
          const isMovie = !!item.movie;
          const entity = item.movie || item.show;
          return {
            listId: newList.id,
            tmdbId: entity?.ids?.tmdb,
            mediaType: isMovie ? 'movie' : 'tv',
            title: entity?.title,
          };
        })
        .filter((item) => item.tmdbId);

      if (itemValues.length > 0) {
        await db.insert(userListItems).values(itemValues).onConflictDoNothing();
      }
      listsImported++;
    }
    updateStep('lists', { status: 'done', imported: listsImported });

    // ── Completado ──────────────────────────────────
    progress.status = 'done';
    progress.completedAt = new Date();
  } catch (err) {
    progress.status = 'error';
    progress.error = err.message;
    throw err;
  }
}
