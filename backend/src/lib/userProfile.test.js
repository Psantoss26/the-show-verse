import assert from 'node:assert/strict';
import test from 'node:test';

import {
  titleKey,
  canFollow,
  buildRatingHistogram,
  dedupeRecentWatched,
  collapseGroupedWatchActivity,
  normalizeProfileFavorites,
  countCompletedShows,
  getUserReviews,
  pageParams,
  packPage,
  pickBestEnglishPosterPath,
  PROFILE_FAVORITES_MAX,
} from './userProfile.js';

function queryRows(rows) {
  const query = {
    from: () => query,
    where: () => query,
    orderBy: () => query,
    limit: () => query,
    offset: () => rows,
    then: (resolve, reject) => Promise.resolve(rows).then(resolve, reject),
  };
  return query;
}

function reviewQueryDb(reviewRows) {
  let selectCount = 0;
  return {
    select: () => {
      const rows = selectCount === 0 ? reviewRows : [];
      selectCount += 1;
      return queryRows(rows);
    },
  };
}

test('titleKey combines mediaType and numeric id', () => {
  assert.equal(titleKey('movie', 27205), 'movie:27205');
  assert.equal(titleKey('tv', '1399'), 'tv:1399');
});

test('getUserReviews hydrates title and poster for a review-only user', async () => {
  const page = await getUserReviews(
    reviewQueryDb([{
      id: 'review-1',
      tmdbId: 453,
      mediaType: 'movie',
      body: 'Una reseña sin elementos en otras listas.',
      spoiler: false,
      likes: 0,
      createdAt: new Date('2026-07-27T00:00:00.000Z'),
    }]),
    'reviewer-1',
    {
      hydrateMissing: async (_db, userId, items) => {
        assert.equal(userId, 'reviewer-1');
        assert.equal(items.length, 1);
        items[0].title = 'Ejemplo';
        items[0].posterPath = '/ejemplo.jpg';
      },
    },
  );

  assert.equal(page.items[0].title, 'Ejemplo');
  assert.equal(page.items[0].posterPath, '/ejemplo.jpg');
});

test('pickBestEnglishPosterPath keeps the DetailsClient artwork priority', () => {
  const posters = [
    { file_path: '/spanish.jpg', iso_639_1: 'es', vote_count: 100 },
    { file_path: '/neutral.jpg', iso_639_1: null, vote_count: 80 },
    { file_path: '/english-low.jpg', iso_639_1: 'en', vote_count: 2, width: 1200 },
    { file_path: '/english-best.jpg', iso_639_1: 'en', vote_count: 8, width: 900 },
  ];
  assert.equal(pickBestEnglishPosterPath(posters), '/english-best.jpg');
  assert.equal(pickBestEnglishPosterPath(posters.slice(0, 2)), '/neutral.jpg');
  assert.equal(pickBestEnglishPosterPath([{ file_path: '/spanish.jpg', iso_639_1: 'es' }]), null);
});

test('canFollow rejects self-follow and missing ids', () => {
  assert.equal(canFollow('a', 'b'), true);
  assert.equal(canFollow('a', 'a'), false);
  assert.equal(canFollow(null, 'b'), false);
  assert.equal(canFollow('a', null), false);
});

test('buildRatingHistogram counts only real 1-10 ratings, ignoring the rest', () => {
  const h = buildRatingHistogram([1, 1.4, 8.5, 10, 9.6, 'x', null, 0, 11]);
  assert.equal(h.length, 10);
  // 1 y 1.4 → índice 0. null(→0), 0 y 11 quedan FUERA de rango → ignorados.
  assert.equal(h[0], 2);
  // 8.5 → 9 (índice 8).
  assert.equal(h[8], 1);
  // 10 y 9.6(→10) → índice 9.
  assert.equal(h[9], 2);
  // Total contado = 5 (los 4 inválidos se descartan).
  assert.equal(h.reduce((a, b) => a + b, 0), 5);
});

test('dedupeRecentWatched keeps the most recent occurrence per title', () => {
  const rows = [
    { tmdbId: 1, mediaType: 'movie', watchedAt: '2026-07-10' },
    { tmdbId: 1, mediaType: 'movie', watchedAt: '2026-07-01' }, // duplicado (más antiguo)
    { tmdbId: 1, mediaType: 'tv', watchedAt: '2026-07-09' }, // mismo id, otro tipo → distinto
    { tmdbId: 2, mediaType: 'movie', watchedAt: '2026-07-08' },
  ];
  const out = dedupeRecentWatched(rows, 5);
  assert.deepEqual(
    out.map((r) => titleKey(r.mediaType, r.tmdbId)),
    ['movie:1', 'tv:1', 'movie:2'],
  );
});

test('dedupeRecentWatched respects the limit', () => {
  const rows = Array.from({ length: 10 }, (_, i) => ({ tmdbId: i, mediaType: 'movie' }));
  assert.equal(dedupeRecentWatched(rows, 3).length, 3);
});

