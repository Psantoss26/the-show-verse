import { randomBytes } from "crypto";

export const GOOGLE_OAUTH_STATE_COOKIE = "showverse_google_oauth_state";
export const GOOGLE_OAUTH_NEXT_COOKIE = "showverse_google_oauth_next";
export const ANDROID_APP_USER_AGENT_TOKEN = "TheShowVerseApp/";
export const ANDROID_OAUTH_STATE_PREFIX = "android.";

export function sanitizeNextPath(value) {
  const next = typeof value === "string" ? value : "/";
  if (!next.startsWith("/")) return "/";
  if (next.startsWith("/login")) return "/";
  if (next.startsWith("/api/")) return "/";
  if (next.startsWith("/auth/callback")) return "/";
  if (next.startsWith("/auth/tmdb/callback")) return "/";
  return next;
}

export function isAndroidAppUserAgent(userAgent) {
  return String(userAgent || "").includes(ANDROID_APP_USER_AGENT_TOKEN);
}

export function createOauthState({ android = false } = {}) {
  const token = randomBytes(32).toString("hex");
  return android ? `${ANDROID_OAUTH_STATE_PREFIX}${token}` : token;
}

export function isAndroidOauthState(value) {
  return new RegExp(`^${ANDROID_OAUTH_STATE_PREFIX}[a-f0-9]{64}$`).test(
    String(value || ""),
  );
}

/**
 * El navegador del proveedor no comparte cookies con el WebView. Devuelve el
 * código OAuth a la app mediante su esquema propio; WebAppActivity abrirá la
 * URL HTTPS interna en el WebView, donde sí vive la cookie `state` original.
 */
export function buildAndroidOauthHandoffUrl(origin, { code, state, error } = {}) {
  const callbackUrl = new URL("/api/auth/google/callback", origin);
  if (code) callbackUrl.searchParams.set("code", code);
  if (state) callbackUrl.searchParams.set("state", state);
  if (error) callbackUrl.searchParams.set("error", error);
  callbackUrl.searchParams.set("app_handoff", "1");

  const appUrl = new URL("theshowverse://open");
  appUrl.searchParams.set("url", callbackUrl.toString());
  return appUrl;
}

export function getRequestOrigin(request) {
  // Origen público forzado (autoalojado tras proxy/túnel, donde request.url usa
  // el HOSTNAME interno). En Vercel no se define → cae a las cabeceras.
  const forced = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL;
  if (forced) return forced.replace(/\/+$/, "");
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
