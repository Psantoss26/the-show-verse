import { NextResponse } from "next/server";
import { backendFetchJson, setBackendAuthCookies } from "@/lib/backend/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// DELETE /api/lists/:id/items/:tmdbId/:mediaType → quitar item
export async function DELETE(request, { params }) {
  const { id, tmdbId, mediaType } = await params;
  const path = `/v1/lists/${encodeURIComponent(id)}/items/${encodeURIComponent(tmdbId)}/${encodeURIComponent(mediaType)}`;
  const backend = await backendFetchJson(request, path, { method: "DELETE" });
  const res = NextResponse.json(backend.json || {}, {
    status: backend.status || (backend.ok ? 200 : 500),
  });
  setBackendAuthCookies(res, backend, { secure: request.nextUrl.protocol === "https:" });
  return res;
}
