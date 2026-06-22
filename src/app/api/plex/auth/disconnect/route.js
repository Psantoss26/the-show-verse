import { NextResponse } from "next/server";
import { clearPlexTokenCookie } from "@/lib/plex/userAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isSecure(req) {
  const proto = req.nextUrl?.protocol || req.headers.get("x-forwarded-proto") || "";
  return String(proto).startsWith("https");
}

export async function POST(req) {
  const res = NextResponse.json({ disconnected: true });
  clearPlexTokenCookie(res, { secure: isSecure(req) });
  return res;
}
