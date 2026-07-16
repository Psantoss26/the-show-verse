export const AWARDS_REQUEST_TIMEOUT_MS = 6000;
export const AWARDS_RETRY_DELAY_MS = 250;
export const AWARDS_NEGATIVE_TTL_MS = 5 * 60 * 1000;

export function emptyAwardsResponse({ sourceUrl = null, type = null, id = null, unavailable = false } = {}) {
  return {
    source: "tmdb",
    sourceUrl,
    type,
    id: id == null ? null : String(id),
    wins: 0,
    nominations: 0,
    total: 0,
    summary: null,
    groups: [],
    hasAwards: false,
    unavailable,
  };
}

export function isTransientAwardsStatus(status) {
  return status === 408 || status === 429 || status >= 500;
}

export function isTransientAwardsError(error) {
  const code = error?.code || error?.cause?.code;
  return (
    error?.name === "AbortError" ||
    error?.name === "TimeoutError" ||
    error?.name === "TypeError" ||
    code === "UND_ERR_ABORTED" ||
    code === "UND_ERR_CONNECT_TIMEOUT" ||
    code === "ECONNRESET" ||
    code === "ETIMEDOUT" ||
    code === "ENOTFOUND" ||
    code === "EAI_AGAIN"
  );
}

export function awardsRetryDelayMs(attempt = 0) {
  return AWARDS_RETRY_DELAY_MS * 2 ** Math.max(0, attempt);
}
