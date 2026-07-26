import { NextResponse } from "next/server";
import {
  backendFetchPublicJson,
  clearBackendAuthCookies,
  getCookieSecure,
} from "@/lib/backend/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body.token !== "string") {
    return NextResponse.json({ error: "Invalid verification link" }, { status: 400 });
  }

  const result = await backendFetchPublicJson(request, "/v1/auth/account/email/confirm", {
    method: "POST",
    body: JSON.stringify({ token: body.token }),
  });

  const response = NextResponse.json(
    result.json || { error: result.error || "No se pudo confirmar el correo" },
    { status: result.status || 500 },
  );
  if (result.ok) {
    clearBackendAuthCookies(response, { secure: getCookieSecure(request) });
  }
  return response;
}
