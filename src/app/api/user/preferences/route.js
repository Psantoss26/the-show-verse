import { NextResponse } from "next/server";
import {
  backendFetchJson,
  getCookieSecure,
  setBackendAuthCookies,
} from "@/lib/backend/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function respond(request, backend, successStatus = 200) {
  const res = NextResponse.json(backend.json || { error: backend.error }, {
    status: backend.ok ? successStatus : backend.status || 500,
  });
  setBackendAuthCookies(res, backend, { secure: getCookieSecure(request) });
  return res;
}

export async function GET(request) {
  const backend = await backendFetchJson(request, "/v1/users/preferences");
  return respond(request, backend);
}

export async function PATCH(request) {
  const body = await request.json().catch(() => ({}));
  const backend = await backendFetchJson(request, "/v1/users/preferences", {
    method: "PATCH",
    body: JSON.stringify(body || {}),
  });
  return respond(request, backend);
}
