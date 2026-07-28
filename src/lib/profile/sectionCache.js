const FINAL_ENGLISH_POSTER_SECTIONS = new Set([
  "activity",
  "favorites",
  "ratings",
  "watched",
  "watchlist",
]);

export function profileSectionCacheKey(username, section) {
  const normalizedUsername = String(username || "").trim().toLocaleLowerCase();
  const version = FINAL_ENGLISH_POSTER_SECTIONS.has(section) ? "v2" : "v1";
  return `${normalizedUsername}:${section}:${version}`;
}
