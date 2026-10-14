// Exportación de favoritos, pendientes y puntuaciones del usuario. Devuelve
// los datos en JSON; el panel de Ajustes los convierte en el archivo elegido.
import { NextResponse } from "next/server";
import {
  backendFetchJson,
  getCookieSecure,
  setBackendAuthCookies,
} from "@/lib/backend/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(request) {
  const include = request.nextUrl.searchParams.get("include") || "";
  const query = include ? `?include=${encodeURIComponent(include)}` : "";
  const backend = await backendFetchJson(request, `/v1/users/me/export${query}`);

  const res = NextResponse.json(backend.json || { error: backend.error }, {
    status: backend.ok ? 200 : backend.status || 500,
  });
  setBackendAuthCookies(res, backend, { secure: getCookieSecure(request) });
  res.headers.set("Cache-Control", "private, no-store, max-age=0");
  return res;
}
