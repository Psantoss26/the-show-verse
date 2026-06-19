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

  const result = await backendAuthRequest("/v1/auth/register", {
    method: "POST",
    body: JSON.stringify({
      email: body?.email,
      username: body?.username,
      password: body?.password,
      displayName: body?.displayName || undefined,
    }),
  });

  if (!result.ok) {
    return authError(result.error || "Register failed", result.status || 500, request);
  }

  const response = NextResponse.json(
    { user: sanitizeBackendUser(result.json?.user) },
    { status: 201 },
  );
  clearBackendAuthCookies(response, { secure: getCookieSecure(request) });
  setBackendTokenCookies(response, result.json, {
    secure: getCookieSecure(request),
  });
  return response;
}
