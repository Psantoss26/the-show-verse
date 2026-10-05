import { NextResponse } from "next/server";
import { getCookieSecure, setBackendAuthCookies } from "@/lib/backend/server";

// Respuesta de los proxies de detecciones: reenvía el estado del backend y
// renueva las cookies de sesión si el backend rotó los tokens.
export function respondFromBackend(request, backend, fallback = {}) {
  const status = backend.skipped && backend.status === 401
    ? 401
    : backend.status || (backend.ok ? 200 : 502);
  const response = NextResponse.json(backend.json || fallback, { status });
  setBackendAuthCookies(response, backend, { secure: getCookieSecure(request) });
  return response;
}
