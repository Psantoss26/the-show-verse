// src/app/api/community/artwork/route.js
// Imagen más votada de cada tipo para VARIOS títulos
// (?type=movie&ids=1,2,3[&kinds=poster,cardBackdrop]): la imagen por defecto de
// las tarjetas para todo el mundo. Ver backend/src/lib/artworkVotes.js.
import { NextResponse } from "next/server";
import { clientIpHeaders } from "@/lib/backend/server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const BASE = process.env.BACKEND_API_BASE_URL || process.env.NEXT_PUBLIC_API_BASE_URL;

export async function GET(request) {
  const params = new URL(request.url).searchParams;
  const query = new URLSearchParams({
    type: params.get("type") || "",
    ids: params.get("ids") || "",
    kinds: params.get("kinds") || "",
  });
  const res = await fetch(`${BASE}/v1/community/artwork?${query}`, {
    cache: "no-store",
    headers: clientIpHeaders(request),
  });
  const json = await res.json().catch(() => ({ artwork: {} }));
  return NextResponse.json(json, { status: res.ok ? 200 : res.status });
}
