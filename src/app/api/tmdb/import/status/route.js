import { NextResponse } from "next/server";
import {
  backendFetchJson,
  getCookieSecure,
  setBackendAuthCookies,
} from "@/lib/backend/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(request) {
  const backend = await backendFetchJson(request, "/v1/import/tmdb/status");
  const res = NextResponse.json(backend.json || { error: backend.error }, {
    status: backend.ok ? 200 : backend.status || 500,
  });

  setBackendAuthCookies(res, backend, { secure: getCookieSecure(request) });
  return res;
}
