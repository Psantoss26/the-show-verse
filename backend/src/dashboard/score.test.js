// backend/src/dashboard/score.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  aggregateCandidates,
  excludeSeen,
  rankAnticipatedMovies,
  rankNewReleaseMovies,
} from './score.js';
import { balanceSoftLimitedContent, softLimitedContentWeight } from './filters.js';

const card = (id, extra = {}) => ({ tmdbId: id, mediaType: 'movie', title: `M${id}`, ...extra });

test('aggregateCandidates scores recommendations above similar and aggregates seeds', async () => {
  const seeds = [
    { tmdbId: 1, mediaType: 'movie', weight: 5, title: 'S1', strongPositive: true },
    { tmdbId: 2, mediaType: 'movie', weight: 2, title: 'S2', strongPositive: false },
  ];
  const fetchSimilar = async (s) => s.tmdbId === 1
    ? { recommendations: [card(10), card(11)], similar: [card(20)] }
    : { recommendations: [card(10)], similar: [] };
  const out = await aggregateCandidates({ seeds, fetchSimilar });
  const c10 = out.find((c) => c.tmdbId === 10);
  const c20 = out.find((c) => c.tmdbId === 20);
  assert.ok(c10.score > c20.score);                 // appears for 2 seeds, rec source
  assert.ok(c10.reasons.some((r) => r.seedTmdbId === 1)); // strongPositive seed → reason
  assert.ok(out[0].score >= out[out.length - 1].score);   // sorted desc
});

test('aggregateCandidates only attaches because-reasons for strongPositive seeds', async () => {
  const seeds = [
    { tmdbId: 1, mediaType: 'movie', weight: 10, title: 'Liked', strongPositive: true },
    { tmdbId: 2, mediaType: 'movie', weight: 2, title: 'JustWatched', strongPositive: false },
  ];
  // Cada seed recomienda un candidato distinto; ambos puntúan, pero solo el de
  // la seed con strongPositive lleva razón "because".
  const fetchSimilar = async (s) => ({
    recommendations: [card(s.tmdbId === 1 ? 10 : 20)],
    similar: [],
  });
  const out = await aggregateCandidates({ seeds, fetchSimilar });
  const fromLiked = out.find((c) => c.tmdbId === 10);
  const fromWatched = out.find((c) => c.tmdbId === 20);
  assert.ok(fromLiked.score > 0 && fromWatched.score > 0); // ambos puntúan
  assert.deepEqual(fromLiked.reasons.map((r) => r.seedTmdbId), [1]); // razón solo del liked
  assert.deepEqual(fromWatched.reasons, []); // el visionado casual no crea "porque viste"
});

test('excludeSeen removes library items', () => {
  const items = [card(10), card(11)];
  assert.deepEqual(excludeSeen(items, new Set(['movie:11'])).map((c) => c.tmdbId), [10]);
});

test('soft-limited animation/documentary content is downweighted unless strongly representative', () => {
  const weakAnimation = card(30, { genreIds: [16], voteAverage: 6.6, voteCount: 300 });
  const strongDocumentary = card(31, { genreIds: [99], voteAverage: 8.1, voteCount: 4000 });
  const drama = card(32, { genreIds: [18], voteAverage: 6.8, voteCount: 400 });

  assert.ok(softLimitedContentWeight(weakAnimation) < softLimitedContentWeight(drama));
  assert.ok(softLimitedContentWeight(strongDocumentary) > softLimitedContentWeight(weakAnimation));
});

test('balanceSoftLimitedContent lowers weaker animation/documentary items without removing them', () => {
  const items = [
    card(42, { genreIds: [99], voteAverage: 8.2, voteCount: 4000 }),
    card(41, { genreIds: [18], voteAverage: 6.8, voteCount: 300 }),
    card(40, { genreIds: [16], voteAverage: 6.4, voteCount: 300 }),
  ];

  const out = balanceSoftLimitedContent(items);
  assert.deepEqual(out.map((c) => c.tmdbId), [42, 41, 40]);
});

