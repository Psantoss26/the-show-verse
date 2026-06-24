import { NextResponse } from "next/server";
import {
  clearBackendAuthCookies,
  getBackendAccessToken,
  getBackendBaseUrl,
  getBackendRefreshToken,
  getCookieSecure,
  setBackendTokenCookies,
} from "@/lib/backend/server";

export const AUTH_JSON_HEADERS = {
  Accept: "application/json",
  "Content-Type": "application/json",
};

export function authError(message, status = 500, request = null) {
  const response = NextResponse.json({ error: message }, { status });
  if (status === 401 && request) {
    clearBackendAuthCookies(response, { secure: getCookieSecure(request) });
  }
  return response;
}

export function sanitizeBackendUser(user) {
  if (!user || typeof user !== "object") return null;
  return {
    id: user.id,
    email: user.email || null,
    username: user.username || null,
    displayName: user.displayName || user.username || null,
    avatarUrl: user.avatarUrl || null,
    bio: user.bio || null,
    plan: user.plan || "free",
    planExpiresAt: user.planExpiresAt || null,
    provider: "showverse",
  };
}

export async function backendAuthRequest(path, init = {}) {
  const baseUrl = getBackendBaseUrl();
  if (!baseUrl) {
    return {
      ok: false,
      status: 503,
      json: null,
      error: "Backend API is not configured",
    };
  }

  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      ...AUTH_JSON_HEADERS,
      ...(init.headers || {}),
    },
    cache: "no-store",
  });
  const json = await response.json().catch(() => null);

  return {
    ok: response.ok,
    status: response.status,
    json,
    error: json?.error || json?.message || `Backend HTTP ${response.status}`,
  };
}

export async function refreshBackendSession(request) {
  const refreshToken = getBackendRefreshToken(request);
  if (!refreshToken) return null;

  const refreshed = await backendAuthRequest("/v1/auth/refresh", {
    method: "POST",
    body: JSON.stringify({ refreshToken }),
  });

  if (!refreshed.ok || !refreshed.json?.accessToken) return null;

  return {
    accessToken: refreshed.json.accessToken,
    refreshToken: refreshed.json.refreshToken || refreshToken,
  };
}

export async function fetchBackendMe(accessToken) {
  return backendAuthRequest("/v1/auth/me", {
    method: "GET",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}

export function authUserResponse(request, user, tokens = null) {
  const response = NextResponse.json({
    authenticated: true,
    user: sanitizeBackendUser(user),
  });
  if (tokens) {
    setBackendTokenCookies(response, tokens, {
      secure: getCookieSecure(request),
    });
  }
  return response;
}

export function unauthenticatedResponse(
  request,
  status = 200,
  { clearCookies = false } = {},
) {
  const response = NextResponse.json(
    { authenticated: false, user: null },
    { status },
  );
  // IMPORTANTE: por defecto NO borramos las cookies de auth. Al cargar el
  // dashboard se disparan muchas peticiones a la vez y todas intentan refrescar
  // el mismo refresh token; si el backend lo rota (de un solo uso), unas ganan
  // y otras reciben 401. Si /api/auth/me pierde esa carrera y borrara el token,
  // invalidaría una sesión válida de 30 días → logout permanente al volver.
  // El refresh token solo se limpia en el logout explícito (o se sobrescribe al
  // volver a iniciar sesión).
  if (clearCookies) {
    clearBackendAuthCookies(response, { secure: getCookieSecure(request) });
  }
  return response;
}

export function getCurrentBackendAccessToken(request) {
  return getBackendAccessToken(request);
}

export function getCurrentBackendRefreshToken(request) {
  return getBackendRefreshToken(request);
}
