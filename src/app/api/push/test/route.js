import { NextResponse } from "next/server";
import {
  backendFetchJson,
  getCookieSecure,
  setBackendAuthCookies,
} from "@/lib/backend/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/push/test — notificación de prueba a los dispositivos de la cuenta.
export async function POST(request) {
  const backend = await backendFetchJson(request, "/v1/push/test", { method: "POST", body: "{}" });
  const res = NextResponse.json(backend.json || { error: backend.error }, {
    status: backend.status || 503,
  });
  setBackendAuthCookies(res, backend, { secure: getCookieSecure(request) });
  return res;
}
