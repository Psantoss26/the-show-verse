// src/app/api/community/[type]/[tmdbId]/lists/route.js
import { NextResponse } from "next/server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const BASE = process.env.BACKEND_API_BASE_URL || process.env.NEXT_PUBLIC_API_BASE_URL;
export async function GET(request, { params }) {
  const p = await params;
  const qs = request.nextUrl.search || "";
  const res = await fetch(`${BASE}/v1/community/${p.type}/${p.tmdbId}/lists${qs}`, { cache: "no-store" });
  const json = await res.json().catch(() => ({ items: [] }));
  return NextResponse.json(json, { status: res.ok ? 200 : res.status });
}
