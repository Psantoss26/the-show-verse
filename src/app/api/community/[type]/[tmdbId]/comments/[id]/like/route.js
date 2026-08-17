// src/app/api/community/[type]/[tmdbId]/comments/[id]/like/route.js
// Me gusta en una reseña. Requiere sesión: se reenvía con las credenciales.
import { NextResponse } from "next/server";
import { backendFetchJson, setBackendAuthCookies } from "@/lib/backend/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function toggle(request, params, method) {
  const p = await params;
  const path = `/v1/community/${encodeURIComponent(p.type)}/${encodeURIComponent(p.tmdbId)}`
    + `/comments/${encodeURIComponent(p.id)}/like`;
  const backend = await backendFetchJson(request, path, { method });
  const res = NextResponse.json(backend.json || {}, {
    status: backend.status || (backend.ok ? 200 : 500),
  });
  setBackendAuthCookies(res, backend, { secure: request.nextUrl.protocol === "https:" });
  return res;
}

export const POST = (request, ctx) => toggle(request, ctx.params, "POST");
export const DELETE = (request, ctx) => toggle(request, ctx.params, "DELETE");
