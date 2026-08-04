// src/app/api/recommendations/route.js
// Baraja de recomendaciones para la sección de deslizar. Simple pasarela al
// backend, que es quien decide qué cartas son válidas (descarta lo ya
// descartado y lo que ya está en pendientes/favoritos).

import { NextResponse } from "next/server";
import {
  backendFetchJson,
  getCookieSecure,
  setBackendAuthCookies,
} from "@/lib/backend/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  const params = request.nextUrl?.searchParams;
  const type = params?.get("type") || "all";
  const limit = params?.get("limit") || "40";

  const backend = await backendFetchJson(
    request,
    `/v1/recommendations?type=${encodeURIComponent(type)}&limit=${encodeURIComponent(limit)}`,
  );

  if (!backend.ok) {
    if (backend.status === 401 || backend.skipped) {
      return NextResponse.json(
        { authenticated: false, items: [], error: "Authentication required" },
        { status: 401 },
      );
    }
    return NextResponse.json(
      {
        authenticated: true,
        items: [],
        error: backend.error || "No se pudieron cargar las recomendaciones.",
      },
      { status: backend.status || 503 },
    );
  }

  const response = NextResponse.json({
    authenticated: true,
    items: Array.isArray(backend.json?.items) ? backend.json.items : [],
    total: backend.json?.total ?? 0,
  });

  setBackendAuthCookies(response, backend, {
    secure: getCookieSecure(request),
  });

  return response;
}
