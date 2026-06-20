import { inArray } from 'drizzle-orm';
import { db } from '../db/client.js';
import { tmdbCache } from '../db/schema.js';

function normalizedType(mediaType) {
  if (mediaType === 'movie') return 'movie';
  if (mediaType === 'tv' || mediaType === 'show') return 'tv';
  return null;
}

function canonicalKey(mediaType, tmdbId) {
  const type = normalizedType(mediaType);
  if (!type || !tmdbId) return null;
  return `${type}:${tmdbId}`;
}

function cacheKeys(mediaType, tmdbId) {
  const key = canonicalKey(mediaType, tmdbId);
  if (!key) return [];
  return [`tmdb:${key}`, key];
}

function cacheKeyToCanonical(cacheKey) {
  return String(cacheKey || '').replace(/^tmdb:/, '');
}

export async function getMediaMetadataMap(rows = [], options = {}) {
  const getMediaType = options.getMediaType || ((row) => row.mediaType);
  const getTmdbId = options.getTmdbId || ((row) => row.tmdbId);
  const keys = [
    ...new Set(rows.flatMap((row) => cacheKeys(getMediaType(row), getTmdbId(row)))),
  ];

  if (!keys.length) return new Map();

  const hits = await db
    .select({ cacheKey: tmdbCache.cacheKey, data: tmdbCache.data })
    .from(tmdbCache)
    .where(inArray(tmdbCache.cacheKey, keys));

  const map = new Map();
  for (const hit of hits) {
    map.set(cacheKeyToCanonical(hit.cacheKey), hit.data || {});
  }
  return map;
}

export function metadataFor(metadataByKey, mediaType, tmdbId) {
  const key = canonicalKey(mediaType, tmdbId);
  return key ? metadataByKey.get(key) || null : null;
}

export function mediaYearFromMetadata(metadata, mediaType) {
  const date =
    mediaType === 'movie'
      ? metadata?.release_date
      : metadata?.first_air_date;
  return date ? String(date).slice(0, 4) : null;
}

export function genreIdsFromMetadata(metadata) {
  return Array.isArray(metadata?.genres)
    ? metadata.genres.map((genre) => genre?.id).filter(Boolean)
    : [];
}

export function genreNamesFromMetadata(metadata) {
  return Array.isArray(metadata?.genres)
    ? metadata.genres
        .map((genre) => (typeof genre === 'string' ? genre : genre?.name))
        .filter(Boolean)
    : [];
}

export function hydrateMediaRow(row, metadataByKey) {
  const metadata = metadataFor(metadataByKey, row.mediaType, row.tmdbId);
  const isMovie = row.mediaType === 'movie';
  const title =
    row.title ||
    (isMovie
      ? metadata?.title || metadata?.original_title
      : metadata?.name || metadata?.original_name) ||
    null;

  return {
    ...row,
    title,
    posterPath: row.posterPath || metadata?.poster_path || null,
    backdropPath: metadata?.backdrop_path || null,
    releaseDate: metadata?.release_date || null,
    firstAirDate: metadata?.first_air_date || null,
    year: mediaYearFromMetadata(metadata, row.mediaType),
    genreIds: genreIdsFromMetadata(metadata),
    genres: Array.isArray(metadata?.genres) ? metadata.genres : [],
    genreNames: genreNamesFromMetadata(metadata),
    overview: metadata?.overview || null,
    voteAverage: metadata?.vote_average ?? null,
    runtimeMins: row.runtimeMins || metadata?.runtime || null,
    numberOfSeasons: metadata?.number_of_seasons || null,
    numberOfEpisodes: metadata?.number_of_episodes || null,
    seasons: Array.isArray(metadata?.seasons) ? metadata.seasons : [],
    status: metadata?.status || null,
    networks: Array.isArray(metadata?.networks) ? metadata.networks : [],
  };
}
