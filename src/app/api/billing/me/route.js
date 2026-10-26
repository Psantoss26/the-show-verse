import { NextResponse } from "next/server";
import {
  backendFetchJson,
  getCookieSecure,
  setBackendAuthCookies,
} from "@/lib/backend/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/billing/me — plan efectivo, funciones y suscripción del usuario.
export async function GET(request) {
  const backend = await backendFetchJson(request, "/v1/billing/me");
  const res = NextResponse.json(backend.json || { error: backend.error }, {
    status: backend.status || 503,
  });
  setBackendAuthCookies(res, backend, { secure: getCookieSecure(request) });
  return res;
}
