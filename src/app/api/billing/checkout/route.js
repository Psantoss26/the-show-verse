import { NextResponse } from "next/server";
import {
  backendFetchJson,
  getCookieSecure,
  setBackendAuthCookies,
} from "@/lib/backend/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/billing/checkout — devuelve { url } de Stripe a la que redirigir.
export async function POST(request) {
  const body = await request.text();
  const backend = await backendFetchJson(request, "/v1/billing/checkout", { method: "POST", body: body || "{}" });
  const res = NextResponse.json(backend.json || { error: backend.error }, {
    status: backend.status || 503,
  });
  setBackendAuthCookies(res, backend, { secure: getCookieSecure(request) });
  return res;
}
