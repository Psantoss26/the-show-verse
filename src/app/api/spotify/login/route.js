import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getBaseUrl(req) {
  const configured = process.env.SPOTIFY_REDIRECT_URI;
  if (configured) {
    try {
      const url = new URL(configured);
      return `${url.protocol}//${url.host}`;
    } catch {
      // Fall through to request origin.
    }
  }
  return new URL(req.url).origin;
}

export async function GET(req) {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const redirectUri =
    process.env.SPOTIFY_REDIRECT_URI ||
    `${getBaseUrl(req)}/api/spotify/callback`;

  if (!clientId) {
    return NextResponse.json(
      { error: "Missing SPOTIFY_CLIENT_ID" },
      { status: 500 },
    );
  }

  const state = crypto.randomUUID();
  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri,
    state,
    scope: "playlist-read-private playlist-read-collaborative",
  });

  const response = NextResponse.redirect(
    `https://accounts.spotify.com/authorize?${params.toString()}`,
  );
  response.cookies.set("spotify_oauth_state", state, {
    httpOnly: true,
    sameSite: "lax",
    secure: redirectUri.startsWith("https://"),
    maxAge: 60 * 10,
    path: "/",
  });
  return response;
}
