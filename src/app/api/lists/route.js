import { NextResponse } from "next/server";
import { backendFetchJson, setBackendAuthCookies } from "@/lib/backend/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/lists → listas del usuario (backend /v1/lists). Al incluir tmdbId
// y mediaType devuelve la pertenencia del título sin transferir cada lista.
export async function GET(request) {
  const searchParams = request.nextUrl.searchParams;
  const membershipLookup =
    searchParams.has("tmdbId") || searchParams.has("mediaType");
  const query = searchParams.toString();
  const backendPath = membershipLookup
    ? `/v1/lists/membership${query ? `?${query}` : ""}`
    : "/v1/lists";
  const backend = await backendFetchJson(request, backendPath);
  const res = NextResponse.json(
    backend.json || (membershipLookup ? { membership: {} } : { results: [] }),
    {
      status: backend.ok ? 200 : backend.status || 500,
    },
  );
  setBackendAuthCookies(res, backend, { secure: request.nextUrl.protocol === "https:" });
  return res;
}

// POST /api/lists → crear lista
export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const backend = await backendFetchJson(request, "/v1/lists", {
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
