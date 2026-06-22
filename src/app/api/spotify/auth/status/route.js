import { NextResponse } from "next/server";
import {
  isSpotifyConnected,
  getUserSpotifyAccessToken,
  fetchSpotifyProfile,
} from "@/lib/spotify/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req) {
  if (!isSpotifyConnected(req)) {
    return NextResponse.json({ connected: false });
  }

  const token = await getUserSpotifyAccessToken(req).catch(() => null);
  if (!token) {
    // Hay refresh token pero ya no es válido (revocado/expirado).
    return NextResponse.json({ connected: false, degraded: true });
  }

  const profile = await fetchSpotifyProfile(token);
  return NextResponse.json({ connected: true, profile });
}
