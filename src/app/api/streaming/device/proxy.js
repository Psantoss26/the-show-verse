import { NextResponse } from "next/server";
import { getBackendBaseUrl } from "@/lib/backend/server";

// Proxy fino al backend con el TOKEN DEL MÓVIL (Bearer), no con la sesión web.
// Es lo que usa el registro de detecciones de la app Android y de The Show
// Verse Sync, que no tienen sesión. Ver backend routes/streamingDetections.js
// (rutas /streaming/device/*). El middleware las exime del gate de acceso
// privado por eso mismo.
export async function proxyWithSyncToken(request, backendPath, init = {}) {
  const authHeader = request.headers.get("authorization") || "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) {
    return NextResponse.json({ error: "Sync token is required" }, { status: 401 });
  }
  const baseUrl = getBackendBaseUrl();
  if (!baseUrl) {
    return NextResponse.json({ error: "Backend base URL is not configured" }, { status: 503 });
  }
  const res = await fetch(`${baseUrl}/v1/streaming${backendPath}`, {
    ...init,
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
    headers: {
      Accept: "application/json",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      Authorization: authHeader,
    },
  }).catch(() => null);
  if (!res) return NextResponse.json({ error: "Backend unreachable" }, { status: 502 });
  const json = await res.json().catch(() => ({}));
  return NextResponse.json(json, { status: res.status });
}