const NOW = '2026-07-04T00:00:00Z';

test('rankNewReleaseMovies returns [] for empty input and sorts desc with a score', () => {
  assert.deepEqual(rankNewReleaseMovies([]), []);
  const out = rankNewReleaseMovies(
    [card(1, { popularity: 10, releaseDate: '2026-07-04' })],
    { now: NOW },
  );
  assert.equal(typeof out[0].newReleaseScore, 'number');
});

test('rankNewReleaseMovies ranks a big-budget box-office hit above a small one (same popularity and date)', () => {
  const big = card(1, {
    popularity: 100, releaseDate: '2026-06-20', budget: 200_000_000, revenue: 800_000_000,
  });
  const small = card(2, {
    popularity: 100, releaseDate: '2026-06-20', budget: 1_000_000, revenue: 0,
  });
  const out = rankNewReleaseMovies([small, big], { now: NOW });
  assert.equal(out[0].tmdbId, 1); // el taquillazo primero pese al mismo orden de entrada
});

test('rankNewReleaseMovies prefers an imminent/recent release over a far-future one (same popularity/budget/revenue)', () => {
  const soon = card(1, { popularity: 50, releaseDate: '2026-07-10', budget: 0, revenue: 0 });
  const far = card(2, { popularity: 50, releaseDate: '2027-01-01', budget: 0, revenue: 0 });
  const out = rankNewReleaseMovies([far, soon], { now: NOW });
  assert.equal(out[0].tmdbId, 1); // proximidad de estreno desempata
});

test('rankNewReleaseMovies treats missing budget/revenue as zero (unreleased film still ranks by popularity)', () => {
  const popular = card(1, { popularity: 90, releaseDate: '2026-08-01' }); // sin budget/revenue
  const niche = card(2, { popularity: 5, releaseDate: '2026-08-01', budget: 5_000_000, revenue: 0 });
  const out = rankNewReleaseMovies([niche, popular], { now: NOW });
  assert.equal(out[0].tmdbId, 1); // la popularidad (peso 0.40) domina sobre un presupuesto pequeño
});

test('rankAnticipatedMovies excludes releases from today/past and dates too far away', () => {
  const out = rankAnticipatedMovies(
    [
      card(1, { releaseDate: '2026-07-03', popularity: 100 }),
      card(2, { releaseDate: '2026-07-04', popularity: 100 }),
      card(3, { releaseDate: '2026-07-05', popularity: 10 }),
      card(4, { releaseDate: '2028-07-05', popularity: 500 }),
    ],
    { now: NOW },
  );
  assert.deepEqual(out.map((item) => item.tmdbId), [3]);
});

test('rankAnticipatedMovies uses TMDB popularity as its main anticipation signal', () => {
  const popular = card(1, {
    popularity: 100,
    releaseDate: '2026-11-01',
    budget: 0,
    isFranchise: false,
  });
  const minor = card(2, {
    popularity: 10,
    releaseDate: '2026-07-10',
    budget: 200_000_000,
    isFranchise: true,
  });
  const out = rankAnticipatedMovies([minor, popular], { now: NOW });
  assert.equal(out[0].tmdbId, 1);
  assert.equal(typeof out[0].anticipatedScore, 'number');
});

test('rankAnticipatedMovies uses budget and franchise relevance to break close popularity', () => {
  const standalone = card(1, {
    popularity: 90,
    releaseDate: '2026-09-01',
    budget: 2_000_000,
    isFranchise: false,
  });
  const eventMovie = card(2, {
    popularity: 88,
    releaseDate: '2026-09-01',
    budget: 200_000_000,
    isFranchise: true,
  });
  const out = rankAnticipatedMovies([standalone, eventMovie], { now: NOW });
  assert.equal(out[0].tmdbId, 2);
});
