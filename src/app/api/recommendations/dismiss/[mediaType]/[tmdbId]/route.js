// src/app/api/recommendations/dismiss/[mediaType]/[tmdbId]/route.js
// Deshacer un descarte: el botón de deshacer devuelve el título a la baraja.

import { NextResponse } from "next/server";
import {
  backendFetchJson,
  getCookieSecure,
  setBackendAuthCookies,
} from "@/lib/backend/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(request, { params }) {
  const { mediaType, tmdbId } = await params;

  const backend = await backendFetchJson(
    request,
    `/v1/recommendations/dismiss/${encodeURIComponent(mediaType)}/${encodeURIComponent(tmdbId)}`,
    { method: "DELETE" },
  );

  if (!backend.ok) {
    // El refresco ha podido ROTAR el refresh token (el anterior solo vale
    // 60 s): también en los errores hay que guardar el nuevo, o la sesión
    // queda muerta en cuanto caduca el token de acceso.
    const keepTokens = (response) =>
      setBackendAuthCookies(response, backend, { secure: getCookieSecure(request) });
    if (backend.status === 401 || backend.skipped) {
      return keepTokens(
        NextResponse.json(
          { error: "Authentication required" },
          { status: 401 },
        ),
      );
    }
    return keepTokens(
      NextResponse.json(
        { error: backend.error || "No se pudo deshacer el descarte." },
        { status: backend.status || 503 },
      ),
    );
  }

  const response = NextResponse.json({ ok: true });
  setBackendAuthCookies(response, backend, {
    secure: getCookieSecure(request),
  });
  return response;
}
