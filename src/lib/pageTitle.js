export const SITE_TITLE_SHORT = "TSV";
export const TITLE_SEPARATOR = "•";

export function formatPageTitle(title) {
  const cleanTitle = String(title || "").trim();
  return cleanTitle
    ? `${cleanTitle} ${TITLE_SEPARATOR} ${SITE_TITLE_SHORT}`
    : SITE_TITLE_SHORT;
}
