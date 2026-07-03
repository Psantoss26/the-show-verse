import assert from "node:assert/strict";
import test from "node:test";

import {
  getDirectEpisodeTarget,
  getVisualEpisodeNumber,
  getVisualEpisodeOrdinal,
  mapRatingEpisodesByTmdbOrdinal,
  seasonStructuresAlign,
} from "./episodeRatingsStructure.js";
import { getSeriesGraphEpisodeCellData } from "./seriesGraphRatings.js";

test("SeriesGraph uses contiguous visual positions for sparse episode numbers", () => {
  const sourceEpisodes = [1, 6, 7].map((episode_number) => ({
    episode_number,
  }));

  const visualNumbers = sourceEpisodes.map((episode, episodeIndex) =>
    getVisualEpisodeNumber({
      source: "seriesgraph",
      episode,
      episodeIndex,
    }),
  );

  assert.deepEqual(visualNumbers, [1, 2, 3]);
});

test("detects a Gintama-style mismatch between SeriesGraph and TMDb seasons", () => {
  const ratings = [201, 51, 13, 51, 12, 13, 12, 14].map(
    (episodeCount, index) => ({
      season_number: index + 1,
      episodes: Array.from({ length: episodeCount }, (_, episodeIndex) => ({
        episode_number: episodeIndex + 1,
      })),
    }),
  );
  const tmdb = [49, 50, 51, 51, 51, 13, 51, 12, 13, 12, 14].map(
    (episode_count, index) => ({
      season_number: index + 1,
      episode_count,
    }),
  );

  assert.equal(seasonStructuresAlign(ratings, tmdb), false);
  assert.equal(getVisualEpisodeOrdinal(ratings, 2, 2), 203);

  const mapped = mapRatingEpisodesByTmdbOrdinal(ratings, tmdb);
  assert.deepEqual(
    [...mapped.values()].map((episodes) => episodes.length),
    [49, 50, 51, 51, 51, 13, 51, 12, 13, 12, 14],
  );
});

test("routes compact SeriesGraph cells using their original episode numbers", () => {
  const ratings = [
    {
      season_number: 1,
      episodes: [
        { episodeNumber: 1, sourceEpisodeNumber: 1 },
        { episodeNumber: 201, sourceEpisodeNumber: 201 },
      ],
    },
    {
      season_number: 2,
      episodes: [
        { episodeNumber: 1, sourceEpisodeNumber: 1 },
        { episodeNumber: 2, sourceEpisodeNumber: 6 },
        { episodeNumber: 47, sourceEpisodeNumber: 51 },
      ],
    },
    {
      season_number: 3,
      episodes: [
        { episodeNumber: 1, sourceEpisodeNumber: 1 },
        { episodeNumber: 13, sourceEpisodeNumber: 13 },
      ],
    },
    {
      season_number: 4,
      episodes: [{ episodeNumber: 1, sourceEpisodeNumber: 8 }],
    },
  ];

  assert.equal(getVisualEpisodeOrdinal(ratings, 2, 2, 6), 207);
  assert.equal(getVisualEpisodeOrdinal(ratings, 4, 1, 8), 273);
});

test("uses visual ordinals for a single absolute season with source gaps", () => {
  const ratings = [
    {
      season_number: 1,
      episodes: [
        { episodeNumber: 831, sourceEpisodeNumber: 831 },
        { episodeNumber: 832, sourceEpisodeNumber: 834 },
        { episodeNumber: 839, sourceEpisodeNumber: 847 },
      ],
    },
  ];

  assert.equal(getVisualEpisodeOrdinal(ratings, 1, 832, 834), 832);
  assert.equal(getVisualEpisodeOrdinal(ratings, 1, 839, 847), 839);
});

test("prioritizes the visible season and episode when that TMDb route exists", () => {
  const tmdb = [49, 50, 51, 51, 51, 13, 51, 12, 13, 12, 14].map(
    (episode_count, index) => ({
      season_number: index + 1,
      episode_count,
    }),
  );

  assert.deepEqual(getDirectEpisodeTarget(tmdb, 2, 4), {
    seasonNumber: 2,
    episodeNumber: 4,
  });
  assert.equal(getDirectEpisodeTarget(tmdb, 1, 100), null);
});

test("uses the EpisodeDetails rating for a compacted SeriesGraph cell", () => {
  const ratings = {
    seasons: [
      {
        season_number: 1,
        episodes: Array.from({ length: 53 }, (_, index) => ({
          episode_number: index + 1,
          rating: index === 52 ? 8.4 : 7,
        })),
      },
      {
        season_number: 2,
        episodes: [
          { episode_number: 1, rating: 9 },
          { episode_number: 6, rating: 8.1 },
          { episode_number: 7, rating: 7.9 },
          { episode_number: 8, rating: 6.8 },
        ],
      },
    ],
  };
  const tmdbSeasons = [
    { season_number: 1, episode_count: 49 },
    { season_number: 2, episode_count: 50 },
  ];

  const cell = getSeriesGraphEpisodeCellData({
    ratings,
    tmdbSeasons,
    seasonNumber: 2,
    episodeNumber: 4,
    sourceEpisode: ratings.seasons[1].episodes[3],
  });

  assert.equal(cell?.rating, 8.4);
  assert.notEqual(cell?.rating, 6.8);
});

test("keeps absolute single-season ratings attached to their visual ordinal", () => {
  const ratings = {
    seasons: [
      {
        season_number: 1,
        episodes: [
          { episode_number: 839, rating: 8.4 },
          { episode_number: 847, rating: 7.8 },
        ],
      },
    ],
  };
  const tmdbSeasons = [
    { season_number: 1, episode_count: 61 },
    { season_number: 2, episode_count: 16 },
  ];

  const cell = getSeriesGraphEpisodeCellData({
    ratings,
    tmdbSeasons,
    seasonNumber: 1,
    episodeNumber: 839,
    sourceEpisode: ratings.seasons[0].episodes[1],
  });

  assert.equal(cell?.rating, 7.8);
});

test("keeps direct mapping when rating and TMDb structures match", () => {
  const ratings = [2, 3].map((episodeCount, index) => ({
    season_number: index + 1,
    episodes: Array.from({ length: episodeCount }, (_, episodeIndex) => ({
      episode_number: episodeIndex + 1,
    })),
  }));
  const tmdb = [
    { season_number: 1, episode_count: 2 },
    { season_number: 2, episode_count: 3 },
  ];

  assert.equal(seasonStructuresAlign(ratings, tmdb), true);
});
