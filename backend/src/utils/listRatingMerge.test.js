import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeListItemRatings } from './listRatingMerge.js';

test('merges cache-hydrated TMDb scores into the visible community-list items', () => {
  const visibleItems = [
    { tmdbId: 1, mediaType: 'movie', posterPath: '/movie.jpg', voteAverage: null },
    { tmdbId: 2, mediaType: 'tv', posterPath: '/show.jpg', voteAverage: null },
  ];
  const ratedItems = [
    { tmdbId: 1, mediaType: 'movie', voteAverage: 8.4 },
    { tmdbId: 2, mediaType: 'tv', voteAverage: 7.2 },
  ];

  assert.deepEqual(mergeListItemRatings(visibleItems, ratedItems), [
    { tmdbId: 1, mediaType: 'movie', posterPath: '/movie.jpg', voteAverage: 8.4 },
    { tmdbId: 2, mediaType: 'tv', posterPath: '/show.jpg', voteAverage: 7.2 },
  ]);
});

test('keeps an item unchanged when no valid hydrated score exists', () => {
  const item = { tmdbId: 3, mediaType: 'movie', voteAverage: null };
  assert.deepEqual(mergeListItemRatings([item], [{ ...item, voteAverage: 0 }]), [item]);
});
