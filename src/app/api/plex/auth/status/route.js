import { NextResponse } from "next/server";
import {
  getUserPlexToken,
  getPlexAccount,
  discoverUserPlexServer,
} from "@/lib/plex/userAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req) {
  const token = getUserPlexToken(req);
  if (!token) {
    return NextResponse.json({ connected: false });
  }

  const [account, server] = await Promise.all([
    getPlexAccount(token),
    discoverUserPlexServer(token),
  ]);

  // Si el token ya no es válido, plex.tv no devuelve cuenta.
  if (!account) {
    return NextResponse.json({ connected: false, degraded: true });
  }

  return NextResponse.json({ connected: true, account, server });
}
