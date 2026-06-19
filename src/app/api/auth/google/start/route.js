import { NextResponse } from "next/server";
import {
  createOauthState,
  getGoogleRedirectUri,
  GOOGLE_OAUTH_NEXT_COOKIE,
  GOOGLE_OAUTH_STATE_COOKIE,
  sanitizeNextPath,
} from "../_utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const next = sanitizeNextPath(request.nextUrl.searchParams.get("next") || "/");

  if (!clientId) {
    return NextResponse.redirect(
      new URL(`/login?next=${encodeURIComponent(next)}&google_error=missing_config`, request.url),
    );
  }

  const state = createOauthState();
  const redirectUri = getGoogleRedirectUri(request);
  const googleUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  googleUrl.searchParams.set("client_id", clientId);
  googleUrl.searchParams.set("redirect_uri", redirectUri);
  googleUrl.searchParams.set("response_type", "code");
  googleUrl.searchParams.set("scope", "openid email profile");
  googleUrl.searchParams.set("state", state);
  googleUrl.searchParams.set("prompt", "select_account");

  const response = NextResponse.redirect(googleUrl);
  const secure = request.nextUrl.protocol === "https:";
  const cookieOptions = {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 10,
  };
  response.cookies.set(GOOGLE_OAUTH_STATE_COOKIE, state, cookieOptions);
  response.cookies.set(GOOGLE_OAUTH_NEXT_COOKIE, next, cookieOptions);
  return response;
}
