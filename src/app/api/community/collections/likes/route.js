// src/app/api/community/collections/likes/route.js
// Me gusta (públicos) de varias colecciones: ?ids=10,1241,… → { likes: { id: { likes, liked } } }.
// Con sesión, `liked` es el del visitante.
import { NextResponse } from "next/server";
import { backendFetchPublicJson, setBackendAuthCookies } from "@/lib/backend/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  const ids = request.nextUrl.searchParams.get("ids") || "";
  const backend = await backendFetchPublicJson(
    request,
    `/v1/community/collections/likes?ids=${encodeURIComponent(ids)}`,
  );
  const res = NextResponse.json(backend.json || { likes: {} }, {
    status: backend.ok ? 200 : backend.status || 500,
    headers: { "Cache-Control": "private, no-store" },
  });
  setBackendAuthCookies(res, backend, { secure: request.nextUrl.protocol === "https:" });
  return res;
}
