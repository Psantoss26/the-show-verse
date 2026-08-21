// src/app/api/community/lists/[id]/route.js
import { NextResponse } from "next/server";
import {
  backendFetchPublicJson,
  getCookieSecure,
  setBackendAuthCookies,
} from "@/lib/backend/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request, { params }) {
  const p = await params;
  const qs = request.nextUrl.search || "";
  // Es una ficha pública, pero si hay sesión el backend debe conocerla para
  // devolver `liked` desde list_likes para ESTE usuario. La versión previa
  // hacía fetch directo y descartaba las cookies, por lo que al recargar el
  // corazón siempre volvía a su estado anónimo.
  const backend = await backendFetchPublicJson(
    request,
    `/v1/community/lists/${encodeURIComponent(p.id)}${qs}`,
  );
  const response = NextResponse.json(backend.json || {}, {
    status: backend.status || (backend.ok ? 200 : 500),
  });
  return setBackendAuthCookies(response, backend, {
    secure: getCookieSecure(request),
  });
}
