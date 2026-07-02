import { normalizeText } from "./resolve.js";

function titleFor(result, mediaType) {
  return mediaType === "tv"
    ? result?.name || result?.original_name
    : result?.title || result?.original_title;
}

export function pickTmdbResult(results, query, mediaType, { exactOnly = false } = {}) {
  const candidates = Array.isArray(results) ? results.filter((item) => item?.id) : [];
  if (!candidates.length) return null;

  const normalizedQuery = normalizeText(query);
  const exact = candidates.find(
    (item) =>
      normalizeText(titleFor(item, mediaType)) === normalizedQuery ||
      normalizeText(item?.original_title || item?.original_name) ===
        normalizedQuery,
  );

  return exact || (exactOnly ? null : candidates[0]);
}

export async function searchTmdbCandidatesWithFallback({
  mediaType,
  backendSearch,
  directSearch,
}) {
  const backendResults = await backendSearch(mediaType).catch(() => []);
  if (Array.isArray(backendResults) && backendResults.length > 0) {
    return backendResults;
  }

  const directResults = await directSearch(mediaType).catch(() => []);
  return Array.isArray(directResults) ? directResults : [];
}

export async function resolveStreamingEntity({
  query,
  expectedMediaType = null,
  preferTv = false,
  search,
}) {
  if (expectedMediaType === "tv") {
    const results = await search("tv");
    const entity = pickTmdbResult(results, query, "tv");
    return entity ? { kind: "resolved", mediaType: "tv", entity } : null;
  }

  const [movieResults, tvResults] = await Promise.all([
    search("movie"),
    search("tv"),
  ]);
  const exactMovie = pickTmdbResult(movieResults, query, "movie", {
    exactOnly: true,
  });
  const exactShow = pickTmdbResult(tvResults, query, "tv", {
    exactOnly: true,
  });

  if (preferTv && (exactShow || (!exactMovie && tvResults.length > 0))) {
    return {
      kind: "series_without_episode",
      mediaType: "tv",
      entity: exactShow || pickTmdbResult(tvResults, query, "tv"),
    };
  }

  if (exactShow && !exactMovie) {
    return {
      kind: "series_without_episode",
      mediaType: "tv",
      entity: exactShow,
    };
  }

  if (exactMovie) {
    return { kind: "resolved", mediaType: "movie", entity: exactMovie };
  }

  if (exactShow) {
    return {
      kind: "series_without_episode",
      mediaType: "tv",
      entity: exactShow,
    };
  }

  const movie = pickTmdbResult(movieResults, query, "movie");
  if (movie) return { kind: "resolved", mediaType: "movie", entity: movie };

  const show = pickTmdbResult(tvResults, query, "tv");
  return show
    ? { kind: "series_without_episode", mediaType: "tv", entity: show }
    : null;
}
