// src/app/api/community/[type]/[tmdbId]/sentiment/route.js
import { NextResponse } from "next/server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const BASE = process.env.BACKEND_API_BASE_URL || process.env.NEXT_PUBLIC_API_BASE_URL;

export async function GET(request, { params }) {
  const p = await params;
  const res = await fetch(`${BASE}/v1/community/${p.type}/${p.tmdbId}/sentiment`, { cache: "no-store" });
  const json = await res.json().catch(() => ({ good: [], bad: [], comment_count: 0 }));
  return NextResponse.json(json, { status: res.ok ? 200 : res.status });
}
