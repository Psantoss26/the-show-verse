import { NextResponse } from "next/server";
import { getCookieSecure, setBackendAuthCookies } from "@/lib/backend/server";

// Respuesta de los proxies del administrador: reenvía el estado del backend
// (401 sin sesión, 403 si no es administrador) y renueva las cookies de sesión
// si el backend rotó los tokens.
export function respondFromBackend(request, backend, fallback = {}) {
  const status = backend.skipped && backend.status === 401
    ? 401
    : backend.status || (backend.ok ? 200 : 502);
  const response = NextResponse.json(backend.json || fallback, { status });
  response.headers.set("Cache-Control", "no-store");
  setBackendAuthCookies(response, backend, { secure: getCookieSecure(request) });
  return response;
}

const RANGES = new Set(["1h", "24h", "7d", "30d"]);

export function rangeParam(request) {
  const range = new URL(request.url).searchParams.get("range") || "24h";
  return RANGES.has(range) ? range : "24h";
}
