import { NextResponse } from "next/server";
import { headers } from "next/headers";
import {
  backendFetchJson,
  getBackendBaseUrl,
  getCookieSecure,
  setBackendAuthCookies,
} from "@/lib/backend/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TMDB = "https://api.themoviedb.org/3";
const API_KEY = process.env.TMDB_API_KEY || process.env.NEXT_PUBLIC_TMDB_API_KEY;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function cleanOrigin(s) {
  return String(s || "").replace(/\/+$/, "");
}

async function resolveOrigin(req) {
  const forced = process.env.TMDB_APP_ORIGIN || process.env.APP_URL;
  if (forced) return cleanOrigin(forced);

  const nextOrigin = req?.nextUrl?.origin;
  if (nextOrigin && nextOrigin !== "null") return cleanOrigin(nextOrigin);

  const h = await headers();
  const proto = (h.get("x-forwarded-proto") || "http").split(",")[0].trim();
  const host = (h.get("x-forwarded-host") || h.get("host") || "")
    .split(",")[0]
    .trim();

  if (host) return `${proto}://${host}`;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  if (process.env.NEXT_PUBLIC_APP_ORIGIN)
    return cleanOrigin(process.env.NEXT_PUBLIC_APP_ORIGIN);
  if (process.env.NEXT_PUBLIC_APP_URL)
    return cleanOrigin(process.env.NEXT_PUBLIC_APP_URL);

  return "http://localhost:3000";
}

function sanitizeNextPath(nextPath) {
  if (!nextPath || typeof nextPath !== "string") return "/";
  if (!nextPath.startsWith("/")) return "/";
  if (nextPath.startsWith("/api/tmdb/auth/")) return "/";
  if (nextPath.startsWith("/auth/callback")) return "/";
  if (nextPath.startsWith("/auth/tmdb/callback")) return "/";
  if (nextPath.startsWith("/login")) return "/";
  return nextPath;
}

async function createTmdbSession(requestToken) {
  const url = `${TMDB}/authentication/session/new?api_key=${encodeURIComponent(API_KEY)}`;
  const maxAttempts = 4;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json;charset=utf-8",
        Accept: "application/json",
      },
      cache: "no-store",
      body: JSON.stringify({ request_token: requestToken }),
    });
    const json = await res.json().catch(() => ({}));

    if (res.ok && json?.success && json?.session_id) return json.session_id;

    const message = json?.status_message || `TMDb ${res.status}`;
    const retriable = json?.status_code === 17 || /session denied/i.test(message);
    if (retriable && attempt < maxAttempts) {
      await sleep(250 * attempt);
      continue;
    }

    throw new Error(message);
  }

  throw new Error("No se pudo crear la sesión de TMDb");
}

async function createBackendSessionFromTmdb(sessionId) {
  const backendBaseUrl = getBackendBaseUrl();
  if (!backendBaseUrl) return null;

  const res = await fetch(`${backendBaseUrl}/v1/auth/tmdb`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    cache: "no-store",
    body: JSON.stringify({ sessionId }),
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(json?.error || `Backend auth failed (${res.status})`);
  }

  return json;
}

async function connectTmdbToCurrentUser(req, sessionId) {
  return backendFetchJson(req, "/v1/auth/tmdb/connect", {
    method: "POST",
    body: JSON.stringify({ sessionId }),
  });
}

export async function GET(req) {
  const origin = await resolveOrigin(req);
  const { searchParams } = new URL(req.url);
  const nextPath = sanitizeNextPath(searchParams.get("next") || "/");
  const requestToken = searchParams.get("request_token");
  const approved = searchParams.get("approved");

  const redirectUrl = new URL(nextPath, origin);

  if (!API_KEY) {
    redirectUrl.searchParams.set("tmdb_auth_error", "missing_api_key");
    return NextResponse.redirect(redirectUrl);
  }

  if (!requestToken || approved !== "true") {
    redirectUrl.searchParams.set("tmdb_auth_error", "cancelled");
    return NextResponse.redirect(redirectUrl);
  }

  try {
    const sessionId = await createTmdbSession(requestToken);
    const backendConnection = await connectTmdbToCurrentUser(req, sessionId).catch((e) => {
      console.warn("Backend TMDb connection failed:", e);
      return null;
    });

    let backendSession = null;
    if (!backendConnection?.ok && backendConnection?.status !== 401 && backendConnection?.status !== 0) {
      throw new Error(backendConnection?.error || "No se pudo conectar TMDb a tu cuenta");
    }

    if (!backendConnection?.ok) {
      backendSession = await createBackendSessionFromTmdb(sessionId).catch((e) => {
        console.warn("Backend TMDb session bootstrap failed:", e);
        return null;
      });
    }

    const res = NextResponse.redirect(redirectUrl);
    res.cookies.set("tmdb_session_id", sessionId, {
      httpOnly: true,
      secure: origin.startsWith("https://"),
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
    if (backendConnection?.ok) {
      setBackendAuthCookies(res, backendConnection, { secure: getCookieSecure(req) });
      return res;
    }
    if (backendSession?.accessToken) {
      res.cookies.set("showverse_access_token", backendSession.accessToken, {
        httpOnly: true,
        secure: origin.startsWith("https://"),
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 15,
      });
    }
    if (backendSession?.refreshToken) {
      res.cookies.set("showverse_refresh_token", backendSession.refreshToken, {
        httpOnly: true,
        secure: origin.startsWith("https://"),
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 24 * 30,
      });
    }
    return res;
  } catch (error) {
    console.error("TMDb OAuth callback failed:", error);
    redirectUrl.searchParams.set("tmdb_auth_error", "session_failed");
    return NextResponse.redirect(redirectUrl);
  }
}
