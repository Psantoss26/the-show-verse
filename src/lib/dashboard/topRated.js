function normalizeTopRatedItem(item, mediaType) {
  if (!item?.id) return null;
  return {
    ...item,
    media_type: mediaType,
  };
}

function numericValue(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

export function combineTopRatedItems(movieItems = [], tvItems = []) {
  const combined = [
    ...(Array.isArray(movieItems) ? movieItems : []).map((item) =>
      normalizeTopRatedItem(item, "movie"),
    ),
    ...(Array.isArray(tvItems) ? tvItems : []).map((item) =>
      normalizeTopRatedItem(item, "tv"),
    ),
  ].filter(Boolean);

  const unique = new Map();
  for (const item of combined) {
    const key = `${item.media_type}:${item.id}`;
    if (!unique.has(key)) unique.set(key, item);
  }

  return [...unique.values()].sort((a, b) => {
    const ratingDifference =
      numericValue(b.vote_average) - numericValue(a.vote_average);
    if (ratingDifference !== 0) return ratingDifference;

    const votesDifference = numericValue(b.vote_count) - numericValue(a.vote_count);
    if (votesDifference !== 0) return votesDifference;

    const aTitle = String(a.title || a.name || "");
    const bTitle = String(b.title || b.name || "");
    return aTitle.localeCompare(bTitle, "es");
  });
}
