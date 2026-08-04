// src/app/api/recommendations/dismiss/route.js
// Descartar un título de la baraja de recomendaciones (deslizar a la izquierda).

import { NextResponse } from "next/server";
import {
  backendFetchJson,
  getCookieSecure,
  setBackendAuthCookies,
} from "@/lib/backend/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request) {
  const body = await request.json().catch(() => null);
  if (!body?.tmdbId || !body?.mediaType) {
    return NextResponse.json(
      { error: "Faltan tmdbId o mediaType" },
      { status: 400 },
    );
  }

  const backend = await backendFetchJson(request, "/v1/recommendations/dismiss", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      tmdbId: Number(body.tmdbId),
      mediaType: body.mediaType,
    }),
  });

  if (!backend.ok) {
    if (backend.status === 401 || backend.skipped) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 },
      );
    }
    return NextResponse.json(
      { error: backend.error || "No se pudo descartar el título." },
      { status: backend.status || 503 },
    );
  }

  const response = NextResponse.json({ ok: true });
  setBackendAuthCookies(response, backend, {
    secure: getCookieSecure(request),
  });
  return response;
}
