// src/app/api/community/lists/[id]/like/route.js
// Me gusta en una lista de la comunidad. Requiere sesión.
import { NextResponse } from "next/server";
import { backendFetchJson, setBackendAuthCookies } from "@/lib/backend/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function toggle(request, params, method) {
  const p = await params;
  const backend = await backendFetchJson(
    request,
    `/v1/community/lists/${encodeURIComponent(p.id)}/like`,
    { method },
  );
  const res = NextResponse.json(backend.json || {}, {
    status: backend.status || (backend.ok ? 200 : 500),
  });
  setBackendAuthCookies(res, backend, { secure: request.nextUrl.protocol === "https:" });
  return res;
}

export const POST = (request, ctx) => toggle(request, ctx.params, "POST");
export const DELETE = (request, ctx) => toggle(request, ctx.params, "DELETE");
