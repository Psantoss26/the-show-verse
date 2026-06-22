import { NextResponse } from "next/server";
import { clearSpotifyCookies } from "@/lib/spotify/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isSecure(req) {
  const proto =
    req.nextUrl?.protocol || req.headers.get("x-forwarded-proto") || "";
  return String(proto).startsWith("https");
}

export async function POST(req) {
  const res = NextResponse.json({ disconnected: true });
  clearSpotifyCookies(res, { secure: isSecure(req) });
  return res;
}
