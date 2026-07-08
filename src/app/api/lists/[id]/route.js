import { NextResponse } from "next/server";
import { backendFetchJson, setBackendAuthCookies } from "@/lib/backend/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function proxy(request, id, { method, body } = {}) {
  const init = { method: method || "GET" };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
    init.headers = { "Content-Type": "application/json" };
  }
  const backend = await backendFetchJson(request, `/v1/lists/${encodeURIComponent(id)}`, init);
  const res = NextResponse.json(backend.json || {}, {
    status: backend.status || (backend.ok ? 200 : 500),
  });
  setBackendAuthCookies(res, backend, { secure: request.nextUrl.protocol === "https:" });
  return res;
}

// GET /api/lists/:id → detalle de lista + items
export async function GET(request, { params }) {
  const { id } = await params;
  return proxy(request, id);
}

// PATCH /api/lists/:id → editar lista
export async function PATCH(request, { params }) {
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  return proxy(request, id, { method: "PATCH", body });
}

// DELETE /api/lists/:id → borrar lista
export async function DELETE(request, { params }) {
  const { id } = await params;
  return proxy(request, id, { method: "DELETE" });
}
