import { NextResponse } from "next/server";
import {
  authError,
  backendAuthRequest,
  sanitizeBackendUser,
} from "../_utils";
import {
  clearBackendAuthCookies,
  getCookieSecure,
  setBackendTokenCookies,
} from "@/lib/backend/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return authError("Invalid JSON body", 400);
  }

  const result = await backendAuthRequest("/v1/auth/login", {
    method: "POST",
    body: JSON.stringify({
      // Email o nombre de usuario. `email` se acepta aún por compatibilidad.
      identifier: body?.identifier ?? body?.email,
      password: body?.password,
    }),
  });

  if (!result.ok) {
    const code = typeof result.json?.code === "string" ? result.json.code : null;
    return authError(
      result.error || "Login failed",
      result.status || 500,
      request,
      code ? { code } : null,
    );
  }

  const response = NextResponse.json({
    user: sanitizeBackendUser(result.json?.user),
  });
  clearBackendAuthCookies(response, { secure: getCookieSecure(request) });
  setBackendTokenCookies(response, result.json, {
    secure: getCookieSecure(request),
  });
  return response;
}
