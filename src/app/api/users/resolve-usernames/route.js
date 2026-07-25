import { NextResponse } from "next/server";
import {
  backendFetchPublicJson,
  getCookieSecure,
  setBackendAuthCookies,
} from "@/lib/backend/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Resuelve únicamente handles existentes en nuestra BBDD. Los comentarios de
// fuentes externas siguen siendo texto plano cuando su autor no es miembro.
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const usernames = searchParams.get("usernames") || "";
  const backend = await backendFetchPublicJson(
    request,
    `/v1/users/public/resolve-usernames?usernames=${encodeURIComponent(usernames)}`,
  );
  const response = NextResponse.json(
    backend.json || { usernames: [] },
    { status: backend.ok ? 200 : backend.status || 500 },
  );
  setBackendAuthCookies(response, backend, { secure: getCookieSecure(request) });
  return response;
}
