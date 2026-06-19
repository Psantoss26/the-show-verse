import {
  authUserResponse,
  fetchBackendMe,
  getCurrentBackendAccessToken,
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
    return unauthenticatedResponse(request);
  }

  let result = await fetchBackendMe(accessToken);
  if (result.status === 401) {
    refreshedTokens = await refreshBackendSession(request);
    if (refreshedTokens?.accessToken) {
      result = await fetchBackendMe(refreshedTokens.accessToken);
    }
  }

  if (!result.ok || !result.json?.user) {
    return unauthenticatedResponse(request, result.status === 401 ? 200 : 503);
  }

  return authUserResponse(request, result.json.user, refreshedTokens);
}
