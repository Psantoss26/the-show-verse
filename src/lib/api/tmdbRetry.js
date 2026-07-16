export const TMDB_RETRY_BASE_DELAY_MS = 250;
export const TMDB_MAX_RETRY_AFTER_MS = 8000;

export function isTmdbNotFound(status, json = {}) {
  return status === 404 || json?.status_code === 34;
}

export function isTmdbTransientStatus(status) {
  return status === 429 || status >= 500;
}

export function isHeavyTmdbPayload(path = "", params = {}) {
  const appendToResponse =
    params.append_to_response || params.appendToResponse || "";

  if (String(appendToResponse).trim()) return true;

  return /\/(images|videos|credits|recommendations|reviews|watch\/providers)(?:$|[/?])/.test(
    String(path),
  );
}

export function getTmdbRetryDelayMs({ attempt = 0, retryAfter } = {}) {
  const retryAfterSeconds = Number(retryAfter);
  if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) {
    return Math.min(retryAfterSeconds * 1000, TMDB_MAX_RETRY_AFTER_MS);
  }

  return TMDB_RETRY_BASE_DELAY_MS * 2 ** Math.max(0, attempt);
}

export function getTmdbErrorCode(error) {
  return error?.code || error?.cause?.code || null;
}

export function isTmdbTransientError(error) {
  const code = getTmdbErrorCode(error);
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
