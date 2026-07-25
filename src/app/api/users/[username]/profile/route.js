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

export async function GET(request, { params }) {
  const { username } = await params;
  const backend = await backendFetchJson(
    request,
    `/v1/users/${encodeURIComponent(username)}/profile`,
  );
  return respond(request, backend);
}
