import { NextResponse } from "next/server";
import {
  backendFetchJson,
  getCookieSecure,
  setBackendAuthCookies,
} from "@/lib/backend/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST/DELETE /api/push/subscriptions — registra o quita este dispositivo
// (Web Push del navegador o token FCM de la app de Android).
async function proxy(request, method) {
  const body = await request.text();
  const backend = await backendFetchJson(request, "/v1/push/subscriptions", { method, body });
  const res = NextResponse.json(backend.json || { error: backend.error }, {
    status: backend.status || 503,
  });
  setBackendAuthCookies(res, backend, { secure: getCookieSecure(request) });
  return res;
}

export function POST(request) {
  return proxy(request, "POST");
}

export function DELETE(request) {
  return proxy(request, "DELETE");
}
