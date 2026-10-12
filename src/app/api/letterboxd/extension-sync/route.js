import { NextResponse } from "next/server";
import {
  backendFetchJson,
  getCookieSecure,
  setBackendAuthCookies,
} from "@/lib/backend/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

// La web terminó la sincronización completa con la exportación de Letterboxd
// descargada por la extensión (lib/letterboxd/sync).
export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const count = (value) => Math.max(0, Math.floor(Number(value) || 0));
  const backend = await backendFetchJson(request, "/v1/import/letterboxd/extension-sync", {
    method: "POST",
    body: JSON.stringify({
      films: count(body?.films),
      history: count(body?.history),
      ratings: count(body?.ratings),
      missing: count(body?.missing),
    }),
  });
  const res = NextResponse.json(backend.json || { error: backend.error }, {
    status: backend.ok ? 200 : backend.status || 500,
  });
  setBackendAuthCookies(res, backend, { secure: getCookieSecure(request) });
  return res;
}
