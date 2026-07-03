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
    const backend = await backendFetchJson(request, "/v1/auth/netflix/pair-mobile", {
      method: "POST",
      body: JSON.stringify({}),
    });

    if (!backend.ok) {
      return NextResponse.json(
        { error: backend.error || "No se pudo generar el emparejamiento." },
        { status: backend.status || 500 },
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
