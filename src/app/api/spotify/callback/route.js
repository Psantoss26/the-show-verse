import { NextResponse } from "next/server";
import {
  exchangeSpotifyCode,
  resolveSpotifyRedirectUri,
  setSpotifyCookies,
} from "@/lib/spotify/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function decodeState(s) {
  try {
    const o = JSON.parse(Buffer.from(String(s), "base64url").toString("utf8"));
    return o && typeof o === "object" ? o : null;
  } catch {
    return null;
  }
}

function sanitizeNext(p) {
  if (!p || typeof p !== "string" || !p.startsWith("/")) return "/profile/settings";
  return p;
}

export async function GET(req) {
  const url = new URL(req.url);
  const origin = req.nextUrl?.origin || url.origin;
  const code = url.searchParams.get("code");
  const oauthError = url.searchParams.get("error");
  const decoded = decodeState(url.searchParams.get("state"));
  const nextPath = sanitizeNext(decoded?.p);
  const storedNonce = req.cookies.get("spotify_oauth_state")?.value || null;
  const secure = origin.startsWith("https://");

  const back = (status) => {
    const dest = new URL(nextPath, origin);
    dest.searchParams.set("spotify", status);
    const res = NextResponse.redirect(dest);
    // Limpia cookies temporales del flujo.
    const clear = { httpOnly: true, sameSite: "lax", secure, path: "/", maxAge: 0 };
    res.cookies.set("spotify_oauth_state", "", clear);
    res.cookies.set("spotify_oauth_redirect_uri", "", clear);
    return res;
  };

  if (oauthError || !code) return back("error");
  if (decoded?.n && storedNonce && decoded.n !== storedNonce) return back("error");

  const redirectUri =
    req.cookies.get("spotify_oauth_redirect_uri")?.value ||
    resolveSpotifyRedirectUri(origin);

  try {
    const tokens = await exchangeSpotifyCode({ code, redirectUri });
    const res = back("connected");
    setSpotifyCookies(res, tokens, { secure });
    return res;
  } catch (e) {
    console.error("[Spotify] token exchange failed:", e?.message);
    return back("error");
  }
}
