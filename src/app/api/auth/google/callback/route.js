import { NextResponse } from "next/server";
import {
  backendAuthRequest,
} from "../../_utils";
import {
  clearBackendAuthCookies,
  getCookieSecure,
  setBackendTokenCookies,
} from "@/lib/backend/server";
import {
  clearGoogleOauthCookies,
  getGoogleRedirectUri,
  GOOGLE_OAUTH_NEXT_COOKIE,
  GOOGLE_OAUTH_STATE_COOKIE,
  sanitizeNextPath,
} from "../_utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function redirectToLogin(request, next, reason) {
  const url = new URL("/login", request.url);
  url.searchParams.set("next", sanitizeNextPath(next));
  if (reason) url.searchParams.set("google_error", reason);
  const response = NextResponse.redirect(url);
  clearGoogleOauthCookies(response, request);
  return response;
}

function normalizeBackendGoogleError(error) {
  const message = String(error || "").toLowerCase();
  if (message.includes("google_client_id")) return "backend_google_config";
  if (message.includes("audience")) return "google_audience_mismatch";
  if (message.includes("email is not verified")) return "google_email_not_verified";
  if (message.includes("backend api is not configured")) return "backend_missing_config";
  return "backend_auth_failed";
}

async function exchangeCodeForTokens(request, code) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return { ok: false, error: "missing_config" };
  }

  const body = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: getGoogleRedirectUri(request),
    grant_type: "authorization_code",
  });

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    cache: "no-store",
    body,
  });
  const json = await res.json().catch(() => ({}));
  return {
    ok: res.ok,
    status: res.status,
    json,
    error: json?.error || `Google token exchange failed (${res.status})`,
  };
}

export async function GET(request) {
  const expectedState = request.cookies.get(GOOGLE_OAUTH_STATE_COOKIE)?.value;
  const next = sanitizeNextPath(
    request.cookies.get(GOOGLE_OAUTH_NEXT_COOKIE)?.value || "/",
  );
  const state = request.nextUrl.searchParams.get("state");
  const code = request.nextUrl.searchParams.get("code");
  const error = request.nextUrl.searchParams.get("error");

  if (error) return redirectToLogin(request, next, error);
  if (!code) return redirectToLogin(request, next, "missing_code");
  if (!expectedState || !state || expectedState !== state) {
    return redirectToLogin(request, next, "invalid_state");
  }

  const googleTokens = await exchangeCodeForTokens(request, code);
  if (!googleTokens.ok || !googleTokens.json?.id_token) {
    return redirectToLogin(request, next, googleTokens.error || "token_exchange_failed");
  }

  let backend;
  try {
    backend = await backendAuthRequest("/v1/auth/google", {
      method: "POST",
      body: JSON.stringify({ idToken: googleTokens.json.id_token }),
    });
  } catch {
    return redirectToLogin(request, next, "backend_unavailable");
  }

  if (!backend.ok || !backend.json?.accessToken || !backend.json?.refreshToken) {
    return redirectToLogin(request, next, normalizeBackendGoogleError(backend.error));
  }

  const response = NextResponse.redirect(new URL(next, request.url));
  clearGoogleOauthCookies(response, request);
  clearBackendAuthCookies(response, { secure: getCookieSecure(request) });
  setBackendTokenCookies(response, backend.json, {
    secure: getCookieSecure(request),
  });
  return response;
}
