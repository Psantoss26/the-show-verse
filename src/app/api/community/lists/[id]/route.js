// src/app/api/community/lists/[id]/route.js
import { NextResponse } from "next/server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const BASE = process.env.BACKEND_API_BASE_URL || process.env.NEXT_PUBLIC_API_BASE_URL;
export async function GET(request, { params }) {
  const p = await params;
  const qs = request.nextUrl.search || "";
  const res = await fetch(`${BASE}/v1/community/lists/${p.id}${qs}`, { cache: "no-store" });
  const json = await res.json().catch(() => ({}));
  return NextResponse.json(json, { status: res.ok ? 200 : res.status });
}
