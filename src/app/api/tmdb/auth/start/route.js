import { NextResponse } from "next/server";
import { headers } from "next/headers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TMDB = "https://api.themoviedb.org/3";
const API_KEY = process.env.TMDB_API_KEY || process.env.NEXT_PUBLIC_TMDB_API_KEY;

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

function nextPathFromReferer(req, origin) {
  const referer = req?.headers?.get("referer") || "";
  if (!referer) return "/";

  try {
    const refUrl = new URL(referer);
    if (cleanOrigin(refUrl.origin) !== cleanOrigin(origin)) return "/";
    return sanitizeNextPath(`${refUrl.pathname || "/"}${refUrl.search || ""}`);
  } catch {
    return "/";
  }
}

export async function GET(req) {
  if (!API_KEY) {
    return NextResponse.json({ error: "Missing TMDB API key" }, { status: 500 });
  }

  const origin = await resolveOrigin(req);
  const nextFromQuery = req?.nextUrl?.searchParams?.get("next") || "";
  const nextPath = sanitizeNextPath(
    nextFromQuery || nextPathFromReferer(req, origin),
  );

  const tokenUrl = `${TMDB}/authentication/token/new?api_key=${encodeURIComponent(API_KEY)}`;
  const tokenRes = await fetch(tokenUrl, {
    cache: "no-store",
    headers: { Accept: "application/json" },
  });
  const tokenJson = await tokenRes.json().catch(() => ({}));

  if (!tokenRes.ok || !tokenJson?.success || !tokenJson?.request_token) {
    return NextResponse.json(
      { error: tokenJson?.status_message || `TMDb ${tokenRes.status}` },
      { status: tokenRes.ok ? 500 : tokenRes.status },
    );
  }

  const callbackUrl = new URL("/api/tmdb/auth/callback", origin);
  callbackUrl.searchParams.set("next", nextPath);

  const authorizeUrl =
    `https://www.themoviedb.org/authenticate/${tokenJson.request_token}` +
    `?redirect_to=${encodeURIComponent(callbackUrl.toString())}`;

  return NextResponse.redirect(authorizeUrl);
}
