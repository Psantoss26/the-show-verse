import { NextResponse } from "next/server";
import {
  getSpotifyClientCreds,
  resolveSpotifyRedirectUri,
  buildSpotifyAuthorizeUrl,
} from "@/lib/spotify/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function sanitizeNext(p) {
  if (!p || typeof p !== "string" || !p.startsWith("/")) return "/profile/settings";
  return p;
}

export async function GET(req) {
  const creds = getSpotifyClientCreds();
  if (!creds) {
    return NextResponse.json(
      { error: "Missing SPOTIFY_CLIENT_ID/SPOTIFY_CLIENT_SECRET" },
      { status: 500 },
    );
  }

  const origin = req.nextUrl?.origin || new URL(req.url).origin;
  const redirectUri = resolveSpotifyRedirectUri(origin);
  const nextPath = sanitizeNext(req.nextUrl?.searchParams?.get("next"));

  const nonce = crypto.randomUUID();
  const state = Buffer.from(JSON.stringify({ n: nonce, p: nextPath }), "utf8").toString(
    "base64url",
  );

  const authorizeUrl = buildSpotifyAuthorizeUrl({
    clientId: creds.id,
    redirectUri,
    state,
  });

  const secure = redirectUri.startsWith("https://") || origin.startsWith("https://");
  const cookieOptions = {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: 60 * 10,
  };

  const res = NextResponse.redirect(authorizeUrl);
  res.cookies.set("spotify_oauth_state", nonce, cookieOptions);
  // Guardamos el redirect_uri exacto usado para reutilizarlo en el callback.
  res.cookies.set("spotify_oauth_redirect_uri", redirectUri, cookieOptions);
  return res;
}
