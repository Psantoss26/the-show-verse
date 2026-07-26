export const PROFILE_TAB_IDS = Object.freeze([
  "profile",
  "statistics",
  "activity",
  "watched",
  "reviews",
  "favorites",
  "watchlist",
  "ratings",
  "lists",
  "social",
]);

export const PROFILE_SECTION_IDS = new Set(PROFILE_TAB_IDS.filter((section) => section !== "profile"));

export function profileTabHref(username, section = "profile") {
  const base = `/u/${encodeURIComponent(String(username || "").trim())}`;
  return section === "profile" ? base : `${base}/${section}`;
}
