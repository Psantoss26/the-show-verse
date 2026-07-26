import { NextResponse } from "next/server";
import {
  backendFetchJson,
  clearBackendAuthCookies,
  getCookieSecure,
  setBackendAuthCookies,
} from "@/lib/backend/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PUT(request) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const result = await backendFetchJson(request, "/v1/auth/account/password", {
    method: "PUT",
    body: JSON.stringify({
      currentPassword: body.currentPassword,
      newPassword: body.newPassword,
    }),
  });
  const response = NextResponse.json(
    result.json || { error: result.error || "No se pudo cambiar la contraseña" },
    { status: result.status || 500 },
  );

  if (result.ok) {
    return clearBackendAuthCookies(response, { secure: getCookieSecure(request) });
  }

  return setBackendAuthCookies(response, result, { secure: getCookieSecure(request) });
}
