import { NextResponse } from "next/server";
import {
  backendFetchJson,
  getCookieSecure,
  setBackendAuthCookies,
} from "@/lib/backend/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/users/notifications — sección de alertas del navbar.
//
// Proxy del backend, igual que el feed de Social. Un fallo se devuelve con su
// estado real para que el desplegable conserve lo que ya tuviera.
export async function GET(request) {
  const backend = await backendFetchJson(request, "/v1/users/notifications");

  const res = NextResponse.json(
    backend.ok
      ? backend.json
      : { actions: [], reminders: [], events: [], error: backend.error },
    { status: backend.ok ? 200 : backend.status || 503 },
  );
  setBackendAuthCookies(res, backend, { secure: getCookieSecure(request) });
  return res;
}
