// src/app/api/community/seasons/artwork/route.js
// Póster más votado de varias temporadas (?ids=1,2,3): la portada por defecto
// de cada una para todo el mundo. Ver backend/src/lib/artworkVotes.js.
import { NextResponse } from "next/server";
import { clientIpHeaders } from "@/lib/backend/server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const BASE = process.env.BACKEND_API_BASE_URL || process.env.NEXT_PUBLIC_API_BASE_URL;

export async function GET(request) {
  const ids = new URL(request.url).searchParams.get("ids") || "";
  const res = await fetch(`${BASE}/v1/community/seasons/artwork?ids=${encodeURIComponent(ids)}`, {
    cache: "no-store",
    headers: clientIpHeaders(request),
  });
  const json = await res.json().catch(() => ({ posters: {} }));
  return NextResponse.json(json, { status: res.ok ? 200 : res.status });
}
