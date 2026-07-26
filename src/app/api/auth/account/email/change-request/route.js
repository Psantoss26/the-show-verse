import { NextResponse } from "next/server";
import { backendFetchJson, setBackendAuthCookies } from "@/lib/backend/server";
import { getCookieSecure } from "@/lib/backend/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const result = await backendFetchJson(request, "/v1/auth/account/email/change-request", {
    method: "POST",
    body: JSON.stringify({
      email: body.email,
      currentPassword: body.currentPassword,
    }),
  });
  const response = NextResponse.json(
    result.json || { error: result.error || "No se pudo solicitar el cambio de correo" },
    { status: result.status || 500 },
  );
  return setBackendAuthCookies(response, result, { secure: getCookieSecure(request) });
}
