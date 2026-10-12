import { NextResponse } from "next/server";
import {
  backendFetchJson,
  getCookieSecure,
  setBackendAuthCookies,
} from "@/lib/backend/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Conexión de Letterboxd para la sincronización automática por RSS.
async function proxy(request, init) {
  const backend = await backendFetchJson(request, "/v1/import/letterboxd/connection", init);
  const res = NextResponse.json(backend.json || { error: backend.error }, {
    status: backend.ok ? 200 : backend.status || 500,
  });
  setBackendAuthCookies(res, backend, { secure: getCookieSecure(request) });
  return res;
}

export async function GET(request) {
  return proxy(request, { cache: "no-store" });
}

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  return proxy(request, {
    method: "POST",
    body: JSON.stringify({ username: String(body?.username || "").slice(0, 200) }),
  });
}

export async function DELETE(request) {
  return proxy(request, { method: "DELETE" });
}
