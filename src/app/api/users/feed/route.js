import { NextResponse } from "next/server";
import {
  backendFetchJson,
  getCookieSecure,
  setBackendAuthCookies,
} from "@/lib/backend/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/users/feed?scope=following|me — feed de la sección social.
//
// Proxy directo del backend, que es de donde sale toda la actividad. Se
// reenvían las cookies rotadas igual que en el resto de rutas: sin eso, un
// refresco de token durante esta llamada se perdería.
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const scope = searchParams.get("scope") === "me" ? "me" : "following";
  const limit = searchParams.get("limit") || "30";
  const offset = searchParams.get("offset") || "0";

  const backend = await backendFetchJson(
    request,
    `/v1/users/feed?scope=${scope}&limit=${encodeURIComponent(limit)}&offset=${encodeURIComponent(offset)}`,
  );

  const res = NextResponse.json(
    backend.ok
      ? backend.json
      : { items: [], hasMore: false, offset: Number(offset) || 0, error: backend.error },
    // Un fallo de backend NO es "no tienes actividad": se responde con el
    // estado real para que la página conserve lo que ya tuviera en vez de
    // pintarse vacía (mismo criterio que las listas de usuario).
    { status: backend.ok ? 200 : backend.status || 503 },
  );
  setBackendAuthCookies(res, backend, { secure: getCookieSecure(request) });
  return res;
}
