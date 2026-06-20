const ACCESS_TOKEN_COOKIE_NAMES = [
  "showverse_access_token",
  "backend_access_token",
  "access_token",
];
const REFRESH_TOKEN_COOKIE_NAMES = [
  "showverse_refresh_token",
  "backend_refresh_token",
  "refresh_token",
];
export const BACKEND_ACCESS_TOKEN_COOKIE = "showverse_access_token";
export const BACKEND_REFRESH_TOKEN_COOKIE = "showverse_refresh_token";
export const BACKEND_AUTH_COOKIE_NAMES = [
  ...ACCESS_TOKEN_COOKIE_NAMES,
  ...REFRESH_TOKEN_COOKIE_NAMES,
  "tmdb_session_id",
  "tmdb_session",
];
const BACKEND_FETCH_TIMEOUT_MS = 8000;

function backendTimeoutSignal(timeoutMs = BACKEND_FETCH_TIMEOUT_MS) {
  if (typeof AbortSignal !== "undefined" && AbortSignal.timeout) {
    return AbortSignal.timeout(timeoutMs);
  }
  const controller = new AbortController();
  setTimeout(() => controller.abort(), timeoutMs);
  return controller.signal;
}

function cleanBaseUrl(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

export function getBackendBaseUrl() {
  return cleanBaseUrl(
    process.env.BACKEND_API_BASE_URL ||
      process.env.NEXT_PUBLIC_API_BASE_URL ||
      process.env.NEXT_PUBLIC_BACKEND_URL,
  );
}

export function getCookieSecure(request) {
  const protocol =
    request?.nextUrl?.protocol ||
    request?.headers?.get?.("x-forwarded-proto") ||
    "";
  return String(protocol).startsWith("https");
}

export function setBackendTokenCookies(
  response,
  { accessToken, refreshToken } = {},
  { secure = true } = {},
) {
  if (accessToken) {
    response.cookies.set(BACKEND_ACCESS_TOKEN_COOKIE, accessToken, {
      httpOnly: true,
      secure,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 15,
    });
  }

  if (refreshToken) {
    response.cookies.set(BACKEND_REFRESH_TOKEN_COOKIE, refreshToken, {
      httpOnly: true,
      secure,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
  }

  return response;
}

export function clearBackendAuthCookies(response, { secure = true } = {}) {
  for (const name of BACKEND_AUTH_COOKIE_NAMES) {
    response.cookies.set(name, "", {
      httpOnly: true,
      secure,
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    });
  }

  return response;
}

export function getBackendAccessToken(request) {
  for (const name of ACCESS_TOKEN_COOKIE_NAMES) {
    const value = request?.cookies?.get(name)?.value;
    if (value) return value;
  }

  const auth = request?.headers?.get?.("authorization");
  if (auth?.toLowerCase().startsWith("bearer ")) return auth.slice(7);

  return null;
}

export function getBackendRefreshToken(request) {
  for (const name of REFRESH_TOKEN_COOKIE_NAMES) {
    const value = request?.cookies?.get(name)?.value;
    if (value) return value;
  }

  return null;
}

export function hasBackendCredentials(request) {
  return Boolean(getBackendBaseUrl() && (getBackendAccessToken(request) || getBackendRefreshToken(request)));
}

export function mediaTypeToBackend(type) {
  if (type === "show") return "tv";
  return type;
}

export function mediaTypeFromBackend(mediaType) {
  if (mediaType === "tv") return "show";
  return mediaType;
}

async function refreshBackendAccessToken(baseUrl, refreshToken) {
  if (!refreshToken) return null;

  const res = await fetch(`${baseUrl}/v1/auth/refresh`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    cache: "no-store",
    signal: backendTimeoutSignal(),
    body: JSON.stringify({ refreshToken }),
  });

  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.accessToken) return null;

  return {
    accessToken: json.accessToken,
    refreshToken: json.refreshToken || refreshToken,
  };
}

async function fetchBackendOnce(baseUrl, path, init, accessToken) {
  const { timeoutMs, ...fetchInit } = init;
  const headers = new Headers(init.headers || {});
  headers.set("Accept", "application/json");
  headers.set("Authorization", `Bearer ${accessToken}`);

  if (init.body != null && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const res = await fetch(`${baseUrl}${path}`, {
    ...fetchInit,
    headers,
    cache: "no-store",
    signal: init.signal || backendTimeoutSignal(timeoutMs),
  });

  const json = await res.json().catch(() => null);
  return {
    ok: res.ok,
    skipped: false,
    status: res.status,
    json,
    error: json?.error || json?.message || `Backend HTTP ${res.status}`,
  };
}

export async function backendFetchJson(request, path, init = {}) {
  const baseUrl = getBackendBaseUrl();
  let accessToken = getBackendAccessToken(request);
  const refreshToken = getBackendRefreshToken(request);

  if (!baseUrl) {
    return { ok: false, skipped: true, status: 0, json: null, error: "Backend base URL is not configured" };
  }

  let refreshedTokens = null;
  if (!accessToken && refreshToken) {
    refreshedTokens = await refreshBackendAccessToken(baseUrl, refreshToken);
    accessToken = refreshedTokens?.accessToken || null;
  }

  if (!accessToken) {
    return { ok: false, skipped: true, status: 401, json: null, error: "Backend access token is not available" };
  }

  let result = await fetchBackendOnce(baseUrl, path, init, accessToken);
  if (result.status === 401 && refreshToken) {
    refreshedTokens = await refreshBackendAccessToken(baseUrl, refreshToken);
    if (refreshedTokens?.accessToken) {
      result = await fetchBackendOnce(baseUrl, path, init, refreshedTokens.accessToken);
    }
  }

  return { ...result, refreshedTokens };
}

export function setBackendAuthCookies(response, backendResult, { secure = true } = {}) {
  const tokens = backendResult?.refreshedTokens;
  if (!tokens) return response;

  return setBackendTokenCookies(response, tokens, { secure });
}

export function normalizeBackendStatus(json, requestedType) {
  const mediaType = json?.mediaType || mediaTypeToBackend(requestedType);
  const type = mediaTypeFromBackend(mediaType);
  const isShow = type === "show";
  const watchedBySeason = json?.watchedBySeason || {};
  const completed = isShow
    ? Object.values(watchedBySeason).reduce((sum, episodes) => {
        return sum + (Array.isArray(episodes) ? episodes.length : 0);
      }, 0)
    : 0;

  return {
    connected: true,
    found: true,
    tmdbId: json?.tmdbId || null,
    mediaType,
    type,
    favorite: Boolean(json?.favorite),
    inWatchlist: Boolean(json?.inWatchlist ?? json?.watchlist),
    watchlist: Boolean(json?.watchlist ?? json?.inWatchlist),
    watched: Boolean(json?.watched),
    plays: Number(json?.plays || 0),
    lastWatchedAt: json?.lastWatchedAt || null,
    history: Array.isArray(json?.history) ? json.history : [],
    rating: json?.rating ?? null,
    ratedAt: json?.ratedAt || null,
    progress: isShow && completed > 0 ? null : json?.progress ?? null,
    completed: json?.completed ?? completed,
    aired: json?.aired ?? 0,
    traktId: null,
    traktUrl: null,
    ...(isShow ? { watchedBySeason } : {}),
    source: "backend",
  };
}
