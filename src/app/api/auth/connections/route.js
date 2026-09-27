import { NextResponse } from "next/server";
import {
  backendFetchJson,
  getCookieSecure,
  setBackendAuthCookies,
} from "@/lib/backend/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const backend = await backendFetchJson(request, "/v1/auth/connections");

    if (!backend.ok) {
      // El refresco ha podido ROTAR el refresh token (el anterior solo vale
      // 60 s): también en los errores hay que guardar el nuevo, o la sesión
      // queda muerta en cuanto caduca el token de acceso.
      const keepTokens = (response) =>
        setBackendAuthCookies(response, backend, { secure: getCookieSecure(request) });
      return keepTokens(
        NextResponse.json(
          { error: backend.error || "No se pudieron obtener las conexiones." },
          { status: backend.status || 500 },
        ),
      );
    }

    const response = NextResponse.json(backend.json);
    setBackendAuthCookies(response, backend, {
      secure: getCookieSecure(request),
    });
    return response;
  } catch (error) {
    return NextResponse.json(
      { error: error?.message || "Error interno del servidor." },
      { status: 500 },
    );
  }
}
