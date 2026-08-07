import { NextResponse } from "next/server";
import { backendAuthRequest } from "../../_utils";
import {
  clearBackendAuthCookies,
  getCookieSecure,
  setBackendTokenCookies,
} from "@/lib/backend/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/auth/google/native — login con el idToken que da Android.
//
// La app obtiene el token con Credential Manager (el selector de cuentas del
// sistema, sin navegador) y lo manda aquí. A partir de este punto el camino es
// EXACTAMENTE el del login por navegador: el mismo endpoint del backend valida
// el token contra Google —incluida la comprobación de `aud`— y las cookies de
// sesión se escriben en la respuesta, con lo que acaban en el WebView, que es
// donde la app necesita la sesión.
//
// No hay que comprobar aquí la firma del token: fiarse del cliente sería el
// error clásico, y por eso el canje lo hace el backend contra Google.
export async function POST(request) {
  let idToken = "";
  try {
    const body = await request.json();
    idToken = typeof body?.idToken === "string" ? body.idToken.trim() : "";
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  if (!idToken) {
    return NextResponse.json({ error: "missing_id_token" }, { status: 400 });
  }

  let backend;
  try {
    backend = await backendAuthRequest("/v1/auth/google", {
      method: "POST",
      body: JSON.stringify({ idToken }),
    });
  } catch (error) {
    console.error("[google-native] backend request failed", {
      message: error?.message || String(error),
    });
    return NextResponse.json({ error: "backend_unavailable" }, { status: 503 });
  }

  if (!backend.ok || !backend.json?.accessToken || !backend.json?.refreshToken) {
    console.error("[google-native] backend rejected Google login", {
      status: backend.status,
      error: backend.error,
    });
    return NextResponse.json(
      { error: backend.error || "backend_auth_failed" },
      { status: backend.status || 401 },
    );
  }

  const response = NextResponse.json({ ok: true, user: backend.json.user ?? null });
  const secure = getCookieSecure(request);
  clearBackendAuthCookies(response, { secure });
  setBackendTokenCookies(response, backend.json, { secure });
  return response;
}
