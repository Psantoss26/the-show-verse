import {
  authUserResponse,
  authError,
  backendAuthRequest,
  fetchBackendMe,
  getCurrentBackendAccessToken,
  isBackendSessionUnavailable,
  refreshBackendSession,
  unauthenticatedResponse,
} from "../_utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  let accessToken = getCurrentBackendAccessToken(request);
  let refreshedTokens = null;

  if (!accessToken) {
    refreshedTokens = await refreshBackendSession(request);
    accessToken = refreshedTokens?.accessToken || null;
  }

  if (!accessToken) {
    if (isBackendSessionUnavailable(refreshedTokens)) {
      return unauthenticatedResponse(request, 503);
    }
    return unauthenticatedResponse(request);
  }

  let result = await fetchBackendMe(accessToken);
  if (result.status === 401) {
    refreshedTokens = await refreshBackendSession(request);
    if (refreshedTokens?.accessToken) {
      result = await fetchBackendMe(refreshedTokens.accessToken);
    } else if (isBackendSessionUnavailable(refreshedTokens)) {
      return unauthenticatedResponse(request, 503);
    }
  }

  if (!result.ok || !result.json?.user) {
    return unauthenticatedResponse(request, result.status === 401 ? 200 : 503);
  }

  return authUserResponse(request, result.json.user, refreshedTokens);
}

export async function PATCH(request) {
  const body = await request.json().catch(() => ({}));
  let accessToken = getCurrentBackendAccessToken(request);
  let refreshedTokens = null;

  if (!accessToken) {
    refreshedTokens = await refreshBackendSession(request);
    accessToken = refreshedTokens?.accessToken || null;
  }

  if (!accessToken) {
    if (isBackendSessionUnavailable(refreshedTokens)) {
      return authError("Authentication service unavailable", 503, request);
    }
    return authError("Authentication required", 401, request);
  }

  const sendUpdate = (token) =>
    backendAuthRequest("/v1/auth/me", {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify(body || {}),
    });

  let result = await sendUpdate(accessToken);
  if (result.status === 401) {
    refreshedTokens = await refreshBackendSession(request);
    if (refreshedTokens?.accessToken) {
      result = await sendUpdate(refreshedTokens.accessToken);
    } else if (isBackendSessionUnavailable(refreshedTokens)) {
      return authError("Authentication service unavailable", 503, request);
    }
  }

  if (!result.ok || !result.json?.user) {
    return authError(result.error || "No se pudo actualizar el perfil", result.status || 500, request);
  }

  return authUserResponse(request, result.json.user, refreshedTokens);
}
