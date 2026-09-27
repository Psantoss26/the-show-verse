import { NextResponse } from "next/server";
import {
  backendFetchJson,
  getCookieSecure,
  setBackendAuthCookies,
} from "@/lib/backend/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Empareja la app companion de Android: pide al backend un token de sincronización
// dedicado al dispositivo móvil (fila separada, no pisa el de la extensión) y lo
// devuelve para construir el deep link theshowverse://pair.
export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const backend = await backendFetchJson(request, "/v1/auth/netflix/pair-mobile", {
      method: "POST",
      body: JSON.stringify({ deviceId: body.deviceId }),
    });

    if (!backend.ok) {
      // El refresco ha podido ROTAR el refresh token (el anterior solo vale
      // 60 s): también en los errores hay que guardar el nuevo, o la sesión
      // queda muerta en cuanto caduca el token de acceso.
      const keepTokens = (response) =>
        setBackendAuthCookies(response, backend, { secure: getCookieSecure(request) });
      return keepTokens(
        NextResponse.json(
          {
            // Sin sesión válida en este dispositivo (token de acceso caducado y
            // el de refresco ya no vale): el mensaje técnico del proxy no le dice
            // al usuario qué hacer.
            error:
              backend.skipped && backend.status === 401
                ? "Tu sesión en este dispositivo ha caducado. Cierra sesión y vuelve a iniciarla para vincularlo."
                : backend.error || "No se pudo generar el emparejamiento.",
          },
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
