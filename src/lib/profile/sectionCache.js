const FINAL_ENGLISH_POSTER_SECTIONS = new Set([
  "activity",
  "favorites",
  "ratings",
  "watched",
  "watchlist",
]);

export function profileSectionCacheKey(username, section) {
  const normalizedUsername = String(username || "").trim().toLocaleLowerCase();
  // v3 invalida las instantáneas que podían contener una decisión de póster
  // procedente del espacio de caché de artwork anterior.
  const version = FINAL_ENGLISH_POSTER_SECTIONS.has(section) ? "v3" : "v1";
  return `${normalizedUsername}:${section}:${version}`;
}
