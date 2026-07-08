import { NextResponse } from "next/server";
import { backendFetchJson, setBackendAuthCookies } from "@/lib/backend/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/lists/:id/items → añadir item
export async function POST(request, { params }) {
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const backend = await backendFetchJson(request, `/v1/lists/${encodeURIComponent(id)}/items`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const res = NextResponse.json(backend.json || {}, {
    status: backend.status || (backend.ok ? 201 : 500),
  });
  setBackendAuthCookies(res, backend, { secure: request.nextUrl.protocol === "https:" });
  return res;
}

// DELETE /api/lists/:id/items → vaciar lista
export async function DELETE(request, { params }) {
  const { id } = await params;
  const backend = await backendFetchJson(request, `/v1/lists/${encodeURIComponent(id)}/items`, {
    method: "DELETE",
  });
  const res = NextResponse.json(backend.json || {}, {
    status: backend.status || (backend.ok ? 200 : 500),
  });
  setBackendAuthCookies(res, backend, { secure: request.nextUrl.protocol === "https:" });
  return res;
}
