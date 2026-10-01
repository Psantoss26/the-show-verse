import { NextResponse } from "next/server";
import {
  backendFetchJson,
  getCookieSecure,
  setBackendAuthCookies,
} from "@/lib/backend/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// "Tus amigos" en la ficha: actividad de las cuentas que sigue el usuario con
// este título (backend/src/lib/followingTitleActivity.js). Requiere sesión.
export async function GET(request, { params }) {
  const { type, tmdbId } = await params;
  if (!["movie", "tv"].includes(type) || !/^\d+$/.test(String(tmdbId))) {
    return NextResponse.json({ error: "Invalid type or tmdbId" }, { status: 400 });
  }
  const backend = await backendFetchJson(request, `/v1/community/${type}/${tmdbId}/following`);
  const res = NextResponse.json(backend.json || { error: backend.error }, {
    status: backend.ok ? 200 : backend.status || 500,
    headers: { "Cache-Control": "private, no-store" },
  });
  setBackendAuthCookies(res, backend, { secure: getCookieSecure(request) });
  return res;
}
