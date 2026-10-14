// src/app/api/community/lists/discover/route.js
import { NextResponse } from "next/server";
import {
  backendFetchPublicJson,
  getCookieSecure,
  setBackendAuthCookies,
} from "@/lib/backend/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Índice de «Listas de la comunidad». Es público, pero con sesión el backend
// debe saber quién mira para no enseñarle SUS listas publicadas (ya están en
// «Mis listas»). Antes se pedía sin cookies y siempre salía la versión anónima.
export async function GET(request) {
  const qs = request.nextUrl.search || "";
  const backend = await backendFetchPublicJson(request, `/v1/community/lists/discover${qs}`);
  const response = NextResponse.json(backend.json || { results: [] }, {
    status: backend.status || (backend.ok ? 200 : 500),
  });
  return setBackendAuthCookies(response, backend, {
    secure: getCookieSecure(request),
  });
}