test('collapseGroupedWatchActivity shows a completed series as one event', () => {
  const out = collapseGroupedWatchActivity([
    { id: 'ep-1', tmdbId: 10, mediaType: 'tv', season: 1, episode: 1, activityGroup: 'show-complete:10:run' },
    { id: 'ep-2', tmdbId: 10, mediaType: 'tv', season: 1, episode: 2, activityGroup: 'show-complete:10:run' },
    { id: 'ep-3', tmdbId: 11, mediaType: 'tv', season: 1, episode: 1, activityGroup: null },
  ]);

  assert.equal(out.length, 2);
  assert.equal(out[0].id, 'ep-3');
  assert.equal(out[1].tmdbId, 10);
  assert.equal(out[1].season, null);
  assert.equal(out[1].episode, null);
  assert.equal(out[1].completedShow, true);
});

test('normalizeProfileFavorites caps at 5, dedupes, and assigns positions', () => {
  const input = [
    { tmdbId: 1, mediaType: 'movie', title: 'A', posterPath: '/a.jpg' },
    { tmdbId: 1, mediaType: 'movie', title: 'A dup' }, // duplicado
    { tmdbId: 2, mediaType: 'tv', title: 'B', posterPath: 'http://evil' }, // poster inválido → null
    { tmdbId: -3, mediaType: 'movie' }, // id inválido → descartado
    { tmdbId: 4, mediaType: 'anime' }, // tipo inválido → descartado
    { tmdbId: 5, mediaType: 'movie' },
    { tmdbId: 6, mediaType: 'movie' },
    { tmdbId: 7, mediaType: 'movie' },
    { tmdbId: 8, mediaType: 'movie' }, // se recorta (>5)
  ];
  const out = normalizeProfileFavorites(input);
  assert.equal(out.length, PROFILE_FAVORITES_MAX);
  assert.deepEqual(
    out.map((f) => titleKey(f.mediaType, f.tmdbId)),
    ['movie:1', 'tv:2', 'movie:5', 'movie:6', 'movie:7'],
  );
  assert.deepEqual(out.map((f) => f.position), [0, 1, 2, 3, 4]);
  assert.equal(out[1].posterPath, null); // 'http://evil' rechazado
  assert.equal(out[0].posterPath, '/a.jpg');
});

test('normalizeProfileFavorites tolerates non-array input', () => {
  assert.deepEqual(normalizeProfileFavorites(null), []);
  assert.deepEqual(normalizeProfileFavorites(undefined), []);
  assert.deepEqual(normalizeProfileFavorites('nope'), []);
});

test('normalizeProfileFavorites keeps five entries for each requested media type', () => {
  const input = Array.from({ length: 6 }, (_, index) => ({
    tmdbId: index + 1,
    mediaType: 'movie',
  })).concat(Array.from({ length: 6 }, (_, index) => ({
    tmdbId: index + 101,
    mediaType: 'tv',
  })));

  const movies = normalizeProfileFavorites(input, PROFILE_FAVORITES_MAX, 'movie');
  const series = normalizeProfileFavorites(input, PROFILE_FAVORITES_MAX, 'tv');
  assert.equal(movies.length, PROFILE_FAVORITES_MAX);
  assert.equal(series.length, PROFILE_FAVORITES_MAX);
  assert.ok(movies.every((item) => item.mediaType === 'movie'));
  assert.ok(series.every((item) => item.mediaType === 'tv'));
});

test('countCompletedShows only counts series with every aired episode watched', () => {
  const metadata = new Map([
    ['tmdb:tv:1', { seasons: [{ season_number: 1, episode_count: 2 }] }],
    ['tmdb:tv:2', { seasons: [{ season_number: 1, episode_count: 2 }] }],
  ]);
  const rows = [
    { tmdbId: 1, season: 1, episode: 1 },
    { tmdbId: 1, season: 1, episode: 2 },
    { tmdbId: 1, season: 1, episode: 2 }, // rewatch, no duplica la serie
    { tmdbId: 2, season: 1, episode: 1 }, // falta el segundo episodio
  ];
  assert.equal(countCompletedShows(rows, metadata), 1);
});

test('pageParams clamps limit and offset to safe bounds', () => {
  assert.deepEqual(pageParams({}), { limit: 30, offset: 0 });
  assert.deepEqual(pageParams({ limit: 10, offset: 20 }), { limit: 10, offset: 20 });
  assert.deepEqual(pageParams({ limit: 999 }), { limit: 60, offset: 0 }); // tope 60
  assert.deepEqual(pageParams({ limit: -5, offset: -3 }), { limit: 1, offset: 0 }); // se acota al mínimo
  assert.deepEqual(pageParams({ limit: 0 }), { limit: 30, offset: 0 }); // 0 → por defecto
  assert.deepEqual(pageParams({ limit: '15', offset: '5' }), { limit: 15, offset: 5 });
});

test('packPage detects hasMore via the limit+1 sentinel and trims it', () => {
  // Se pidió limit+1 (4) y llegaron 4 → hay más; se recorta a 3.
  const withMore = packPage([1, 2, 3, 4], 3, 0);
  assert.deepEqual(withMore.items, [1, 2, 3]);
  assert.equal(withMore.hasMore, true);
  assert.equal(withMore.offset, 3);

  // Llegaron 2 (< limit) → no hay más.
  const noMore = packPage([1, 2], 3, 10);
  assert.deepEqual(noMore.items, [1, 2]);
  assert.equal(noMore.hasMore, false);
  assert.equal(noMore.offset, 12);
});
