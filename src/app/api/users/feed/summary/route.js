import { NextResponse } from "next/server";
import {
  backendFetchJson,
  getCookieSecure,
  setBackendAuthCookies,
} from "@/lib/backend/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/users/feed/summary — cifras de la cabecera de la sección social
// (seguidores, seguidos y cuentas activas esta semana).
//
// Proxy directo del backend, con el mismo reenvío de cookies rotadas que el
// resto de rutas: sin eso, un refresco de token durante esta llamada se
// perdería. Un fallo NO se convierte en ceros; se responde con el estado real
// para que la cabecera conserve lo que ya tuviera.
export async function GET(request) {
  const backend = await backendFetchJson(request, "/v1/users/feed/summary");

  const res = NextResponse.json(
    backend.ok ? backend.json : { error: backend.error || "Summary unavailable" },
    { status: backend.ok ? 200 : backend.status || 503 },
  );
  setBackendAuthCookies(res, backend, { secure: getCookieSecure(request) });
  return res;
}
