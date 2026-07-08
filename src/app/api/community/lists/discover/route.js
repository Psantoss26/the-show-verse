// src/app/api/community/lists/discover/route.js
import { NextResponse } from "next/server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const BASE = process.env.BACKEND_API_BASE_URL || process.env.NEXT_PUBLIC_API_BASE_URL;
export async function GET(request) {
  const qs = request.nextUrl.search || "";
  const res = await fetch(`${BASE}/v1/community/lists/discover${qs}`, { cache: "no-store" });
  const json = await res.json().catch(() => ({ results: [] }));
  return NextResponse.json(json, { status: res.ok ? 200 : res.status });
}
