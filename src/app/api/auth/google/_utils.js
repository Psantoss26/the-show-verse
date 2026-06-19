import { randomBytes } from "crypto";

export const GOOGLE_OAUTH_STATE_COOKIE = "showverse_google_oauth_state";
export const GOOGLE_OAUTH_NEXT_COOKIE = "showverse_google_oauth_next";

export function sanitizeNextPath(value) {
  const next = typeof value === "string" ? value : "/";
  if (!next.startsWith("/")) return "/";
  if (next.startsWith("/login")) return "/";
  if (next.startsWith("/api/")) return "/";
  if (next.startsWith("/auth/callback")) return "/";
  if (next.startsWith("/auth/tmdb/callback")) return "/";
  return next;
}

export function createOauthState() {
  return randomBytes(32).toString("hex");
}

export function getRequestOrigin(request) {
  const proto = request.headers.get("x-forwarded-proto") || request.nextUrl.protocol.replace(":", "");
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host");
  if (host) return `${proto || "https"}://${host}`;
  return request.nextUrl.origin;
}

export function getGoogleRedirectUri(request) {
  return (
    process.env.GOOGLE_REDIRECT_URI ||
    `${getRequestOrigin(request).replace(/\/+$/, "")}/api/auth/google/callback`
  );
}

export function clearGoogleOauthCookies(response, request) {
  const secure = request?.nextUrl?.protocol === "https:";
  for (const name of [GOOGLE_OAUTH_STATE_COOKIE, GOOGLE_OAUTH_NEXT_COOKIE]) {
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
