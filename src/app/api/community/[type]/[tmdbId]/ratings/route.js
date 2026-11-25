// src/app/api/community/[type]/[tmdbId]/ratings/route.js
// Puntuaciones de los usuarios de The Show Verse para un título (media y
// reparto 1–10) que pinta el modal de puntuación de la ficha.
import { NextResponse } from "next/server";
import { clientIpHeaders } from "@/lib/backend/server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const BASE = process.env.BACKEND_API_BASE_URL || process.env.NEXT_PUBLIC_API_BASE_URL;

const EMPTY = { count: 0, average: null, histogram: [] };

export async function GET(request, { params }) {
  const p = await params;
  try {
    const res = await fetch(
      `${BASE}/v1/community/${encodeURIComponent(p.type)}/${encodeURIComponent(p.tmdbId)}/ratings`,
      { cache: "no-store", headers: clientIpHeaders(request) },
    );
    const json = await res.json().catch(() => EMPTY);
    return NextResponse.json(json, {
      status: res.ok ? 200 : res.status,
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return NextResponse.json(EMPTY, { status: 502 });
  }
}
