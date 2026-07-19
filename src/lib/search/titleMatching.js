const DEFAULT_TITLE_FIELDS = [
  "title",
  "name",
  "original_title",
  "original_name",
  "title_es",
  "name_es",
  "title_en",
  "name_en",
  "originalTitle",
  "originalName",
  "spanishTitle",
  "englishTitle",
  "localizedTitle",
  "displayTitle",
  "primaryTitle",
  "showName",
  "movieTitle",
  "seriesTitle",
];

const NESTED_TITLE_FIELDS = ["movie", "show", "tv", "media", "details"];

export function normalizeSearchText(value = "") {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function addCandidate(candidates, seen, value) {
  const text = String(value || "").trim();
  if (!text) return;
  const key = normalizeSearchText(text);
  if (!key || seen.has(key)) return;
  seen.add(key);
  candidates.push(text);
}

function collectTitleCandidates(item, fields, candidates, seen, depth = 0) {
  if (!item || typeof item !== "object" || depth > 1) return;

  for (const field of fields) {
    addCandidate(candidates, seen, item[field]);
  }

  for (const nestedField of NESTED_TITLE_FIELDS) {
    collectTitleCandidates(
      item[nestedField],
      DEFAULT_TITLE_FIELDS,
      candidates,
      seen,
      depth + 1,
    );
  }
}

export function getTitleCandidates(item, extraFields = []) {
  const candidates = [];
  const seen = new Set();
  const fields = [...DEFAULT_TITLE_FIELDS, ...extraFields];
  collectTitleCandidates(item, fields, candidates, seen);
  return candidates;
}

export function getPrimarySearchTitle(item) {
  return getTitleCandidates(item)[0] || "";
}

export function buildSearchableTitleText(item, extraFields = []) {
  return getTitleCandidates(item, extraFields).join(" ");
}

export function titleMatchesQuery(item, query, extraFields = []) {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return true;
  return getTitleCandidates(item, extraFields).some((title) =>
    normalizeSearchText(title).includes(normalizedQuery),
  );
}
