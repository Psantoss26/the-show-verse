import { NextResponse } from "next/server";
import {
  backendAuthRequest,
  getCurrentBackendRefreshToken,
} from "../_utils";
import {
  clearBackendAuthCookies,
  getCookieSecure,
} from "@/lib/backend/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request) {
  const refreshToken = getCurrentBackendRefreshToken(request);

  if (refreshToken) {
    await backendAuthRequest("/v1/auth/logout", {
      method: "POST",
      body: JSON.stringify({ refreshToken }),
    }).catch(() => null);
  }

  const response = NextResponse.json({ ok: true });
  clearBackendAuthCookies(response, { secure: getCookieSecure(request) });
  return response;
}
