import { createGunzip } from "node:zlib";
import { Readable } from "node:stream";
import readline from "node:readline";

const DATASET_URL =
  process.env.IMDB_RATINGS_DATASET_URL ||
  "https://datasets.imdbws.com/title.ratings.tsv.gz";

const DATASET_TTL_MS = 24 * 60 * 60 * 1000;
const FAILED_RETRY_MS = 5 * 60 * 1000;

const g = globalThis;
g.__imdbRatingsDataset = g.__imdbRatingsDataset || {
  map: null,
  loadedAt: 0,
  inflight: null,
  error: null,
};

const state = g.__imdbRatingsDataset;

function normalizeImdbId(value) {
  const id = String(value || "").trim();
  return /^tt\d+$/i.test(id) ? id.toLowerCase() : null;
}

function parseRatingEntry(raw) {
  if (!raw) return null;
  const [ratingRaw, votesRaw] = String(raw).split("|");
  const rating = Number(ratingRaw);
  const votes = Number(votesRaw);
  if (!Number.isFinite(rating) || rating <= 0) return null;
  return {
    rating,
    votes: Number.isFinite(votes) && votes > 0 ? votes : null,
    source: "imdb-dataset",
    updatedAt: state.loadedAt || null,
  };
}

async function downloadAndParseRatings() {
  const response = await fetch(DATASET_URL, {
    cache: "no-store",
    headers: { accept: "application/gzip, application/octet-stream" },
  });

  if (!response.ok || !response.body) {
    throw new Error(`IMDb dataset unavailable (${response.status})`);
  }

  const map = new Map();
  const stream = Readable.fromWeb(response.body).pipe(createGunzip());
  const lines = readline.createInterface({
    input: stream,
    crlfDelay: Infinity,
  });

  let isHeader = true;
  for await (const line of lines) {
    if (isHeader) {
      isHeader = false;
      continue;
    }

    const [tconst, averageRating, numVotes] = String(line).split("\t");
    const imdbId = normalizeImdbId(tconst);
    const rating = Number(averageRating);
    const votes = Number(numVotes);

    if (!imdbId || !Number.isFinite(rating) || rating <= 0) continue;

    map.set(
      imdbId,
      `${rating}|${Number.isFinite(votes) && votes > 0 ? votes : ""}`,
    );
  }

  return map;
}

async function getRatingsMap({ force = false } = {}) {
  const now = Date.now();
  const hasFreshMap =
    state.map instanceof Map &&
    now - Number(state.loadedAt || 0) < DATASET_TTL_MS;

  if (!force && hasFreshMap) return state.map;
  if (!force && state.inflight) return state.inflight;

  const recentlyFailed =
    state.error?.at && now - Number(state.error.at) < FAILED_RETRY_MS;
  if (!force && recentlyFailed && state.map instanceof Map) return state.map;
  if (!force && recentlyFailed) {
    throw new Error(
      state.error?.message || "IMDb dataset temporarily unavailable",
    );
  }

  state.inflight = (async () => {
    try {
      const map = await downloadAndParseRatings();
      state.map = map;
      state.loadedAt = Date.now();
      state.error = null;
      return map;
    } catch (error) {
      state.error = {
        at: Date.now(),
        message: error?.message || "IMDb dataset fetch failed",
      };
      if (state.map instanceof Map) return state.map;
      throw error;
    } finally {
      state.inflight = null;
    }
  })();

  return state.inflight;
}

export async function lookupImdbRatings(imdbIds, options = {}) {
  const ids = [
    ...new Set(
      (Array.isArray(imdbIds) ? imdbIds : [imdbIds])
        .map(normalizeImdbId)
        .filter(Boolean),
    ),
  ];

  if (!ids.length) return {};

  const map = await getRatingsMap(options);
  const result = {};

  for (const id of ids) {
    const entry = parseRatingEntry(map.get(id));
    if (entry) result[id] = entry;
  }

  return result;
}

export async function lookupImdbRating(imdbId, options = {}) {
  const id = normalizeImdbId(imdbId);
  if (!id) return null;
  const result = await lookupImdbRatings([id], options);
  return result[id] || null;
}

export function getImdbRatingsDatasetStatus() {
  return {
    loaded: state.map instanceof Map,
    entries: state.map instanceof Map ? state.map.size : 0,
    loadedAt: state.loadedAt || null,
    error: state.error || null,
    source: DATASET_URL,
  };
}
