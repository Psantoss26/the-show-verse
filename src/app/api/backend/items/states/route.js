import { NextResponse } from "next/server";
import {
  backendFetchJson,
  getCookieSecure,
  setBackendAuthCookies,
} from "@/lib/backend/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function noCache(response) {
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  return response;
}

export async function POST(request) {
  let payload;
  try {
    payload = await request.json();
  } catch {
    return noCache(NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }));
  }

  const backend = await backendFetchJson(request, "/v1/items/states", {
    method: "POST",
    body: JSON.stringify(payload),
  });

  // Sin sesión no hay biblioteca propia que decorar; responder vacío evita que
  // una página de perfil pública se convierta en un error.
  if (!backend.ok && (backend.skipped || backend.status === 401)) {
    return noCache(NextResponse.json({ states: {} }));
  }

  const response = NextResponse.json(backend.json || { error: backend.error }, {
    status: backend.ok ? 200 : backend.status || 500,
  });
  setBackendAuthCookies(response, backend, { secure: getCookieSecure(request) });
  return noCache(response);
}
