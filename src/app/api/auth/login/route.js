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
      email: body?.email,
      password: body?.password,
    }),
  });

  if (!result.ok) {
    return authError(result.error || "Login failed", result.status || 500, request);
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
